import { test } from "node:test";
import assert from "node:assert/strict";
import { buildQuery, fub } from "../src/fubClient.js";

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

function setFubEnv() {
  process.env.FUB_API_KEY = "test-api-key";
  process.env.FUB_SYSTEM = "test-system";
  process.env.FUB_SYSTEM_KEY = "test-system-key";
}

test("buildQuery: builds a leading-? query string from params", () => {
  assert.equal(buildQuery({ stage: "Lead", limit: 25 }), "?stage=Lead&limit=25");
});

test("buildQuery: omits undefined, null, and empty-string values", () => {
  assert.equal(buildQuery({ stage: "Lead", tag: undefined, note: null, q: "" }), "?stage=Lead");
});

test("buildQuery: returns an empty string when there's nothing to send", () => {
  assert.equal(buildQuery({}), "");
  assert.equal(buildQuery(), "");
});

test("buildQuery: coerces non-string values", () => {
  assert.equal(buildQuery({ limit: 10, includeTrash: false }), "?limit=10&includeTrash=false");
});

test("fub.get: sends Basic auth + X-System headers to the FUB base URL", async () => {
  setFubEnv();
  await withMockFetch([{ status: 200, body: { people: [] } }], async (calls) => {
    const result = await fub.get("/people", { limit: 5 });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.followupboss.com/v1/people?limit=5");
    assert.equal(calls[0].init.headers["X-System"], "test-system");
    assert.equal(calls[0].init.headers["X-System-Key"], "test-system-key");
    assert.match(calls[0].init.headers.Authorization, /^Basic /);
    assert.deepEqual(result, { people: [] });
  });
});

test("fub.get: throws without retrying on a 400 (bad request)", async () => {
  setFubEnv();
  await withMockFetch(
    [{ status: 400, statusText: "Bad Request", body: { errorMessage: "Invalid stage" } }],
    async (calls) => {
      await assert.rejects(() => fub.get("/people"), /Invalid stage/);
      assert.equal(calls.length, 1, "a 400 should not be retried");
    }
  );
});

test("fub.post: retries once on a 429 then succeeds", async () => {
  setFubEnv();
  await withMockFetch(
    [
      { status: 429, statusText: "Too Many Requests", body: { errorMessage: "rate limited" }, headers: { "retry-after": "0" } },
      { status: 200, body: { id: 123 } },
    ],
    async (calls) => {
      const result = await fub.post("/people", { firstName: "Test" });
      assert.equal(calls.length, 2, "should have retried exactly once");
      assert.deepEqual(result, { id: 123 });
    }
  );
});

test("fub.get: normalizes an array-shaped error into a readable message", async () => {
  setFubEnv();
  await withMockFetch([{ status: 402, statusText: "Payment Required", body: { error: ["insufficient tasks on account"] } }], async () => {
    await assert.rejects(() => fub.get("/people"), /insufficient tasks on account/);
  });
});

test("fub.get: gives up after MAX_RETRIES on a persistent 500", async () => {
  setFubEnv();
  await withMockFetch(
    [{ status: 500, statusText: "Internal Server Error", body: { errorMessage: "boom" }, headers: { "retry-after": "0" } }],
    async (calls) => {
      await assert.rejects(() => fub.get("/people"), /boom/);
      assert.equal(calls.length, 4, "should attempt once plus 3 retries, then give up");
    }
  );
});
