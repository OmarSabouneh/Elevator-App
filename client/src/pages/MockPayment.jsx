import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { api } from '../api';

/** Shown when WHISH_MODE=mock — simulates completing a Whish payment */
export default function MockPayment({ auth }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const orderId = params.get('order_id');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function complete() {
    setBusy(true);
    setError('');
    try {
      await api.mockComplete(orderId);
      await auth.refresh();
      navigate('/?payment=success');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="header">
        <h1>Mock Whish Payment</h1>
      </header>
      <div className="card">
        <p style={{ color: 'var(--muted)' }}>
          Development mode — no real charge. Order: <strong>{orderId}</strong>
        </p>
        <button type="button" className="btn-success" onClick={complete} disabled={busy || !orderId}>
          {busy ? 'Processing…' : 'Simulate successful payment'}
        </button>
        {error && <p className="error">{error}</p>}
      </div>
    </>
  );
}
