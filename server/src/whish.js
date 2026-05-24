const WHISH_API = 'https://pay.codnloc.com/api.php';

export async function createWhishPayment({
  orderId,
  amount,
  currency,
  invoice,
  phone,
  email,
  firstName,
  lastName,
}) {
  if (process.env.WHISH_MODE === 'mock') {
    const mockUrl = `${process.env.CLIENT_URL || 'http://localhost:5173'}/payment/mock?order_id=${orderId}`;
    return { success: true, paymentUrl: mockUrl };
  }

  const website = process.env.WHISH_WEBSITE;
  const secret = process.env.WHISH_SECRET;
  if (!website || !secret) {
    throw new Error('WHISH_WEBSITE and WHISH_SECRET must be set (or use WHISH_MODE=mock)');
  }

  const body = new URLSearchParams({
    website,
    secret,
    order_id: String(orderId),
    invoice,
    amount: String(amount),
    currency,
    order_user_login: phone,
    order_user_email: email || `${phone.replace(/\D/g, '')}@elevator.local`,
    order_billing_phone: phone,
    order_first_name: firstName || 'Resident',
    order_last_name: lastName || '',
  });

  const res = await fetch(WHISH_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const data = await res.json();
  if (!data.success) {
    throw new Error(data.message || 'Whish payment creation failed');
  }

  return { success: true, paymentUrl: data.message };
}
