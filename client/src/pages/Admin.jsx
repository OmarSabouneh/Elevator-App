import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { formatPhoneLocal } from '../phone';

export default function Admin() {
  const [users, setUsers] = useState([]);
  const [subscriptionDays, setSubscriptionDays] = useState(31);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activatingId, setActivatingId] = useState(null);
  const [switchState, setSwitchState] = useState({ isOn: false, indefinite: false });
  const [togglingSwitch, setTogglingSwitch] = useState(false);

  async function load() {
    setError('');
    setSuccess('');
    try {
      const { users: u, subscriptionDays: days } = await api.adminUsers();
      setUsers(u);
      if (days) setSubscriptionDays(days);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
    loadSwitch();
  }, []);

  async function loadSwitch() {
    try {
      const res = await api.switchState();
      if (res && res.state) setSwitchState(res.state);
    } catch (err) {
      // ignore failures
    }
  }

  async function activate(userId) {
    setError('');
    setSuccess('');
    setActivatingId(userId);
    try {
      const res = await api.activateSubscription(userId);
      setSuccess(`Access activated for ${subscriptionDays} days.`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setActivatingId(null);
    }
  }

  async function toggleIndefinite() {
    setTogglingSwitch(true);
    try {
      const turnOn = !switchState.indefinite;
      const res = await api.setIndefiniteSwitch(turnOn);
      if (res && res.indefinite !== undefined) {
        setSwitchState({ ...switchState, indefinite: res.indefinite, isOn: res.state === 'on' });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setTogglingSwitch(false);
    }
  }

  return (
    <>
      <header className="header">
        <div>
          <h1>Admin</h1>
          <small>Activate subscriptions manually</small>
        </div>
        <Link to="/" className="link">
          Back
        </Link>
      </header>

      <div className="card">
        <div style={{ marginBottom: 12 }}>
          <button
            type="button"
            className="btn-activate"
            onClick={toggleIndefinite}
            disabled={togglingSwitch}
          >
            {togglingSwitch
              ? 'Updating…'
              : switchState.indefinite
              ? 'Turn breaker off'
              : 'Turn breaker on indefinitely'}
          </button>
        </div>
        {users.length === 0 && (
          <p style={{ color: 'var(--muted)' }}>No registered users yet.</p>
        )}

        {users.map((u) => (
          <div key={u.id} className="user-row">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="user-line-primary">{formatPhoneLocal(u.phone)}</div>
              <div className="user-line-secondary">{u.lastName || '—'}</div>
              <small style={{ color: 'var(--muted)' }}>
                {u.hasAccess
                  ? `Active until ${new Date(u.accessExpiresAt).toLocaleDateString()}`
                  : 'No active subscription'}
              </small>
            </div>
            <button
              type="button"
              className="btn-activate"
              disabled={activatingId === u.id}
              onClick={() => activate(u.id)}
            >
              {activatingId === u.id
                ? 'Activating…'
                : `Activate ${subscriptionDays} days`}
            </button>
          </div>
        ))}
      </div>

      {error && <p className="error">{error}</p>}
      {success && <p className="success-msg">{success}</p>}
    </>
  );
}
