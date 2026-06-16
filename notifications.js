// notifications.js — outbound message dispatch for Upto safety events.
//
// Two triggers fire today:
//   1. TripLink Start  → notify ALL embedded contacts (any channel they have)
//   2. TripLink Overdue → notify only embedded contacts where isEmergency=true
//                         (i.e. the user's account emergency circle at save time)
//
// Two channels:
//   • Email via Resend (primary today — free tier covers solo-dev volume)
//   • SMS via Twilio   (scaffolded; activates the moment TWILIO_* env vars are set)
//
// Per-contact channel selection (see `pickChannel`):
//   • phone + Twilio configured → SMS
//   • email present              → email
//   • phone-only, Twilio absent  → SMS stub (logged, not sent)
//   • neither                    → skip
//
// Each adapter runs in stub mode (logs only, no network) when its creds are
// absent. This lets us deploy the wiring before either account exists and
// verify end-to-end via `pm2 logs`.

// ── Provider feature flags ────────────────────────────────────────────────────

function hasTwilioCreds() {
  return !!(process.env.TWILIO_ACCOUNT_SID
         && process.env.TWILIO_AUTH_TOKEN
         && process.env.TWILIO_PHONE_NUMBER);
}

function hasResendCreds() {
  return !!process.env.RESEND_API_KEY;
}

// ── SMS adapter (Twilio) ──────────────────────────────────────────────────────

const TWILIO_API = 'https://api.twilio.com/2010-04-01/Accounts';

async function sendSms(to, body) {
  if (!to) return { ok: false, reason: 'no-recipient' };
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
      headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
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

// ── Email adapter (Resend) ────────────────────────────────────────────────────

const RESEND_API = 'https://api.resend.com/emails';
const DEFAULT_FROM = 'Upto Safety <safety@upto.world>';

async function sendEmail(to, subject, body) {
  if (!to) return { ok: false, reason: 'no-recipient' };
  if (!hasResendCreds()) {
    console.log(`[email STUB] would send to ${to} (${subject}): ${body}`);
    return { ok: true, stubbed: true };
  }
  const from = process.env.RESEND_FROM || DEFAULT_FROM;
  try {
    const res = await fetch(RESEND_API, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to, subject, text: body }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error(`[email] Resend ${res.status} → ${to}: ${data.message || data.name || 'unknown error'}`);
      return { ok: false, reason: 'resend-error', status: res.status, error: data.message };
    }
    return { ok: true, id: data.id };
  } catch (err) {
    console.error(`[email] network error → ${to}: ${err.message}`);
    return { ok: false, reason: 'network', error: err.message };
  }
}

// ── Per-contact channel picker ────────────────────────────────────────────────

/**
 * Decide which channel to use for a given contact and dispatch.
 * Returns the outcome so the dispatcher can aggregate stats.
 */
async function dispatchToContact(contact, { subject, body }) {
  const hasPhone = !!contact.phone;
  const hasEmail = !!contact.email;

  if (hasPhone && hasTwilioCreds()) {
    return { contact, channel: 'sms', result: await sendSms(contact.phone, body) };
  }
  if (hasEmail) {
    return { contact, channel: 'email', result: await sendEmail(contact.email, subject, body) };
  }
  if (hasPhone) {
    // Phone-only contact, Twilio not configured → stub SMS so log surface shows intent
    return { contact, channel: 'sms', result: await sendSms(contact.phone, body) };
  }
  return { contact, channel: 'none', result: { ok: false, reason: 'no-channel' } };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function shareUrl(shareToken) {
  const origin = process.env.BACKEND_URL || 'https://upto.world';
  return `${origin}/triplink/${shareToken}`;
}

function formatTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString('en-NZ', {
      hour: '2-digit', minute: '2-digit', timeZone: 'Pacific/Auckland',
    });
  } catch {
    return iso;
  }
}

function summarise(results) {
  const tally = { sms: 0, email: 0, stubbed: 0, failed: 0, skipped: 0 };
  for (const r of results) {
    if (r.channel === 'none') { tally.skipped++; continue; }
    if (!r.result?.ok) { tally.failed++; continue; }
    if (r.result.stubbed) tally.stubbed++;
    if (r.channel === 'sms')   tally.sms++;
    if (r.channel === 'email') tally.email++;
  }
  return tally;
}

// ── Dispatchers ───────────────────────────────────────────────────────────────

/**
 * Notify all included watchers that a trip just started.
 * @param {object} tripLink  Full TripLink (from JSONB `data`) — must include
 *                           title, shareToken, expectedReturnTime, emergencyContacts.
 */
export async function notifyTripStart(tripLink) {
  const contacts = tripLink?.emergencyContacts || [];
  if (contacts.length === 0) {
    console.log(`[notify] start: no contacts on trip ${tripLink?.id || '?'}`);
    return { notified: [], skipped: [] };
  }
  const url = shareUrl(tripLink.shareToken);
  const back = formatTime(tripLink.expectedReturnTime);
  const title = tripLink.title || 'their adventure';
  const content = {
    subject: `Upto: ${tripLink.title || 'a trip'} just started`,
    body: `Upto: ${title} just started. Track them: ${url}. Expected back ~${back}.\n\nYou'll only hear from us again if something's wrong.`,
  };
  const results = await Promise.all(contacts.map(c => dispatchToContact(c, content)));
  const t = summarise(results);
  console.log(`[notify] start trip=${tripLink.id} → sms=${t.sms} email=${t.email} stubbed=${t.stubbed} failed=${t.failed} skipped=${t.skipped}`);
  const notified = results
    .filter(r => r.channel !== 'none' && r.result?.ok)
    .map(r => ({ name: r.contact.name, channel: r.channel, stubbed: !!r.result.stubbed }));
  const skipped = results
    .filter(r => r.channel === 'none' || !r.result?.ok)
    .map(r => ({ name: r.contact.name, reason: r.channel === 'none' ? 'no-channel' : (r.result?.reason || 'failed') }));
  return { notified, skipped };
}

/**
 * Notify the user's emergency circle that a trip is overdue.
 * Only contacts with isEmergency=true are messaged.
 */
export async function notifyTripOverdue(tripLink) {
  const contacts = (tripLink?.emergencyContacts || []).filter(c => c.isEmergency);
  if (contacts.length === 0) {
    console.log(`[notify] overdue: no emergency-circle contacts on trip ${tripLink?.id || '?'}`);
    return;
  }
  const url = shareUrl(tripLink.shareToken);
  const back = formatTime(tripLink.expectedReturnTime);
  const lastCi = tripLink.lastCheckIn ? formatTime(tripLink.lastCheckIn) : 'no check-in';
  const title = tripLink.title || 'an Upto trip';
  const content = {
    subject: `⚠️ Upto: ${tripLink.title || 'a trip'} is OVERDUE`,
    body: `⚠️ Upto: ${title} is OVERDUE.\n\nExpected back ${back}. Last check-in: ${lastCi}.\n\nDetails: ${url}`,
  };
  const results = await Promise.all(contacts.map(c => dispatchToContact(c, content)));
  const t = summarise(results);
  console.log(`[notify] overdue trip=${tripLink.id} → sms=${t.sms} email=${t.email} stubbed=${t.stubbed} failed=${t.failed} skipped=${t.skipped}`);
}
