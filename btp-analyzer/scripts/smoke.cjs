const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('request', r => { if (r.url().includes('/api/analyze') || r.url().includes('/api/parse')) console.log('REQ', r.url()); });
  await p.goto('http://localhost:3999/');
  await p.click('#alt'); await p.fill('#email', 's@x.com'); await p.fill('#pw', 'longenough'); await p.fill('#invite', 'inv');
  await Promise.all([p.waitForNavigation(), p.click('#go')]);
  await p.waitForTimeout(1500);
  console.log(await p.title(), 'errors:', errs);
  const r = await p.evaluate(() => window.claude.use('sample').then(s => s.parseComps({ text: 'x' })).then(() => 'ok', e => e.code));
  console.log('parseComps without key ->', r);
  await b.close();
})();
