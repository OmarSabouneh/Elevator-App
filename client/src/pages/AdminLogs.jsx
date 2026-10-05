import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { formatPhoneLocal } from '../phone';
import AdminNav from '../components/AdminNav';

function getLocalDateString(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDayHeading(dateString) {
  if (!dateString) return '';
  const [y, m, d] = dateString.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  return dateObj.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(isoString) {
  if (!isoString) return '--:--:--';
  const d = new Date(isoString);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function getActionDetails(action) {
  switch (action) {
    case 'switch_indefinite_on':
      return { label: 'Breaker On (Indefinite)', badgeClass: 'badge-indefinite' };
    case 'switch_on':
      return { label: 'Breaker On (Manual)', badgeClass: 'badge-manual' };
    case 'elevator_call':
    default:
      return { label: 'Elevator Call', badgeClass: 'badge-call' };
  }
}

export default function AdminLogs() {
  const [selectedDate, setSelectedDate] = useState(() => getLocalDateString());
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('all');
  const [users, setUsers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Load user list for the user filter dropdown
  useEffect(() => {
    api.adminUsers()
      .then((res) => {
        if (res && res.users) {
          setUsers(res.users);
        }
      })
      .catch(() => {});
  }, []);

  const fetchLogs = useCallback(async () => {
    if (!selectedDate) return;
    setLoading(true);
    setError('');

    try {
      const [y, m, d] = selectedDate.split('-').map(Number);
      const startHourMin = startTime ? startTime.split(':').map(Number) : [0, 0, 0];
      const endHourMin = endTime ? endTime.split(':').map(Number) : [23, 59, 59];

      const startObj = new Date(y, m - 1, d, startHourMin[0], startHourMin[1], startHourMin[2] || 0, 0);
      const endObj = new Date(y, m - 1, d, endHourMin[0], endHourMin[1], endHourMin[2] !== undefined ? endHourMin[2] : 59, 999);

      const params = {
        from: startObj.toISOString(),
        to: endObj.toISOString(),
      };
      if (selectedUserId && selectedUserId !== 'all') {
        params.userId = selectedUserId;
      }

      const res = await api.adminLogs(params);
      setLogs(res.logs || []);
    } catch (err) {
      setError(err.message || 'Failed to load logs');
    } finally {
      setLoading(false);
    }
  }, [selectedDate, startTime, endTime, selectedUserId]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const todayStr = useMemo(() => getLocalDateString(), []);
  const isToday = selectedDate === todayStr;

  function stepDay(offset) {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d + offset);
    const nextStr = getLocalDateString(dateObj);
    setSelectedDate(nextStr);
  }

  function resetFilters() {
    setStartTime('');
    setEndTime('');
    setSelectedUserId('all');
  }

  const hasActiveFilters = startTime !== '' || endTime !== '' || selectedUserId !== 'all';

  return (
    <>
      <header className="header">
        <div>
          <h1>Activity Logs</h1>
          <small>Turn-on history (retained 60 days)</small>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <AdminNav current="/admin/logs" />
          <Link to="/" className="link">
            Back
          </Link>
        </div>
      </header>

      {/* Day Selector */}
      <div className="card log-day-card">
        <div className="log-day-nav">
          <button
            type="button"
            className="btn-day-nav"
            onClick={() => stepDay(-1)}
            aria-label="Previous day"
          >
            ← Prev
          </button>

          <div className="log-date-picker-wrap">
            <input
              type="date"
              className="log-date-input"
              value={selectedDate}
              max={todayStr}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
          </div>

          <button
            type="button"
            className="btn-day-nav"
            onClick={() => stepDay(1)}
            disabled={selectedDate >= todayStr}
            aria-label="Next day"
          >
            Next →
          </button>

          {!isToday && (
            <button
              type="button"
              className="btn-day-today"
              onClick={() => setSelectedDate(todayStr)}
            >
              Today
            </button>
          )}
        </div>

        <div className="log-day-title-row">
          <span className="log-day-heading">{formatDayHeading(selectedDate)}</span>
          <span className="badge badge-count">
            {logs.length} turn-on{logs.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      {/* Filters Card */}
      <div className="card log-filter-card">
        <div className="log-filter-row">
          <div className="log-filter-field">
            <label htmlFor="userFilter">Filter by User</label>
            <select
              id="userFilter"
              className="log-select"
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
            >
              <option value="all">All Users</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.lastName ? `${u.lastName} (${formatPhoneLocal(u.phone)})` : formatPhoneLocal(u.phone)}
                </option>
              ))}
            </select>
          </div>

          <div className="log-filter-time-group">
            <div className="log-filter-field">
              <label htmlFor="startTime">From</label>
              <input
                id="startTime"
                type="time"
                className="log-time-input"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div className="log-filter-field">
              <label htmlFor="endTime">To</label>
              <input
                id="endTime"
                type="time"
                className="log-time-input"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="log-filter-actions">
          {hasActiveFilters && (
            <button
              type="button"
              className="btn-clear-filters"
              onClick={resetFilters}
            >
              Reset Filters
            </button>
          )}
          <button
            type="button"
            className="btn-refresh"
            onClick={fetchLogs}
            disabled={loading}
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      {/* Logs Timeline */}
      <div className="card log-list-card">
        {loading && logs.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--muted)', padding: '1.5rem 0' }}>
            Loading logs…
          </p>
        ) : logs.length === 0 ? (
          <div className="log-empty-state">
            <div className="log-empty-icon">📋</div>
            <p className="log-empty-title">No turn-on events found</p>
            <p className="log-empty-subtitle">
              {hasActiveFilters
                ? 'Try adjusting your user or time range filters.'
                : 'No elevator activation commands were recorded for this day.'}
            </p>
          </div>
        ) : (
          <div className="log-timeline">
            {logs.map((log) => {
              const actionInfo = getActionDetails(log.action);
              const displayName =
                log.user.lastName ||
                (log.user.firstName ? `${log.user.firstName} ${log.user.lastName || ''}`.trim() : null) ||
                (log.user.role === 'admin' ? 'Admin' : 'Unknown');

              return (
                <div key={log.id} className="log-item">
                  <div className="log-time-badge">
                    <span className="log-time">{formatTime(log.createdAt)}</span>
                  </div>

                  <div className="log-details">
                    <div className="log-primary-row">
                      <span className="log-user-name">{displayName}</span>
                      <span className={`badge ${actionInfo.badgeClass}`}>
                        {actionInfo.label}
                      </span>
                    </div>

                    <div className="log-secondary-row">
                      <span className="log-phone">
                        {log.user.phone ? formatPhoneLocal(log.user.phone) : '—'}
                      </span>
                      {log.user.role === 'admin' && (
                        <span className="badge badge-admin-tag">Admin</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Free Supabase Protection Banner */}
      <div className="log-retention-banner">
        <span>🛡️</span>
        <span>
          <strong>Free Supabase Tier Protected:</strong> Logs are stored with automatic 60-day rolling retention to ensure zero quota overflow.
        </span>
      </div>
    </>
  );
}
