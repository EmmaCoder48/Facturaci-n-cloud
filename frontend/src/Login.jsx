import { useState } from 'react';

export default function Login({ api, onLogin }) {
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  const entrar = async (e) => {
    e.preventDefault();
    setError('');
    setEnviando(true);
    try {
      const r = await fetch(`${api}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario, password }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'No se pudo iniciar sesión');
      onLogin(password);
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="app">
      <div className="login">
        <h1>Supermercado La Nube</h1>
        <p className="centro">Iniciá sesión para usar la caja</p>
        {error && <p className="error">{error}</p>}
        <form onSubmit={entrar}>
          <input
            placeholder="Usuario"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            autoFocus
          />
          <input
            type="password"
            placeholder="Contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button className="primario" disabled={enviando}>
            {enviando ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  );
}
