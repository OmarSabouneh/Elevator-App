const API = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');

function headers() {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(`${API}${path}`, {
      ...options,
      headers: { ...headers(), ...options.headers },
    });
  } catch (err) {
    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
    const hint = import.meta.env.VITE_API_URL
      ? `API: ${import.meta.env.VITE_API_URL}`
      : 'VITE_API_URL is not set.';
    const msg = isOffline
      ? 'No internet connection. Please check your network and try again.'
      : `Cannot reach the server. ${hint}`;
    const networkErr = new Error(msg);
    networkErr.isNetworkError = true;
    networkErr.status = 0;
    throw networkErr;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || data.message || 'Request failed');
    error.status = res.status;
    throw error;
  }
  return data;
}

export const api = {
  login: (body) => request('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  me: () => request('/me'),
  elevatorConfig: () => request('/elevator/config'),
  callElevator: () => request('/elevator/call', { method: 'POST' }),
  adminUsers: () => request('/admin/users'),
  activateSubscription: (id) =>
    request(`/admin/users/${id}/activate`, { method: 'POST' }),
  switchState: () => request('/switch/state'),
  setIndefiniteSwitch: (on) => request('/switch/indefinite', { method: 'POST', body: JSON.stringify({ on }) }),
  setUserPermanent: (id) => request(`/admin/users/${id}/permanent`, { method: 'POST' }),
  setUserPassword: (id, password) => request(`/admin/users/${id}/password`, { method: 'POST', body: JSON.stringify({ password }) }),
  deleteUser: (id) => request(`/admin/users/${id}`, { method: 'DELETE' }),
  editSubscription: (id, days) => request(`/admin/users/${id}/subscription`, { method: 'POST', body: JSON.stringify({ days }) }),
  createUser: (body) => request('/admin/users', { method: 'POST', body: JSON.stringify(body) }),
  adminLogs: (params = {}) => {
    const cleanParams = Object.fromEntries(
      Object.entries(params).filter(([_, v]) => v !== undefined && v !== null && v !== '')
    );
    const qs = new URLSearchParams(cleanParams).toString();
    return request(`/admin/logs${qs ? '?' + qs : ''}`);
  },
};
