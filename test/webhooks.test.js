import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { fillTemplate, verifyFubSignature } from "../src/webhooks.js";

test("fillTemplate: substitutes known placeholders", () => {
  const out = fillTemplate("Hi {firstName}, this is {agentName}!", { firstName: "Sam", agentName: "Jess" });
  assert.equal(out, "Hi Sam, this is Jess!");
});

test("fillTemplate: leaves unknown placeholders untouched instead of blanking them", () => {
  const out = fillTemplate("Hi {firstName}, re: {unknownVar}", { firstName: "Sam" });
  assert.equal(out, "Hi Sam, re: {unknownVar}");
});

test("fillTemplate: falls back on nullish values without dropping the placeholder", () => {
  const out = fillTemplate("Hi {firstName}", { firstName: null });
  assert.equal(out, "Hi {firstName}");
});

test("verifyFubSignature: accepts a correctly-signed body", () => {
  const systemKey = "test-system-key";
  process.env.FUB_SYSTEM_KEY = systemKey;
  const rawBody = Buffer.from(JSON.stringify({ event: "peopleCreated", resourceIds: [1] }));
  const base64Body = rawBody.toString("base64");
  const signature = crypto.createHmac("sha256", systemKey).update(base64Body).digest("hex");

  assert.equal(verifyFubSignature(rawBody, signature), true);
});

test("verifyFubSignature: rejects a tampered body", () => {
  const systemKey = "test-system-key";
  process.env.FUB_SYSTEM_KEY = systemKey;
  const original = Buffer.from(JSON.stringify({ event: "peopleCreated", resourceIds: [1] }));
  const signature = crypto
    .createHmac("sha256", systemKey)
    .update(original.toString("base64"))
    .digest("hex");

  const tampered = Buffer.from(JSON.stringify({ event: "peopleCreated", resourceIds: [999] }));
  assert.equal(verifyFubSignature(tampered, signature), false);
});

test("verifyFubSignature: rejects when FUB_SYSTEM_KEY is unset", () => {
  delete process.env.FUB_SYSTEM_KEY;
  const rawBody = Buffer.from("{}");
  assert.equal(verifyFubSignature(rawBody, "any-signature"), false);
});

test("verifyFubSignature: rejects a missing signature header", () => {
  process.env.FUB_SYSTEM_KEY = "test-system-key";
  const rawBody = Buffer.from("{}");
  assert.equal(verifyFubSignature(rawBody, undefined), false);
});
