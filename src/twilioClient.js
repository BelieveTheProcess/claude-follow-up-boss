// Thin wrapper around the Twilio SMS API.
//
// Follow Up Boss's own /textMessages endpoint only *logs* text messages -
// it does not actually deliver them (see fubClient.js callers). To send a
// real SMS we go through Twilio directly, then log the result back into
// FUB so it shows up on the person's timeline.

import twilio from "twilio";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. Set it before starting the server (see .env.example).`
    );
  }
  return value;
}

let cachedClient;

function client() {
  if (!cachedClient) {
    const accountSid = requireEnv("TWILIO_ACCOUNT_SID");
    const authToken = requireEnv("TWILIO_AUTH_TOKEN");
    cachedClient = twilio(accountSid, authToken);
  }
  return cachedClient;
}

export function fromNumber() {
  return requireEnv("TWILIO_FROM_NUMBER");
}

/**
 * Sends an SMS via Twilio. Returns the created Twilio message resource.
 */
export async function sendSms({ to, body }) {
  return client().messages.create({ to, from: fromNumber(), body });
}
