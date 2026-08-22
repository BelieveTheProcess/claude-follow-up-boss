// The agent/brokerage signature block appended to every send_email message,
// between the drafted body and the CAN-SPAM footer (see emailCompliance.js -
// a separate concern: that one exists because the law requires it, this one
// exists because you want your name and license on outgoing mail).
//
// Entirely env-var driven, and optional field-by-field, on purpose:
// - A license number, ranking/award claim, or logo is exactly the kind of
//   thing that must be typed in correctly by a human once, not guessed or
//   transcribed from a screenshot/photo. Most state real estate advertising
//   rules also require ranking/award claims to be accurate and current -
//   this file has no way to verify that, so it only prints what's actually
//   provided, verbatim.
// - If neither the business-card image nor AGENT_NAME is set, buildSignature()
//   returns null and send_email sends without a signature rather than a
//   broken partial one.
//
// assets/email-signature-card.png - if present, this exact image (the
// agent's existing "digital business card" graphic, already laid out with
// name/title/license/contact/brokerage logos/ranking badges) is embedded as
// an inline (cid) attachment and used as the signature, instead of
// rebuilding the same information as HTML text - a hand-built approximation
// would drift from the real card and duplicate a design someone already
// made. The individual AGENT_* fields below are the fallback for when no
// card image is provided, and always populate the plain-text version (image
// signatures don't render in text-only clients).

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CARD_PATH = path.join(__dirname, "..", "assets", "email-signature-card.png");
const CARD_CID = "email-signature-card";

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

export function buildSignature() {
  const name = process.env.AGENT_NAME;
  const hasCard = existsSync(CARD_PATH);
  if (!name && !hasCard) return null;

  const title = process.env.AGENT_TITLE;
  const license = process.env.AGENT_LICENSE;
  const brokerage = process.env.BROKERAGE_NAME;
  const phone = process.env.AGENT_PHONE;
  const mobile = process.env.AGENT_MOBILE;
  const website = process.env.AGENT_WEBSITE;
  const bookingUrl = process.env.AGENT_BOOKING_URL;
  const headshotUrl = process.env.AGENT_HEADSHOT_URL;
  const brokerageLogoUrl = process.env.BROKERAGE_LOGO_URL;
  const rankingText = process.env.AGENT_RANKING_TEXT;
  const email = process.env.GMAIL_USER;

  const textLines = [
    name,
    [title, brokerage].filter(Boolean).join(" - "),
    license,
    phone && `Office: ${phone}`,
    mobile && `Mobile: ${mobile}`,
    email,
    website,
    bookingUrl && `Book a call: ${bookingUrl}`,
    rankingText,
  ].filter(Boolean);
  const text = `\n\n${textLines.join("\n")}`;

  if (hasCard) {
    const img = `<img src="cid:${CARD_CID}" alt="${esc(name || brokerage || "Signature")}" width="650" style="max-width:100%;height:auto;display:block;">`;
    const html = `
<div style="margin-top:24px;">
  ${bookingUrl ? `<a href="${esc(bookingUrl)}">${img}</a>` : img}
</div>`;
    return {
      html,
      text,
      attachments: [{ filename: "email-signature-card.png", path: CARD_PATH, cid: CARD_CID }],
    };
  }

  const contactRows = [
    phone && `<div>&#9742; ${esc(phone)}</div>`,
    mobile && `<div>&#128241; ${esc(mobile)}</div>`,
    email && `<div>&#9993; <a href="mailto:${esc(email)}" style="color:inherit;">${esc(email)}</a></div>`,
    website && `<div>&#127760; <a href="${esc(website)}" style="color:inherit;">${esc(website)}</a></div>`,
  ].filter(Boolean).join("\n");

  const html = `
<table cellpadding="0" cellspacing="0" style="margin-top:24px;font-family:sans-serif;font-size:13px;color:#1a1a2e;">
  <tr>
    ${headshotUrl ? `<td style="padding-right:16px;vertical-align:top;"><img src="${esc(headshotUrl)}" alt="${esc(name)}" width="72" height="72" style="border-radius:50%;object-fit:cover;"></td>` : ""}
    <td style="vertical-align:top;">
      <div style="font-weight:bold;font-size:15px;">${esc(name)}</div>
      ${title ? `<div>${esc(title)}</div>` : ""}
      ${license ? `<div style="color:#666;">${esc(license)}</div>` : ""}
      ${brokerage ? `<div style="font-weight:bold;margin-top:4px;">${esc(brokerage)}</div>` : ""}
      <div style="margin-top:6px;">${contactRows}</div>
      ${bookingUrl ? `<div style="margin-top:6px;"><a href="${esc(bookingUrl)}" style="color:inherit;">Book a call with me</a></div>` : ""}
    </td>
  </tr>
  ${brokerageLogoUrl || rankingText ? `
  <tr><td colspan="2" style="padding-top:12px;">
    ${brokerageLogoUrl ? `<img src="${esc(brokerageLogoUrl)}" alt="${esc(brokerage || "")}" style="max-height:40px;">` : ""}
    ${rankingText ? `<div style="color:#666;font-size:11px;margin-top:4px;">${esc(rankingText)}</div>` : ""}
  </td></tr>` : ""}
</table>`;

  return { html, text, attachments: [] };
}
