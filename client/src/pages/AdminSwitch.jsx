import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import AdminNav from '../components/AdminNav';
import {
  isPushSupported,
  getNotificationPermission,
  getExistingSubscription,
  subscribeToPush,
  unsubscribeFromPush,
} from '../pushManager';

export default function AdminSwitch() {
  const [switchState, setSwitchState] = useState({ isOn: false, indefinite: false });
  const [togglingSwitch, setTogglingSwitch] = useState(false);
  const [availability, setAvailability] = useState(null);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showHelpModal, setShowHelpModal] = useState(false);

  const [pushStatus, setPushStatus] = useState({
    supported: isPushSupported(),
    permission: getNotificationPermission(),
    subscribed: false,
  });
  const [togglingPush, setTogglingPush] = useState(false);
  const [testingPush, setTestingPush] = useState(false);

  const isInsideApp =
    typeof window !== 'undefined' &&
    (Boolean(window.AndroidBridge) || /;\s*wv/i.test(navigator.userAgent || ''));

  function openInBrowser() {
    const targetUrl = window.location.origin + '/admin/switch';
    if (window.AndroidBridge && typeof window.AndroidBridge.openInExternalBrowser === 'function') {
      window.AndroidBridge.openInExternalBrowser(targetUrl);
    } else {
      window.open(targetUrl + '?open_external=true', '_blank');
    }
  }

  const loadSwitchState = useCallback(async () => {
    try {
      const res = await api.switchState();
      if (res && res.state) setSwitchState(res.state);
    } catch {
      /* ignore */
    }
  }, []);

  const loadAvailability = useCallback(async () => {
    try {
      const res = await api.switchAvailability();
      if (res && res.ok) {
        setAvailability(res);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const syncPushState = useCallback(async () => {
    if (!isPushSupported()) {
      setPushStatus({
        supported: false,
        permission: 'unsupported',
        subscribed: false,
      });
      return;
    }
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
  }, []);

  useEffect(() => {
    loadSwitchState();
    loadAvailability();
    syncPushState();

    const interval = setInterval(() => {
      loadAvailability();
      loadSwitchState();
      syncPushState();
    }, 30000); // 30-sec refresh while admin is on the switch page

    return () => clearInterval(interval);
  }, [loadSwitchState, loadAvailability, syncPushState]);

  async function toggleIndefinite() {
    setTogglingSwitch(true);
    setError('');
    setSuccess('');
    try {
      const turnOn = !switchState.indefinite;
      const res = await api.setIndefiniteSwitch(turnOn);
      if (res && res.indefinite !== undefined) {
        const isIndef = Boolean(res.indefinite);
        setSwitchState({ ...switchState, indefinite: isIndef, isOn: res.state === 'on' });
        setSuccess(
          isIndef
            ? 'Breaker is now locked ON indefinitely.'
            : 'Indefinite mode disabled. Breaker is now OFF.'
        );
      }
    } catch (err) {
      setError(err.message || 'Failed to toggle breaker mode');
    } finally {
      setTogglingSwitch(false);
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
          setSuccess('Switch is ONLINE and responding normally!');
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

  async function handlePushClick() {
    setError('');
    setSuccess('');

    // If notifications are blocked by the browser or Android settings
    if (pushStatus.permission === 'denied') {
      setShowHelpModal(true);
      return;
    }

    if (!pushStatus.supported) {
      setShowHelpModal(true);
      return;
    }

    setTogglingPush(true);
    try {
      if (pushStatus.subscribed) {
        await unsubscribeFromPush(api);
        setPushStatus((prev) => ({ ...prev, subscribed: false }));
        setSuccess('Push notifications disabled on this device.');
      } else {
        await subscribeToPush(api);
        setPushStatus((prev) => ({ ...prev, permission: 'granted', subscribed: true }));
        setSuccess('Push notifications ENABLED! You will be alerted immediately if the switch goes offline.');
        loadAvailability();
      }
    } catch (err) {
      const currentPerm = getNotificationPermission();
      setPushStatus((prev) => ({ ...prev, permission: currentPerm }));
      if (currentPerm === 'denied') {
        setShowHelpModal(true);
      } else {
        setError(`Notification setup error: ${err.message}`);
      }
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
      setSuccess('Test push notification sent! Check your notification bar.');
    } catch (err) {
      setError(`Test notification failed: ${err.message}`);
    } finally {
      setTestingPush(false);
    }
  }

  return (
    <>
      <header className="header">
        <div>
          <h1>Breaker & Switch</h1>
          <small>Status, keep-on mode & push alerts</small>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <AdminNav current="/admin/switch" />
          <Link to="/" className="link">
            Back
          </Link>
        </div>
      </header>

      {error && <div className="msg-error" style={{ marginTop: '1rem' }} role="alert">{error}</div>}
      {success && <div className="msg-success" style={{ marginTop: '1rem' }} role="status">{success}</div>}

      {/* 1. Indefinite Breaker Control Card */}
      <div className="card" style={{ marginTop: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <h2 style={{ color: 'var(--text)', fontSize: '1.05rem', margin: 0, fontWeight: 700 }}>
            ⚡ Indefinite Power (Keep On)
          </h2>
          <span
            className={`status-badge ${switchState.indefinite ? 'online' : 'checking'}`}
            style={{ fontSize: '0.78rem' }}
          >
            {switchState.indefinite ? 'LOCKED ON' : 'AUTO-OFF TIMER'}
          </span>
        </div>

        <p style={{ color: 'var(--muted)', fontSize: '0.85rem', lineHeight: 1.45, marginBottom: '0.85rem' }}>
          When <strong>Indefinite Mode</strong> is enabled, the elevator breaker stays powered continuously without timing out. Use this for moving furniture, elevator inspections, or emergency bypass.
        </p>

        <button
          type="button"
          className={switchState.indefinite ? 'btn-ghost-danger' : 'btn-activate'}
          onClick={toggleIndefinite}
          disabled={togglingSwitch}
          style={{ width: '100%', margin: 0 }}
        >
          {togglingSwitch
            ? 'Updating breaker…'
            : switchState.indefinite
            ? '🛑 Turn Breaker Off (Disable Indefinite)'
            : '⚡ Turn Breaker ON Indefinitely'}
        </button>
      </div>

      {/* 2. Switch Availability & Live Status Card */}
      <div className="switch-status-card">
        <div className="switch-status-header">
          <div className="switch-status-title">
            <span>📡 Switch Connection Status</span>
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
            <span className="switch-meta-label">Connected Switch</span>
            <span className="switch-meta-value">
              {availability?.lastCheckResult?.deviceName ||
                availability?.lastCheckResult?.switchType?.toUpperCase() ||
                'Tuya Switch'}
            </span>
          </div>
          <div className="switch-meta-item">
            <span className="switch-meta-label">Auto-Check Cadence</span>
            <span className="switch-meta-value">Every {availability?.intervalMinutes || 5} minutes</span>
          </div>
          <div className="switch-meta-item">
            <span className="switch-meta-label">Last Checked</span>
            <span className="switch-meta-value">
              {availability?.lastCheckAt
                ? new Date(availability.lastCheckAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                : 'Pending initial check'}
            </span>
          </div>
          <div className="switch-meta-item">
            <span className="switch-meta-label">Subscribed Admins</span>
            <span className="switch-meta-value">
              {availability?.subscriberCount !== undefined ? `${availability.subscriberCount} device(s)` : '0 device(s)'}
            </span>
          </div>
        </div>

        {availability?.isOnline === false && (
          <div className="msg-error" style={{ margin: '0.75rem 0' }}>
            ⚠️ <strong>ALERT: Switch is OFFLINE!</strong> {availability?.lastCheckResult?.error || 'Device is not reachable via WiFi.'}
          </div>
        )}

        <div className="switch-actions-row">
          <button
            type="button"
            className="btn-activate"
            onClick={checkAvailabilityNow}
            disabled={checkingAvailability}
            style={{ width: '100%', margin: 0 }}
          >
            {checkingAvailability ? 'Checking status…' : '🔄 Check Switch Availability Now'}
          </button>
        </div>
      </div>

      {/* 3. Push Notifications Card */}
      <div className="switch-status-card">
        <div className="switch-status-header">
          <div className="switch-status-title">
            <span>🔔 Admin Push Notifications</span>
          </div>
          <span className="push-status-text">
            {pushStatus.subscribed
              ? '✅ ACTIVE'
              : pushStatus.permission === 'denied'
              ? '🚫 DISABLED'
              : 'OFF'}
          </span>
        </div>

        <p style={{ color: 'var(--muted)', fontSize: '0.85rem', lineHeight: 1.45, marginBottom: '0.85rem' }}>
          When the switch is unreachable during a 5-minute check, an instant push notification is dispatched to all registered admin devices.
        </p>

        <div className="switch-actions-row" style={{ marginTop: 0 }}>
          {isInsideApp && !pushStatus.subscribed ? (
            <button
              type="button"
              className="btn-activate"
              onClick={openInBrowser}
              style={{ width: '100%', margin: 0 }}
            >
              🌐 Open in Chrome to Enable Push Alerts
            </button>
          ) : (
            <button
              type="button"
              className={
                pushStatus.subscribed
                  ? 'btn-ghost-danger'
                  : pushStatus.permission === 'denied'
                  ? 'btn-primary'
                  : 'btn-activate'
              }
              onClick={handlePushClick}
              disabled={togglingPush}
              style={{ width: 'auto', flex: 1.2, margin: 0 }}
            >
              {togglingPush
                ? 'Saving…'
                : pushStatus.subscribed
                ? 'Disable Push Alerts'
                : pushStatus.permission === 'denied'
                ? '⚠️ Enable (Blocked in Settings)'
                : '🔔 Enable Push Notifications'}
            </button>
          )}

          {pushStatus.subscribed && (
            <button
              type="button"
              className="btn-activate"
              onClick={sendTestPush}
              disabled={testingPush}
              style={{ width: 'auto', flex: 1, margin: 0 }}
            >
              {testingPush ? 'Sending…' : '📨 Send Test Push'}
            </button>
          )}
        </div>

        {isInsideApp && !pushStatus.subscribed && (
          <div
            style={{
              background: 'rgba(59, 130, 246, 0.12)',
              border: '1px solid rgba(59, 130, 246, 0.35)',
              borderRadius: 8,
              padding: '0.75rem',
              marginTop: '0.75rem',
              fontSize: '0.82rem',
              color: '#93c5fd',
              lineHeight: 1.45,
            }}
          >
            <strong>📱 Running in Elevator App (APK)</strong>
            <br />
            To receive instant push notifications when the switch goes offline, tap <strong>"Open in Chrome"</strong> above to allow notifications once in Chrome. Once enabled, alerts arrive in your phone notification tray even when Chrome is closed.
          </div>
        )}

        {pushStatus.permission === 'denied' && (
          <div
            style={{
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              borderRadius: 8,
              padding: '0.75rem',
              marginTop: '0.75rem',
              fontSize: '0.82rem',
              color: '#fca5a5',
              lineHeight: 1.4,
            }}
          >
            <strong>Notifications are disabled in your settings!</strong>
            <br />
            To enable: Tap <strong>"Enable (Blocked in Settings)"</strong> above for instructions on allowing notifications in Android or your browser.
          </div>
        )}

        <div className="push-tip-box" style={{ marginTop: '0.75rem' }}>
          💡 <strong>Tip:</strong> Push notifications deliver to Android, iPhones (installed to Home Screen), and Desktop browsers.
        </div>
      </div>

      {/* Help Modal when notifications are denied */}
      {showHelpModal && (
        <div className="modal-overlay" onClick={() => setShowHelpModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title" style={{ color: 'var(--text)' }}>
              🔔 How to Enable Notifications
            </h2>
            <div style={{ color: 'var(--text)', fontSize: '0.9rem', lineHeight: 1.5, margin: '1rem 0' }}>
              <p style={{ marginBottom: '0.75rem' }}>
                Your phone or browser currently has notifications <strong>disabled</strong> or <strong>blocked</strong> for this app.
              </p>

              {isInsideApp && (
                <div style={{ background: 'var(--bg)', padding: '0.75rem', borderRadius: 8, border: '1px solid var(--accent)', marginBottom: '0.75rem' }}>
                  <strong style={{ color: 'var(--accent)' }}>Recommended for Android Phone:</strong>
                  <p style={{ fontSize: '0.85rem', color: 'var(--muted)', margin: '0.4rem 0 0.6rem 0' }}>
                    Open this page in Google Chrome to subscribe with one tap. Once subscribed, notifications arrive automatically.
                  </p>
                  <button
                    type="button"
                    className="btn-activate"
                    onClick={() => {
                      setShowHelpModal(false);
                      openInBrowser();
                    }}
                    style={{ width: '100%', margin: 0, padding: '0.65rem 1rem', fontSize: '0.85rem' }}
                  >
                    🌐 Open in Chrome Now
                  </button>
                </div>
              )}

              <div style={{ background: 'var(--bg)', padding: '0.75rem', borderRadius: 8, border: '1px solid var(--surface2)', marginBottom: '0.75rem' }}>
                <strong style={{ color: 'var(--accent)' }}>On Android Phone Settings:</strong>
                <ol style={{ paddingLeft: '1.25rem', marginTop: '0.4rem', color: 'var(--muted)', fontSize: '0.85rem' }}>
                  <li>Open phone <strong>Settings</strong> → <strong>Apps</strong></li>
                  <li>Select <strong>Elevator App</strong> (or <strong>Chrome</strong>)</li>
                  <li>Tap <strong>Notifications</strong></li>
                  <li>Switch <strong>Allow notifications</strong> to <strong style={{ color: 'var(--success)' }}>ON</strong></li>
                </ol>
              </div>

              <div style={{ background: 'var(--bg)', padding: '0.75rem', borderRadius: 8, border: '1px solid var(--surface2)' }}>
                <strong style={{ color: 'var(--accent)' }}>In Chrome / Mobile Browser:</strong>
                <ol style={{ paddingLeft: '1.25rem', marginTop: '0.4rem', color: 'var(--muted)', fontSize: '0.85rem' }}>
                  <li>Tap the <strong>tune/lock icon</strong> to the left of the website URL</li>
                  <li>Tap <strong>Permissions</strong> → <strong>Notifications</strong></li>
                  <li>Change from <em>Blocked</em> to <strong style={{ color: 'var(--success)' }}>Allow</strong></li>
                  <li>Reload this page and tap <strong>Enable Push Notifications</strong></li>
                </ol>
              </div>
            </div>

            <div className="modal-actions" style={{ display: 'flex', gap: '0.5rem' }}>
              {isInsideApp && (
                <button
                  type="button"
                  className="btn-activate"
                  onClick={() => {
                    setShowHelpModal(false);
                    openInBrowser();
                  }}
                  style={{ flex: 1 }}
                >
                  🌐 Open in Chrome
                </button>
              )}
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  setShowHelpModal(false);
                  syncPushState();
                }}
                style={{ flex: 1 }}
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
