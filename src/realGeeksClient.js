// Thin wrapper around the Real Geeks Incoming Leads API
// (https://developers.realgeeks.com/incoming-leads-api/).
//
// Auth model:
// - HTTP Basic Auth using partner credentials issued by Real Geeks
//   (REALGEEKS_USERNAME / REALGEEKS_PASSWORD). These are not self-generated -
//   they're granted when Real Geeks registers your integration, and the
//   target site owner grants your integration access to their Site UUID.
// - Every request targets a specific site: /sites/{REALGEEKS_SITE_UUID}/leads

const REALGEEKS_BASE_URL = "https://receivers.leadrouter.realgeeks.com/rest";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. Set it before starting the server (see .env.example).`
    );
  }
  return value;
}

function authHeaders() {
  const username = requireEnv("REALGEEKS_USERNAME");
  const password = requireEnv("REALGEEKS_PASSWORD");
  const basic = Buffer.from(`${username}:${password}`).toString("base64");

  return {
    Authorization: `Basic ${basic}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

/**
 * Creates a lead on the configured Real Geeks site.
 * Real Geeks returns 201 Created with an empty body on success.
 */
async function createLead(lead) {
  const siteUuid = requireEnv("REALGEEKS_SITE_UUID");
  const url = `${REALGEEKS_BASE_URL}/sites/${siteUuid}/leads`;

  const res = await fetch(url, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(lead),
  });

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    const message =
      (data && (data.errorMessage || data.message || data.error)) ||
      `Real Geeks API request failed (${res.status} ${res.statusText})`;
    const err = new Error(`${message} [POST /sites/${siteUuid}/leads]`);
    err.status = res.status;
    err.body = data;
    throw err;
  }

  return data;
}

export const realGeeks = { createLead };

export { REALGEEKS_BASE_URL };
