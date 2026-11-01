// Database adapter: Postgres via DATABASE_URL, or in-memory PGlite for tests.
// Both expose query(sql, params) -> { rows }.
import pg from 'pg';

export const MIGRATIONS = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  pw_hash TEXT NOT NULL,
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  disabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS reports (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  json TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);
CREATE TABLE IF NOT EXISTS usage (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  ai_calls INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);
`;

export async function openDb(url) {
  let db;
  if (url) {
    const pool = new pg.Pool({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false } });
    db = { query: (s, p) => pool.query(s, p) };
  } else {
    const { PGlite } = await import('@electric-sql/pglite');
    const lite = new PGlite();
    db = { query: (s, p) => lite.query(s, p) };
    await lite.exec(MIGRATIONS);
    return db;
  }
  for (const stmt of MIGRATIONS.split(';').map((s) => s.trim()).filter(Boolean)) await db.query(stmt);
  return db;
}
