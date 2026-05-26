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
  const [processingId, setProcessingId] = useState(null);

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

  async function makeMyPermanent() {
    setError('');
    setSuccess('');
    try {
      const res = await api.setMyPermanent();
      if (res && res.accessExpiresAt) setSuccess('Your subscription is now permanent.');
    } catch (err) {
      setError(err.message);
    }
  }

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

  async function makePermanent(userId) {
    setError('');
    setSuccess('');
    setProcessingId(userId);
    try {
      const res = await api.setUserPermanent(userId);
      if (res && res.accessExpiresAt) setSuccess('Subscription set to permanent.');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setProcessingId(null);
    }
  }

  async function changePassword(userId) {
    setError('');
    setSuccess('');
    const pw = window.prompt('Enter new password for this user (min 6 chars)');
    if (!pw) return;
    if (pw.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    setProcessingId(userId);
    try {
      await api.setUserPassword(userId, pw);
      setSuccess('Password updated.');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setProcessingId(null);
    }
  }

  async function removeUser(userId) {
    setError('');
    setSuccess('');
    if (!window.confirm('Delete this user? This cannot be undone.')) return;
    setProcessingId(userId);
    try {
      await api.deleteUser(userId);
      setSuccess('User deleted.');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setProcessingId(null);
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
        <div style={{ marginBottom: 12 }}>
          <button type="button" className="btn-ghost" onClick={makeMyPermanent}>
            Make my subscription permanent
          </button>
        </div>
        {users.length === 0 && (
          <p style={{ color: 'var(--muted)' }}>No registered users yet.</p>
        )}

        {users.map((u) => (
          <div key={u.id} className="user-row" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
            <div style={{ width: '100%', marginBottom: 8 }}>
              <div className="user-line-primary">{formatPhoneLocal(u.phone)}</div>
              <div className="user-line-secondary">{u.lastName || '—'}</div>
              <small style={{ color: 'var(--muted)' }}>
                {u.hasAccess
                  ? `Active until ${new Date(u.accessExpiresAt).toLocaleDateString()}`
                  : 'No active subscription'}
              </small>
            </div>
            <div style={{ display: 'flex', gap: 8, width: '100%' }}>
              <button
                type="button"
                className="btn-ghost"
                disabled={processingId === u.id}
                onClick={() => changePassword(u.id)}
              >
                Change password
              </button>
              <button
                type="button"
                className="btn-ghost"
                style={{ background: 'transparent', color: 'var(--danger)' }}
                disabled={processingId === u.id}
                onClick={() => removeUser(u.id)}
              >
                Delete
              </button>
              <div style={{ marginLeft: 'auto' }}>
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
            </div>
          </div>
        ))}
      </div>

      {error && <p className="error">{error}</p>}
      {success && <p className="success-msg">{success}</p>}
    </>
  );
}
