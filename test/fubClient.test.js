import { test } from "node:test";
import assert from "node:assert/strict";
import { buildQuery } from "../src/fubClient.js";

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
