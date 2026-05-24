import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { formatPhoneLocal } from '../phone';

export default function Admin() {
  const [tab, setTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [payments, setPayments] = useState([]);
  const [error, setError] = useState('');

  async function load() {
    setError('');
    try {
      if (tab === 'users') {
        const { users: u } = await api.adminUsers();
        setUsers(u);
      } else {
        const { payments: p } = await api.adminPayments();
        setPayments(p);
      }
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, [tab]);

  async function grantDays(userId) {
    const days = prompt('Grant how many days?', '30');
    if (!days) return;
    try {
      await api.extendAccess(userId, Number(days));
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <>
      <header className="header">
        <div>
          <h1>Admin</h1>
          <small>User database</small>
        </div>
        <Link to="/" className="link">
          Back
        </Link>
      </header>

      <div className="tabs">
        <button type="button" className={tab === 'users' ? 'active' : ''} onClick={() => setTab('users')}>
          Users ({users.length || '…'})
        </button>
        <button
          type="button"
          className={tab === 'payments' ? 'active' : ''}
          onClick={() => setTab('payments')}
        >
          Payments
        </button>
      </div>

      <div className="card">
        {tab === 'users' &&
          users.map((u) => (
            <div key={u.id} className="user-row">
              <div>
                <div>{formatPhoneLocal(u.phone)}</div>
                <small style={{ color: 'var(--muted)' }}>
                  {u.hasAccess ? `Active until ${new Date(u.accessExpiresAt).toLocaleDateString()}` : 'No access'}
                  {u.role === 'admin' ? ' · admin' : ''}
                </small>
              </div>
              <button type="button" className="link" onClick={() => grantDays(u.id)}>
                +30d
              </button>
            </div>
          ))}

        {tab === 'payments' &&
          payments.map((p) => (
            <div key={p.id} className="user-row">
              <div>
                <div>{formatPhoneLocal(p.phone)}</div>
                <small style={{ color: 'var(--muted)' }}>
                  {p.order_id} · {p.amount} {p.currency} · {p.status}
                </small>
              </div>
            </div>
          ))}
      </div>

      {error && <p className="error">{error}</p>}
    </>
  );
}
