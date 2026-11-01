import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { createAI } from '../server/ai.js';
import { createDealMachine } from '../server/providers/dealmachine.js';

async function boot({ limit = 3, anthropic, dmFetch } = {}) {
  const db = await openDb();
  const config = { sessionSecret: 'x'.repeat(32), inviteCode: 'inv', adminEmail: 'adan@x.com', dailyAiLimit: limit, secureCookies: false };
  const aiFetch = anthropic || (async () => ({ ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: '```json\n{"a":1}\n```' }] }) }));
  const app = createApp({ db, config, runAI: createAI({ apiKey: 'k', model: 'm', fetchImpl: aiFetch }),
    dm: createDealMachine({ apiKey: 'dm', fetchImpl: dmFetch || (async (url) => ({ ok: true, status: 200, json: async () => ({ data: [{ url }], credits: {} }) })) }) });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, body, cookie) => {
    const r = await fetch(base + path, { method, redirect: 'manual', headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, cookie: (r.headers.get('set-cookie') || '').split(';')[0], json: await r.json().catch(() => null), loc: r.headers.get('location') };
  };
  return { call, close: () => server.close(), db };
}
const signup = (t, email = 'adan@x.com') => t.call('POST', '/api/signup', { email, password: 'longenough', invite: 'inv' });

test('health, invite-only signup, login, me, logout', async () => {
  const t = await boot();
  assert.equal((await t.call('GET', '/api/health')).json.ok, true);
  assert.equal((await t.call('POST', '/api/signup', { email: 'a@b.co', password: 'longenough', invite: 'no' })).status, 403);
  assert.equal((await t.call('POST', '/api/signup', { email: 'a@b.co', password: 'short', invite: 'inv' })).status, 400);
  const s = await signup(t);
  assert.equal(s.status, 200);
  assert.equal((await signup(t)).status, 409);
  const me = await t.call('GET', '/api/me', null, s.cookie);
  assert.equal(me.json.isAdmin, true);
  assert.equal((await t.call('GET', '/api/me')).status, 401);
  assert.equal((await t.call('GET', '/api/me', null, s.cookie + 'x')).status, 401);
  assert.equal((await t.call('POST', '/api/login', { email: 'adan@x.com', password: 'wrong' })).status, 401);
  assert.equal((await t.call('POST', '/api/login', { email: 'ADAN@x.com', password: 'longenough' })).status, 200);
  assert.equal((await t.call('GET', '/')).loc, '/login.html');
  t.close();
});

test('reports are per-user CRUD', async () => {
  const t = await boot();
  const a = await signup(t), b = await signup(t, 'b@x.com');
  assert.equal((await t.call('PUT', '/api/reports/rpt_1', { kind: 'report', id: '1', name: 'Main St' }, a.cookie)).status, 200);
  await t.call('PUT', '/api/reports/rpt_1', { kind: 'report', id: '1', name: 'Renamed' }, a.cookie);
  const la = await t.call('GET', '/api/reports', null, a.cookie);
  assert.equal(la.json.reports.length, 1);
  assert.equal(la.json.reports[0].data.name, 'Renamed');
  assert.equal((await t.call('GET', '/api/reports', null, b.cookie)).json.reports.length, 0);
  await t.call('DELETE', '/api/reports/rpt_1', null, b.cookie);
  assert.equal((await t.call('GET', '/api/reports', null, a.cookie)).json.reports.length, 1);
  await t.call('DELETE', '/api/reports/rpt_1', null, a.cookie);
  assert.equal((await t.call('GET', '/api/reports', null, a.cookie)).json.reports.length, 0);
  t.close();
});

test('/api/ai parses fenced JSON, enforces limits and daily cap, refunds failures', async () => {
  const t = await boot({ limit: 2 });
  const a = await signup(t);
  assert.equal((await t.call('POST', '/api/ai', { prompt: 'hi' })).status, 401);
  const ok = await t.call('POST', '/api/ai', { prompt: 'hi', images: ['AAAA'] }, a.cookie);
  assert.deepEqual(ok.json, { data: { a: 1 } });
  assert.equal((await t.call('POST', '/api/ai', { prompt: 'hi', images: Array(9).fill('A') }, a.cookie)).json.error, 'image_rejected');
  assert.equal((await t.call('POST', '/api/ai', { prompt: 'hi', images: ['A'.repeat(2.1 * 1024 * 1024)] }, a.cookie)).json.error, 'image_rejected');
  assert.equal((await t.call('POST', '/api/ai', { prompt: 'x'.repeat(260 * 1024) }, a.cookie)).status, 400);
  assert.equal((await t.call('POST', '/api/ai', { prompt: 'hi' }, a.cookie)).status, 200);
  const over = await t.call('POST', '/api/ai', { prompt: 'hi' }, a.cookie);
  assert.equal(over.status, 429);
  assert.equal(over.json.error, 'daily_limit');
  t.close();
});

test('/api/ai maps upstream failures and refunds the call', async () => {
  let mode = 'badjson';
  const t = await boot({ limit: 1, anthropic: async () => mode === 'badjson'
    ? { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: 'sorry' }] }) }
    : { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: '{"z":2}' }] }) } });
  const a = await signup(t);
  const bad = await t.call('POST', '/api/ai', { prompt: 'hi' }, a.cookie);
  assert.equal(bad.status, 502);
  assert.equal(bad.json.error, 'invalid_json');
  mode = 'good';
  assert.deepEqual((await t.call('POST', '/api/ai', { prompt: 'hi' }, a.cookie)).json, { data: { z: 2 } });
  t.close();
});

test('comps endpoints call DealMachine with the documented shapes', async () => {
  const seen = [];
  const t = await boot({ dmFetch: async (url, opts) => { seen.push({ url, body: JSON.parse(opts.body), auth: opts.headers.Authorization }); return { ok: true, status: 200, json: async () => ({ data: [{ matched: true }], credits: { used: 1 } }) }; } });
  const a = await signup(t);
  const m = await t.call('POST', '/api/comps/match', { full_address: '1 Main St, San Jose, CA 95125' }, a.cookie);
  assert.equal(m.json.data[0].matched, true);
  assert.equal(seen[0].url, 'https://api.v2.dealmachine.com/v1/enrichment/address');
  assert.equal(seen[0].body.contact_audience, 'none');
  assert.equal(seen[0].auth, 'Bearer dm');
  assert.equal((await t.call('POST', '/api/comps/search', { property_id: 'p', radius_miles: 99, timeframe: '12months' }, a.cookie)).status, 400);
  await t.call('POST', '/api/comps/search', { property_id: 'p', latitude: 37, longitude: -122, radius_miles: 1, timeframe: '12months' }, a.cookie);
  assert.equal(seen[1].url, 'https://api.v2.dealmachine.com/v1/comps');
  assert.deepEqual(seen[1].body.location, { type: 'radius', radius_miles: 1, latitude: 37, longitude: -122 });
  assert.equal(seen[1].body.criteria.timeframe, '12months');
  t.close();
});

test('admin lists users with usage and can disable', async () => {
  const t = await boot();
  const a = await signup(t), b = await signup(t, 'b@x.com');
  await t.call('POST', '/api/ai', { prompt: 'hi' }, b.cookie);
  assert.equal((await t.call('GET', '/api/admin/users', null, b.cookie)).status, 403);
  const l = await t.call('GET', '/api/admin/users', null, a.cookie);
  assert.equal(l.json.users.find((u) => u.email === 'b@x.com').today, 1);
  const id = l.json.users.find((u) => u.email === 'b@x.com').id;
  await t.call('POST', `/api/admin/users/${id}/disabled`, { disabled: true }, a.cookie);
  assert.equal((await t.call('GET', '/api/me', null, b.cookie)).status, 401);
  assert.equal((await t.call('POST', '/api/login', { email: 'b@x.com', password: 'longenough' })).status, 401);
  t.close();
});
