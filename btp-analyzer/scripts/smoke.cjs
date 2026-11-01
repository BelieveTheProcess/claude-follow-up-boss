const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:3999/');
  await p.click('#alt'); await p.fill('#email', 's@x.com'); await p.fill('#pw', 'longenough'); await p.fill('#invite', 'inv');
  await Promise.all([p.waitForNavigation(), p.click('#go')]);
  await p.waitForTimeout(1500);
  console.log(await p.title(), 'errors:', errs);
  await p.evaluate(() => window.claude.use('db').then(d => d.collection('x').doc('rpt_t').set({kind:'report', id:'t', name:'T'})));
  console.log(await p.evaluate(() => window.claude.use('db').then(d => d.collection('x').get()).then(s => s.docs.map(x => x.data().name))));
  await b.close();
})();
