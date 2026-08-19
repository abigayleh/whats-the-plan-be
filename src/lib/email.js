// Email sending via Resend's REST API using the built-in fetch — no SDK dependency.
// Env: RESEND_API_KEY (required to actually send), RESEND_FROM_EMAIL, ADMIN_NOTIFICATION_EMAIL.

const { captureException } = require('./sentry');

// Sends are fire-and-forget by design, so this file is the only place a failure is visible.
const EMAIL_TAG = { tags: { subsystem: 'email' } };

const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const fromEmail = () => process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

// Design tokens mirrored from the frontend (styles/abstracts/_variables.scss) so
// emails read as the same product. Update both together if the brand shifts.
const T = {
  primary: '#c56a4a',
  bg: '#fbfaf7',
  surface: '#ffffff',
  border: '#e7e0d6',
  borderLight: '#f3efe7',
  text: '#2c2823',
  muted: '#a29a8e',
  font: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
};

// Branded shell — a centered card on the warm canvas, wordmark header, muted footer.
// `preview` is the hidden inbox-snippet text; `body` is the inner HTML.
function renderEmail({ preview = '', body }) {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="light" />
  </head>
  <body style="margin:0; padding:0; background:${T.bg};">
    <span style="display:none; visibility:hidden; opacity:0; height:0; width:0; overflow:hidden;">${escapeHtml(preview)}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${T.bg};">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px; background:${T.surface}; border:1px solid ${T.border}; border-radius:16px; overflow:hidden;">
            <tr>
              <td style="padding:28px 32px 20px; border-bottom:1px solid ${T.borderLight};">
                <span style="font-family:${T.font}; font-size:20px; font-weight:700; color:${T.primary};">What's the Plan?</span>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px 32px; font-family:${T.font}; color:${T.text};">
                ${body}
              </td>
            </tr>
          </table>
          <p style="max-width:480px; margin:20px auto 0; font-family:${T.font}; font-size:12px; color:${T.muted}; text-align:center;">
            You're receiving this because you have an account with What's the Plan.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

const button = (href, label) =>
  `<a href="${href}" style="display:inline-block; background:${T.primary}; color:#ffffff; font-weight:600; font-size:15px; padding:12px 24px; border-radius:9px; text-decoration:none;">${label}</a>`;

// Best-effort: a missing key or a rejected send is logged, never thrown — email must not
// be able to fail a signup or login.
async function sendEmail({ to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(`RESEND_API_KEY not set — skipping email "${subject}" to ${to}`);
    captureException(new Error('RESEND_API_KEY not set — email skipped'), EMAIL_TAG);
    return;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: fromEmail(), to, subject, html }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`Resend rejected "${subject}" (${res.status}):`, body);
      captureException(new Error(`Resend rejected email (${res.status})`), { ...EMAIL_TAG, extra: { body } });
    }
  } catch (err) {
    console.error(`Email send failed for "${subject}":`, err);
    captureException(err, EMAIL_TAG);
  }
}

function sendVerificationEmail(user, link) {
  const name = escapeHtml(user.name || 'there');
  const safeLink = escapeHtml(link);
  return sendEmail({
    to: user.email,
    subject: "Verify your email for What's the Plan",
    html: renderEmail({
      preview: 'Confirm your email to start planning.',
      body: `
        <h1 style="margin:0 0 12px; font-size:22px; font-weight:700; color:${T.text};">Welcome, ${name}!</h1>
        <p style="margin:0 0 24px; font-size:15px; line-height:1.5; color:${T.text};">Confirm your email address to start planning.</p>
        <p style="margin:0 0 28px;">${button(safeLink, 'Verify my email')}</p>
        <p style="margin:0; font-size:13px; line-height:1.5; color:${T.muted};">This link expires in 24 hours. If you didn't sign up, you can safely ignore this email.</p>
      `,
    }),
  });
}

// Best-effort heads-up to the site owner that a new user signed up.
function notifyAdminOfNewUser(user) {
  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || 'abigayle@openscreen.com';
  const rowStyle = `font-size:14px; line-height:1.6; color:${T.text};`;
  return sendEmail({
    to: adminEmail,
    subject: `New sign-up: ${user.name || user.email}`,
    html: renderEmail({
      preview: `${user.name || user.email} just created an account.`,
      body: `
        <h1 style="margin:0 0 16px; font-size:22px; font-weight:700; color:${T.text};">A new user just signed up 🎉</h1>
        <p style="margin:0 0 6px; ${rowStyle}"><strong style="color:${T.muted}; font-weight:600;">Name</strong><br />${escapeHtml(user.name || 'Unknown')}</p>
        <p style="margin:16px 0 0; ${rowStyle}"><strong style="color:${T.muted}; font-weight:600;">Email</strong><br />${escapeHtml(user.email)}</p>
      `,
    }),
  });
}

module.exports = { sendEmail, sendVerificationEmail, notifyAdminOfNewUser };
