'use strict';
/* Menjalankan Code.gs (logik bot yang sama) di Node. Fungsi Apps Script ditiru:
   - Sheet dibaca dari salinan dalam memori (laju); tulisan dihantar ke Google Sheets di belakang tabir.
   - Panggilan Telegram segerak melalui thread kecil. */
const vm = require('vm'), fs = require('fs'), path = require('path');
const { Worker, MessageChannel, receiveMessageOnPort } = require('worker_threads');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const colName = n => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

function makeSyncFetch() {
  const w = new Worker(path.join(__dirname, 'syncworker.js'));
  w.unref();
  return function (url, opts) {
    const sab = new SharedArrayBuffer(4), flag = new Int32Array(sab);
    const { port1, port2 } = new MessageChannel();
    w.postMessage({ sab, port: port2, url, opts: opts || {} }, [port2]);
    const res = Atomics.wait(flag, 0, 0, 30000);
    if (res === 'timed-out') throw new Error('Permintaan tamat masa: ' + url.split('?')[0]);
    const m = receiveMessageOnPort(port1);
    if (!m) throw new Error('Tiada jawapan');
    if (!m.message.ok) throw new Error(m.message.error);
    return m.message;
  };
}

/** Salinan sheet dalam memori + baris gilir tulisan ke backend. */
class Mirror {
  constructor(backend) { this.b = backend; this.sheets = {}; this.q = []; this.busy = false; this.ver = 0; this.failed = 0; }
  async load() {
    const d = await this.b.load();
    Object.keys(d).forEach(n => { const w = Math.max(0, ...d[n].map(r => r.length)); d[n] = d[n].map(r => { const x = r.slice(); while (x.length < w) x.push(''); return x; }); });
    this.sheets = d;
  }
  async reloadIfIdle() {
    if (!this.idle()) return false;
    const v = this.ver;
    const keepLocal = this.sheets;
    const prev = this.sheets;
    let d; try { d = await this.b.load(); } catch (e) { console.error('muat semula gagal', e.message); return false; }
    if (v !== this.ver || !this.idle()) return false;   // ada perubahan semasa memuat: abaikan
    Object.keys(d).forEach(n => { const w = Math.max(0, ...d[n].map(r => r.length)); d[n] = d[n].map(r => { const x = r.slice(); while (x.length < w) x.push(''); return x; }); });
    this.sheets = d; return true;
  }
  idle() { return !this.busy && this.q.length === 0; }
  enqueue(op) { op.tries = 0; this.q.push(op); this.ver++; this.pump(); }
  async pump() {
    if (this.busy) return; this.busy = true;
    try {
      while (this.q.length) {
        const op = this.q[0];
        try { await this.b.apply(op); this.q.shift(); }
        catch (e) {
          console.error('Tulis ke Sheet gagal:', e.message);
          this.failed++;
          if (++op.tries >= 5) { console.error('Dibuang selepas 5 cubaan:', JSON.stringify(op).slice(0, 200)); this.q.shift(); }
          else await sleep(1500 * op.tries);
        }
      }
    } finally { this.busy = false; }
  }
  async drain() { while (!this.idle()) await sleep(20); }
}

function createBot(o) {
  const { code, cfg, backend, syncFetch, now } = o;
  const mirror = new Mirror(backend);
  const props = Object.assign({}, cfg.props);
  const cache = new Map();

  const sheetObj = n => ({
    getDataRange: () => ({ getValues: () => mirror.sheets[n].map(r => r.slice()) }),
    appendRow: r => { mirror.sheets[n].push(r.slice()); mirror.enqueue({ t: 'append', tab: n, row: r.slice() }); },
    getRange: (r, c, nr, nc) => ({
      getValue: () => (mirror.sheets[n][r - 1] || [])[c - 1],
      setValue: v => { const s = mirror.sheets[n]; while (s.length < r) s.push([]); const row = s[r - 1]; while (row.length < c) row.push(''); row[c - 1] = v; mirror.enqueue({ t: 'set', tab: n, r, c, vals: [[v]] }); },
      setValues: vs => { const s = mirror.sheets[n]; while (s.length < r - 1 + vs.length) s.push([]); vs.forEach((vr, i) => { const row = s[r - 1 + i]; vr.forEach((v, j) => { while (row.length < c + j) row.push(''); row[c - 1 + j] = v; }); }); mirror.enqueue({ t: 'set', tab: n, r, c, vals: vs.map(x => x.slice()) }); }
    })
  });
  const ss = {
    getSheetByName: n => mirror.sheets[n] ? sheetObj(n) : null,
    insertSheet: n => { mirror.sheets[n] = []; mirror.enqueue({ t: 'add', tab: n }); return sheetObj(n); },
    getSpreadsheetTimeZone: () => 'Asia/Kuala_Lumpur'
  };

  // Sifat kekal: hanya kaunter n_* disimpan dalam tab Sistem (kekal selepas mulakan semula)
  function persistProp(k, v) {
    if (!/^n_/.test(k)) return;
    if (!mirror.sheets.Sistem) { mirror.sheets.Sistem = [['Kunci', 'Nilai']]; mirror.enqueue({ t: 'add', tab: 'Sistem' }); mirror.enqueue({ t: 'append', tab: 'Sistem', row: ['Kunci', 'Nilai'] }); }
    const s = mirror.sheets.Sistem, i = s.findIndex((r, x) => x > 0 && r[0] === k);
    if (i >= 0) { s[i][1] = v; mirror.enqueue({ t: 'set', tab: 'Sistem', r: i + 1, c: 2, vals: [[v]] }); }
    else { s.push([k, v]); mirror.enqueue({ t: 'append', tab: 'Sistem', row: [k, v] }); }
  }
  function loadProps() {
    (mirror.sheets.Sistem || []).slice(1).forEach(r => { if (r[0]) props[r[0]] = String(r[1]); });
    if (cfg.propsFile && fs.existsSync(cfg.propsFile)) { try { Object.assign(props, JSON.parse(fs.readFileSync(cfg.propsFile, 'utf8'))); } catch (e) { } }
    Object.assign(props, cfg.props);   // persekitaran sentiasa menang
  }
  let saveT = null;
  const saveProps = () => { if (!cfg.propsFile || saveT) return; saveT = setTimeout(() => { saveT = null; try { fs.writeFileSync(cfg.propsFile, JSON.stringify(Object.fromEntries(Object.entries(props).filter(([k]) => !/^(BOT_TOKEN|SECRET|GROUP_ID|WEBAPP_URL)$/.test(k))))); } catch (e) { } }, 500); };

  const fmt = (d, tz, f) => {
    const x = new Date(d.getTime() + 8 * 3600e3), p = n => String(n).padStart(2, '0');
    const ymd = x.getUTCFullYear() + '-' + p(x.getUTCMonth() + 1) + '-' + p(x.getUTCDate()), hm = p(x.getUTCHours()) + ':' + p(x.getUTCMinutes());
    return f === 'u' ? String(x.getUTCDay() || 7) : f === 'HH:mm' ? hm : f === 'yyyy-MM-dd' ? ymd : ymd + ' ' + hm;
  };

  const ctx = {
    console, setTimeout, Buffer,
    SpreadsheetApp: { getActive: () => ss },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: k => (props[k] === undefined ? null : props[k]),
      setProperty: (k, v) => { props[k] = String(v); persistProp(k, String(v)); saveProps(); },
      deleteProperty: k => { delete props[k]; saveProps(); } }) },
    CacheService: { getScriptCache: () => ({
      get: k => { const e = cache.get(k); if (!e) return null; if (e.x < Date.now()) { cache.delete(k); return null; } return e.v; },
      put: (k, v, s) => { cache.set(k, { v, x: Date.now() + (s || 600) * 1000 }); if (cache.size > 5000) { const t = Date.now(); for (const [kk, e] of cache) if (e.x < t) cache.delete(kk); } },
      remove: k => cache.delete(k) }) },
    LockService: { getScriptLock: () => ({ waitLock() { }, releaseLock() { } }) },
    Utilities: { formatDate: fmt },
    ContentService: { createTextOutput: t => t },
    ScriptApp: { getService: () => ({ getUrl: () => cfg.props.WEBAPP_URL || '' }), getProjectTriggers: () => [], deleteTrigger() { }, newTrigger: () => ({ timeBased: () => ({ everyMinutes: () => ({ create() { } }) }) }) },
    UrlFetchApp: { fetch: (url, o) => {
      o = o || {};
      if (cfg.telegramBase) url = url.replace('https://api.telegram.org', cfg.telegramBase);
      const r = syncFetch(url, { method: (o.method || 'get').toUpperCase(), headers: o.contentType ? { 'Content-Type': o.contentType } : {}, body: o.payload });
      return { getContentText: () => r.text, getResponseCode: () => r.status };
    } },
    PHOTO_LINK: cfg.photoLink,
    NOW_OVERRIDE: null
  };
  if (now) Object.defineProperty(ctx, 'NOW_OVERRIDE', { get: now, set() { }, configurable: true });
  vm.createContext(ctx);
  vm.runInContext(code + '\nthis.__x={doPost,doGet,handleUpdate_,peringatanKiraan,setupWebhook,semakTab,parseBody_,parseExp_,findUbat_};', ctx);
  return {
    ctx, mirror, props, x: ctx.__x,
    async start() { await mirror.load(); loadProps(); return this; }
  };
}
module.exports = { createBot, Mirror, makeSyncFetch, sleep, colName };
