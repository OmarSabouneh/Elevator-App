import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

export default function Login({ auth }) {
  const navigate = useNavigate();
  const [phone, setPhone] = useState(() => localStorage.getItem('saved_phone') || '');
  const [password, setPassword] = useState(() => localStorage.getItem('saved_password') || '');
  const [remember, setRemember] = useState(() => localStorage.getItem('remember_credentials') !== 'false');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // If already logged in, navigate directly to home
  useEffect(() => {
    if (auth.user) {
      navigate('/', { replace: true });
    }
  }, [auth.user, navigate]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { token, user } = await api.login({ phone, password });
      if (remember) {
        localStorage.setItem('saved_phone', phone);
        localStorage.setItem('saved_password', password);
        localStorage.setItem('remember_credentials', 'true');
      } else {
        localStorage.removeItem('saved_phone');
        localStorage.removeItem('saved_password');
        localStorage.setItem('remember_credentials', 'false');
      }
      auth.login(token, user);
      navigate('/');
    } catch (err) {
      if (!navigator.onLine || err.isNetworkError) {
        setError('No internet connection. Please connect to the internet and try again.');
      } else {
        setError(err.message);
      }
    } finally {
      setBusy(false);
    }
  }

  const hasSavedCredentials = !!(localStorage.getItem('saved_phone') || localStorage.getItem('saved_password'));

  function handleClearSaved() {
    localStorage.removeItem('saved_phone');
    localStorage.removeItem('saved_password');
    setPhone('');
    setPassword('');
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
          autoComplete="tel username"
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

        <div className="checkbox-row">
          <input
            id="remember"
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          <label htmlFor="remember">Remember credentials on this device</label>
        </div>

        {error && <p className="error">{error}</p>}

        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>

        {hasSavedCredentials && (
          <p style={{ marginTop: '0.9rem', textAlign: 'center' }}>
            <button
              type="button"
              className="link"
              style={{ fontSize: '0.85rem' }}
              onClick={handleClearSaved}
            >
              Clear saved credentials
            </button>
          </p>
        )}
      </form>
    </>
  );
}
