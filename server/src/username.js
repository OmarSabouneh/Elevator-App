export function normalizeUsername(username) {
  return String(username ?? '').trim().toLowerCase();
}

export function validateUsername(username) {
  const normalized = normalizeUsername(username);
  if (!normalized) return { error: 'Username is required' };
  if (normalized.length < 3 || normalized.length > 30) {
    return { error: 'Username must be 3–30 characters' };
  }
  if (!/^[a-z0-9_]+$/.test(normalized)) {
    return { error: 'Username can only use letters, numbers, and underscore' };
  }
  return { normalized };
}
