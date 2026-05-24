const API = '/api';

function headers() {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function request(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: { ...headers(), ...options.headers },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || 'Request failed');
  return data;
}

export const api = {
  register: (body) => request('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  login: (body) => request('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  me: () => request('/me'),
  createPayment: () => request('/payments/create', { method: 'POST' }),
  mockComplete: (orderId) =>
    request('/payments/mock-complete', { method: 'POST', body: JSON.stringify({ orderId }) }),
  elevatorConfig: () => request('/elevator/config'),
  callElevator: () => request('/elevator/call', { method: 'POST' }),
  adminUsers: () => request('/admin/users'),
  adminPayments: () => request('/admin/payments'),
  extendAccess: (id, days) =>
    request(`/admin/users/${id}/access`, { method: 'PATCH', body: JSON.stringify({ days }) }),
};
