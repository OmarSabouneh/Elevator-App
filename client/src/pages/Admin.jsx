import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { formatPhoneLocal } from '../phone';
import AdminNav from '../components/AdminNav';
import {
  isPushSupported,
  getNotificationPermission,
  getExistingSubscription,
  subscribeToPush,
  unsubscribeFromPush,
} from '../pushManager';

function Modal({ title, message, children, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">{title}</h2>
        {message && <p className="modal-message">{message}</p>}
        {children}
      </div>
    </div>
  );
}

export default function Admin() {
  const [users, setUsers] = useState([]);
  const [subscriptionDays, setSubscriptionDays] = useState(31);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activatingId, setActivatingId] = useState(null);
  const [switchState, setSwitchState] = useState({ isOn: false, indefinite: false });
  const [togglingSwitch, setTogglingSwitch] = useState(false);
  const [processingId, setProcessingId] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');

  const [availability, setAvailability] = useState(null);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [pushStatus, setPushStatus] = useState({
    supported: isPushSupported(),
    permission: getNotificationPermission(),
    subscribed: false,
  });
  const [togglingPush, setTogglingPush] = useState(false);
  const [testingPush, setTestingPush] = useState(false);

  const [modal, setModal] = useState(null);

  const closeModal = useCallback(() => setModal(null), []);

  const confirm = useCallback((title, message) => {
    return new Promise((resolve) => {
      setModal({
        type: 'confirm',
        title,
        message,
        onConfirm: () => { closeModal(); resolve(true); },
        onCancel: () => { closeModal(); resolve(false); },
      });
    });
  }, [closeModal]);

  const prompt = useCallback((title, message, inputType = 'text', defaultValue = '') => {
    return new Promise((resolve) => {
      setModal({
        type: 'prompt',
        title,
        message,
        inputType,
        defaultValue,
        onConfirm: (value) => { closeModal(); resolve(value); },
        onCancel: () => { closeModal(); resolve(null); },
      });
    });
  }, [closeModal]);

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

  async function loadSwitch() {
    try {
      const res = await api.switchState();
      if (res && res.state) setSwitchState(res.state);
    } catch (err) {
      // ignore failures
    }
  }

  async function loadAvailability() {
    try {
      const res = await api.switchAvailability();
      if (res && res.ok) {
        setAvailability(res);
      }
    } catch {
      // ignore failures
    }
  }

  async function checkAvailabilityNow() {
    setCheckingAvailability(true);
    setError('');
    setSuccess('');
    try {
      const res = await api.checkSwitchNow();
      if (res && res.result) {
        setAvailability((prev) => ({
          ...prev,
          ...res.result,
          isOnline: res.result.online,
          subscriberCount: res.subscriberCount,
          lastCheckResult: res.result,
        }));
        if (res.result.online) {
          setSuccess('Switch is online and responsive!');
        } else {
          setError(`Switch is OFFLINE: ${res.result.error || 'unreachable'}`);
        }
      }
    } catch (err) {
      setError(`Check failed: ${err.message}`);
    } finally {
      setCheckingAvailability(false);
    }
  }

  async function syncPushState() {
    if (!isPushSupported()) return;
    try {
      const sub = await getExistingSubscription();
      setPushStatus({
        supported: true,
        permission: getNotificationPermission(),
        subscribed: Boolean(sub),
      });
    } catch (err) {
      console.warn('Push sync error:', err);
    }
  }

  async function togglePushSubscription() {
    setError('');
    setSuccess('');
    setTogglingPush(true);
    try {
      if (pushStatus.subscribed) {
        await unsubscribeFromPush(api);
        setPushStatus((prev) => ({ ...prev, subscribed: false }));
        setSuccess('Push notifications disabled on this device.');
      } else {
        await subscribeToPush(api);
        setPushStatus((prev) => ({ ...prev, permission: 'granted', subscribed: true }));
        setSuccess('Push notifications enabled! You will be alerted immediately if the switch goes offline.');
        loadAvailability();
      }
    } catch (err) {
      setError(`Push notification error: ${err.message}`);
      setPushStatus((prev) => ({ ...prev, permission: getNotificationPermission() }));
    } finally {
      setTogglingPush(false);
    }
  }

  async function sendTestPush() {
    setError('');
    setSuccess('');
    setTestingPush(true);
    try {
      await api.testPushNotification();
      setSuccess('Test notification sent! Check your device notifications.');
    } catch (err) {
      setError(`Test notification failed: ${err.message}`);
    } finally {
      setTestingPush(false);
    }
  }

  useEffect(() => {
    load();
    loadSwitch();
    loadAvailability();
    syncPushState();

    const interval = setInterval(() => {
      loadAvailability();
    }, 45000); // refresh every 45s while admin is on the page
    return () => clearInterval(interval);
  }, []);

  async function activate(userId) {
    setError('');
    setSuccess('');
    const ok = await confirm('Activate Subscription', `Activate ${subscriptionDays} days of access for this user?`);
    if (!ok) return;
    setActivatingId(userId);
    try {
      await api.activateSubscription(userId);
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
      await api.setUserPermanent(userId);
      setSuccess('Subscription set to permanent.');
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
    const pw = await prompt('Change Password', 'Enter new password for this user (min 6 characters)', 'password');
    if (pw === null) return;
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
    const ok = await confirm('Delete User', 'Are you sure you want to delete this user? This cannot be undone.');
    if (!ok) return;
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

  async function createUser(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!newPhone || !newLastName.trim() || !newPassword || newPassword.length < 6) {
      setError('Phone, last name, and password (min 6 chars) are required');
      return;
    }
    setCreating(true);
    try {
      await api.createUser({ phone: newPhone, lastName: newLastName, password: newPassword });
      setSuccess('User created successfully.');
      setNewPhone('');
      setNewLastName('');
      setNewPassword('');
      setShowCreateForm(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function editSubscription(userId) {
    setError('');
    setSuccess('');
    const input = await prompt('Edit Subscription', 'Enter number of days for subscription (0 to cancel):', 'number', '');
    if (input === null) return;
    const days = parseInt(input, 10);
    if (isNaN(days) || days < 0) {
      setError('Please enter a valid non-negative number of days');
      return;
    }
    setProcessingId(userId);
    try {
      await api.editSubscription(userId, days);
      setSuccess(days === 0 ? 'Subscription cancelled.' : `Subscription set to ${days} days.`);
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
          <small>Manage users</small>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <AdminNav current="/admin" />
          <Link to="/" className="link">
            Back
          </Link>
        </div>
      </header>

      {error && <div className="msg-error" style={{ marginTop: '1rem' }} role="alert">{error}</div>}
      {success && <div className="msg-success" style={{ marginTop: '1rem' }} role="status">{success}</div>}

      <div style={{ marginTop: '1rem' }}>
        <Link
          to="/admin/switch"
          className="btn-activate"
          style={{
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            padding: '0.85rem 1rem',
            fontSize: '0.92rem',
            margin: 0,
          }}
        >
          <span>⚡ Breaker Control & Switch Status</span>
          <span style={{ opacity: 0.8 }}>→</span>
        </Link>
      </div>

      <div className="card">
        <div style={{ marginBottom: 12 }}>
          <button
            type="button"
            className="btn-primary"
            onClick={() => setShowCreateForm(!showCreateForm)}
          >
            {showCreateForm ? 'Cancel' : 'Create new user'}
          </button>
        </div>
        {showCreateForm && (
          <form className="card" onSubmit={createUser} style={{ marginBottom: 16 }}>
            <label htmlFor="newPhone">Mobile number</label>
            <input
              id="newPhone"
              type="tel"
              placeholder="Mobile number"
              inputMode="tel"
              autoComplete="tel"
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              required
            />
            <label htmlFor="newLastName">Last name</label>
            <input
              id="newLastName"
              type="text"
              placeholder="Last name"
              autoComplete="family-name"
              value={newLastName}
              onChange={(e) => setNewLastName(e.target.value)}
              required
            />
            <label htmlFor="newPassword">Password (min 6 characters)</label>
            <input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={6}
              required
            />
            <button type="submit" className="btn-primary" disabled={creating}>
              {creating ? 'Creating…' : 'Create user'}
            </button>
          </form>
        )}
        {users.length === 0 && (
          <p style={{ color: 'var(--muted)' }}>No registered users yet.</p>
        )}

        {users.length > 0 && (
          <input
            type="text"
            placeholder="Search by name or phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ marginBottom: 8 }}
          />
        )}

        {users.filter((u) => {
          if (!search.trim()) return true;
          const q = search.toLowerCase().trim();
          return (
            (u.lastName && u.lastName.toLowerCase().includes(q)) ||
            (u.firstName && u.firstName.toLowerCase().includes(q)) ||
            u.phone.toLowerCase().includes(q) ||
            formatPhoneLocal(u.phone).toLowerCase().includes(q)
          );
        }).map((u) => (
          <div key={u.id} className="user-row">
            <div className="user-row-info">
              <div className="user-row-text-line">
                <div className="user-line-primary">{formatPhoneLocal(u.phone)}</div>
                <div className="user-line-secondary">{u.lastName || '—'}</div>
                <div className="user-row-access">
                  {u.hasAccess
                    ? `Active until ${new Date(u.accessExpiresAt).toLocaleDateString()}`
                    : 'No active subscription'}
                </div>
              </div>
            </div>
            <div className="user-row-actions">
              <button
                type="button"
                className="btn-ghost"
                disabled={processingId === u.id}
                onClick={() => changePassword(u.id)}
              >
                Password
              </button>
              <button
                type="button"
                className="btn-ghost btn-ghost-danger"
                disabled={processingId === u.id}
                onClick={() => removeUser(u.id)}
              >
                Delete
              </button>
              <button
                type="button"
                className="btn-ghost"
                disabled={activatingId === u.id}
                onClick={() => activate(u.id)}
              >
                {activatingId === u.id
                  ? 'Activating…'
                  : 'Activate'}
              </button>
              <button
                type="button"
                className="btn-ghost"
                disabled={processingId === u.id}
                onClick={() => editSubscription(u.id)}
              >
                Edit
              </button>
            </div>
          </div>
        ))}
      </div>

      {error && <p className="error">{error}</p>}
      {success && <p className="success-msg">{success}</p>}

      {modal && modal.type === 'confirm' && (
        <Modal
          title={modal.title}
          message={modal.message}
          onClose={modal.onCancel}
        >
          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={modal.onCancel}>
              Cancel
            </button>
            <button type="button" className="btn-danger" onClick={modal.onConfirm}>
              Confirm
            </button>
          </div>
        </Modal>
      )}

      {modal && modal.type === 'prompt' && (
        <PromptModal modal={modal} />
      )}
    </>
  );
}

function PromptModal({ modal }) {
  const [value, setValue] = useState(modal.defaultValue ?? '');

  return (
    <div className="modal-overlay" onClick={modal.onCancel}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">{modal.title}</h2>
        {modal.message && <p className="modal-message">{modal.message}</p>}
        <input
          type={modal.inputType}
          className="modal-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') modal.onConfirm(value);
          }}
        />
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={modal.onCancel}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={() => modal.onConfirm(value)}>
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}