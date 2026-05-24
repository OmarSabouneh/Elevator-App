import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { formatPhoneLocal } from '../phone';

const ELEVATOR_TIMER_KEY = 'elevatorActiveUntil';

function formatExpiry(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { dateStyle: 'medium' });
}

function daysLeft(iso) {
  if (!iso) return 0;
  const ms = new Date(iso) - new Date();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

function formatCountdown(remainingMs) {
  const totalSec = Math.max(0, Math.ceil(remainingMs / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function readStoredActiveUntil() {
  const saved = sessionStorage.getItem(ELEVATOR_TIMER_KEY);
  const n = saved ? Number(saved) : 0;
  return n > Date.now() ? n : 0;
}

export default function Home({ auth }) {
  const { user, logout, refresh } = auth;
  const [searchParams, setSearchParams] = useSearchParams();
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState('');
  const [activeUntil, setActiveUntil] = useState(readStoredActiveUntil);
  const [now, setNow] = useState(Date.now());
  const [pulseMs, setPulseMs] = useState(60000);

  const paymentNotice = searchParams.get('payment');
  const remainingMs = activeUntil > now ? activeUntil - now : 0;
  const elevatorActive = remainingMs > 0;

  useEffect(() => {
    api.elevatorConfig().then((c) => setPulseMs(c.pulseMs)).catch(() => {});
  }, []);

  useEffect(() => {
    if (paymentNotice === 'success') {
      refresh();
      setSearchParams({}, { replace: true });
    }
  }, [paymentNotice]);

  useEffect(() => {
    if (!elevatorActive) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (activeUntil <= t) {
        sessionStorage.removeItem(ELEVATOR_TIMER_KEY);
        setActiveUntil(0);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [elevatorActive, activeUntil]);

  async function handlePay() {
    setError('');
    setSuccess('');
    setBusy('pay');
    try {
      const { paymentUrl } = await api.createPayment();
      window.location.href = paymentUrl;
    } catch (err) {
      setError(err.message);
      setBusy('');
    }
  }

  async function handleCallElevator() {
    if (elevatorActive) return;
    setError('');
    setSuccess('');
    setBusy('elevator');
    try {
      const res = await api.callElevator();
      if (!res.verified) {
        throw new Error('Breaker did not turn on');
      }
      setActiveUntil(res.activeUntil);
      sessionStorage.setItem(ELEVATOR_TIMER_KEY, String(res.activeUntil));
      setNow(Date.now());
      setSuccess(res.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  const pulseMinutes = Math.round(pulseMs / 60000);

  function elevatorButtonLabel() {
    if (busy === 'elevator') return 'Checking breaker…';
    if (elevatorActive) return formatCountdown(remainingMs);
    return 'Call Elevator';
  }

  return (
    <>
      <header className="header">
        <div>
          <h1>Welcome{user.firstName ? `, ${user.firstName}` : ''}</h1>
          <small>{formatPhoneLocal(user.phone)}</small>
        </div>
        <button type="button" className="link" onClick={logout}>
          Log out
        </button>
      </header>

      {paymentNotice === 'success' && (
        <p className="success-msg card">Payment received — your access is now active.</p>
      )}

      <div className="card">
        <h2>Subscription</h2>
        <p style={{ marginTop: '0.75rem' }}>
          {user.hasAccess ? (
            <>
              <span className="badge badge-active">Active</span>
              <span style={{ marginLeft: '0.5rem', color: 'var(--muted)' }}>
                until {formatExpiry(user.accessExpiresAt)} ({daysLeft(user.accessExpiresAt)} days left)
              </span>
            </>
          ) : (
            <>
              <span className="badge badge-inactive">No access</span>
              <span style={{ marginLeft: '0.5rem', color: 'var(--muted)' }}>
                Pay with Whish for 30 days
              </span>
            </>
          )}
        </p>

        {!user.hasAccess && (
          <button type="button" className="btn-primary" onClick={handlePay} disabled={!!busy}>
            {busy === 'pay' ? 'Opening Whish…' : 'Pay with Whish Money'}
          </button>
        )}
      </div>

      <div className="card">
        <h2>Elevator</h2>
        <p style={{ marginTop: '0.5rem', color: 'var(--muted)', fontSize: '0.9rem' }}>
          {elevatorActive
            ? 'Breaker is on — use the elevator now.'
            : `Press to turn the breaker on for ${pulseMinutes || 1} minute${pulseMinutes === 1 ? '' : 's'}.`}
        </p>

        <button
          type="button"
          className={`btn-success elevator-btn${elevatorActive ? ' timer-active' : ''}`}
          onClick={handleCallElevator}
          disabled={!user.hasAccess || !!busy || elevatorActive}
          aria-live="polite"
        >
          {elevatorButtonLabel()}
        </button>
      </div>

      {error && <p className="error">{error}</p>}
      {success && !elevatorActive && <p className="success-msg">{success}</p>}

      {user.role === 'admin' && (
        <p style={{ marginTop: '1.5rem', textAlign: 'center' }}>
          <Link to="/admin" className="link">
            Admin — manage users
          </Link>
        </p>
      )}
    </>
  );
}
