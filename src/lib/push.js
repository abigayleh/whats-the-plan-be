// Push notifications via Expo's push API using the built-in fetch — no SDK dependency,
// matching lib/email.js. The mobile app is the only client, and it always runs on Expo, so
// there's no need to speak APNs/FCM directly.

const prisma = require('./prisma');
const { captureException } = require('./sentry');

const PUSH_TAG = { tags: { subsystem: 'push' } };
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

// Best-effort and silent by design: a user with notifications off, or no device registered,
// should not surface an error to whoever tapped "Send reminder" — the button just does nothing.
async function sendPushToUser(userId, { title, body, data }) {
  const tokens = await prisma.pushToken.findMany({ where: { userId } });
  if (!tokens.length) return;

  const messages = tokens.map(({ token }) => ({ to: token, title, body, data }));
  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages),
    });
    if (!res.ok) {
      const responseBody = await res.text();
      console.error(`Expo push rejected send (${res.status}):`, responseBody);
      captureException(new Error(`Expo push rejected send (${res.status})`), { ...PUSH_TAG, extra: { responseBody } });
    }
  } catch (err) {
    console.error('Push send failed:', err);
    captureException(err, PUSH_TAG);
  }
}

module.exports = { sendPushToUser };
