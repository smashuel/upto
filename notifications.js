// notifications.js — SMS dispatch for Upto safety events.
//
// Two triggers fire SMS today:
//   1. TripLink Start  → message ALL embedded contacts with a phone number
//   2. TripLink Overdue → message only embedded contacts where isEmergency=true
//                         (i.e. members of the user's account emergency circle
//                         at the moment the TripLink was saved)
//
// The actual transport is Twilio's REST API. If TWILIO_ACCOUNT_SID /
// TWILIO_AUTH_TOKEN / TWILIO_PHONE_NUMBER are not all set, the adapter
// runs in **stub mode**: it logs the message it would have sent and
// returns success. This lets us deploy the wiring before the Twilio
// account exists, and verify end-to-end via `pm2 logs`.

// ── Transport: Twilio REST ────────────────────────────────────────────────────

const TWILIO_API = 'https://api.twilio.com/2010-04-01/Accounts';

function hasTwilioCreds() {
  return !!(process.env.TWILIO_ACCOUNT_SID
         && process.env.TWILIO_AUTH_TOKEN
         && process.env.TWILIO_PHONE_NUMBER);
}

export async function sendSms(to, body) {
  if (!to) {
    console.warn('[sms] skip: no recipient');
    return { ok: false, reason: 'no-recipient' };
  }
  if (!hasTwilioCreds()) {
    console.log(`[sms STUB] would send to ${to}: ${body}`);
    return { ok: true, stubbed: true };
  }

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const url = `${TWILIO_API}/${sid}/Messages.json`;
  const auth = Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');

  const form = new URLSearchParams();
  form.set('From', process.env.TWILIO_PHONE_NUMBER);
  form.set('To', to);
  form.set('Body', body);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error(`[sms] Twilio ${res.status} → ${to}: ${data.message || 'unknown error'}`);
      return { ok: false, reason: 'twilio-error', status: res.status, error: data.message };
    }
    return { ok: true, sid: data.sid };
  } catch (err) {
    console.error(`[sms] network error → ${to}: ${err.message}`);
    return { ok: false, reason: 'network', error: err.message };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function shareUrl(shareToken) {
  // BACKEND_URL is the public origin (e.g. https://upto.world). The frontend
  // serves the watcher view at /triplink/:shareToken.
  const origin = process.env.BACKEND_URL || 'https://upto.world';
  return `${origin}/triplink/${shareToken}`;
}

function formatTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString('en-NZ', { hour: '2-digit', minute: '2-digit', timeZone: 'Pacific/Auckland' });
  } catch {
    return iso;
  }
}

// ── Dispatchers ───────────────────────────────────────────────────────────────

/**
 * Notify watchers that a trip just started.
 *
 * @param {object} tripLink  The full TripLink object (from the JSONB `data` column).
 *                           Must include: title, shareToken, expectedReturnTime,
 *                           emergencyContacts: Array<{ name, phone, isEmergency?, isPrimary? }>
 */
export async function notifyTripStart(tripLink) {
  const contacts = (tripLink?.emergencyContacts || []).filter(c => c.phone);
  if (contacts.length === 0) {
    console.log(`[notify] start: no contacts with phones for trip ${tripLink?.id || '?'}`);
    return;
  }
  const url = shareUrl(tripLink.shareToken);
  const back = formatTime(tripLink.expectedReturnTime);
  const title = tripLink.title || 'their adventure';
  const body = `Upto: ${title} just started. Track them: ${url}. Expected back ~${back}. You'll only hear from us again if something's wrong.`;

  await Promise.allSettled(contacts.map(c => sendSms(c.phone, body)));
  console.log(`[notify] start: dispatched to ${contacts.length} recipient(s) for trip ${tripLink.id}`);
}

/**
 * Notify the user's emergency circle that a trip is overdue.
 * Only contacts with `isEmergency === true` *and* a phone are messaged.
 */
export async function notifyTripOverdue(tripLink) {
  const contacts = (tripLink?.emergencyContacts || [])
    .filter(c => c.isEmergency && c.phone);
  if (contacts.length === 0) {
    console.log(`[notify] overdue: no emergency-circle phones for trip ${tripLink?.id || '?'}`);
    return;
  }
  const url = shareUrl(tripLink.shareToken);
  const back = formatTime(tripLink.expectedReturnTime);
  const lastCi = tripLink.lastCheckIn ? formatTime(tripLink.lastCheckIn) : 'no check-in';
  const title = tripLink.title || 'an Upto trip';
  const body = `⚠️ Upto: ${title} is OVERDUE. Expected back ${back}. Last check-in: ${lastCi}. Details: ${url}`;

  await Promise.allSettled(contacts.map(c => sendSms(c.phone, body)));
  console.log(`[notify] overdue: dispatched to ${contacts.length} recipient(s) for trip ${tripLink.id}`);
}
