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
  } catch {
    const hint = import.meta.env.VITE_API_URL
      ? `API: ${import.meta.env.VITE_API_URL}`
      : 'VITE_API_URL is not set (Vercel must rebuild after adding it).';
    throw new Error(`Cannot reach the server. ${hint}`);
  }
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
