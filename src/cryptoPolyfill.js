// Some dependencies assume `crypto` is available as a global (the Web
// Crypto API) - true by default starting in Node 19, stable in Node 20+,
// but NOT true on Node 18 without the --experimental-global-webcrypto flag.
// Railway's runtime for this service has been observed on a Node version
// where it isn't set, which crashes the very first request with a bare
// `ReferenceError: crypto is not defined` the moment a dependency (deep
// inside @modelcontextprotocol/sdk's request handling, in this case)
// touches that global.
//
// Import this file FIRST, before anything else, in any entry point - ESM
// evaluates a file's own imports in source order, so this must appear
// above imports for express/the SDK/etc. to guarantee the polyfill is in
// place before their module-level code (if any) can run.
import { webcrypto } from "node:crypto";

if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}
