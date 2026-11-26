'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { createBot, makeSyncFetch } = require('./shim');
const { GoogleSheets } = require('./gsheets');

const env = process.env;
const need = ['SHEET_ID', 'GOOGLE_SERVICE_ACCOUNT_JSON', 'BOT_TOKEN', 'GROUP_ID', 'SECRET', 'PUBLIC_URL'];
const miss = need.filter(k => !env[k]);
if (miss.length) { console.error('Tetapan tiada: ' + miss.join(', ')); process.exit(1); }
let sa;
try { sa = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON.trim().startsWith('{') ? env.GOOGLE_SERVICE_ACCOUNT_JSON : Buffer.from(env.GOOGLE_SERVICE_ACCOUNT_JSON, 'base64').toString('utf8')); }
catch (e) { console.error('GOOGLE_SERVICE_ACCOUNT_JSON tidak sah'); process.exit(1); }
if (sa.private_key) sa.private_key = sa.private_key.replace(/\\n/g, '\n');

const TG = env.TELEGRAM_API || 'https://api.telegram.org';
const BASE = env.PUBLIC_URL.replace(/\/+$/, '');
const sign = id => crypto.createHmac('sha256', env.SECRET).update(String(id)).digest('hex').slice(0, 24);

(async () => {
  const bot = createBot({
    code: fs.readFileSync(path.join(__dirname, 'Code.gs'), 'utf8'),
    cfg: {
      props: { BOT_TOKEN: env.BOT_TOKEN, GROUP_ID: env.GROUP_ID, SECRET: env.SECRET, WEBAPP_URL: BASE + '/hook' },
      propsFile: env.PROPS_FILE || '/tmp/bot-props.json',
      telegramBase: env.TELEGRAM_API,
      photoLink: id => BASE + '/f/' + encodeURIComponent(id) + '?s=' + sign(id)
    },
    backend: new GoogleSheets(env.SHEET_ID, sa, env.SHEETS_API),
    syncFetch: makeSyncFetch()
  });
  await bot.start();
  console.log('Sheet dimuat:', Object.keys(bot.mirror.sheets).map(n => n + '(' + Math.max(0, bot.mirror.sheets[n].length - 1) + ')').join(' '));

  // Satu giliran: proses mesej satu demi satu
  let chain = Promise.resolve();
  const run = fn => (chain = chain.then(fn).catch(e => console.error('Ralat:', e && e.stack || e)));

  http.createServer((req, res) => {
    const u = new URL(req.url, BASE);
    const done = (code, body, type) => { res.writeHead(code, { 'Content-Type': type || 'text/plain; charset=utf-8' }); res.end(body); };
    if (req.method === 'POST' && u.pathname === '/hook') {
      let b = ''; req.on('data', c => { b += c; if (b.length > 2e6) req.destroy(); });
      req.on('end', () => { done(200, 'ok'); run(() => { bot.x.doPost({ parameter: { k: u.searchParams.get('k') }, postData: { contents: b } }); }); });
      return;
    }
    if (u.pathname === '/setup' && u.searchParams.get('k') === env.SECRET) { run(() => { bot.x.setupWebhook(); }); return done(200, 'Webhook didaftarkan. Semak log.'); }
    if (u.pathname.startsWith('/f/')) {
      const id = decodeURIComponent(u.pathname.slice(3));
      if (u.searchParams.get('s') !== sign(id)) return done(403, 'Tidak dibenarkan');
      (async () => {
        const gf = await (await fetch(TG + '/bot' + env.BOT_TOKEN + '/getFile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file_id: id }) })).json();
        if (!gf.ok) return done(404, 'Gambar tiada');
        const f = await fetch(TG + '/file/bot' + env.BOT_TOKEN + '/' + gf.result.file_path);
        res.writeHead(200, { 'Content-Type': f.headers.get('content-type') || 'image/jpeg', 'Cache-Control': 'private, max-age=86400' });
        res.end(Buffer.from(await f.arrayBuffer()));
      })().catch(e => done(500, 'Ralat'));
      return;
    }
    if (u.pathname === '/health') return done(200, JSON.stringify({ ok: true, tulisan_menunggu: bot.mirror.q.length, gagal: bot.mirror.failed }), 'application/json');
    done(200, 'Bot stok aktif');
  }).listen(Number(env.PORT || 8080), () => console.log('Pelayan hidup pada port', env.PORT || 8080));

  // Peringatan kiraan harian setiap minit; muat semula Sheet setiap 2 minit jika tiada tulisan tertangguh
  setInterval(() => run(() => { bot.x.peringatanKiraan(); }), 60 * 1000);
  setInterval(() => { bot.mirror.reloadIfIdle().catch(() => {}); }, 120 * 1000);
  process.on('SIGTERM', async () => { await bot.mirror.drain(); process.exit(0); });
})().catch(e => { console.error(e); process.exit(1); });
