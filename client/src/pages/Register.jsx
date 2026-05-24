import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';

export default function Register({ auth }) {
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { token, user } = await api.register({ phone, lastName, password });
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
          <h1>Create account</h1>
          <small>Sign in with your mobile number</small>
        </div>
      </header>

      <form className="card" onSubmit={handleSubmit}>
        <label htmlFor="phone">Mobile number</label>
        <input
          id="phone"
          type="tel"
          placeholder="Mobile number"
          inputMode="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
        />

        <label htmlFor="lastName">Last name</label>
        <input
          id="lastName"
          type="text"
          placeholder="Last name"
          autoComplete="family-name"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          required
        />

        <label htmlFor="password">Password (min 6 characters)</label>
        <input
          id="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={6}
          required
        />

        {error && <p className="error">{error}</p>}

        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? 'Creating…' : 'Register'}
        </button>

        <p style={{ marginTop: '1rem', textAlign: 'center', color: 'var(--muted)', fontSize: '0.9rem' }}>
          Already registered?{' '}
          <Link to="/login" className="link">
            Sign in
          </Link>
        </p>
      </form>
    </>
  );
}
