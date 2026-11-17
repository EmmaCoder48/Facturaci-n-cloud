require('dotenv').config();

// Application Insights debe arrancar antes que cualquier otro módulo para
// poder instrumentar automáticamente express, pg, http, etc.
if (process.env.APPLICATIONINSIGHTS_CONNECTION_STRING) {
  const appInsights = require('applicationinsights');
  appInsights
    .setup()
    .setSendLiveMetrics(true)
    .setAutoCollectConsole(true, true)
    .start();
}

const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const { init, getPool } = require('./db');

const IVA = 0.12; // Los precios ya incluyen IVA
const SERIE = 'FAC';
const redondear = (n) => Math.round(n * 100) / 100;
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '123';

const app = express();
app.use(cors());
app.use(express.json());

// Login simple de administrador (único usuario: admin).
app.post('/api/login', (req, res) => {
  const { usuario, password } = req.body || {};
  if (usuario === ADMIN_USER && password === ADMIN_PASSWORD) {
    return res.json({ ok: true });
  }
  res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
});

// Protege los endpoints de administración de inventario.
function requiereAdmin(req, res, next) {
  if (req.get('x-admin-password') === ADMIN_PASSWORD) return next();
  res.status(401).json({ error: 'No autorizado' });
}

app.get('/', (req, res) => res.json({ ok: true, servicio: 'facturacion-backend-v3' }));

app.get('/api/productos', async (req, res, next) => {
  try {
    const { rows } = await getPool().query('SELECT * FROM productos ORDER BY nombre');
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

// Body: { codigo, nombre, precio, stock }
app.post('/api/productos', requiereAdmin, async (req, res, next) => {
  try {
    const codigo = String(req.body?.codigo || '').trim();
    const nombre = String(req.body?.nombre || '').trim();
    const precio = Number(req.body?.precio);
    const stock = Number(req.body?.stock);

    if (!codigo || !nombre) {
      return res.status(400).json({ error: 'Código y nombre son obligatorios' });
    }
    if (!Number.isFinite(precio) || precio <= 0) {
      return res.status(400).json({ error: 'Precio inválido' });
    }
    if (!Number.isInteger(stock) || stock < 0) {
      return res.status(400).json({ error: 'Cantidad de inventario inválida' });
    }

    const existe = await getPool().query('SELECT id FROM productos WHERE codigo = $1', [codigo]);
    if (existe.rowCount > 0) {
      return res.status(400).json({ error: 'Ya existe un producto con ese código' });
    }

    const { rows } = await getPool().query(
      'INSERT INTO productos (codigo, nombre, precio, stock) VALUES ($1,$2,$3,$4) RETURNING *',
      [codigo, nombre, precio, stock]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    next(e);
  }
});

// Body: { cantidad } — suma cantidad al inventario existente del producto.
app.patch('/api/productos/:id/stock', requiereAdmin, async (req, res, next) => {
  try {
    const cantidad = Number(req.body?.cantidad);
    if (!Number.isInteger(cantidad) || cantidad <= 0) {
      return res.status(400).json({ error: 'Cantidad inválida' });
    }
    const { rows } = await getPool().query(
      'UPDATE productos SET stock = stock + $1 WHERE id = $2 RETURNING *',
      [cantidad, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Producto no existe' });
    res.json(rows[0]);
  } catch (e) {
    next(e);
  }
});

// Resumen para el panel de reportes: ventas de los últimos 7 días,
// productos más vendidos y totales acumulados.
app.get('/api/reportes', requiereAdmin, async (req, res, next) => {
  try {
    const db = getPool();
    const [porDia, topProductos, acumulado] = await Promise.all([
      db.query(`
        SELECT TO_CHAR(fecha, 'YYYY-MM-DD') AS dia,
               COUNT(*)::int AS facturas,
               COALESCE(SUM(total), 0)::float AS total
        FROM facturas
        WHERE fecha >= NOW() - INTERVAL '7 days'
        GROUP BY dia
        ORDER BY dia
      `),
      db.query(`
        SELECT descripcion, SUM(cantidad)::int AS unidades
        FROM detalle_factura
        GROUP BY descripcion
        ORDER BY unidades DESC
        LIMIT 5
      `),
      db.query(`
        SELECT COUNT(*)::int AS facturas, COALESCE(SUM(total), 0)::float AS total
        FROM facturas
      `),
    ]);
    res.json({
      porDia: porDia.rows,
      topProductos: topProductos.rows,
      acumulado: acumulado.rows[0],
    });
  } catch (e) {
    next(e);
  }
});

app.get('/api/facturas', requiereAdmin, async (req, res, next) => {
  try {
    const { rows } = await getPool().query('SELECT * FROM facturas ORDER BY id DESC LIMIT 50');
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

async function obtenerFactura(db, id) {
  const { rows } = await db.query('SELECT * FROM facturas WHERE id = $1', [id]);
  const factura = rows[0];
  if (!factura) return null;
  const items = await db.query(
    'SELECT descripcion, cantidad, precio_unitario, total_linea FROM detalle_factura WHERE factura_id = $1',
    [id]
  );
  return { ...factura, items: items.rows };
}

app.get('/api/facturas/:id', async (req, res, next) => {
  try {
    const factura = await obtenerFactura(getPool(), req.params.id);
    if (!factura) return res.status(404).json({ error: 'Factura no encontrada' });
    res.json(factura);
  } catch (e) {
    next(e);
  }
});

// Body: { nit, nombre, direccion, items: [{ producto_id, cantidad }] }
app.post('/api/facturas', async (req, res, next) => {
  const { items } = req.body || {};
  const nit = String(req.body?.nit || 'CF').trim() || 'CF';
  const nombre = String(req.body?.nombre || 'Consumidor Final').trim() || 'Consumidor Final';
  const direccion = String(req.body?.direccion || 'Ciudad').trim() || 'Ciudad';

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'La factura no tiene productos' });
  }

  const conn = await getPool().connect();
  try {
    await conn.query('BEGIN');

    const lineas = [];
    let total = 0;
    for (const item of items) {
      const cantidad = Number(item.cantidad);
      if (!Number.isInteger(cantidad) || cantidad <= 0) {
        throw Object.assign(new Error('Cantidad inválida'), { status: 400 });
      }
      // FOR UPDATE bloquea la fila para evitar que dos facturas a la vez vendan el mismo stock.
      const { rows } = await conn.query('SELECT * FROM productos WHERE id = $1 FOR UPDATE', [
        item.producto_id,
      ]);
      const producto = rows[0];
      if (!producto) {
        throw Object.assign(new Error('Producto no existe'), { status: 400 });
      }
      if (producto.stock <= 0) {
        throw Object.assign(new Error(`${producto.nombre} no tiene inventario disponible`), {
          status: 400,
        });
      }
      if (cantidad > producto.stock) {
        throw Object.assign(
          new Error(`Solo hay ${producto.stock} unidades disponibles de ${producto.nombre}`),
          { status: 400 }
        );
      }
      const precio = Number(producto.precio);
      const totalLinea = redondear(precio * cantidad);
      total += totalLinea;
      lineas.push([producto.id, producto.nombre, cantidad, precio, totalLinea]);
    }

    for (const [productoId, , cantidad] of lineas) {
      await conn.query('UPDATE productos SET stock = stock - $1 WHERE id = $2', [
        cantidad,
        productoId,
      ]);
    }

    total = redondear(total);
    const subtotal = redondear(total / (1 + IVA));
    const iva = redondear(total - subtotal);
    // Simula el número de autorización que daría el certificador (SAT/FEL)
    const autorizacion = crypto.randomUUID().toUpperCase();

    const insertFactura = await conn.query(
      'INSERT INTO facturas (serie, autorizacion, nit, nombre, direccion, subtotal, iva, total) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
      [SERIE, autorizacion, nit, nombre, direccion, subtotal, iva, total]
    );
    const facturaId = insertFactura.rows[0].id;

    for (const [productoId, descripcion, cantidad, precioUnitario, totalLinea] of lineas) {
      await conn.query(
        'INSERT INTO detalle_factura (factura_id, producto_id, descripcion, cantidad, precio_unitario, total_linea) VALUES ($1,$2,$3,$4,$5,$6)',
        [facturaId, productoId, descripcion, cantidad, precioUnitario, totalLinea]
      );
    }
    await conn.query('COMMIT');

    res.status(201).json(await obtenerFactura(conn, facturaId));
  } catch (e) {
    await conn.query('ROLLBACK');
    next(e);
  } finally {
    conn.release();
  }
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.status ? err.message : 'Error del servidor' });
});

const PORT = process.env.PORT || 3000;
init()
  .then(() => app.listen(PORT, () => console.log(`Backend escuchando en puerto ${PORT}`)))
  .catch((e) => {
    console.error('No se pudo conectar a la base de datos:', e.message);
    process.exit(1); // systemd lo reintenta
  });
