import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { verifyPkce } from "../src/oauth.js";

function base64url(buf) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

test("verifyPkce: accepts a verifier that matches its S256 challenge", () => {
  const verifier = "a-random-code-verifier-1234567890";
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  assert.equal(verifyPkce(verifier, challenge), true);
});

test("verifyPkce: rejects a mismatched verifier", () => {
  const verifier = "a-random-code-verifier-1234567890";
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  assert.equal(verifyPkce("a-different-verifier", challenge), false);
});
