import { useEffect, useState } from 'react';
import Login from './Login';
import Inventario from './Inventario';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const Q = (n) => 'Q ' + Number(n).toFixed(2);

export default function App() {
  const [adminPassword, setAdminPassword] = useState(
    () => sessionStorage.getItem('adminPassword') || ''
  );
  const [vista, setVista] = useState('caja'); // 'caja' | 'inventario'
  const [productos, setProductos] = useState([]);
  const [carrito, setCarrito] = useState({}); // { idProducto: cantidad }
  const [cliente, setCliente] = useState({ nit: '', nombre: '', direccion: '' });
  const [factura, setFactura] = useState(null);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  const cargarProductos = () => {
    fetch(`${API}/api/productos`)
      .then((r) => r.json())
      .then(setProductos)
      .catch(() => setError('No se pudo conectar con el servidor'));
  };

  useEffect(() => {
    if (adminPassword) cargarProductos();
  }, [adminPassword]);

  if (!adminPassword) {
    return (
      <Login
        api={API}
        onLogin={(password) => {
          sessionStorage.setItem('adminPassword', password);
          setAdminPassword(password);
        }}
      />
    );
  }

  const salir = () => {
    sessionStorage.removeItem('adminPassword');
    setAdminPassword('');
  };

  const cambiar = (id, delta) =>
    setCarrito((c) => {
      const producto = productos.find((p) => p.id === id);
      const cantidad = (c[id] || 0) + delta;
      const nuevo = { ...c };
      if (cantidad <= 0) delete nuevo[id];
      else if (producto && cantidad > producto.stock) return c; // no dejar pasar del stock disponible
      else nuevo[id] = cantidad;
      return nuevo;
    });

  const lineas = productos
    .filter((p) => carrito[p.id])
    .map((p) => ({ ...p, cantidad: carrito[p.id], total: p.precio * carrito[p.id] }));
  const total = lineas.reduce((s, l) => s + l.total, 0);

  const facturar = async (e) => {
    e.preventDefault();
    setError('');
    setEnviando(true);
    try {
      const r = await fetch(`${API}/api/facturas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...cliente,
          items: lineas.map((l) => ({ producto_id: l.id, cantidad: l.cantidad })),
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Error al facturar');
      setFactura(data);
      cargarProductos();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  };

  const nuevaVenta = () => {
    setFactura(null);
    setCarrito({});
    setCliente({ nit: '', nombre: '', direccion: '' });
  };

  if (factura) return <Factura factura={factura} onNueva={nuevaVenta} />;

  return (
    <div className="app">
      <header>
        <h1>Supermercado La Nube</h1>
        <nav className="tabs">
          <button className={vista === 'caja' ? 'activa' : ''} onClick={() => setVista('caja')}>
            Caja
          </button>
          <button
            className={vista === 'inventario' ? 'activa' : ''}
            onClick={() => setVista('inventario')}
          >
            Inventario
          </button>
        </nav>
        <button className="salir" onClick={salir}>
          Salir
        </button>
      </header>

      {error && <p className="error">{error}</p>}

      {vista === 'inventario' ? (
        <Inventario
          api={API}
          adminPassword={adminPassword}
          productos={productos}
          onCambio={cargarProductos}
        />
      ) : (
      <main>
        <section className="productos">
          <h2>Productos</h2>
          <div className="grid">
            {productos.map((p) => (
              <button
                key={p.id}
                className="producto"
                disabled={p.stock <= 0}
                onClick={() => cambiar(p.id, 1)}
              >
                <small>{p.codigo}</small>
                <strong>{p.nombre}</strong>
                <span>{Q(p.precio)}</span>
                <small className={p.stock <= 0 ? 'agotado' : 'disponible'}>
                  {p.stock <= 0 ? 'Agotado' : `${p.stock} disponibles`}
                </small>
              </button>
            ))}
          </div>
        </section>

        <section className="venta">
          <h2>Venta actual</h2>
          {lineas.length === 0 ? (
            <p className="vacio">Seleccioná productos para empezar.</p>
          ) : (
            <table>
              <tbody>
                {lineas.map((l) => (
                  <tr key={l.id}>
                    <td>{l.nombre}</td>
                    <td className="cant">
                      <button onClick={() => cambiar(l.id, -1)}>−</button>
                      {l.cantidad}
                      <button onClick={() => cambiar(l.id, 1)}>+</button>
                    </td>
                    <td className="num">{Q(l.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="total">
            Total <strong>{Q(total)}</strong>
          </p>

          <form onSubmit={facturar}>
            <h2>Datos de facturación</h2>
            <input
              placeholder="NIT (vacío = CF)"
              value={cliente.nit}
              onChange={(e) => setCliente({ ...cliente, nit: e.target.value })}
            />
            <input
              placeholder="Nombre"
              value={cliente.nombre}
              onChange={(e) => setCliente({ ...cliente, nombre: e.target.value })}
            />
            <input
              placeholder="Dirección"
              value={cliente.direccion}
              onChange={(e) => setCliente({ ...cliente, direccion: e.target.value })}
            />
            <button className="primario" disabled={lineas.length === 0 || enviando}>
              {enviando ? 'Facturando…' : 'Generar factura'}
            </button>
          </form>
        </section>
      </main>
      )}
    </div>
  );
}

function Factura({ factura, onNueva }) {
  return (
    <div className="app">
      <div className="factura">
        <h1>Supermercado La Nube</h1>
        <p className="centro">Factura electrónica (simulada)</p>
        <dl>
          <dt>Serie / No.</dt>
          <dd>
            {factura.serie}-{String(factura.id).padStart(6, '0')}
          </dd>
          <dt>Autorización</dt>
          <dd>{factura.autorizacion}</dd>
          <dt>Fecha</dt>
          <dd>{new Date(factura.fecha).toLocaleString('es-GT')}</dd>
          <dt>NIT</dt>
          <dd>{factura.nit}</dd>
          <dt>Nombre</dt>
          <dd>{factura.nombre}</dd>
          <dt>Dirección</dt>
          <dd>{factura.direccion}</dd>
        </dl>
        <table>
          <thead>
            <tr>
              <th>Cant.</th>
              <th>Descripción</th>
              <th className="num">P. unit.</th>
              <th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {factura.items.map((i, k) => (
              <tr key={k}>
                <td>{i.cantidad}</td>
                <td>{i.descripcion}</td>
                <td className="num">{Q(i.precio_unitario)}</td>
                <td className="num">{Q(i.total_linea)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="resumen">Subtotal (sin IVA): {Q(factura.subtotal)}</p>
        <p className="resumen">IVA 12%: {Q(factura.iva)}</p>
        <p className="total">
          Total <strong>{Q(factura.total)}</strong>
        </p>
        <div className="acciones">
          <button onClick={() => window.print()}>Imprimir</button>
          <button className="primario" onClick={onNueva}>
            Nueva venta
          </button>
        </div>
      </div>
    </div>
  );
}
