import { useState } from 'react';

const Q = (n) => 'Q ' + Number(n).toFixed(2);

export default function Inventario({ api, adminPassword, productos, onCambio }) {
  const [nuevo, setNuevo] = useState({ codigo: '', nombre: '', precio: '', stock: '' });
  const [sumar, setSumar] = useState({}); // { idProducto: cantidadATexto }
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');

  const headers = {
    'Content-Type': 'application/json',
    'x-admin-password': adminPassword,
  };

  const crearProducto = async (e) => {
    e.preventDefault();
    setError('');
    setMensaje('');
    try {
      const r = await fetch(`${api}/api/productos`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          codigo: nuevo.codigo,
          nombre: nuevo.nombre,
          precio: Number(nuevo.precio),
          stock: Number(nuevo.stock),
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'No se pudo crear el producto');
      setNuevo({ codigo: '', nombre: '', precio: '', stock: '' });
      setMensaje(`Producto "${data.nombre}" creado con ${data.stock} unidades.`);
      onCambio();
    } catch (err) {
      setError(err.message);
    }
  };

  const agregarStock = async (producto) => {
    const cantidad = Number(sumar[producto.id]);
    setError('');
    setMensaje('');
    if (!Number.isInteger(cantidad) || cantidad <= 0) {
      setError('Ingresá una cantidad válida para sumar al inventario');
      return;
    }
    try {
      const r = await fetch(`${api}/api/productos/${producto.id}/stock`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ cantidad }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'No se pudo actualizar el inventario');
      setSumar((s) => ({ ...s, [producto.id]: '' }));
      setMensaje(`${data.nombre}: ahora hay ${data.stock} unidades.`);
      onCambio();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <section className="inventario">
      <h2>Inventario</h2>
      {error && <p className="error">{error}</p>}
      {mensaje && <p className="exito">{mensaje}</p>}

      <h3>Agregar producto nuevo</h3>
      <form className="fila" onSubmit={crearProducto}>
        <input
          placeholder="Código"
          value={nuevo.codigo}
          onChange={(e) => setNuevo({ ...nuevo, codigo: e.target.value })}
        />
        <input
          placeholder="Nombre"
          value={nuevo.nombre}
          onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })}
        />
        <input
          type="number"
          step="0.01"
          min="0"
          placeholder="Precio"
          value={nuevo.precio}
          onChange={(e) => setNuevo({ ...nuevo, precio: e.target.value })}
        />
        <input
          type="number"
          min="0"
          placeholder="Cantidad"
          value={nuevo.stock}
          onChange={(e) => setNuevo({ ...nuevo, stock: e.target.value })}
        />
        <button className="primario">Agregar</button>
      </form>

      <h3>Productos existentes</h3>
      <table>
        <thead>
          <tr>
            <th>Código</th>
            <th>Nombre</th>
            <th className="num">Precio</th>
            <th className="num">Stock</th>
            <th>Sumar inventario</th>
          </tr>
        </thead>
        <tbody>
          {productos.map((p) => (
            <tr key={p.id}>
              <td>{p.codigo}</td>
              <td>{p.nombre}</td>
              <td className="num">{Q(p.precio)}</td>
              <td className="num">
                <span className={p.stock <= 0 ? 'agotado' : ''}>{p.stock}</span>
              </td>
              <td className="cant">
                <input
                  type="number"
                  min="1"
                  className="chica"
                  value={sumar[p.id] || ''}
                  onChange={(e) => setSumar((s) => ({ ...s, [p.id]: e.target.value }))}
                />
                <button onClick={() => agregarStock(p)}>Agregar</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
