import { useEffect, useState } from 'react';

const Q = (n) => 'Q ' + Number(n).toFixed(2);

export default function Reportes({ api, adminPassword }) {
  const [datos, setDatos] = useState(null);
  const [facturas, setFacturas] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const headers = { 'x-admin-password': adminPassword };
    Promise.all([
      fetch(`${api}/api/reportes`, { headers }).then((r) => r.json()),
      fetch(`${api}/api/facturas`, { headers }).then((r) => r.json()),
    ])
      .then(([reportes, listaFacturas]) => {
        setDatos(reportes);
        setFacturas(listaFacturas);
      })
      .catch(() => setError('No se pudo cargar el reporte'));
  }, [api, adminPassword]);

  if (error) return <p className="error">{error}</p>;
  if (!datos) return <p className="vacio">Cargando reporte…</p>;

  const maxDia = Math.max(1, ...datos.porDia.map((d) => d.total));
  const maxProducto = Math.max(1, ...datos.topProductos.map((p) => p.unidades));

  return (
    <section className="reportes">
      <h2>Reportes de ventas</h2>

      <div className="tarjetas">
        <div className="tarjeta">
          <small>Facturas totales</small>
          <strong>{datos.acumulado.facturas}</strong>
        </div>
        <div className="tarjeta">
          <small>Ventas totales</small>
          <strong>{Q(datos.acumulado.total)}</strong>
        </div>
      </div>

      <h3>Ventas de los últimos 7 días</h3>
      {datos.porDia.length === 0 ? (
        <p className="vacio">Todavía no hay ventas registradas esta semana.</p>
      ) : (
        <div className="barras">
          {datos.porDia.map((d) => (
            <div className="barra-fila" key={d.dia}>
              <span className="barra-etiqueta">{d.dia}</span>
              <div className="barra-pista">
                <div className="barra" style={{ width: `${(d.total / maxDia) * 100}%` }} />
              </div>
              <span className="barra-valor">{Q(d.total)}</span>
            </div>
          ))}
        </div>
      )}

      <h3>Productos más vendidos</h3>
      {datos.topProductos.length === 0 ? (
        <p className="vacio">Todavía no hay productos vendidos.</p>
      ) : (
        <div className="barras">
          {datos.topProductos.map((p) => (
            <div className="barra-fila" key={p.descripcion}>
              <span className="barra-etiqueta">{p.descripcion}</span>
              <div className="barra-pista">
                <div
                  className="barra producto"
                  style={{ width: `${(p.unidades / maxProducto) * 100}%` }}
                />
              </div>
              <span className="barra-valor">{p.unidades} u.</span>
            </div>
          ))}
        </div>
      )}

      <h3>Historial de facturas</h3>
      {facturas.length === 0 ? (
        <p className="vacio">Todavía no hay facturas.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>No.</th>
              <th>Fecha</th>
              <th>Cliente</th>
              <th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {facturas.map((f) => (
              <tr key={f.id}>
                <td>
                  {f.serie}-{String(f.id).padStart(6, '0')}
                </td>
                <td>{new Date(f.fecha).toLocaleString('es-GT')}</td>
                <td>{f.nombre}</td>
                <td className="num">{Q(f.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
