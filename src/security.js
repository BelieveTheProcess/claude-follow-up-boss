// Small shared constant-time/escaping helpers used by both the OAuth shell
// and the plain bearer-token check, so neither one leaks timing information
// or renders attacker-controlled strings into HTML unescaped.

import { timingSafeEqual } from "node:crypto";

export function timingSafeEqualStr(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}
