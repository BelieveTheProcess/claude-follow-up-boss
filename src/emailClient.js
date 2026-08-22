// Thin wrapper around Gmail/Google Workspace SMTP, via nodemailer.
//
// Uses an App Password (not the account password) - requires 2-Step
// Verification enabled on the sending Google account, then a 16-character
// App Password generated at https://myaccount.google.com/apppasswords.
// Google Workspace admins may need to explicitly allow App Passwords for
// the org (Admin Console -> Security -> Authentication -> 2-step verification).
//
// Gmail/Workspace enforce their own daily sending caps (~500/day on
// consumer Gmail, ~2000/day on Workspace) - this is not meant for bulk
// marketing blasts, only individual agent-driven follow-up email.

import nodemailer from "nodemailer";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. Set it before starting the server (see .env.example).`
    );
  }
  return value;
}

let cachedTransport;

function transport() {
  if (!cachedTransport) {
    const user = requireEnv("GMAIL_USER");
    const pass = requireEnv("GMAIL_APP_PASSWORD");
    cachedTransport = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user, pass },
    });
  }
  return cachedTransport;
}

export function fromAddress() {
  const user = requireEnv("GMAIL_USER");
  const name = process.env.EMAIL_FROM_NAME;
  return name ? `"${name}" <${user}>` : user;
}

/**
 * Sends an email via Gmail/Workspace SMTP. Returns nodemailer's send result
 * (includes messageId). Does not add any compliance footer itself - callers
 * (see send_email in tools/index.js) are responsible for that.
 */
export async function sendEmail({ to, subject, html, text }) {
  return transport().sendMail({
    from: fromAddress(),
    to,
    subject,
    html,
    text,
  });
}
