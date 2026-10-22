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
          <small>Manage users & breaker</small>
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

      {/* Switch Availability & Push Notifications Card */}
      <div className="switch-status-card">
        <div className="switch-status-header">
          <div className="switch-status-title">
            <span>⚡ Breaker Switch Status</span>
          </div>
          <div>
            {checkingAvailability ? (
              <span className="status-badge checking">
                <span className="dot-indicator checking" /> Checking…
              </span>
            ) : availability?.isOnline === true ? (
              <span className="status-badge online">
                <span className="dot-indicator online" /> Online
              </span>
            ) : availability?.isOnline === false ? (
              <span className="status-badge offline">
                <span className="dot-indicator offline" /> Offline
              </span>
            ) : (
              <span className="status-badge checking">
                <span className="dot-indicator checking" /> Monitoring
              </span>
            )}
          </div>
        </div>

        <div className="switch-meta-grid">
          <div className="switch-meta-item">
            <span className="switch-meta-label">Switch Device</span>
            <span className="switch-meta-value">
              {availability?.lastCheckResult?.deviceName ||
                availability?.lastCheckResult?.switchType?.toUpperCase() ||
                'Tuya Switch'}
            </span>
          </div>
          <div className="switch-meta-item">
            <span className="switch-meta-label">Check Cadence</span>
            <span className="switch-meta-value">Every {availability?.intervalMinutes || 5} min</span>
          </div>
          <div className="switch-meta-item">
            <span className="switch-meta-label">Last Checked</span>
            <span className="switch-meta-value">
              {availability?.lastCheckAt
                ? new Date(availability.lastCheckAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                : 'Initial check soon'}
            </span>
          </div>
          <div className="switch-meta-item">
            <span className="switch-meta-label">Alert Subscribers</span>
            <span className="switch-meta-value">
              {availability?.subscriberCount !== undefined ? `${availability.subscriberCount} device(s)` : '0 device(s)'}
            </span>
          </div>
        </div>

        {availability?.isOnline === false && (
          <div className="msg-error" style={{ margin: '0.65rem 0' }}>
            ⚠️ <strong>Switch is currently OFFLINE!</strong> {availability?.lastCheckResult?.error || 'Unreachable via WiFi / Tuya Cloud.'}
          </div>
        )}

        <div className="switch-actions-row">
          <button
            type="button"
            className="btn-activate"
            onClick={checkAvailabilityNow}
            disabled={checkingAvailability}
            style={{ width: 'auto', flex: 1 }}
          >
            {checkingAvailability ? 'Checking…' : '🔄 Check Switch Now'}
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={toggleIndefinite}
            disabled={togglingSwitch}
            style={{ width: 'auto', flex: 1.2 }}
          >
            {togglingSwitch
              ? 'Updating…'
              : switchState.indefinite
              ? 'Turn breaker off'
              : 'Keep ON indefinitely'}
          </button>
        </div>

        {/* Push Notification Section */}
        <div className="push-section">
          <div className="push-section-header">
            <div className="push-section-title">
              <span>🔔 Push Notifications</span>
            </div>
            <span className="push-status-text">
              {!pushStatus.supported
                ? 'Not supported in this browser'
                : pushStatus.subscribed
                ? '✅ Active on this device'
                : pushStatus.permission === 'denied'
                ? '🚫 Blocked in browser'
                : 'Not enabled'}
            </span>
          </div>

          <div className="switch-actions-row">
            {pushStatus.supported && (
              <button
                type="button"
                className={pushStatus.subscribed ? 'btn-ghost-danger' : 'btn-activate'}
                onClick={togglePushSubscription}
                disabled={togglingPush || pushStatus.permission === 'denied'}
                style={{ width: 'auto', flex: 1 }}
              >
                {togglingPush
                  ? 'Saving…'
                  : pushStatus.subscribed
                  ? 'Disable Push'
                  : 'Enable Push Notifications'}
              </button>
            )}
            {pushStatus.subscribed && (
              <button
                type="button"
                className="btn-activate"
                onClick={sendTestPush}
                disabled={testingPush}
                style={{ width: 'auto', flex: 1 }}
              >
                {testingPush ? 'Sending…' : '📨 Send Test Push'}
              </button>
            )}
          </div>

          <div className="push-tip-box">
            💡 <strong>Instant Alerts:</strong> If the switch goes offline, the server immediately pushes a notification to all registered admin devices.
            Works on Android (Chrome or PWA installed to Home Screen) and Desktop without needing a new APK!
          </div>
        </div>
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