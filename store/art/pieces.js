#!/usr/bin/env node
// @ts-check
// Takes the five pictures of drip that frames-v5.html shows, from the dev pages in light mode, into store/art/pieces/.
// Each one is a single piece of the interface on a clear background, several times larger than the frame draws it.
// Headless Chrome over Node's built-in WebSocket, like bin/capture-screens. No dependencies.
// Usage: node store/art/pieces.js [name ...]   Then store/art/capture.sh v5 shoots the frames.

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(__dirname, 'pieces');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
/** @type {Record<string, string>} */
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json; charset=utf-8', '.woff2': 'font/woff2',
};

/** @param {number} ms */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** An expression that adds a stylesheet to the page. @param {string} text */
const css = (text) => `(() => { const s = document.createElement('style'); s.textContent = ${JSON.stringify(text)}; document.head.append(s); })()`;

/** The box around every element in els, pad pixels wider on each side. Runs in the page. */
const BOX = `const box = (els, pad = 0) => { const rs = els.map((e) => e.getBoundingClientRect());
  const x = Math.min(...rs.map((r) => r.left)) - pad, y = Math.min(...rs.map((r) => r.top)) - pad;
  return { x: x + scrollX, y: y + scrollY, width: Math.max(...rs.map((r) => r.right)) + pad - x, height: Math.max(...rs.map((r) => r.bottom)) + pad - y }; };`;
/** The two rows of Settings that set a day's watch time. Runs in the page. */
const LIMIT_ROWS = `[...document.querySelectorAll('.setting')].filter((e) => /^(Drops per day|Minutes per drop)/.test(e.textContent.trim()))`;
const OPTIONS = '/dev/page.html?page=options&settled=1&sample=1';

/**
 * One page per entry. steps run in order after the page has had `wait` ms to draw, each an expression and the ms to
 * wait after it. shots are the pieces cut from the page: a name and an expression for its box. scale is the device
 * pixel ratio, so a piece is scale times its CSS size. clear takes the picture on a transparent background.
 * @type {{url: string, w: number, h: number, scale: number, wait: number, clear: boolean, steps: [string, number][], shots: {name: string, box: string}[]}[]}
 */
const PAGES = [
  {
    // The home page with one video revealed. videos=store is the made-up video, so nothing comes from YouTube.
    url: '/dev/home.html?scenario=card&theme=light&reduced=1&videos=store', w: 900, h: 900, scale: 3, wait: 7000, clear: true,
    steps: [[css('#masthead, #harness-bar { visibility: hidden !important; } html, body, #drip-home, .drip-page { background: transparent !important; }'), 400]],
    shots: [{ name: 'card', box: `(() => { ${BOX} return box([document.querySelector('.drip-card')], 8); })()` }],
  },
  {
    // Settings: the mode control, and the two limit rows narrowed so the numbers sit near their labels.
    url: OPTIONS, w: 900, h: 1100, scale: 6, wait: 4000, clear: true,
    steps: [
      [css('html, body, main, .card, .panel { background: transparent !important; box-shadow: none !important; }'), 0],
      [`for (const e of ${LIMIT_ROWS}) e.style.width = '290px'`, 400],
    ],
    shots: [
      { name: 'modes', box: `(() => { ${BOX} return box([document.querySelector('.segmented')], 2); })()` },
      { name: 'limit', box: `(() => { ${BOX} return box(${LIMIT_ROWS}); })()` },
    ],
  },
  {
    // The lock, from the welcome tour's fourth step, which draws it over a sample video. Its orbit and the tour's
    // callouts are hidden, and the type is Roboto as on YouTube. The panel starts and ends at a fraction of a pixel,
    // so the box is rounded inward, or the video behind shows as a line along the edge. The video still shows
    // outside the panel's round corners, and frames-v5.html clips those.
    url: '/dev/page.html?page=welcome#tour-4', w: 1280, h: 800, scale: 4, wait: 5000, clear: false,
    steps: [
      [css(`@import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap');
        #drip-lock, #drip-lock * { font-family: Roboto, Arial, sans-serif !important; }
        #drip-lock .drip-orbit, #drip-lock .drip-orbit-spark, #drip-lock .drip-orbit-star, #drip-lock .drip-done-ring, .co-layer, .co-ring, .co-chip, .co-said { display: none !important; }
        #drip-lock .drip-lock-panel { box-shadow: none !important; }`), 1500],
      [`(() => { document.querySelector('#drip-lock .drip-lock-sub').textContent = '1h watched today'; document.activeElement?.blur();
        document.getAnimations().forEach((a) => { try { a.finish(); } catch {} }); })()`, 500],
    ],
    shots: [{ name: 'lock', box: `(() => { const r = document.querySelector('#drip-lock .drip-lock-panel').getBoundingClientRect(); const x = Math.ceil(r.left), y = Math.ceil(r.top);
      return { x: x + scrollX, y: y + scrollY, width: Math.floor(r.right) - x, height: Math.floor(r.bottom) - y }; })()` }],
  },
  {
    // History with the sample week: from the daily average down to the chart's key, without the card around them.
    url: `${OPTIONS}#history`, w: 900, h: 1300, scale: 4, wait: 4000, clear: true,
    steps: [
      [`document.querySelector('[data-k=earlier]')?.click()`, 900],
      [css('html, body, #panel-history > .card:first-child { background: transparent !important; box-shadow: none !important; }'), 0],
      ['window.scrollTo(0, 0)', 300],
    ],
    shots: [{ name: 'week', box: `(() => { ${BOX} const q = (s) => document.querySelector('#panel-history > .card:first-child ' + s); return box([q('.avg-row'), q('.key')]); })()` }],
  },
];

const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url || '/', 'http://127.0.0.1').pathname);
    const file = await fs.promises.realpath(path.resolve(ROOT, `.${pathname}`));
    if (!file.startsWith(`${ROOT}${path.sep}`)) {
      res.writeHead(403).end();
      return;
    }
    const data = await fs.promises.readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch {
    res.writeHead(404).end('Not found');
  }
});

async function main() {
  const names = process.argv.slice(2);
  const known = PAGES.flatMap((page) => page.shots.map((shot) => shot.name));
  const unknown = names.filter((name) => !known.includes(name));
  if (unknown.length) throw new Error(`Unknown piece: ${unknown.join(', ')}. The pieces are ${known.join(', ')}.`);
  const wanted = (/** @type {string} */ name) => !names.length || names.includes(name);
  fs.mkdirSync(OUT, { recursive: true });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drip-pieces-'));
  /** @type {import('node:child_process').ChildProcess | undefined} */
  let chrome;
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => resolve(undefined));
    });
    const origin = `http://127.0.0.1:${/** @type {import('node:net').AddressInfo} */ (server.address()).port}`;
    chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', '--remote-allow-origins=*', `--user-data-dir=${dir}`,
      '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
    const portFile = path.join(dir, 'DevToolsActivePort');
    for (let i = 0; i < 150 && !fs.existsSync(portFile); i++) await sleep(100);
    if (!fs.existsSync(portFile)) throw new Error('Chrome did not start its DevTools server');
    const devtools = `http://127.0.0.1:${fs.readFileSync(portFile, 'utf8').split('\n')[0]}`;

    for (const page of PAGES.filter((p) => p.shots.some((shot) => wanted(shot.name)))) {
      const tab = await (await fetch(`${devtools}/json/new?about:blank`, { method: 'PUT' })).json();
      const ws = new WebSocket(tab.webSocketDebuggerUrl);
      await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = () => reject(new Error('DevTools connection failed')); });
      let nextId = 0;
      /** @type {Map<number, {resolve: (value: any) => void, reject: (err: Error) => void}>} */
      const waiting = new Map();
      ws.onmessage = (event) => {
        const msg = JSON.parse(String(event.data));
        const pending = waiting.get(msg.id);
        if (!pending) return;
        waiting.delete(msg.id);
        if (msg.error) pending.reject(new Error(msg.error.message));
        else pending.resolve(msg.result);
      };
      /** @param {string} method @param {object} [params] @returns {Promise<any>} */
      const cdp = (method, params = {}) => new Promise((resolve, reject) => {
        const id = ++nextId;
        waiting.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      });
      /** @param {string} expression @returns {Promise<any>} */
      const run = async (expression) => {
        const r = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (r.exceptionDetails) throw new Error(`${page.url}: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
        return r.result.value;
      };

      await cdp('Emulation.setDeviceMetricsOverride', { width: page.w, height: page.h, deviceScaleFactor: page.scale, mobile: false });
      await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }, { name: 'prefers-reduced-motion', value: 'reduce' }] });
      if (page.clear) await cdp('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
      await cdp('Page.enable');
      await cdp('Page.navigate', { url: origin + page.url });
      await sleep(page.wait);
      for (const [expression, ms] of page.steps) {
        await run(expression);
        await sleep(ms);
      }
      for (const shot of page.shots.filter((s) => wanted(s.name))) {
        const clip = await run(shot.box);
        const picture = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { ...clip, scale: 1 } });
        const file = path.join(OUT, `${shot.name}.png`);
        fs.writeFileSync(file, Buffer.from(picture.data, 'base64'));
        console.log(`${path.relative(ROOT, file)}  ${Math.round(clip.width * page.scale)}x${Math.round(clip.height * page.scale)}`);
      }
      ws.close();
      await fetch(`${devtools}/json/close/${tab.id}`);
    }
  } finally {
    chrome?.kill();
    server.close();
    await sleep(300);
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(`pieces: ${err.message}`);
  process.exit(1);
});
