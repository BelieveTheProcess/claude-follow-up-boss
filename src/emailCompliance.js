// Shared CAN-SPAM mechanics for send_email (tools/index.js) and the
// /unsubscribe route (unsubscribeRoute.js): a tamper-resistant unsubscribe
// link, and the footer every outgoing email must carry (physical mailing
// address + working opt-out, both required by CAN-SPAM).
//
// Suppression is tracked as a "Do Not Email" tag on the FUB person record -
// not a separate database - because FUB is already this repo's system of
// record for everything else about a lead, and tags are something every
// tool here can already read (get_lead, get_priority_leads) and write
// (update_lead). A tag survives redeploys; an in-memory list would not.

import { createHmac } from "node:crypto";
import { timingSafeEqualStr } from "./authUtils.js";

export const DO_NOT_EMAIL_TAG = "Do Not Email";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. Set it before starting the server (see .env.example).`
    );
  }
  return value;
}

function unsubscribeSecret() {
  return requireEnv("EMAIL_UNSUBSCRIBE_SECRET");
}

export function buildUnsubscribeToken(personId, email) {
  return createHmac("sha256", unsubscribeSecret())
    .update(`${personId}:${(email || "").toLowerCase()}`)
    .digest("hex");
}

export function verifyUnsubscribeToken(personId, email, token) {
  if (!token) return false;
  return timingSafeEqualStr(token, buildUnsubscribeToken(personId, email));
}

export function buildUnsubscribeUrl(personId, email) {
  const base = requireEnv("PUBLIC_BASE_URL").replace(/\/+$/, "");
  const token = buildUnsubscribeToken(personId, email);
  const params = new URLSearchParams({ personId: String(personId), email, token });
  return `${base}/unsubscribe?${params.toString()}`;
}

/**
 * The footer every outgoing email must carry. CAN-SPAM requires a valid
 * physical postal address and a working opt-out mechanism on every
 * commercial email - this is not optional per-message.
 */
export function buildCanSpamFooter({ personId, email }) {
  const mailingAddress = requireEnv("AGENT_MAILING_ADDRESS");
  const unsubscribeUrl = buildUnsubscribeUrl(personId, email);

  const html = `
<hr style="margin-top:24px;border:none;border-top:1px solid #ddd;">
<p style="font-size:12px;color:#888;">
  ${mailingAddress}<br>
  <a href="${unsubscribeUrl}">Unsubscribe</a> from future emails.
</p>`;

  const text = `\n\n---\n${mailingAddress}\nUnsubscribe: ${unsubscribeUrl}`;

  return { html, text, unsubscribeUrl };
}
