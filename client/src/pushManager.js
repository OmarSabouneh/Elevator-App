function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function isPushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function getNotificationPermission() {
  if (!isPushSupported()) return 'unsupported';
  return Notification.permission;
}

export async function getExistingSubscription() {
  if (!isPushSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    return await reg.pushManager.getSubscription();
  } catch (err) {
    console.warn('Error reading push subscription:', err);
    return null;
  }
}

export async function subscribeToPush(api) {
  if (!isPushSupported()) {
    throw new Error('Push notifications are not supported in this browser or environment.');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notification permission was not granted.');
  }

  const { publicKey } = await api.getVapidPublicKey();
  if (!publicKey) {
    throw new Error('Failed to retrieve server push notification key.');
  }

  const reg = await navigator.serviceWorker.ready;
  let subscription = await reg.pushManager.getSubscription();

  if (!subscription) {
    subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  await api.subscribePush(subscription.toJSON());
  return subscription;
}

export async function unsubscribeFromPush(api) {
  if (!isPushSupported()) return;

  const reg = await navigator.serviceWorker.ready;
  const subscription = await reg.pushManager.getSubscription();
  if (subscription) {
    try {
      await api.unsubscribePush(subscription.endpoint);
    } catch {
      /* ignore server cleanup errors */
    }
    await subscription.unsubscribe();
  }
}
