import crypto from 'node:crypto';

const COOKIE = 'btp_session';
const MAX_AGE = 30 * 24 * 3600;

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(pw, salt, 64);
  return `${salt.toString('hex')}:${h.toString('hex')}`;
}
export function verifyPassword(pw, stored) {
  const [s, h] = String(stored).split(':');
  if (!s || !h) return false;
  const calc = crypto.scryptSync(pw, Buffer.from(s, 'hex'), 64);
  const want = Buffer.from(h, 'hex');
  return calc.length === want.length && crypto.timingSafeEqual(calc, want);
}

const sign = (secret, v) => crypto.createHmac('sha256', secret).update(v).digest('base64url');

export function makeCookie(secret, userId, secure) {
  const v = `${userId}.${Math.floor(Date.now() / 1000) + MAX_AGE}`;
  return `${COOKIE}=${v}.${sign(secret, v)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${MAX_AGE}${secure ? '; Secure' : ''}`;
}
export function clearCookie(secure) {
  return `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure ? '; Secure' : ''}`;
}
export function readSession(secret, req) {
  const m = /(?:^|;\s*)btp_session=([^;]+)/.exec(req.headers.cookie || '');
  if (!m) return null;
  const parts = m[1].split('.');
  if (parts.length !== 3) return null;
  const v = `${parts[0]}.${parts[1]}`;
  const a = Buffer.from(sign(secret, v)), b = Buffer.from(parts[2]);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  if (Number(parts[1]) < Date.now() / 1000) return null;
  return Number(parts[0]);
}

// Simple in-memory fixed-window limiter for auth endpoints.
export function rateLimit({ max, windowMs }) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const k = req.ip;
    const e = hits.get(k);
    if (!e || e.reset < now) hits.set(k, { n: 1, reset: now + windowMs });
    else if (++e.n > max) return res.status(429).json({ error: 'rate_limited' });
    next();
  };
}
