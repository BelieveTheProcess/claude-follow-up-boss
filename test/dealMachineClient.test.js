import { test } from "node:test";
import assert from "node:assert/strict";
import { buildQuery, DEALMACHINE_BASE_URL } from "../src/dealMachineClient.js";

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
