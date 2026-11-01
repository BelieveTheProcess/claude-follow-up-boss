// DealMachine comps provider. Swap this file for an MLS/IDX feed later; keep the return shapes.
// Endpoints per docs/dealmachine-api.md (verify with a real call before trusting shapes).
const BASE = 'https://api.v2.dealmachine.com/v1';

export function createDealMachine({ apiKey, fetchImpl = fetch }) {
  async function call(path, body) {
    if (!apiKey) throw Object.assign(new Error('no key'), { code: 'not_configured' });
    let r;
    try {
      r = await fetchImpl(BASE + path, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000)
      });
    } catch { throw Object.assign(new Error('network'), { code: 'upstream_error' }); }
    if (r.status === 429) throw Object.assign(new Error('rl'), { code: 'rate_limited' });
    if (!r.ok) throw Object.assign(new Error('http ' + r.status), { code: 'upstream_error' });
    return r.json();
  }
  return {
    // -> { matched, dm_property_id, ... } (first data row, passed through)
    async match(fullAddress) {
      const j = await call('/enrichment/address', { data: [{ full_address: fullAddress }], contact_audience: 'none' });
      return { data: j.data || [], credits: j.credits };
    },
    async comps({ property_ids, location, criteria }) {
      const j = await call('/comps', { property_ids, location, criteria });
      return { data: j.data || [], credits: j.credits };
    }
  };
}
