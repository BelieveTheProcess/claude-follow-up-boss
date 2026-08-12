// Speed to Lead automation.
//
// Real estate "speed to lead" best practice: the first minutes after a lead
// comes in decide whether they convert, so this runs the full first-response
// pipeline in one shot instead of relying on a human to notice the lead first:
//
//   1. Fire a Follow Up Boss lead event (POST /v1/events) with
//      source = "Speed to Lead" - the only call that triggers FUB's own
//      Action Plan / lead-routing automation, as long as that source is
//      mapped to a plan under Admin > Lead Flow.
//   2. Text the lead immediately via Twilio, if we have a phone number and
//      Twilio is configured.
//   3. Log a note on the person record summarizing what ran, so anyone
//      reading the timeline in FUB can see the automation fired.
//
// Two entry points call into this: the run_speed_to_lead_automation MCP
// tool (src/tools/index.js) and the POST /webhooks/speed-to-lead route
// (src/index.js), so it can be triggered either by an agent/human or
// directly by whatever system originates Speed to Lead leads.

import twilio from "twilio";
import { fub } from "../fubClient.js";

export const SPEED_TO_LEAD_SOURCE = "Speed to Lead";

const DEFAULT_SMS_TEMPLATE =
  "Hi {firstName}, thanks for reaching out! One of our agents will be in touch shortly.";

function renderTemplate(template, { firstName }) {
  return template.replace(/\{firstName\}/g, firstName || "there");
}

function getTwilioClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;
  if (!accountSid || !authToken || !fromNumber) return null;
  return { client: twilio(accountSid, authToken), fromNumber };
}

async function sendInstantText({ firstName, phone }) {
  if (!phone) {
    return { skipped: "No phone number on file." };
  }

  const twilioConn = getTwilioClient();
  if (!twilioConn) {
    return {
      skipped:
        "Twilio not configured (set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER).",
    };
  }

  const template = process.env.SPEED_TO_LEAD_SMS_TEMPLATE || DEFAULT_SMS_TEMPLATE;
  const body = renderTemplate(template, { firstName });

  try {
    const sms = await twilioConn.client.messages.create({ to: phone, from: twilioConn.fromNumber, body });
    return { sid: sms.sid, status: sms.status, body };
  } catch (err) {
    return { error: err.message };
  }
}

function summarizeForNote({ eventType, smsResult }) {
  const lines = [
    `Speed to Lead automation ran at ${new Date().toISOString()}.`,
    `Follow Up Boss event fired: ${eventType} / ${SPEED_TO_LEAD_SOURCE}.`,
  ];

  if (smsResult.sid) {
    lines.push(`Instant text sent (Twilio SID ${smsResult.sid}).`);
  } else if (smsResult.error) {
    lines.push(`Instant text failed: ${smsResult.error}`);
  } else if (smsResult.skipped) {
    lines.push(`Instant text skipped: ${smsResult.skipped}`);
  }

  return lines.join("\n");
}

/**
 * Runs the Speed to Lead automation end to end for one lead.
 * Each step is best-effort and reported individually - a Twilio failure,
 * for example, should not stop the FUB event or note from being recorded.
 */
export async function runSpeedToLeadAutomation({
  firstName,
  lastName,
  email,
  phone,
  message,
  eventType = "Registration",
}) {
  if (!firstName) {
    throw new Error("firstName is required.");
  }
  if (!email && !phone) {
    throw new Error("At least one of email or phone is required.");
  }

  const eventBody = {
    type: eventType,
    source: SPEED_TO_LEAD_SOURCE,
    person: {
      firstName,
      ...(lastName && { lastName }),
      ...(email && { emails: [{ value: email }] }),
      ...(phone && { phones: [{ value: phone }] }),
    },
    ...(message && { message }),
  };
  const event = await fub.post("/events", eventBody);
  const personId = event?.person?.id ?? event?.personId ?? null;

  const sms = await sendInstantText({ firstName, phone });

  let note = null;
  if (personId) {
    try {
      note = await fub.post("/notes", {
        personId,
        subject: "Speed to Lead automation",
        body: summarizeForNote({ eventType, smsResult: sms }),
      });
    } catch (err) {
      note = { error: err.message };
    }
  }

  return { personId, event, sms, note };
}
