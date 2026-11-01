import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword, verifyPassword, makeCookie, clearCookie, readSession, rateLimit } from './auth.js';
import { LIMITS } from './ai.js';
import { roomPrompt, docsPrompt, compsPrompt } from './prompts.js';

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function createApp({ db, config, runAI, dm }) {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  const secure = config.secureCookies;
  const asyncH = (fn) => (req, res, next) => fn(req, res, next).catch(next);

  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.use(express.json({ limit: '12mb' }));

  // ---- auth ----
  const authLimiter = rateLimit({ max: 20, windowMs: 15 * 60 * 1000 });
  app.post('/api/signup', authLimiter, asyncH(async (req, res) => {
    const { email, password, invite } = req.body || {};
    if (!config.inviteCode || invite !== config.inviteCode) return res.status(403).json({ error: 'bad_invite' });
    if (!EMAIL_RE.test(String(email || ''))) return res.status(400).json({ error: 'bad_email' });
    if (String(password || '').length < 8) return res.status(400).json({ error: 'weak_password' });
    const em = email.trim().toLowerCase();
    const isAdmin = !!config.adminEmail && em === config.adminEmail.toLowerCase();
    try {
      const r = await db.query('INSERT INTO users (email, pw_hash, is_admin) VALUES ($1,$2,$3) RETURNING id', [em, hashPassword(password), isAdmin]);
      res.setHeader('Set-Cookie', makeCookie(config.sessionSecret, r.rows[0].id, secure));
      res.json({ ok: true });
    } catch (e) {
      if (/unique|duplicate/i.test(String(e.message))) return res.status(409).json({ error: 'email_taken' });
      throw e;
    }
  }));
  app.post('/api/login', authLimiter, asyncH(async (req, res) => {
    const { email, password } = req.body || {};
    const r = await db.query('SELECT id, pw_hash, disabled FROM users WHERE email=$1', [String(email || '').trim().toLowerCase()]);
    const u = r.rows[0];
    if (!u || u.disabled || !verifyPassword(String(password || ''), u.pw_hash)) return res.status(401).json({ error: 'bad_login' });
    res.setHeader('Set-Cookie', makeCookie(config.sessionSecret, u.id, secure));
    res.json({ ok: true });
  }));
  app.post('/api/logout', (req, res) => { res.setHeader('Set-Cookie', clearCookie(secure)); res.json({ ok: true }); });

  const requireUser = asyncH(async (req, res, next) => {
    const id = readSession(config.sessionSecret, req);
    if (!id) return res.status(401).json({ error: 'session_expired' });
    const r = await db.query('SELECT id, email, is_admin, disabled FROM users WHERE id=$1', [id]);
    const u = r.rows[0];
    if (!u || u.disabled) return res.status(401).json({ error: 'session_expired' });
    req.user = u;
    next();
  });
  app.get('/api/me', requireUser, (req, res) => res.json({ id: req.user.id, email: req.user.email, isAdmin: req.user.is_admin }));

  // ---- reports ----
  const okId = (id) => typeof id === 'string' && id.length > 0 && id.length <= 100;
  app.get('/api/reports', requireUser, asyncH(async (req, res) => {
    const r = await db.query('SELECT id, json FROM reports WHERE user_id=$1 ORDER BY updated_at DESC', [req.user.id]);
    res.json({ reports: r.rows.map((x) => ({ id: x.id, data: JSON.parse(x.json) })) });
  }));
  app.put('/api/reports/:id', requireUser, asyncH(async (req, res) => {
    const id = req.params.id;
    const body = req.body;
    if (!okId(id) || !body || typeof body !== 'object') return res.status(400).json({ error: 'bad_request' });
    const json = JSON.stringify(body);
    if (json.length > 400000) return res.status(413).json({ error: 'too_large' });
    await db.query(
      `INSERT INTO reports (user_id, id, name, json, updated_at) VALUES ($1,$2,$3,$4,now())
       ON CONFLICT (user_id, id) DO UPDATE SET name=EXCLUDED.name, json=EXCLUDED.json, updated_at=now()`,
      [req.user.id, id, String(body.name || '').slice(0, 200), json]);
    res.json({ ok: true });
  }));
  app.delete('/api/reports/:id', requireUser, asyncH(async (req, res) => {
    await db.query('DELETE FROM reports WHERE user_id=$1 AND id=$2', [req.user.id, req.params.id]);
    res.json({ ok: true });
  }));

  // ---- AI (fixed server-side prompts only) ----
  async function counted(req, res, prompt, imgs) {
    if (Buffer.byteLength(prompt) > LIMITS.maxPromptBytes) return res.status(413).json({ error: 'too_large' });
    // Atomically reserve a call under the daily cap.
    const u = await db.query(
      `INSERT INTO usage (user_id, day, ai_calls) VALUES ($1, CURRENT_DATE, 1)
       ON CONFLICT (user_id, day) DO UPDATE SET ai_calls = usage.ai_calls + 1
       WHERE usage.ai_calls < $2 RETURNING ai_calls`, [req.user.id, config.dailyAiLimit]);
    if (!u.rows.length) return res.status(429).json({ error: 'daily_limit' });
    try {
      return await runAI(prompt, imgs);
    } catch (e) {
      // Failed calls don't count against the user's cap.
      await db.query('UPDATE usage SET ai_calls = GREATEST(ai_calls - 1, 0) WHERE user_id=$1 AND day=CURRENT_DATE', [req.user.id]);
      throw e;
    }
  }
  function checkImages(images, res, min = 0) {
    const imgs = Array.isArray(images) ? images : [];
    if (imgs.length < min || imgs.length > LIMITS.maxImages) { res.status(400).json({ error: 'image_rejected' }); return null; }
    for (const b of imgs) {
      if (typeof b !== 'string' || !b || b.length * 0.75 > LIMITS.maxImageBytes) { res.status(400).json({ error: 'image_rejected' }); return null; }
    }
    return imgs;
  }
  const bad = (res) => res.status(400).json({ error: 'bad_request' });
  const mode = (m) => (m === 'investor' ? 'investor' : 'buyer');

  app.post('/api/analyze-room', requireUser, asyncH(async (req, res) => {
    const b = req.body || {};
    const imgs = checkImages(b.images, res, 1);
    if (!imgs) return;
    if (typeof b.label !== 'string' || !b.label) return bad(res);
    const prompt = roomPrompt({ label: b.label, sqft: b.sqft, address: b.address, mode: mode(b.mode), n: imgs.length });
    const data = await counted(req, res, prompt, imgs);
    if (data !== undefined && !res.headersSent) res.json({ data });
  }));

  app.post('/api/analyze-docs', requireUser, asyncH(async (req, res) => {
    const b = req.body || {};
    const imgs = checkImages(b.images, res);
    if (!imgs) return;
    if (!Array.isArray(b.docs) || !b.docs.length || b.docs.length > 20) return bad(res);
    const docs = b.docs.map((d) => ({ name: String((d && d.name) || 'Document'), kind: d && d.kind === 'pdf' ? 'pdf' : 'other',
      text: typeof (d && d.text) === 'string' ? d.text : '', imageCount: Math.max(0, Math.min(Number(d && d.imageCount) || 0, 50)) }));
    if (!imgs.length && !docs.some((d) => d.text)) return bad(res);
    const built = docsPrompt({ docs, scan: Array.isArray(b.scan) ? b.scan : [], address: b.address, mode: mode(b.mode), imageTotal: imgs.length });
    const data = await counted(req, res, built.prompt, imgs);
    if (data !== undefined && !res.headersSent) res.json({ data, trimmed: built.trimmed });
  }));

  app.post('/api/parse-comps', requireUser, asyncH(async (req, res) => {
    const b = req.body || {};
    const imgs = checkImages(b.images, res);
    if (!imgs) return;
    const text = typeof b.text === 'string' ? b.text.trim() : '';
    if (!imgs.length && !text) return bad(res);
    const data = await counted(req, res, compsPrompt({ text, hasImages: imgs.length > 0 }), imgs);
    if (data !== undefined && !res.headersSent) res.json({ data });
  }));

  // ---- comps ----
  app.post('/api/comps/match', requireUser, asyncH(async (req, res) => {
    const addr = String((req.body || {}).full_address || '').trim();
    if (!addr || addr.length > 300) return res.status(400).json({ error: 'bad_request' });
    res.json(await dm.match(addr));
  }));
  app.post('/api/comps/search', requireUser, asyncH(async (req, res) => {
    const b = req.body || {};
    const radius = Number(b.radius_miles), lat = Number(b.latitude), lng = Number(b.longitude);
    const ok = ['3months', '6months', '12months', 'all'];
    if (!b.property_id || !(radius >= 0.1 && radius <= 25) || !ok.includes(b.timeframe)) return res.status(400).json({ error: 'bad_request' });
    const location = { type: 'radius', radius_miles: radius };
    if (isFinite(lat) && isFinite(lng) && b.latitude != null) { location.latitude = lat; location.longitude = lng; }
    res.json(await dm.comps({
      property_ids: [String(b.property_id)],
      location,
      criteria: { include_active_listings: false, include_pending: false, limit: 25, sort_by: 'match', sqft_tolerance_percent: 30, timeframe: b.timeframe }
    }));
  }));

  // ---- admin ----
  const requireAdmin = (req, res, next) => (req.user.is_admin ? next() : res.status(403).json({ error: 'forbidden' }));
  app.get('/api/admin/users', requireUser, requireAdmin, asyncH(async (req, res) => {
    const r = await db.query(
      `SELECT u.id, u.email, u.disabled, u.created_at,
              COALESCE((SELECT ai_calls FROM usage WHERE user_id=u.id AND day=CURRENT_DATE),0) AS today,
              COALESCE((SELECT SUM(ai_calls) FROM usage WHERE user_id=u.id),0) AS total
       FROM users u ORDER BY u.id`);
    res.json({ users: r.rows.map((x) => ({ ...x, today: Number(x.today), total: Number(x.total) })) });
  }));
  app.post('/api/admin/users/:id/disabled', requireUser, requireAdmin, asyncH(async (req, res) => {
    const id = Number(req.params.id);
    if (id === req.user.id) return res.status(400).json({ error: 'bad_request' });
    await db.query('UPDATE users SET disabled=$2 WHERE id=$1', [id, !!(req.body || {}).disabled]);
    res.json({ ok: true });
  }));

  // ---- front end ----
  app.get(['/', '/index.html'], (req, res) => {
    if (!readSession(config.sessionSecret, req)) return res.redirect('/login.html');
    res.sendFile(path.join(PUBLIC, 'index.html'));
  });
  app.use(express.static(PUBLIC, { index: false }));

  app.use('/api', (req, res) => res.status(404).json({ error: 'not_found' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'too_large' });
    const code = err.code && /^[a-z_]+$/.test(err.code) ? err.code : null;
    if (code) return res.status(code === 'rate_limited' ? 429 : code === 'not_configured' ? 503 : 502).json({ error: code });
    console.error('error:', err.message); // never log prompts or document text
    res.status(500).json({ error: 'server_error' });
  });
  return app;
}
