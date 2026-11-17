require('dotenv').config();
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const { init, getPool } = require('./db');

const IVA = 0.12; // Los precios ya incluyen IVA
const SERIE = 'FAC';
const redondear = (n) => Math.round(n * 100) / 100;

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => res.json({ ok: true, servicio: 'facturacion-backend' }));

app.get('/api/productos', async (req, res, next) => {
  try {
    const { rows } = await getPool().query('SELECT * FROM productos ORDER BY nombre');
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

app.get('/api/facturas', async (req, res, next) => {
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
      const { rows } = await conn.query('SELECT * FROM productos WHERE id = $1', [
        item.producto_id,
      ]);
      const producto = rows[0];
      if (!producto) {
        throw Object.assign(new Error('Producto no existe'), { status: 400 });
      }
      const precio = Number(producto.precio);
      const totalLinea = redondear(precio * cantidad);
      total += totalLinea;
      lineas.push([producto.id, producto.nombre, cantidad, precio, totalLinea]);
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
