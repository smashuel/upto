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

async function sendEmail(to, subject, text, html) {
  if (!to) return { ok: false, reason: 'no-recipient' };
  if (!hasResendCreds()) {
    console.log(`[email STUB] would send to ${to} (${subject}): ${text}`);
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
      body: JSON.stringify({ from, to, subject, text, ...(html ? { html } : {}) }),
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
 * `content` carries channel-specific payloads: a terse `sms` string and a
 * rich `email` object ({ subject, text, html }). SMS stays single-segment;
 * email gets the full safety briefing.
 * Returns the outcome so the dispatcher can aggregate stats.
 */
async function dispatchToContact(contact, content) {
  const hasPhone = !!contact.phone;
  const hasEmail = !!contact.email;
  const { sms, email } = content;

  if (hasPhone && hasTwilioCreds()) {
    return { contact, channel: 'sms', result: await sendSms(contact.phone, sms) };
  }
  if (hasEmail) {
    return { contact, channel: 'email', result: await sendEmail(contact.email, email.subject, email.text, email.html) };
  }
  if (hasPhone) {
    // Phone-only contact, Twilio not configured → stub SMS so log surface shows intent
    return { contact, channel: 'sms', result: await sendSms(contact.phone, sms) };
  }
  return { contact, channel: 'none', result: { ok: false, reason: 'no-channel' } };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Share links point at the public frontend, NOT the API. Kept on its own env
// var (FRONTEND_URL) so it can't drift with BACKEND_URL, which is the OAuth
// callback origin and may legitimately be the API host.
function shareUrl(shareToken) {
  const origin = process.env.FRONTEND_URL || 'https://upto.world';
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

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function firstNameOf(name) {
  const n = (name || '').trim();
  if (!n) return 'Your contact';
  return n.split(/\s+/)[0];
}

// ── Email presentation ────────────────────────────────────────────────────────

const BRAND_GREEN = '#2f6f4f';
const INK = '#1c2620';
const MUTED = '#7a857d';

function emailButton(url, label) {
  return `<a href="${escapeHtml(url)}" style="display:inline-block;background:${BRAND_GREEN};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:13px 24px;border-radius:10px;">${escapeHtml(label)} &rarr;</a>`;
}

function tripCard(title, rows) {
  const lines = rows
    .map(r => `<div style="font-size:14px;color:#56615a;margin-top:5px;"><span style="color:${MUTED};">${escapeHtml(r.label)}:</span> ${escapeHtml(r.value)}</div>`)
    .join('');
  return `<div style="background:#f6f8f5;border:1px solid #e4e7e3;border-radius:10px;padding:16px 18px;margin:18px 0;">
    <div style="font-size:16px;font-weight:700;color:${INK};">${escapeHtml(title)}</div>
    ${lines}
  </div>`;
}

// Wraps inner content in a branded, email-client-safe shell (inline styles only).
function emailShell({ title, inner }) {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#f4f5f3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${INK};">
  <div style="max-width:520px;margin:0 auto;padding:24px 16px;">
    <div style="padding:4px 4px 16px;">
      <span style="font-size:19px;font-weight:800;letter-spacing:-0.02em;color:${INK};">Upto</span>
      <span style="font-size:13px;color:${MUTED};margin-left:8px;">outdoor trip safety</span>
    </div>
    <div style="background:#ffffff;border:1px solid #e4e7e3;border-radius:14px;padding:28px 24px;">
      ${inner}
    </div>
    <p style="font-size:12px;color:#9aa39c;text-align:center;margin:18px 8px 0;line-height:1.6;">
      You're getting this because someone added you as a safety contact on Upto.<br>
      <a href="https://upto.world" style="color:${MUTED};">upto.world</a>
    </p>
  </div>
</body></html>`;
}

function paragraph(html) {
  return `<p style="font-size:15px;line-height:1.6;color:#3a443d;margin:0 0 14px;">${html}</p>`;
}

// Warm per-recipient greeting. Falls back to a plain "Hi," when we have no name.
function greeting(contact) {
  const name = firstNameOf(contact?.name);
  const who = name === 'Your contact' ? '' : ` ${escapeHtml(name)}`;
  return `<p style="font-size:15px;line-height:1.6;color:#3a443d;margin:0 0 14px;">Hi${who},</p>`;
}

function sectionHeading(text) {
  return `<div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:${MUTED};margin:22px 0 8px;">${escapeHtml(text)}</div>`;
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
  const title = tripLink.title || 'their trip';
  const creator = tripLink.creatorName || 'Someone you know';
  const first = firstNameOf(tripLink.creatorName);

  // Content is built per-recipient so the email greeting can be personalised.
  const buildContent = (contact) => {
    const inner = `
      ${greeting(contact)}
      <h1 style="font-size:21px;font-weight:800;color:${INK};margin:0 0 14px;">${escapeHtml(creator)} is heading out</h1>
      ${paragraph(`<strong>${escapeHtml(first)}</strong> just started a trip on Upto and added you as a safety contact — someone they trust to know where they are and when they're due back.`)}
      ${tripCard(title, [{ label: 'Expected back', value: `~${back}` }])}
      <div style="margin:4px 0 6px;">${emailButton(url, `View ${first}'s trip plan`)}</div>
      ${sectionHeading('What you need to do')}
      ${paragraph(`Nothing right now. Upto is a safety tool, not a chat app — ${escapeHtml(first)} will check in along the way, and you'll only hear from us again if they don't make it back on time. You can open the link any time to see their planned route and latest check-in.`)}
      ${sectionHeading('If something seems wrong')}
      ${paragraph(`If ${escapeHtml(first)} becomes overdue we'll email you automatically. If you can't reach them and you're genuinely worried, contact local emergency services (dial <strong>111</strong> in New Zealand, <strong>000</strong> in Australia) and share this trip link — it has their route and precise location details to help responders.`)}
    `;
    const hiName = firstNameOf(contact?.name);
    const hi = hiName === 'Your contact' ? 'Hi,' : `Hi ${hiName},`;
    return {
      sms: `${first} started "${title}" on Upto & added you as a safety contact. Back ~${back}. Live plan: ${url}`,
      email: {
        subject: `${creator} is heading out — ${title}`,
        text: `${hi}\n\n${creator} just started a trip on Upto and added you as a safety contact.\n\n${title}\nExpected back ~${back}\n\nView the live trip plan: ${url}\n\nWhat you need to do: nothing right now. Upto is a safety tool — ${first} will check in along the way, and you'll only hear from us again if they don't make it back on time.\n\nIf something seems wrong: if ${first} becomes overdue we'll email you. If you can't reach them and you're worried, contact local emergency services (111 in NZ, 000 in AU) and share this link — it has their route and location details.\n\nupto.world`,
        html: emailShell({ title: `${creator} is heading out`, inner }),
      },
    };
  };
  const results = await Promise.all(contacts.map(c => dispatchToContact(c, buildContent(c))));
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
  const lastCi = tripLink.lastCheckIn ? formatTime(tripLink.lastCheckIn) : 'no check-in yet';
  const title = tripLink.title || 'an Upto trip';
  const creator = tripLink.creatorName || 'Someone you know';
  const first = firstNameOf(tripLink.creatorName);

  const buildContent = (contact) => {
    const inner = `
      ${greeting(contact)}
      <div style="display:inline-block;background:#fdecea;color:#b3261e;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;padding:5px 11px;border-radius:6px;margin-bottom:14px;">⚠ Overdue</div>
      <h1 style="font-size:21px;font-weight:800;color:${INK};margin:0 0 14px;">${escapeHtml(creator)} hasn't returned</h1>
      ${paragraph(`${escapeHtml(first)} was due back at <strong>${back}</strong> and hasn't checked in or marked their trip complete. This might be nothing — phones lose signal and plans run late — but as one of ${escapeHtml(first)}'s emergency contacts, you should know.`)}
      ${tripCard(title, [{ label: 'Was due back', value: back }, { label: 'Last check-in', value: lastCi }])}
      <div style="margin:4px 0 6px;">${emailButton(url, `View ${first}'s trip plan`)}</div>
      ${sectionHeading('What to do now')}
      ${paragraph(`<strong>1.</strong> Try to reach ${escapeHtml(first)} directly — call and text.<br>
        <strong>2.</strong> Open the trip plan above for their planned route, exit points and last known location.<br>
        <strong>3.</strong> If you still can't reach them and you're worried, contact local emergency services (dial <strong>111</strong> in New Zealand, <strong>000</strong> in Australia) and share this trip link with them.`)}
      ${paragraph(`<span style="color:${MUTED};font-size:13px;">Don't wait if you're genuinely concerned — it's always better to raise the alarm early.</span>`)}
    `;
    const hiName = firstNameOf(contact?.name);
    const hi = hiName === 'Your contact' ? 'Hi,' : `Hi ${hiName},`;
    return {
      sms: `⚠️ Upto: ${first} is OVERDUE — due ~${back}, last check-in ${lastCi}. Try to reach them. If worried, call 111 & share: ${url}`,
      email: {
        subject: `⚠️ ${creator} is overdue — ${title}`,
        text: `${hi}\n\n${creator} is OVERDUE.\n\n${first} was due back at ${back} and hasn't checked in or marked their trip complete.\n\n${title}\nWas due back: ${back}\nLast check-in: ${lastCi}\n\nView the trip plan: ${url}\n\nWhat to do now:\n1. Try to reach ${first} directly — call and text.\n2. Open the trip plan for their route, exit points and last known location.\n3. If you can't reach them and you're worried, contact local emergency services (111 in NZ, 000 in AU) and share this trip link.\n\nDon't wait if you're genuinely concerned — better to raise the alarm early.\n\nupto.world`,
        html: emailShell({ title: `${creator} is overdue`, inner }),
      },
    };
  };
  const results = await Promise.all(contacts.map(c => dispatchToContact(c, buildContent(c))));
  const t = summarise(results);
  console.log(`[notify] overdue trip=${tripLink.id} → sms=${t.sms} email=${t.email} stubbed=${t.stubbed} failed=${t.failed} skipped=${t.skipped}`);
}
