import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';

export default function Login({ auth }) {
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { token, user } = await api.login({ phone, password });
      auth.login(token, user);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="header">
        <div>
          <h1>Elevator Access</h1>
          <small>Sign in with your mobile number</small>
        </div>
      </header>

      <form className="card" onSubmit={handleSubmit}>
        <label htmlFor="phone">Mobile number</label>
        <input
          id="phone"
          type="tel"
          autoComplete="tel"
          placeholder="Mobile number"
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
        />

        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {error && <p className="error">{error}</p>}

        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>

        <p style={{ marginTop: '1rem', textAlign: 'center', color: 'var(--muted)', fontSize: '0.9rem' }}>
          New resident?{' '}
          <Link to="/register" className="link">
            Register
          </Link>
        </p>
      </form>
    </>
  );
}
