# BROWSER_CHECK: how to look at a page in the sandbox in ONE go (learned in Phase 96)

Use this for the single targeted browser check a phase allows. Do NOT run `vite build`, preview or lighthouse. Dev server only. Playwright and Chromium are pre-installed (never run `playwright install`). `node_modules` is absent in the zip: run `npm ci --no-audit --no-fund --silent` once, in the background, while you write code.

## The three traps (this is what cost tools before)
1. **Install gate:** nothing renders in a plain browser. Fake the installed state with an init script that makes `matchMedia('(display-mode: standalone)')` return `matches: true` (see script).
2. **First-run onboarding:** a fresh browser profile redirects every URL to `/welcome`. Skip it with exact-text buttons: click `Skip for now` repeatedly, then `Start training` (about 5 clicks), THEN `goto` the page you want. Use exact text (`/^Skip for now$|^Start training$/`); a loose filter like Continue/Done hangs the loop. Do it once per new browser context (each context is a fresh profile).
3. **Playwright path:** the project has no playwright; run with `NODE_PATH=$(npm root -g) node check.js`. Keep the script OUTSIDE the project (scratchpad). Save screenshots outside the project too.

## Steps
```bash
cd <project> && (npx vite --port 5199 --host 127.0.0.1 > ../vite.log 2>&1 &) ; sleep 6
NODE_PATH=$(npm root -g) timeout 100 node ../check.js
pkill -f "vite --port"        # always stop the server
```

## check.js skeleton (edit the URL and the actions)
```js
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  for (const [w, h] of [[360, 800], [390, 844]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    await ctx.addInitScript(() => {
      const mm = window.matchMedia.bind(window);
      window.matchMedia = (q) => (q.includes('display-mode: standalone') ? { ...mm(q), matches: true, media: q } : mm(q));
      Object.defineProperty(navigator, 'standalone', { value: true });
    });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
    await p.goto('http://127.0.0.1:5199/welcome', { waitUntil: 'networkidle' });
    for (let i = 0; i < 8; i++) {
      const sk = p.locator('button,a').filter({ hasText: /^Skip for now$|^Start training$/ }).first();
      if (!(await sk.count())) break;
      await sk.click({ timeout: 3000 }); await p.waitForTimeout(400);
    }
    await p.goto('http://127.0.0.1:5199/<the route>', { waitUntil: 'networkidle' });
    // ...do the main action, e.g. await p.click('[role=radio]:has-text("Classic")');
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    await p.screenshot({ path: `../shots/<name>-${w}.png` });   // outside the project
    console.log(w, { overflow, errs });
    await ctx.close();
  }
  await b.close();
})();
```
Handy selectors: Segmented = `[role=radio]`, Toggle/Switch = `[role=switch]` (`aria-checked`), collapsible bar = `button.sf-sec__bar[aria-expanded]`. The style switches are root attributes `data-ux-<key>` (Phase 96); to test Classic click Settings -> Appearance -> Classic or set `localStorage['sf.ux']='000000000'` before load.
Only claim what the script printed. A dev-server check is NOT a phone: keep the standing gaps.
