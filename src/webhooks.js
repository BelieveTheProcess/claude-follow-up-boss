// Speed-to-lead: receives Follow Up Boss webhook events and reacts within
// seconds, instead of waiting for someone to open Claude and ask.
//
// FUB webhook mechanics (see skills/speed-to-lead/SKILL.md for the full
// setup guide):
// - FUB signs each request with an `FUB-Signature` header: HMAC-SHA256 of
//   base64(rawBody), keyed with your FUB_SYSTEM_KEY. No separate webhook
//   secret is issued - the system key doubles as the signing key.
// - The payload only carries { event, resourceIds, uri, ... } - the full
//   resource has to be fetched separately via the API.
// - FUB expects a 2xx response within 10 seconds, so we ack immediately
//   and do the actual work after responding.

import crypto from "node:crypto";
import express from "express";
import { fub } from "./fubClient.js";
import { sendSms, fromNumber as twilioFromNumber } from "./twilioClient.js";
import { postToSlack } from "./slackClient.js";

function verifyFubSignature(rawBody, signatureHeader) {
  const systemKey = process.env.FUB_SYSTEM_KEY;
  if (!systemKey || !signatureHeader) return false;

  const base64Body = rawBody.toString("base64");
  const expected = crypto.createHmac("sha256", systemKey).update(base64Body).digest("hex");

  const expectedBuf = Buffer.from(expected, "utf8");
  const actualBuf = Buffer.from(signatureHeader, "utf8");
  if (expectedBuf.length !== actualBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}

function fillTemplate(template, values) {
  return template.replace(/\{(\w+)\}/g, (match, key) => (values[key] ?? match));
}

async function handleNewLead(personId) {
  const person = await fub.get(`/people/${personId}`, { fields: "allFields" });
  const name = [person.firstName, person.lastName].filter(Boolean).join(" ") || `Person ${personId}`;
  const phone = person?.phones?.find((p) => p.isPrimary)?.value ?? person?.phones?.[0]?.value;

  await fub
    .post("/tasks", {
      personId,
      name: `Call new lead within 5 minutes: ${name}`,
      type: "Call",
      dueDateTime: new Date().toISOString(),
      remindSecondsBefore: 0,
    })
    .catch((err) => console.error("[webhook] failed to create speed-to-lead task:", err.message));

  const slackChannel = process.env.SPEED_TO_LEAD_SLACK_CHANNEL || "speed-to-lead";
  await postToSlack({
    channel: slackChannel,
    text:
      `:rotating_light: New lead: *${name}* (source: ${person.source || "unknown"}) - respond within 5 minutes!\n` +
      `Phone: ${phone || "none on file"}\n` +
      `FUB: https://app.followupboss.com/2/people/view/${personId}`,
  }).catch((err) => console.error("[webhook] failed to post Slack alert:", err.message));

  const autoTextEnabled = process.env.AUTO_FIRST_TOUCH_SMS === "true";
  if (autoTextEnabled && phone) {
    const template =
      process.env.FIRST_TOUCH_SMS_TEMPLATE ||
      "Hi {firstName}, this is {agentName} - thanks for reaching out! I'll give you a call shortly, but feel free to text me anything in the meantime.";
    const message = fillTemplate(template, {
      firstName: person.firstName || "there",
      agentName: process.env.AGENT_NAME || "your agent",
    });

    try {
      await sendSms({ to: phone, body: message });
      await fub.post("/textMessages", {
        personId,
        message,
        toNumber: phone,
        fromNumber: twilioFromNumber(),
        isIncoming: false,
      });
    } catch (err) {
      console.error("[webhook] auto first-touch SMS failed:", err.message);
    }
  }
}

async function handleFubEvent(payload) {
  if (payload.event !== "peopleCreated") return;
  const ids = Array.isArray(payload.resourceIds) ? payload.resourceIds : [];
  for (const id of ids) {
    await handleNewLead(id).catch((err) => console.error(`[webhook] failed to handle person ${id}:`, err.message));
  }
}

/**
 * Mounts the FUB webhook receiver. Must be registered BEFORE any global
 * express.json() middleware, so this route gets the raw body needed for
 * signature verification instead of an already-parsed object.
 */
export function registerFubWebhookRoute(app) {
  app.post("/webhooks/fub", express.raw({ type: "*/*", limit: "1mb" }), (req, res) => {
    const signature = req.headers["fub-signature"];
    if (!verifyFubSignature(req.body, signature)) {
      res.status(401).send("Invalid signature");
      return;
    }

    let payload;
    try {
      payload = JSON.parse(req.body.toString("utf8"));
    } catch {
      res.status(400).send("Invalid JSON");
      return;
    }

    // Ack immediately - FUB requires a 2xx within 10 seconds - then do the work.
    res.status(200).send("ok");
    handleFubEvent(payload).catch((err) => console.error("[webhook] event handling failed:", err.message));
  });
}
