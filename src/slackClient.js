// Thin wrapper around Slack Incoming Webhooks
// (https://api.slack.com/messaging/webhooks).
//
// Each Incoming Webhook URL is bound to a single channel when you create it
// in Slack, so multi-channel routing (e.g. a "marketing-review" channel vs.
// a "cmo" channel) is done here by keeping a label -> webhook URL map in a
// single env var, rather than one env var per channel.

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. Set it before starting the server (see .env.example).`
    );
  }
  return value;
}

function loadWebhooks() {
  const raw = requireEnv("SLACK_WEBHOOKS");
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(
      "SLACK_WEBHOOKS must be a JSON object mapping a channel label to a Slack Incoming Webhook URL, " +
        'e.g. {"marketing-review":"https://hooks.slack.com/services/...","cmo":"https://hooks.slack.com/services/..."}'
    );
  }
}

/**
 * Posts a message to the Slack channel registered under `channel` in
 * SLACK_WEBHOOKS. Slack Incoming Webhooks return a bare "ok" text body
 * (not JSON) on success.
 */
export async function postToSlack({ channel, text }) {
  const webhooks = loadWebhooks();
  const url = webhooks[channel];
  if (!url) {
    const known = Object.keys(webhooks);
    const knownList = known.length > 0 ? known.join(", ") : "(none configured)";
    throw new Error(`No Slack webhook configured for channel "${channel}". Configured channels: ${knownList}`);
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Slack webhook request failed (${res.status} ${res.statusText}): ${body}`);
  }

  return { ok: true, channel };
}

export function listConfiguredSlackChannels() {
  try {
    return Object.keys(loadWebhooks());
  } catch {
    return [];
  }
}
