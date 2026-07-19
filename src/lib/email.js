// Email sending via Resend's REST API using the built-in fetch — no SDK dependency.
// Env: RESEND_API_KEY (required to actually send), RESEND_FROM_EMAIL, ADMIN_NOTIFICATION_EMAIL.

const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const fromEmail = () => process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

// Best-effort: a missing key or a rejected send is logged, never thrown — email must not
// be able to fail a signup or login.
async function sendEmail({ to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(`RESEND_API_KEY not set — skipping email "${subject}" to ${to}`);
    return;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: fromEmail(), to, subject, html }),
    });
    if (!res.ok) console.error(`Resend rejected "${subject}" (${res.status}):`, await res.text());
  } catch (err) {
    console.error(`Email send failed for "${subject}":`, err);
  }
}

function sendVerificationEmail(user, link) {
  const name = escapeHtml(user.name || 'there');
  const safeLink = escapeHtml(link);
  return sendEmail({
    to: user.email,
    subject: "Verify your email for What's the Plan",
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #3A423D;">
        <h2 style="color: #12574A; margin: 0 0 12px;">Welcome, ${name}!</h2>
        <p style="margin: 0 0 16px;">Confirm your email to start planning.</p>
        <p style="margin: 0 0 20px;">
          <a href="${safeLink}" style="background: #12574A; color: #fff; padding: 10px 18px; border-radius: 6px; text-decoration: none;">Verify my email</a>
        </p>
        <p style="margin: 0; color: #6b7280; font-size: 13px;">This link expires in 24 hours. If you didn't sign up, you can ignore this email.</p>
      </div>
    `,
  });
}

// Best-effort heads-up to the site owner that a new user signed up.
function notifyAdminOfNewUser(user) {
  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || 'abigayle@openscreen.com';
  return sendEmail({
    to: adminEmail,
    subject: `New sign-up: ${user.name || user.email}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #3A423D;">
        <h2 style="color: #12574A; margin: 0 0 12px;">A new user just signed up 🎉</h2>
        <p style="margin: 0 0 6px;"><strong>Name:</strong> ${escapeHtml(user.name || 'Unknown')}</p>
        <p style="margin: 0;"><strong>Email:</strong> ${escapeHtml(user.email)}</p>
      </div>
    `,
  });
}

module.exports = { sendEmail, sendVerificationEmail, notifyAdminOfNewUser };
