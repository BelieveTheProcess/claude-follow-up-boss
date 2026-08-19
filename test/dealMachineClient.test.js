import { test } from "node:test";
import assert from "node:assert/strict";
import { buildQuery, DEALMACHINE_BASE_URL, dealMachine } from "../src/dealMachineClient.js";

// Stubs global fetch for the duration of `fn`, feeding it one Response per
// call from `responses` (repeating the last one if fetch is called more
// times than there are responses queued). Always restores the real fetch
// afterward, even if `fn` throws.
async function withMockFetch(responses, fn) {
  const original = globalThis.fetch;
  const calls = [];
  let i = 0;
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    const spec = responses[Math.min(i, responses.length - 1)];
    i++;
    return new Response(spec.body !== undefined ? JSON.stringify(spec.body) : "", {
      status: spec.status,
      statusText: spec.statusText ?? "",
      headers: spec.headers,
    });
  };
  try {
    await fn(calls);
  } finally {
    globalThis.fetch = original;
  }
}

test("buildQuery: builds a leading-? query string from params", () => {
  assert.equal(buildQuery({ q: "San Jose", type: "city" }), "?q=San+Jose&type=city");
});

test("buildQuery: omits undefined, null, and empty-string values", () => {
  assert.equal(buildQuery({ q: "San Jose", state: undefined, type: null, search: "" }), "?q=San+Jose");
});

test("buildQuery: returns an empty string when there's nothing to send", () => {
  assert.equal(buildQuery({}), "");
  assert.equal(buildQuery(), "");
});

test("DEALMACHINE_BASE_URL: points at the v1 REST API, not a Zapier proxy", () => {
  assert.equal(DEALMACHINE_BASE_URL, "https://api.v2.dealmachine.com/v1");
});

test("dealMachine.get: sends Bearer auth and the DealMachine base URL", async () => {
  process.env.DEALMACHINE_API_KEY = "dm_sk_live_test";
  await withMockFetch([{ status: 200, body: { data: { ok: true } } }], async (calls) => {
    const result = await dealMachine.get("/account");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.v2.dealmachine.com/v1/account");
    assert.equal(calls[0].init.headers.Authorization, "Bearer dm_sk_live_test");
    assert.deepEqual(result, { data: { ok: true } });
  });
});

test("dealMachine.get: throws without retrying on a 401 (bad/revoked key)", async () => {
  process.env.DEALMACHINE_API_KEY = "dm_sk_live_test";
  await withMockFetch(
    [{ status: 401, statusText: "Unauthorized", body: { error: "Invalid API key" } }],
    async (calls) => {
      await assert.rejects(() => dealMachine.get("/account"), /Invalid API key/);
      assert.equal(calls.length, 1, "a 401 should not be retried");
    }
  );
});

test("dealMachine.post: retries once on a 429 then succeeds", async () => {
  process.env.DEALMACHINE_API_KEY = "dm_sk_live_test";
  await withMockFetch(
    [
      { status: 429, statusText: "Too Many Requests", body: { error: "rate limited" }, headers: { "retry-after": "0" } },
      { status: 200, body: { data: [{ id: "prop_1" }] } },
    ],
    async (calls) => {
      const result = await dealMachine.post("/properties/search", { locations: [] });
      assert.equal(calls.length, 2, "should have retried exactly once");
      assert.deepEqual(result, { data: [{ id: "prop_1" }] });
    }
  );
});

test("dealMachine.get: normalizes an array-shaped error into a readable message", async () => {
  process.env.DEALMACHINE_API_KEY = "dm_sk_live_test";
  await withMockFetch(
    [{ status: 402, statusText: "Payment Required", body: { error: ["insufficient tasks on account"] } }],
    async () => {
      await assert.rejects(() => dealMachine.get("/account"), /insufficient tasks on account/);
    }
  );
});

test("dealMachine.get: gives up after MAX_RETRIES on a persistent 500", async () => {
  process.env.DEALMACHINE_API_KEY = "dm_sk_live_test";
  await withMockFetch(
    [{ status: 500, statusText: "Internal Server Error", body: { error: "boom" }, headers: { "retry-after": "0" } }],
    async (calls) => {
      await assert.rejects(() => dealMachine.get("/account"), /boom/);
      assert.equal(calls.length, 4, "should attempt once plus 3 retries, then give up");
    }
  );
});
