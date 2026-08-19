// Thin wrapper around the DealMachine Public API (https://api.docs.dealmachine.com/).
//
// Auth model:
// - Bearer token: your DealMachine API key (Application Settings -> API in the
//   DealMachine app), starting with dm_sk_live_.
//
// This replaces the Zapier-mediated DealMachine bridge used earlier - talking
// to DealMachine's own REST API directly avoids Zapier's separate per-account
// "tasks" quota (a Zapier-layer limit on top of DealMachine's own credits),
// and lets DealMachine tools be attached to this repo's own MCP server the
// same way the FUB tools already are - including for scheduled automation,
// which session-level connectors (Zapier or DealMachine's own native
// connector) can't currently be granted to.

const DEALMACHINE_BASE_URL = "https://api.v2.dealmachine.com/v1";

// DealMachine enforces 10 requests/second and 5,000 requests/day per API key
// and returns 429 when exceeded. Retry a handful of times with backoff rather
// than surfacing a 429 straight to the caller - same pattern as fubClient.js.
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;

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
  const apiKey = requireEnv("DEALMACHINE_API_KEY");
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

function buildQuery(params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    query.set(key, String(value));
  }
  const qs = query.toString();
  return qs ? `?${qs}` : "";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelayMs(res, attempt) {
  const retryAfter = res.headers.get("retry-after");
  const retryAfterMs = retryAfter && !Number.isNaN(Number(retryAfter)) ? Number(retryAfter) * 1000 : null;
  return retryAfterMs ?? BASE_DELAY_MS * 2 ** attempt;
}

/**
 * Low-level request helper. Throws a descriptive Error on non-2xx
 * responses so callers (MCP tool handlers) can surface a clean message.
 */
async function dealMachineRequest(method, path, { query, body } = {}) {
  const url = `${DEALMACHINE_BASE_URL}${path}${buildQuery(query)}`;

  let res;
  for (let attempt = 0; ; attempt++) {
    res = await fetch(url, {
      method,
      headers: authHeaders(),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const shouldRetry = (res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES;
    if (!shouldRetry) break;
    await sleep(retryDelayMs(res, attempt));
  }

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    const message =
      (data && (data.error || data.message || data.errorMessage)) ||
      `DealMachine API request failed (${res.status} ${res.statusText})`;
    // DealMachine's error field isn't always a plain string - seen in
    // practice: an array of strings via the Zapier bridge
    // ({"error":["insufficient tasks on account"]}), and a nested object
    // from the native REST API itself ({"error":{"code":...,"message":...}}).
    // Normalize all three shapes into one readable line instead of letting
    // an object/array leak into the Error message as "[object Object]".
    const messageText = Array.isArray(message)
      ? message.join("; ")
      : message && typeof message === "object"
        ? message.message || message.error || JSON.stringify(message)
        : message;
    const err = new Error(`${messageText} [${method} ${path}]`);
    err.status = res.status;
    err.body = data;
    throw err;
  }

  return data;
}

export const dealMachine = {
  get: (path, query) => dealMachineRequest("GET", path, { query }),
  post: (path, body) => dealMachineRequest("POST", path, { body }),
};

export { DEALMACHINE_BASE_URL, buildQuery };
