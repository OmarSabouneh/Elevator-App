/** Same rules as server — keeps login/register consistent in the UI */
export function normalizePhone(phone) {
  if (phone == null || phone === '') return '';

  let digits = String(phone).trim().replace(/[^\d]/g, '');
  if (!digits) return '';

  if (digits.startsWith('00')) digits = digits.slice(2);

  if (digits.startsWith('961')) {
    const local = digits.slice(3);
    if (local.length >= 7 && local.length <= 8) return `+961${local}`;
    return `+961${local}`;
  }

  if (digits.startsWith('0') && digits.length >= 8 && digits.length <= 11) {
    digits = digits.slice(1);
  }

  if (/^\d{7,8}$/.test(digits)) return `+961${digits}`;

  if (digits.length >= 10 && digits.length <= 15) return `+${digits}`;
  if (digits.length >= 9) return `+${digits}`;

  return `+${digits}`;
}

export function formatPhoneLocal(phone) {
  const n = normalizePhone(phone);
  if (!n.startsWith('+961')) return n;
  const local = n.slice(4);
  if (local.length === 8) {
    return `${local.slice(0, 2)} ${local.slice(2, 5)} ${local.slice(5)}`;
  }
  return local;
}