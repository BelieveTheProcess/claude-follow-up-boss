import { openDb } from './db.js';
import { createApp } from './app.js';
import { createAI } from './ai.js';
import { createDealMachine } from './providers/dealmachine.js';

const e = process.env;
if (!e.SESSION_SECRET || e.SESSION_SECRET.length < 16) { console.error('SESSION_SECRET (16+ chars) is required'); process.exit(1); }
const config = {
  sessionSecret: e.SESSION_SECRET,
  inviteCode: e.INVITE_CODE || '',
  adminEmail: e.ADMIN_EMAIL || '',
  dailyAiLimit: Number(e.DAILY_AI_LIMIT) || 40,
  secureCookies: e.NODE_ENV === 'production'
};
const db = await openDb(e.DATABASE_URL);
const runAI = createAI({ apiKey: e.ANTHROPIC_API_KEY, model: e.ANTHROPIC_MODEL || 'claude-sonnet-5-5' });
const dm = createDealMachine({ apiKey: e.DEALMACHINE_API_KEY });
const port = Number(e.PORT) || 3000;
createApp({ db, config, runAI, dm }).listen(port, () => console.log('BTP Analyzer on :' + port));
