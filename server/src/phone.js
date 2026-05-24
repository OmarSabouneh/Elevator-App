/**
 * Normalize mobile numbers to E.164 (+961…) for Lebanon.
 * Accepts: 81464733, 81 464 733, 081464733, 96181464733, +96181464733, 00961…, etc.
 */
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

  // Local format with leading 0: 03…, 07…, 081464733
  if (digits.startsWith('0') && digits.length >= 8 && digits.length <= 11) {
    digits = digits.slice(1);
  }

  // Lebanese local number without country code (7–8 digits)
  if (/^\d{7,8}$/.test(digits)) {
    return `+961${digits}`;
  }

  // Other international numbers already include country code (10–15 digits)
  if (digits.length >= 10 && digits.length <= 15) {
    return `+${digits}`;
  }

  if (digits.length >= 9) return `+${digits}`;

  return `+${digits}`;
}

/** Display as local Lebanese format: 81 464 733 */
export function formatPhoneLocal(phone) {
  const n = normalizePhone(phone);
  if (!n.startsWith('+961')) return n;
  const local = n.slice(4);
  if (local.length === 8) {
    return `${local.slice(0, 2)} ${local.slice(2, 5)} ${local.slice(5)}`;
  }
  return local;
}
