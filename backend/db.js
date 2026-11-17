const { Pool } = require('pg');

// Conexión a Azure Database for PostgreSQL Flexible Server (o local/TCP simple).
const config = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
};
const DB_NAME = process.env.DB_NAME || 'facturacion';

const PRODUCTOS_INICIALES = [
  ['P001', 'Leche entera 1L', 9.5, 25],
  ['P002', 'Pan sandwich', 18.0, 25],
  ['P003', 'Huevos (cartón 30)', 42.0, 25],
  ['P004', 'Arroz 1 lb', 5.25, 25],
  ['P005', 'Frijol negro 1 lb', 7.0, 25],
  ['P006', 'Azúcar 5 lb', 22.5, 25],
  ['P007', 'Aceite vegetal 750ml', 19.75, 25],
  ['P008', 'Café molido 400g', 38.0, 25],
  ['P009', 'Gaseosa 2L', 14.0, 25],
  ['P010', 'Jabón de baño', 6.5, 25],
  ['P011', 'Papel higiénico 4 rollos', 16.0, 25],
  ['P012', 'Pollo entero (lb)', 13.5, 25],
];

let pool;

// Crea la base, las tablas y los productos de ejemplo si no existen.
async function init() {
  // Conecta a la base "postgres" (siempre existe) para poder crear la base destino si falta.
  const adminPool = new Pool({ ...config, database: 'postgres' });
  const exists = await adminPool.query('SELECT 1 FROM pg_database WHERE datname = $1', [DB_NAME]);
  if (exists.rowCount === 0) {
    await adminPool.query(`CREATE DATABASE "${DB_NAME}"`);
  }
  await adminPool.end();

  pool = new Pool({
    ...config,
    database: DB_NAME,
    max: 5,
  });

  await pool.query(`CREATE TABLE IF NOT EXISTS productos (
    id SERIAL PRIMARY KEY,
    codigo VARCHAR(20) NOT NULL UNIQUE,
    nombre VARCHAR(100) NOT NULL,
    precio DECIMAL(10,2) NOT NULL,
    stock INT NOT NULL DEFAULT 0
  )`);
  // Por si la tabla ya existía de antes (sin la columna stock).
  await pool.query(`ALTER TABLE productos ADD COLUMN IF NOT EXISTS stock INT NOT NULL DEFAULT 0`);
  await pool.query(`CREATE TABLE IF NOT EXISTS facturas (
    id SERIAL PRIMARY KEY,
    serie VARCHAR(10) NOT NULL,
    autorizacion VARCHAR(40) NOT NULL,
    nit VARCHAR(20) NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    direccion VARCHAR(150) NOT NULL,
    subtotal DECIMAL(10,2) NOT NULL,
    iva DECIMAL(10,2) NOT NULL,
    total DECIMAL(10,2) NOT NULL,
    fecha TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS detalle_factura (
    id SERIAL PRIMARY KEY,
    factura_id INT NOT NULL REFERENCES facturas(id),
    producto_id INT NOT NULL REFERENCES productos(id),
    descripcion VARCHAR(100) NOT NULL,
    cantidad INT NOT NULL,
    precio_unitario DECIMAL(10,2) NOT NULL,
    total_linea DECIMAL(10,2) NOT NULL
  )`);

  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM productos');
  if (rows[0].n === 0) {
    const valores = [];
    const params = [];
    PRODUCTOS_INICIALES.forEach((p, i) => {
      const base = i * 4;
      valores.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`);
      params.push(...p);
    });
    await pool.query(
      `INSERT INTO productos (codigo, nombre, precio, stock) VALUES ${valores.join(', ')}`,
      params
    );
  }
}

module.exports = { init, getPool: () => pool };
