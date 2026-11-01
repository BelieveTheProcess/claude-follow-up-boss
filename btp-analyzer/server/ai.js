// Anthropic Messages API wrapper: prompt (+ base64 JPEG images) -> parsed JSON.
export const LIMITS = { maxImages: 8, maxImageBytes: 1.5 * 1024 * 1024, maxPromptBytes: 250 * 1024, timeoutMs: 120000 };

export function parseJsonLoose(text) {
  let t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(t); } catch {}
  const a = t.search(/[{[]/), b = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
  if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
  throw new Error('bad json');
}

export function createAI({ apiKey, model, fetchImpl = fetch }) {
  return async function runAI(prompt, images = []) {
    if (!apiKey) throw Object.assign(new Error('no key'), { code: 'capability_disabled' });
    const content = images.map((b64) => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } }));
    content.push({ type: 'text', text: prompt + '\n\nRespond with JSON only, no commentary.' });
    let r;
    try {
      r = await fetchImpl('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model, max_tokens: 4096, messages: [{ role: 'user', content }] }),
        signal: AbortSignal.timeout(LIMITS.timeoutMs)
      });
    } catch { throw Object.assign(new Error('network'), { code: 'upstream_error' }); }
    if (r.status === 429) throw Object.assign(new Error('rl'), { code: 'rate_limited' });
    if (r.status === 400) throw Object.assign(new Error('bad'), { code: 'image_rejected' });
    if (!r.ok) throw Object.assign(new Error('http ' + r.status), { code: 'upstream_error' });
    const j = await r.json();
    if (j.stop_reason === 'refusal') throw Object.assign(new Error('refusal'), { code: 'refused' });
    const text = (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
    if (!text) throw Object.assign(new Error('empty'), { code: 'empty_completion' });
    try { return parseJsonLoose(text); } catch { throw Object.assign(new Error('json'), { code: 'invalid_json' }); }
  };
}
