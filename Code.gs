/**
 * Klinik Putrijaya - Bot Stok Telegram (Google Apps Script)
 * Terima mesej dari group Telegram, simpan ke Google Sheet ini dan balas dalam group.
 * Token bot TIDAK ditulis di sini. Simpan dalam Project Settings > Script properties.
 */
const TZ = 'Asia/Kuala_Lumpur';
const S = { AKAUN: 'Akaun', UBAT: 'Ubat', REKOD: 'Rekod', BARIS: 'Baris', STOK: 'Stok', GAMBAR: 'Gambar' };
const HEAD = {
  Akaun: ['User ID', 'Nama', 'Cawangan', 'Peranan'],
  Ubat: ['Nama', 'Kategori', 'Kumpulan', 'Fast moving'],
  Rekod: ['ID', 'Masa', 'Cawangan', 'Jenis', 'Status', 'No dokumen', 'Dari', 'Pemeriksa', 'Nota', 'Gambar', 'Akaun', 'Mesej', 'Album', 'Rujukan'],
  Baris: ['Rekod', 'Cawangan', 'Ubat', 'Qty rujukan', 'Qty sebenar', 'Beza', 'Batch', 'Luput'],
  Stok: ['Cawangan', 'Ubat', 'Qty', 'Kemas kini'],
  Gambar: ['Masa', 'Mesej', 'Album', 'Akaun', 'Pautan', 'Rekod'],
  Staf: ['Cawangan', 'Nama'],
  Jadual: ['Cawangan', 'Hari', 'Tamat shift', 'Kiraan sebelum (min)'],
  Pergerakan: ['Masa', 'Cawangan', 'Ubat', 'Jenis', 'Perubahan', 'Sebelum', 'Selepas', 'Rekod', 'Pihak lain', 'Oleh']
};
const R = { ID: 0, MASA: 1, CAW: 2, JENIS: 3, STATUS: 4, DOK: 5, DARI: 6, PEM: 7, NOTA: 8, GAMBAR: 9, AKAUN: 10, MSG: 11, ALBUM: 12, RUJUK: 13 };
const WAIT = 'MENUNGGU HQ';
const SHOW_SYS = false; // true = tunjuk stok sistem & butang Tally (lebih laju, tetapi bukan kiraan buta)
const PG = 8;

/* ---------- pintu masuk webhook ---------- */
function doPost(e) {
  try {
    if (!e || !e.parameter || e.parameter.k !== prop_('SECRET')) return ok_();
    const u = JSON.parse(e.postData.contents);
    const cache = CacheService.getScriptCache();
    if (cache.get('u' + u.update_id)) return ok_();
    cache.put('u' + u.update_id, '1', 21600);
    const lock = LockService.getScriptLock();
    lock.waitLock(25000);
    try { handleUpdate_(u); } finally { lock.releaseLock(); }
  } catch (err) { log_(err); }
  return ok_();
}
function doGet() { return ContentService.createTextOutput('Bot stok aktif'); }
function ok_() { return ContentService.createTextOutput('ok'); }
function prop_(k) { return PropertiesService.getScriptProperties().getProperty(k); }
function log_(err) {
  const msg = err && err.stack ? err.stack : String(err);
  console.error(msg);
  try {
    const ss = SpreadsheetApp.getActive();
    const sh = ss.getSheetByName('Log') || ss.insertSheet('Log');
    sh.appendRow([now_(), String(msg).slice(0, 500)]);
  } catch (e) { /* abaikan */ }
}

/* ---------- persediaan (jalankan sekali dari editor) ---------- */
function setupWebhook() {
  const base = prop_('WEBAPP_URL') || ScriptApp.getService().getUrl();
  const r = tg_('setWebhook', { url: base + '?k=' + prop_('SECRET'), allowed_updates: ['message', 'callback_query'], drop_pending_updates: true });
  console.log(JSON.stringify(r));
  const c = tg_('setMyCommands', { scope: { type: 'all_group_chats' }, commands: [
    { command: 'menu', description: 'Menu butang (mula di sini)' }, { command: 'terima', description: 'Terima invois/PO/DO' },
    { command: 'stoktake', description: 'Stock take' }, { command: 'recount', description: 'Kira semula' },
    { command: 'adjust', description: 'Stock adjustment' }, { command: 'stok', description: 'Semak stok ubat' },
    { command: 'status', description: 'Semak status rekod' }, { command: 'bantuan', description: 'Bantuan dan format' }] });
  console.log(JSON.stringify(c));
}
function semakSambungan() {
  say_(prop_('GROUP_ID'), 'Bot stok aktif. Taip /bantuan untuk lihat format mesej.');
}
function semakTab() {
  Object.keys(HEAD).forEach(n => {
    const s = SpreadsheetApp.getActive().getSheetByName(n);
    console.log(n + ': ' + (s ? 'ada' : 'TIADA'));
  });
}

/* ---------- telegram ---------- */
function tg_(method, payload) {
  const res = UrlFetchApp.fetch('https://api.telegram.org/bot' + prop_('BOT_TOKEN') + '/' + method, {
    method: 'post', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true
  });
  let j = null;
  try { j = JSON.parse(res.getContentText()); } catch (e) { j = null; }
  if (!j || !j.ok) log_('Telegram ' + method + ' gagal: ' + String(res.getContentText()).slice(0, 300));
  return j;
}
function esc_(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function say_(chat, html, replyTo, kb) {
  const p = { chat_id: chat, text: html, parse_mode: 'HTML', disable_web_page_preview: true };
  if (kb) p.reply_markup = kb;
  if (replyTo) { p.reply_to_message_id = replyTo; p.allow_sending_without_reply = true; }
  return tg_('sendMessage', p);
}

/* ---------- sheet ---------- */
function sh_(n) { const s = SpreadsheetApp.getActive().getSheetByName(n); if (!s) throw new Error('Tab tiada: ' + n); return s; }
function rows_(n) { return sh_(n).getDataRange().getValues().slice(1); }
function now_() { return Utilities.formatDate(nowDate_(), TZ, 'yyyy-MM-dd HH:mm'); }
function nextId_(prefix) {
  const p = PropertiesService.getScriptProperties();
  const n = Number(p.getProperty('n_' + prefix) || 0) + 1;
  p.setProperty('n_' + prefix, String(n));
  return prefix + '-' + String(n).padStart(4, '0');
}
function stokRows_() { return rows_(S.STOK); }
function getStok_(caw, ubat) {
  const r = stokRows_().find(x => x[0] === caw && x[1] === ubat);
  return r ? Number(r[2]) || 0 : 0;
}
function setStok_(caw, ubat, qty) {
  const rs = stokRows_();
  const i = rs.findIndex(x => x[0] === caw && x[1] === ubat);
  if (i >= 0) { sh_(S.STOK).getRange(i + 2, 3, 1, 2).setValues([[qty, now_()]]); }
  else sh_(S.STOK).appendRow([caw, ubat, qty, now_()]);
}

function cawOf_(s) {
  const n = String(s || '').toLowerCase().replace(/[^a-z]/g, '');
  return { hq: 'HQ', cheras: 'Cheras', puchong: 'Puchong', sungaibesi: 'Sungai Besi', sgbesi: 'Sungai Besi' }[n] || null;
}
/** Tukar stok dan catat pergerakan (Sebelum/Selepas) dalam tab Pergerakan. */
function moveStok_(caw, ubat, newQty, jenis, id, pihak, oleh) {
  const before = getStok_(caw, ubat);
  setStok_(caw, ubat, newQty);
  sh_('Pergerakan').appendRow([now_(), caw, ubat, jenis, newQty - before, before, newQty, id, pihak || '', oleh || '']);
  return before;
}
/** Barang diterima: tambah stok penerima, dan kurangkan stok pengirim jika 'Dari' ialah HQ/cawangan. */
function applyReceive_(id, caw, dari, lines, oleh) {
  const warns = [], src = cawOf_(dari);
  lines.forEach(l => {
    const act = Number(l.act), ref = (l.ref === null || l.ref === undefined || l.ref === '') ? act : Number(l.ref);
    moveStok_(caw, l.name, getStok_(caw, l.name) + act, 'Terima', id, dari, oleh);
    if (src && src !== caw) {
      const b = getStok_(src, l.name);
      moveStok_(src, l.name, b - ref, 'Keluar', id, caw, oleh);
      if (b - ref < 0) warns.push(esc_(l.name) + ': stok ' + src + ' jadi ' + (b - ref) + ' (stok pembukaan ' + src + ' belum lengkap?)');
    }
  });
  return warns;
}

/* ---------- penghurai mesej ---------- */
function norm_(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9.\/% ]+/g, ' ').replace(/\s+/g, ' ').trim(); }
function num_(s) { const m = String(s).match(/-?\d+(?:\.\d+)?/); return m ? Number(m[0]) : NaN; }
let UBAT_CACHE = null;
function ubatNames_() { if (!UBAT_CACHE) UBAT_CACHE = rows_(S.UBAT).map(r => String(r[0])).filter(Boolean); return UBAT_CACHE; }
function findUbat_(q) {
  const nq = norm_(q);
  if (!nq) return { err: 'nama kosong' };
  const names = ubatNames_();
  const exact = names.filter(n => norm_(n) === nq);
  if (exact.length === 1) return { name: exact[0] };
  const toks = nq.split(' ');
  const c = names.filter(n => { const nn = norm_(n); return toks.every(t => nn.includes(t)); });
  if (c.length === 1) return { name: c[0] };
  if (c.length > 1) return { err: 'lebih satu padanan', options: c.slice(0, 5) };
  return { err: 'tiada dalam senarai' };
}
const KEYS = { dari: 'dari', dok: 'dok', nodok: 'dok', nodokumen: 'dok', invois: 'dok', checkedby: 'pem', pemeriksa: 'pem', sebab: 'sebab', ubat: 'ubat', qty: 'qty', rujuk: 'rujuk', nota: 'nota' };
function parseBody_(body) {
  const out = { first: '', kv: {}, items: [], errs: [] };
  const lines = String(body || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  lines.forEach((l, i) => {
    if (l.indexOf('|') >= 0) { out.items.push(parseItem_(l, out.errs)); return; }
    const m = l.match(/^([A-Za-z ]+?)\s*[:=]\s*(.+)$/);
    if (m && KEYS[m[1].toLowerCase().replace(/\s+/g, '')]) { out.kv[KEYS[m[1].toLowerCase().replace(/\s+/g, '')]] = m[2].trim(); return; }
    if (i === 0) out.first = l; else out.errs.push('Baris tidak dikenali: ' + l);
  });
  return out;
}
function parseItem_(line, errs) {
  const p = line.split('|').map(x => x.trim());
  const it = { raw: line, name: p[0], ref: null, act: null, batch: '', exp: '' };
  p.slice(1).forEach(x => {
    let m;
    if ((m = x.match(/^(invois|inv)\D*(-?\d+(?:\.\d+)?)/i))) it.ref = Number(m[2]);
    else if ((m = x.match(/^(fizikal|fiz|terima|kira|kiraan|qty|sebenar)\D*(-?\d+(?:\.\d+)?)/i))) it.act = Number(m[2]);
    else if ((m = x.match(/^batch\s*[:\-]?\s*(.+)$/i))) it.batch = m[1];
    else if ((m = x.match(/^(luput|exp|expiry)\s*[:\-]?\s*(.+)$/i))) it.exp = m[2];
    else if (/^-?\d+(?:\.\d+)?$/.test(x)) it.act = Number(x);
    else errs.push('Format tidak dikenali dalam baris: ' + line);
  });
  return it;
}
function parseExp_(s) {
  if (!s) return null;
  let m, y, mo, d;
  if ((m = s.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/))) { y = +m[1]; mo = +m[2]; d = m[3] ? +m[3] : null; }
  else if ((m = s.match(/^(\d{1,2})[\/\-](\d{4})$/))) { mo = +m[1]; y = +m[2]; d = null; }
  else if ((m = s.match(/^(\d{1,2})[\/\-](\d{2})$/))) { mo = +m[1]; y = 2000 + +m[2]; d = null; }
  else return undefined;
  if (mo < 1 || mo > 12) return undefined;
  if (!d) d = new Date(y, mo, 0).getDate();
  return new Date(y, mo - 1, d);
}
function fmtD_(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
/** Padankan nama ubat dan semak tarikh luput. Pulangkan {lines, errs, warns}. */
function resolveItems_(items) {
  const lines = [], errs = [], warns = [];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const limit = new Date(today); limit.setMonth(limit.getMonth() + 6);
  items.forEach(it => {
    const f = findUbat_(it.name);
    if (f.err) { errs.push(esc_(it.name) + ': ' + f.err + (f.options ? ' (' + f.options.map(esc_).join('; ') + ')' : '')); return; }
    let exp = '';
    if (it.exp) {
      const d = parseExp_(it.exp);
      if (d === undefined) { errs.push(esc_(f.name) + ': tarikh luput tidak sah (guna 2027-05 atau 05/27)'); return; }
      if (d < today) { errs.push(esc_(f.name) + ': sudah LUPUT (' + fmtD_(d) + '). Asingkan, jangan terima.'); return; }
      if (d < limit) warns.push(esc_(f.name) + ': luput dalam 6 bulan (' + fmtD_(d) + ')');
      exp = fmtD_(d);
    }
    lines.push({ name: f.name, ref: it.ref, act: it.act, batch: it.batch, exp: exp });
  });
  return { lines: lines, errs: errs, warns: warns };
}

/* ---------- kemas kini utama ---------- */
function handleUpdate_(u) {
  if (u.callback_query) return handleCallback_(u.callback_query);
  const m = u.message;
  if (!m || !m.from) return;
  if (String(m.chat.id) !== String(prop_('GROUP_ID'))) return;
  const akaun = rows_(S.AKAUN).find(r => String(r[0]) === String(m.from.id));
  const text = m.text || m.caption || '';
  const cm = text.match(/^\/(\w+)(?:@\w+)?[ \t]*([\s\S]*)$/);
  if (!akaun) { if (cm) say_(m.chat.id, 'Akaun Telegram ini belum didaftarkan. Hubungi HQ.', m.message_id); return; }
  const ctx = { chat: m.chat.id, msg: m.message_id, album: m.media_group_id || '', uid: String(m.from.id), nama: akaun[1], caw: akaun[2], role: String(akaun[3]).toUpperCase() };
  const link = (m.photo && m.photo.length) ? savePhoto_(m, ctx) : null;
  const ws = wget_(ctx.uid);
  if (!cm) {
    if (link && ws && ws.step === 'foto') { ws.d.photos.push(link); return wShow_(ctx, ws); }
    if (text && ws) return onText_(ctx, text, ws);
    return;
  }
  const cmd = cm[1].toLowerCase(), body = cm[2];
  const H = { terima: cmdTerima_, stoktake: cmdCount_, recount: cmdCount_, adjust: cmdAdjust_, lulus: cmdLulus_, tolak: cmdTolak_, stok: cmdStok_, gerak: cmdGerak_, harian: cmdHarian_, fast: cmdFast_, fastlist: cmdFastList_, status: cmdStatus_, bantuan: cmdHelp_, start: cmdHelp_, menu: cmdMenu_, sesi: cmdSesi_, ping: cmdSesi_ };
  if (!H[cmd]) return;
  ctx.cmd = cmd;
  try { H[cmd](ctx, body); } catch (err) { log_(err); say_(ctx.chat, 'Ralat sistem. Cuba hantar semula. Jika berulang, maklum HQ.', ctx.msg); }
}

/* ---------- gambar ---------- */
function folder_() {
  let id = prop_('FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* cipta baharu */ } }
  const f = DriveApp.createFolder('Invois Telegram (bot stok)');
  PropertiesService.getScriptProperties().setProperty('FOLDER_ID', f.getId());
  return f;
}
function savePhoto_(m, ctx) {
  const best = m.photo[m.photo.length - 1];
  let link;
  if (typeof PHOTO_LINK === 'function') {
    link = PHOTO_LINK(best.file_id);   // mod pelayan: pautan melalui pelayan, tanpa Drive
  } else {
    const info = tg_('getFile', { file_id: best.file_id });
    if (!info || !info.ok) return null;
    const res = UrlFetchApp.fetch('https://api.telegram.org/file/bot' + prop_('BOT_TOKEN') + '/' + info.result.file_path, { muteHttpExceptions: true });
    const name = now_().replace(/[: ]/g, '-') + '_' + ctx.caw + '_' + m.message_id + '.jpg';
    const f = folder_().createFile(res.getBlob().setName(name));
    link = 'https://drive.google.com/file/d/' + f.getId() + '/view';
  }
  let rekod = '';
  if (ctx.album) {
    const r = rows_(S.REKOD); const i = r.findIndex(x => x[R.ALBUM] && x[R.ALBUM] === ctx.album);
    if (i >= 0) { rekod = r[i][R.ID]; const cell = sh_(S.REKOD).getRange(i + 2, R.GAMBAR + 1); cell.setValue(String(cell.getValue() || '') + '\n' + link); }
  }
  sh_(S.GAMBAR).appendRow([now_(), m.message_id, ctx.album, ctx.uid, link, rekod]);
  return link;
}
/** Gambar yang belum dipadankan, dari mesej ini atau album yang sama. */
function takePhotos_(ctx, rekodId) {
  const sheet = sh_(S.GAMBAR), g = sheet.getDataRange().getValues();
  const links = [];
  if (ctx.links) {
    for (let i = 1; i < g.length; i++) if (!g[i][5] && ctx.links.indexOf(g[i][4]) >= 0) { links.push(g[i][4]); sheet.getRange(i + 1, 6).setValue(rekodId); }
    return links;
  }
  for (let i = 1; i < g.length; i++) {
    if (g[i][5]) continue;
    if (String(g[i][1]) === String(ctx.msg) || (ctx.album && g[i][2] && String(g[i][2]) === ctx.album)) { links.push(g[i][4]); sheet.getRange(i + 1, 6).setValue(rekodId); }
  }
  return links;
}
function countPhotos_(ctx) {
  if (ctx.links) return ctx.links.length;
  const g = rows_(S.GAMBAR);
  return g.filter(x => !x[5] && (String(x[1]) === String(ctx.msg) || (ctx.album && x[2] && String(x[2]) === ctx.album))).length;
}

/* ---------- rekod ---------- */
function addRekod_(ctx, o) {
  const id = nextId_(o.prefix);
  const links = takePhotos_(ctx, id);
  sh_(S.REKOD).appendRow([id, now_(), ctx.caw, o.jenis, o.status, o.dok || '', o.dari || '', o.pem || '', o.nota || '', links.join('\n'), ctx.nama, ctx.msg, ctx.album, o.rujuk || '']);
  o.lines.forEach(l => {
    const beza = (l.ref === null || l.ref === undefined) ? '' : (l.act - l.ref);
    sh_(S.BARIS).appendRow([id, ctx.caw, l.name, l.ref == null ? '' : l.ref, l.act, beza, l.batch || '', l.exp || '']);
  });
  return { id: id, photos: links.length };
}
function hqMention_() {
  return rows_(S.AKAUN).filter(r => String(r[3]).toUpperCase() === 'HQ').map(r => '<a href="tg://user?id=' + r[0] + '">' + esc_(r[1]) + '</a>').join(', ');
}
function summary_(lines, max) {
  const s = lines.slice(0, max || 12).map(l => '• ' + esc_(l.name) + ': ' + (l.ref != null ? 'invois ' + l.ref + ' | ' : '') + (l.act != null ? l.act : '-') + (l.sys != null ? ' (sistem ' + l.sys + ')' : '') + (l.batch ? ' | batch ' + esc_(l.batch) : '') + (l.exp ? ' | luput ' + l.exp : ''));
  if (lines.length > (max || 12)) s.push('… dan ' + (lines.length - (max || 12)) + ' lagi');
  return s.join('\n');
}
function fail_(ctx, title, errs, tmpl) {
  say_(ctx.chat, '<b>' + esc_(title) + '</b>\n' + errs.map(e => '• ' + e).join('\n') + (tmpl ? '\n\nFormat:\n<pre>' + esc_(tmpl) + '</pre>' : ''), ctx.msg);
}

/* ---------- /terima ---------- */
const T_TERIMA = '/terima TALLY\nDari: HQ\nDok: INV-1234\nChecked by: Ema\n\n(NOT TALLY: tambah baris)\nParacetamol 500mg | invois 100 | fizikal 90 | batch A1 | luput 2027-05';
function cmdTerima_(ctx, body) {
  const p = parseBody_(body), errs = p.errs.map(esc_);
  const st = (p.first.match(/^(not\s*-?\s*tally|tally)\b/i) || [])[1];
  if (!st) errs.push('Tulis TALLY atau NOT TALLY selepas /terima');
  const status = /not/i.test(st || '') ? 'NOT TALLY' : 'TALLY';
  ['dari', 'dok', 'pem'].forEach(k => { if (!p.kv[k]) errs.push('Isi ' + { dari: 'Dari', dok: 'Dok (no invois/PO/DO)', pem: 'Checked by' }[k]); });
  if (!countPhotos_(ctx)) errs.push('Sertakan gambar invois/PO/DO (hantar gambar dengan arahan ini sebagai caption)');
  const rs = resolveItems_(p.items);
  rs.errs.forEach(e => errs.push(e));
  rs.lines.forEach(l => {
    if (l.act == null) errs.push(esc_(l.name) + ': isi kuantiti fizikal');
    else if (status === 'TALLY' && l.ref != null && l.ref !== l.act) errs.push(esc_(l.name) + ': invois ' + l.ref + ' tak sama fizikal ' + l.act + '. Guna NOT TALLY.');
  });
  if (status === 'NOT TALLY') {
    if (!rs.lines.length) errs.push('NOT TALLY mesti ada baris item dengan invois dan fizikal');
    rs.lines.forEach(l => { if (l.ref == null) errs.push(esc_(l.name) + ': isi kuantiti invois'); });
    if (rs.lines.length && rs.lines.every(l => l.ref === l.act)) errs.push('Semua item sama dengan invois. Guna TALLY.');
  }
  if (errs.length) return fail_(ctx, 'Rekod TIDAK disimpan', errs, T_TERIMA);
  const tally = status === 'TALLY';
  const r = addRekod_(ctx, { prefix: 'GRN', jenis: 'Terima', status: tally ? 'DITERIMA' : WAIT, dok: p.kv.dok, dari: p.kv.dari, pem: p.kv.pem, nota: (p.kv.nota || '') + (rs.warns.length ? ' Amaran: ' + rs.warns.join('; ') : ''), lines: rs.lines });
  const mw = tally ? applyReceive_(r.id, ctx.caw, p.kv.dari, rs.lines, p.kv.pem) : [];
  const src = cawOf_(p.kv.dari);
  let t = '<b>' + r.id + ' · ' + status + '</b> · ' + esc_(ctx.caw) + '\nDari: ' + esc_(p.kv.dari) + ' | Dok: ' + esc_(p.kv.dok) + ' | Checked by: ' + esc_(p.kv.pem) + '\nGambar: ' + r.photos;
  if (rs.lines.length) t += '\n' + summary_(rs.lines);
  if (tally && !rs.lines.length) t += '\nTiada baris item, jadi kuantiti stok tidak dikemas kini.';
  if (tally && rs.lines.length && src && src !== ctx.caw) t += '\n📤 Stok ' + esc_(src) + ' dikurangkan, 📥 stok ' + esc_(ctx.caw) + ' ditambah.';
  if (mw.length) t += '\n⚠️ ' + mw.join('\n⚠️ ');
  if (rs.warns.length) t += '\n⚠️ ' + rs.warns.join('\n⚠️ ');
  if (!tally) t += '\n\nMenunggu keputusan HQ: ' + hqMention_() + '\nJangan guna item bermasalah sehingga HQ putuskan.';
  else t += '\n\nIngat: update Yezza dan failkan invois.';
  say_(ctx.chat, t, ctx.msg, tally ? null : apprKb_(r.id));
  return true;
}

/* ---------- /stoktake dan /recount ---------- */
const T_COUNT = '/stoktake\nChecked by: Ema\nParacetamol 500mg | 120\nAmoxicillin 500 | 45\n\n(/recount: tambah  Rujuk: ST-0003)';
function cmdCount_(ctx, body) {
  const rc = ctx.cmd === 'recount', dk = ctx.cmd === 'harian';
  const p = parseBody_(body), errs = p.errs.map(esc_);
  if (p.first) errs.push('Baris tidak dikenali: ' + esc_(p.first));
  if (!p.kv.pem) errs.push('Isi Checked by');
  if (!p.items.length) errs.push('Tiada baris item. Guna format: Nama ubat | kiraan');
  let rujuk = '';
  if (rc && p.kv.rujuk) {
    const ref = rows_(S.REKOD).find(x => x[R.ID] === p.kv.rujuk.toUpperCase());
    if (!ref) errs.push('Rujukan ' + esc_(p.kv.rujuk) + ' tiada'); else rujuk = ref[R.ID];
  }
  const rs = resolveItems_(p.items);
  rs.errs.forEach(e => errs.push(e));
  rs.lines.forEach(l => { if (l.act == null || l.act < 0) errs.push(esc_(l.name) + ': isi kiraan (nombor 0 ke atas)'); });
  if (errs.length) return fail_(ctx, 'Rekod TIDAK disimpan', errs, T_COUNT);
  rs.lines.forEach(l => { l.sys = getStok_(ctx.caw, l.name); l.ref = l.sys; });
  const diff0 = rs.lines.filter(l => l.act !== l.sys);
  const slot = dk ? slotLabel_(ctx.caw) : '';
  const r = addRekod_(ctx, { prefix: rc ? 'RC' : dk ? 'KH' : 'ST', jenis: rc ? 'Recount' : dk ? 'Kiraan harian' : 'Stok take', status: (dk && !diff0.length) ? 'SELESAI' : WAIT, pem: p.kv.pem, nota: (slot ? slot + '. ' : '') + (p.kv.nota || ''), rujuk: rujuk, lines: rs.lines });
  const diff = diff0;
  if (dk && !diff.length) { say_(ctx.chat, '<b>' + r.id + ' · KIRAAN HARIAN</b> · ' + esc_(ctx.caw) + ' · ' + esc_(slot) + '\nChecked by: ' + esc_(p.kv.pem) + '\n✅ Semua ' + rs.lines.length + ' item fast moving sepadan dengan stok sistem. Tiada tindakan HQ.', ctx.msg); return true; }
  const t = '<b>' + r.id + ' · ' + (rc ? 'RECOUNT' : dk ? 'KIRAAN HARIAN' : 'STOCK TAKE') + '</b> · ' + esc_(ctx.caw) + '\nChecked by: ' + esc_(p.kv.pem) + ' | ' + rs.lines.length + ' item, ' + diff.length + ' ada beza\n' + summary_(diff.length ? diff : rs.lines) + '\n\nMenunggu HQ: ' + hqMention_() + '\nHQ tekan butang di bawah. Jika kiraan salah, hantar semula guna Recount.';
  say_(ctx.chat, t, ctx.msg, apprKb_(r.id));
  return true;
}

/* ---------- /adjust ---------- */
const T_ADJ = '/adjust\nUbat: Paracetamol 500mg\nQty: -5\nSebab: rosak\nChecked by: Ema\n(sertakan gambar)';
function cmdAdjust_(ctx, body) {
  const p = parseBody_(body), errs = p.errs.map(esc_);
  if (p.first) errs.push('Baris tidak dikenali: ' + esc_(p.first));
  ['ubat', 'qty', 'sebab', 'pem'].forEach(k => { if (!p.kv[k]) errs.push('Isi ' + { ubat: 'Ubat', qty: 'Qty (cth -5 atau +10)', sebab: 'Sebab', pem: 'Checked by' }[k]); });
  if (!countPhotos_(ctx)) errs.push('Sertakan gambar sebagai bukti');
  let line = null, delta = NaN;
  if (p.kv.ubat) { const f = findUbat_(p.kv.ubat); if (f.err) errs.push(esc_(p.kv.ubat) + ': ' + f.err + (f.options ? ' (' + f.options.map(esc_).join('; ') + ')' : '')); else line = f; }
  if (p.kv.qty) { delta = num_(p.kv.qty); if (isNaN(delta) || delta === 0) errs.push('Qty mesti nombor bukan sifar, cth -5 atau +10'); }
  let sys = 0;
  if (line && !isNaN(delta)) { sys = getStok_(ctx.caw, line.name); if (sys + delta < 0) errs.push('Stok sistem ' + sys + ', laras ' + delta + ' akan jadi negatif'); }
  if (errs.length) return fail_(ctx, 'Rekod TIDAK disimpan', errs, T_ADJ);
  const l = { name: line.name, ref: sys, act: sys + delta, batch: '', exp: '' };
  const r = addRekod_(ctx, { prefix: 'ADJ', jenis: 'Adjust', status: WAIT, pem: p.kv.pem, nota: 'Sebab: ' + p.kv.sebab, lines: [l] });
  say_(ctx.chat, '<b>' + r.id + ' · ADJUSTMENT</b> · ' + esc_(ctx.caw) + '\n' + esc_(l.name) + ': ' + sys + ' → ' + l.act + ' (' + (delta > 0 ? '+' : '') + delta + ')\nSebab: ' + esc_(p.kv.sebab) + ' | Checked by: ' + esc_(p.kv.pem) + ' | Gambar: ' + r.photos + '\n\nMenunggu HQ: ' + hqMention_(), ctx.msg, apprKb_(r.id));
  return true;
}

/* ---------- kelulusan HQ ---------- */
function findRekod_(id) {
  const rs = rows_(S.REKOD); const i = rs.findIndex(x => String(x[R.ID]).toUpperCase() === String(id).trim().toUpperCase());
  return i < 0 ? null : { row: i + 2, v: rs[i] };
}
function cmdLulus_(ctx, body) {
  if (ctx.role !== 'HQ') return say_(ctx.chat, 'Hanya HQ boleh meluluskan.', ctx.msg);
  const rec = findRekod_(body.split(/\s+/)[0]);
  if (!rec) return say_(ctx.chat, 'Rekod tidak dijumpai. Contoh: /lulus ADJ-0001', ctx.msg);
  const v = rec.v, id = v[R.ID];
  if (v[R.STATUS] !== WAIT) return say_(ctx.chat, id + ' bukan dalam status menunggu (' + esc_(v[R.STATUS]) + ').', ctx.msg);
  const caw = v[R.CAW], lines = rows_(S.BARIS).filter(b => b[0] === id);
  let warns = [];
  if (v[R.JENIS] === 'Terima') warns = applyReceive_(id, caw, v[R.DARI], lines.map(b => ({ name: b[2], ref: b[3], act: b[4] })), ctx.nama);
  else lines.forEach(b => moveStok_(caw, b[2], Number(b[4]), v[R.JENIS], id, '', ctx.nama));
  const sh = sh_(S.REKOD);
  sh.getRange(rec.row, R.STATUS + 1).setValue('DILULUSKAN');
  sh.getRange(rec.row, R.NOTA + 1).setValue((v[R.NOTA] ? v[R.NOTA] + ' | ' : '') + 'Lulus oleh ' + ctx.nama + ' ' + now_());
  if (v[R.JENIS] === 'Recount' && v[R.RUJUK]) {
    const old = findRekod_(v[R.RUJUK]);
    if (old && old.v[R.STATUS] === WAIT) sh.getRange(old.row, R.STATUS + 1).setValue('DIGANTI ' + id);
  }
  say_(ctx.chat, '✅ <b>' + id + ' diluluskan</b> oleh ' + esc_(ctx.nama) + '. Stok ' + esc_(caw) + (cawOf_(v[R.DARI]) && v[R.JENIS] === 'Terima' ? ' dan ' + esc_(cawOf_(v[R.DARI])) : '') + ' dikemas kini untuk ' + lines.length + ' item.' + (warns.length ? '\n⚠️ ' + warns.join('\n⚠️ ') : ''), ctx.msg);
}
function cmdTolak_(ctx, body) {
  if (ctx.role !== 'HQ') return say_(ctx.chat, 'Hanya HQ boleh menolak.', ctx.msg);
  const parts = body.trim().split(/\s+/), rec = findRekod_(parts[0] || '');
  if (!rec) return say_(ctx.chat, 'Rekod tidak dijumpai. Contoh: /tolak ADJ-0001 gambar tak jelas', ctx.msg);
  const sebab = parts.slice(1).join(' ');
  if (!sebab) return say_(ctx.chat, 'Nyatakan sebab. Contoh: /tolak ' + rec.v[R.ID] + ' gambar tak jelas', ctx.msg);
  if (rec.v[R.STATUS] !== WAIT) return say_(ctx.chat, rec.v[R.ID] + ' bukan dalam status menunggu.', ctx.msg);
  const sh = sh_(S.REKOD);
  sh.getRange(rec.row, R.STATUS + 1).setValue('DITOLAK');
  sh.getRange(rec.row, R.NOTA + 1).setValue((rec.v[R.NOTA] ? rec.v[R.NOTA] + ' | ' : '') + 'Ditolak oleh ' + ctx.nama + ': ' + sebab);
  say_(ctx.chat, '❌ <b>' + rec.v[R.ID] + ' ditolak</b> oleh ' + esc_(ctx.nama) + '. Sebab: ' + esc_(sebab) + '\nStok tidak diubah.', ctx.msg);
}

/* ---------- pertanyaan ---------- */
/* ---------- kiraan harian (fast moving) dan jadual ---------- */
function nowDate_() { return (typeof NOW_OVERRIDE !== 'undefined' && NOW_OVERRIDE) || new Date(); }
function isFast_(v) { return /^(ya|yes|y|1|true)$/i.test(String(v || '').trim()); }
function fastNames_() { return rows_(S.UBAT).filter(r => r[0] && isFast_(r[3])).map(r => String(r[0])); }
function hm_(v) {
  if (typeof v === 'number' && v >= 0 && v < 1) { const t = Math.round(v * 1440); return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); }
  if (v instanceof Date) return Utilities.formatDate(v, SpreadsheetApp.getActive().getSpreadsheetTimeZone(), 'HH:mm');
  const m = String(v || '').trim().match(/^(\d{1,2})[:.](\d{2})/);
  return m ? String(m[1]).padStart(2, '0') + ':' + m[2] : '';
}
function mins_(hm) { const m = String(hm).match(/^(\d{2}):(\d{2})$/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; }
function hariOk_(hari, dow) {
  const h = norm_(hari);
  if (!h || h === 'semua') return true;
  if (h.indexOf('isnin') === 0) return dow <= 5;
  if (h.indexOf('sabtu') === 0) return dow >= 6;
  return false;
}
/** Slot kiraan hari ini untuk satu cawangan: [{caw, end, count (minit sejak tengah malam), label}] */
function slots_(caw, d) {
  const dow = Number(Utilities.formatDate(d, TZ, 'u'));
  return rows_('Jadual').filter(r => r[0] === caw && hariOk_(r[1], dow)).map(r => {
    const end = hm_(r[2]), lead = Number(r[3]) || 30, e = mins_(end);
    if (e === null) return null;
    const c = e - lead, hh = String(Math.floor(c / 60)).padStart(2, '0'), mm = String(c % 60).padStart(2, '0');
    return { caw: caw, end: end, count: c, label: 'Slot ' + hh + ':' + mm + ' (tamat shift ' + end + ')' };
  }).filter(Boolean);
}
function slotLabel_(caw) {
  const d = nowDate_(), nm = mins_(Utilities.formatDate(d, TZ, 'HH:mm'));
  const sl = slots_(caw, d).filter(x => nm >= x.count - 45 && nm <= x.count + 60);
  return sl.length ? sl[0].label : 'Luar jadual';
}
function cmdHarian_(ctx, body) {
  if (!String(body || '').trim()) return startWizard_(ctx, 'harian');
  return cmdCount_(ctx, body);
}
function cmdFastList_(ctx) {
  const f = fastNames_();
  say_(ctx.chat, f.length ? '<b>Item fast moving (' + f.length + ')</b>\n' + f.map(x => '• ' + esc_(x)).join('\n') : 'Belum ada item fast moving. HQ tetapkan guna /fast nama ubat.', ctx.msg);
}
/** HQ: /fast nama ubat  (hidup/matikan tanda fast moving) */
function cmdFast_(ctx, body) {
  if (!String(body || '').trim()) return cmdFastList_(ctx);
  if (ctx.role !== 'HQ') return say_(ctx.chat, 'Hanya HQ boleh menukar senarai fast moving.', ctx.msg);
  const f = findUbat_(body);
  if (f.err) return say_(ctx.chat, esc_(body) + ': ' + f.err + (f.options ? '\n' + f.options.map(esc_).join('\n') : ''), ctx.msg);
  const rs = rows_(S.UBAT), i = rs.findIndex(r => String(r[0]) === f.name);
  const on = !isFast_(rs[i][3]);
  sh_(S.UBAT).getRange(i + 2, 4).setValue(on ? 'Ya' : '');
  UBAT_CACHE = null;
  say_(ctx.chat, (on ? '⚡ <b>' + esc_(f.name) + '</b> ditambah ke senarai fast moving.' : '<b>' + esc_(f.name) + '</b> dibuang daripada senarai fast moving.') + ' Jumlah sekarang: ' + fastNames_().length, ctx.msg);
}
/** Dipanggil oleh pemasa setiap 5 minit. Hantar peringatan sebelum shift tamat dan amaran jika belum dikira. */
function peringatanKiraan() {
  const d = nowDate_(), today = Utilities.formatDate(d, TZ, 'yyyy-MM-dd'), nm = mins_(Utilities.formatDate(d, TZ, 'HH:mm'));
  const group = prop_('GROUP_ID'), P = PropertiesService.getScriptProperties();
  const cawList = rows_('Jadual').map(r => r[0]).filter((v, i, a) => v && a.indexOf(v) === i);
  cawList.forEach(caw => slots_(caw, d).forEach(sl => {
    const key = 'rm_' + today + '_' + caw + '_' + sl.count;
    const done = rows_(S.REKOD).some(r => r[R.CAW] === caw && r[R.JENIS] === 'Kiraan harian' && String(r[R.MASA]).indexOf(today) === 0 && mins_(String(r[R.MASA]).slice(11, 16)) >= sl.count - 45);
    if (done) return;
    if (nm >= sl.count && nm < sl.count + 10 && !P.getProperty(key + '_a')) {
      P.setProperty(key + '_a', '1');
      const n = fastNames_().length;
      const who = rows_(S.AKAUN).filter(r => r[2] === caw && String(r[3]).toUpperCase() !== 'HQ').map(r => '<a href="tg://user?id=' + r[0] + '">' + esc_(r[1]) + '</a>').join(', ');
      say_(group, '⏰ <b>Waktu kiraan stok harian · ' + esc_(caw) + '</b>\n30 minit sebelum shift tamat (' + esc_(sl.end) + '). Kira item <b>fast moving</b> sahaja (' + n + ' item) dan hantar sebelum shift tamat.\n' + who + '\n\nTekan butang di bawah untuk mula.', null, { inline_keyboard: [[B_('📋 Mula Kiraan Harian', 'm:harian')]] });
    } else if (nm >= sl.count + 20 && nm < sl.count + 40 && !P.getProperty(key + '_b')) {
      P.setProperty(key + '_b', '1');
      say_(group, '⚠️ <b>Kiraan harian ' + esc_(caw) + ' belum diterima</b> (' + esc_(sl.label) + '). ' + hqMention_() + ' sila ambil perhatian.\nStaf: tekan /menu → Kiraan Harian.');
    }
  }));
}
/** Jalankan SEKALI dari editor untuk pasang pemasa 5 minit. */
function pasangPemasa() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'peringatanKiraan').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('peringatanKiraan').timeBased().everyMinutes(5).create();
  console.log('Pemasa dipasang: peringatanKiraan setiap 5 minit');
}

function cmdStok_(ctx, body) {
  const f = findUbat_(body);
  if (f.err) return say_(ctx.chat, esc_(body || '(kosong)') + ': ' + f.err + (f.options ? '\n' + f.options.map(esc_).join('\n') : '') + '\nContoh: /stok paracetamol 500', ctx.msg);
  const rs = stokRows_().filter(r => r[1] === f.name && (ctx.role === 'HQ' || r[0] === ctx.caw));
  say_(ctx.chat, '<b>' + esc_(f.name) + '</b>\n' + (rs.length ? rs.map(r => esc_(r[0]) + ': ' + r[2]).join('\n') : 'Tiada rekod stok.'), ctx.msg);
}
function cmdGerak_(ctx, body) {
  const f = findUbat_(body);
  if (f.err) return say_(ctx.chat, esc_(body || '(kosong)') + ': ' + f.err + (f.options ? '\n' + f.options.map(esc_).join('\n') : '') + '\nContoh: /gerak paracetamol 500', ctx.msg);
  const rs = rows_('Pergerakan').filter(r => r[2] === f.name && (ctx.role === 'HQ' || r[1] === ctx.caw)).slice(-10).reverse();
  say_(ctx.chat, '<b>Pergerakan: ' + esc_(f.name) + '</b>\n' + (rs.length ? rs.map(r => esc_(r[0]) + ' · ' + esc_(r[1]) + ' · ' + esc_(r[3]) + ' ' + (Number(r[4]) > 0 ? '+' : '') + r[4] + ' (' + r[5] + '→' + r[6] + ')' + (r[8] ? ' · ' + esc_(r[8]) : '') + ' · ' + esc_(r[7])).join('\n') : 'Tiada pergerakan direkod.'), ctx.msg);
}
function cmdStatus_(ctx, body) {
  const rec = findRekod_(body.split(/\s+/)[0] || '');
  if (!rec) return say_(ctx.chat, 'Rekod tidak dijumpai. Contoh: /status GRN-0001', ctx.msg);
  const v = rec.v;
  say_(ctx.chat, '<b>' + v[R.ID] + '</b> · ' + esc_(v[R.JENIS]) + ' · ' + esc_(v[R.CAW]) + '\nStatus: <b>' + esc_(v[R.STATUS]) + '</b>\nMasa: ' + esc_(v[R.MASA]) + ' | Oleh: ' + esc_(v[R.PEM] || v[R.AKAUN]) + (v[R.NOTA] ? '\nNota: ' + esc_(v[R.NOTA]) : ''), ctx.msg);
}
function cmdHelp_(ctx) {
  say_(ctx.chat, '<b>Bot stok Klinik Putrijaya</b>\nCara mudah: taip /menu dan tekan butang. Cara pantas (untuk yang biasa): hantar arahan terus dalam group. Untuk /terima dan /adjust, hantar GAMBAR dan letak arahan sebagai caption.\n\n<b>Terima invois/PO/DO</b>\n<pre>' + esc_(T_TERIMA) + '</pre>\n<b>Stock take</b>\n<pre>' + esc_(T_COUNT) + '</pre>\n<b>Adjustment</b>\n<pre>' + esc_(T_ADJ) + '</pre>\n<b>Lain-lain</b>\n/stok nama ubat\n/gerak nama ubat (pergerakan stok)\n/status GRN-0001\nHQ sahaja: /lulus ID, /tolak ID sebab\n\nStaff tak boleh ubah stok terus. Semua perubahan menunggu kelulusan HQ.', ctx.msg);
}

/* =====================================================================
 * MENU BUTANG DAN PANDUAN LANGKAH DEMI LANGKAH
 * ===================================================================== */
const TITLE = { terima: '📥 TERIMA INVOIS/PO/DO', stoktake: '📋 STOCK TAKE', recount: '🔁 RECOUNT', adjust: '✏️ ADJUSTMENT', stok: '🔎 SEMAK STOK', gerak: '📈 PERGERAKAN STOK', harian: '🗓 KIRAAN HARIAN (FAST MOVING)' };
const SEBAB = ['Rosak', 'Luput', 'Hilang', 'Salah kira', 'Lain-lain'];
const REASONS = ['Gambar tak jelas', 'Kuantiti salah', 'Dokumen tak lengkap', 'Kira semula'];
const MENU_TEXT = '<b>MENU STOK KLINIK PUTRIJAYA</b>\nTekan butang ikut kerja anda. Bot akan tanya langkah demi langkah.\n\n📥 <b>Barang sampai</b> → Terima (gambar invois, TALLY / NOT TALLY)\n📋 <b>Kira stok di rak</b> → Stock Take\n🔁 <b>Kiraan salah</b> → Recount\n✏️ <b>Rosak / luput / hilang</b> → Adjustment\n\nSemua perubahan stok menunggu kelulusan HQ, kecuali TALLY.\nTaip /menu bila-bila untuk panggil menu ini.';
const SOP_CHERAS = '<b>SOP Terima Stok · Cheras (dari supplier)</b>\n1️⃣ Terima barang dan invois\n2️⃣ Kira dan semak manual: kuantiti, nama ubat, dos, tarikh luput, keadaan. Tick ✓ hanya item yang betul\n3️⃣ Semua tally?\n✅ <b>TALLY</b>: tulis nama di hujung invois (Checked by), ambil gambar, simpan barang di lokasi, tekan 📥 Terima → TALLY\n⚠️ <b>NOT TALLY</b>: kira semula, catat kuantiti sebenar dan beza, asingkan item bermasalah, ambil gambar, tekan 📥 Terima → NOT TALLY, tunggu arahan Puan Ema\n6️⃣ Failkan invois dalam fail khas untuk dikutip Puan Ema\n\n❗ Jangan ubah kuantiti asal invois atau lapor TALLY jika ada percanggahan. Jangan pulangkan barang bermasalah tanpa arahan Puan Ema.';
const SOP_BRANCH = '<b>SOP Terima Stok · Puchong / Sungai Besi (dari HQ)</b>\n1️⃣ Terima barang dan invois daripada HQ Cheras\n2️⃣ Kira dan semak manual: kuantiti, nama ubat, dos, tarikh luput, keadaan. Tick ✓ hanya item yang betul\n3️⃣ Semua tally?\n✅ <b>TALLY</b>: tulis Checked by, ambil gambar, simpan barang, tekan 📥 Terima → TALLY\n⚠️ <b>NOT TALLY</b>: kira semula, catat kuantiti sebenar dan beza, asingkan item bermasalah, tekan 📥 Terima → NOT TALLY, maklum Puan Ema\n6️⃣ <b>Update Yezza – Stock Receive</b> guna akaun sendiri. Jika NOT TALLY, jangan rekod item bermasalah sehingga disahkan Puan Ema\n7️⃣ Failkan invois untuk dikutip Puan Ema\n\n❗ Jangan ubah kuantiti asal invois atau lapor TALLY jika ada percanggahan.';

/* ---------- keadaan sesi (cache, tamat 6 jam) ---------- */
function wget_(uid) {
  const v = prop_('w' + uid);
  if (!v) return null;
  try { const o = JSON.parse(v); if (Date.now() - o.ts > 6 * 3600 * 1000) { wdel_(uid); return null; } return o.s; } catch (e) { return null; }
}
function wset_(uid, s) { PropertiesService.getScriptProperties().setProperty('w' + uid, JSON.stringify({ ts: Date.now(), s: s })); }
function wdel_(uid) { PropertiesService.getScriptProperties().deleteProperty('w' + uid); }
/** Semak sesi sendiri: taip /sesi dalam group. */
function cmdSesi_(ctx) {
  const s = wget_(ctx.uid);
  say_(ctx.chat, s ? 'Sesi aktif: <b>' + esc_(TITLE[s.t] || s.t) + '</b>, langkah <b>' + esc_(s.step) + '</b>, ' + (s.d && s.d.items ? s.d.items.length : 0) + ' item, ' + (s.d && s.d.photos ? s.d.photos.length : 0) + ' gambar.' : 'Tiada sesi aktif untuk akaun ini. Taip /menu untuk mula.', ctx.msg);
}
function ans_(cb, text, alert) { tg_('answerCallbackQuery', { callback_query_id: cb.id, text: text || '', show_alert: !!alert }); }
function edit_(chat, mid, html, kb) { return tg_('editMessageText', { chat_id: chat, message_id: mid, text: html, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: kb || { inline_keyboard: [] } }); }
function B_(text, data) { return { text: text, callback_data: data }; }
function menuKb_() {
  return { inline_keyboard: [
    [B_('📥 Terima Invois/PO/DO', 'm:terima')],
    [B_('📋 Stock Take', 'm:stoktake'), B_('🔁 Recount', 'm:recount')],
    [B_('✏️ Adjustment', 'm:adjust'), B_('🔎 Semak Stok', 'm:stok')],
    [B_('🗓 Kiraan Harian (Fast Moving)', 'm:harian')],
    [B_('📈 Pergerakan Stok', 'm:gerak')],
    [B_('📖 SOP', 'm:sop'), B_('❓ Bantuan', 'm:help')],
    [B_('⏳ Menunggu HQ (HQ sahaja)', 'm:pending')]] };
}
function apprKb_(id) { return { inline_keyboard: [[B_('✅ Lulus', 'a:ok:' + id), B_('❌ Tolak', 'a:rj:' + id)]] }; }
function cmdMenu_(ctx) {
  let r = say_(ctx.chat, MENU_TEXT, null, menuKb_());
  if (!r || !r.ok) r = tg_('sendMessage', { chat_id: ctx.chat, text: 'MENU STOK KLINIK PUTRIJAYA. Tekan butang ikut kerja anda.', reply_markup: menuKb_() });
  if (ctx.role === 'HQ' && r && r.ok) tg_('pinChatMessage', { chat_id: ctx.chat, message_id: r.result.message_id, disable_notification: true });
}

/* ---------- panggilan balik butang ---------- */
function handleCallback_(cb) {
  const m = cb.message;
  if (!m || String(m.chat.id) !== String(prop_('GROUP_ID'))) return;
  const a = rows_(S.AKAUN).find(r => String(r[0]) === String(cb.from.id));
  if (!a) return ans_(cb, 'Akaun ini belum didaftarkan. Hubungi HQ.', true);
  const ctx = { chat: m.chat.id, msg: m.message_id, album: '', uid: String(cb.from.id), nama: a[1], caw: a[2], role: String(a[3]).toUpperCase() };
  const parts = String(cb.data || '').split(':');
  try {
    if (parts[0] === 'm') return onMenu_(ctx, cb, parts[1]);
    if (parts[0] === 'w') return onWiz_(ctx, cb, parts);
    if (parts[0] === 'a') return onApprove_(ctx, cb, parts);
  } catch (e) { log_(e); ans_(cb, 'Ralat. Cuba lagi atau taip /menu.', true); }
}
function onMenu_(ctx, cb, what) {
  ans_(cb);
  if (what === 'sop') return say_(ctx.chat, ctx.caw === 'Cheras' ? SOP_CHERAS : (ctx.role === 'HQ' ? SOP_CHERAS + '\n\n' + SOP_BRANCH : SOP_BRANCH));
  if (what === 'help') return cmdHelp_(ctx);
  if (what === 'pending') return showPending_(ctx);
  startWizard_(ctx, what);
}
function showPending_(ctx) {
  if (ctx.role !== 'HQ') return say_(ctx.chat, 'Senarai ini untuk HQ sahaja.');
  const p = rows_(S.REKOD).filter(r => r[R.STATUS] === WAIT).slice(0, 8);
  if (!p.length) return say_(ctx.chat, '✅ Tiada rekod menunggu kelulusan.');
  say_(ctx.chat, '<b>⏳ Menunggu kelulusan HQ</b>\n' + p.map(r => '• ' + r[R.ID] + ' · ' + esc_(r[R.JENIS]) + ' · ' + esc_(r[R.CAW]) + ' · ' + esc_(r[R.PEM] || r[R.AKAUN])).join('\n') + '\n\nTolak: tekan ❌ pada mesej rekod atau taip /tolak ID sebab.', null,
    { inline_keyboard: p.map(r => [B_('✅ Lulus ' + r[R.ID], 'a:ok:' + r[R.ID])]) });
}
function onApprove_(ctx, cb, p) {
  if (ctx.role !== 'HQ') return ans_(cb, 'Hanya HQ boleh meluluskan atau menolak.', true);
  const id = p[2], clear = () => tg_('editMessageReplyMarkup', { chat_id: ctx.chat, message_id: ctx.msg, reply_markup: { inline_keyboard: [] } });
  if (p[1] === 'ok') { ans_(cb, 'Memproses…'); cmdLulus_(ctx, id); return clear(); }
  if (p[1] === 'rj') {
    ans_(cb);
    const rows = REASONS.map((x, i) => [B_(x, 'a:no:' + id + ':' + i)]);
    rows.push([B_('⬅ Kembali', 'a:bk:' + id)]);
    return tg_('editMessageReplyMarkup', { chat_id: ctx.chat, message_id: ctx.msg, reply_markup: { inline_keyboard: rows } });
  }
  if (p[1] === 'bk') { ans_(cb); return tg_('editMessageReplyMarkup', { chat_id: ctx.chat, message_id: ctx.msg, reply_markup: apprKb_(id) }); }
  if (p[1] === 'no') { ans_(cb, 'Memproses…'); cmdTolak_(ctx, id + ' ' + (REASONS[Number(p[3])] || 'Ditolak')); return clear(); }
}

/* ---------- enjin langkah ---------- */
function staf_(caw) {
  try { return rows_('Staf').filter(r => r[0] === caw).map(r => String(r[1])).filter(Boolean); } catch (e) { return []; }
}
function searchUbat_(q, max) {
  const nq = norm_(q); if (!nq) return [];
  const names = ubatNames_(), ex = names.filter(n => norm_(n) === nq);
  if (ex.length === 1) return ex;
  const toks = nq.split(' ');
  return names.filter(n => { const nn = norm_(n); return toks.every(t => nn.includes(t)); }).slice(0, max || 6);
}
function cats_() { const o = []; rows_(S.UBAT).forEach(r => { const c = String(r[1] || 'LAIN'); if (r[0] && o.indexOf(c) < 0) o.push(c); }); return o; }
function grps_(cat) { const o = []; rows_(S.UBAT).forEach(r => { if (r[0] && String(r[1] || 'LAIN') === cat) { const g = String(r[2] || 'LAIN'); if (o.indexOf(g) < 0) o.push(g); } }); return o; }
function itemsIn_(cat, grp) { return rows_(S.UBAT).filter(r => r[0] && String(r[1] || 'LAIN') === cat && String(r[2] || 'LAIN') === grp).map(r => String(r[0])); }
function pair_(btns) { return btns.reduce((a, b, i) => { if (i % 2 === 0) a.push([b]); else a[a.length - 1].push(b); return a; }, []); }
function pager_(s, n) {
  const tot = Math.ceil(n / PG); if (tot <= 1) return [];
  const p = s.pg || 0;
  return [[B_(p > 0 ? '◀ Sebelum' : '·', p > 0 ? 'w:pg:' + (p - 1) : 'w:noop'), B_((p + 1) + ' / ' + tot, 'w:noop'), B_(p < tot - 1 ? 'Seterusnya ▶' : '·', p < tot - 1 ? 'w:pg:' + (p + 1) : 'w:noop')]];
}
function kpad_() {
  const k = d => B_(String(d), 'w:k:' + d);
  return [[k(1), k(2), k(3)], [k(4), k(5), k(6)], [k(7), k(8), k(9)], [B_('⌫', 'w:k:b'), k(0), B_('✔ Sahkan', 'w:k:ok')]];
}
function setExp_(s, t) {
  const d = parseExp_(t), today = new Date(); today.setHours(0, 0, 0, 0);
  if (d === undefined) { s.err = 'Format tarikh tidak sah. Guna 2027-05 atau 05/27.'; return; }
  if (d < today) { s.err = esc_(s.cur.name) + ' sudah LUPUT (' + fmtD_(d) + '). Asingkan, jangan terima. Item tidak dimasukkan.'; s.cur = null; s.step = 'imenu'; return; }
  s.cur.exp = t; finishItem_(s);
}
function startWizard_(ctx, flow) {
  if (flow === 'harian') {
    const f = fastNames_();
    if (!f.length) return say_(ctx.chat, 'Belum ada item fast moving. HQ tetapkan dahulu guna /fast nama ubat, atau tanda lajur Fast moving dalam tab Ubat.');
    return wShow_(ctx, { t: 'harian', step: 'hcount', d: { photos: [], items: [], fast: f, idx: 0, slot: slotLabel_(ctx.caw) }, cur: null, mid: null, opts: [], err: '' });
  }
  const first = { terima: 'dari', stoktake: 'imenu', recount: 'rujuk', adjust: 'iname', stok: 'stoksearch', gerak: 'stoksearch' }[flow];
  if (!first) return;
  wShow_(ctx, { t: flow, step: first, d: { photos: [], items: [] }, cur: null, mid: null, opts: [], err: '' });
}
function summ_(s) {
  const d = s.d, L = [];
  if (d.dari) L.push('Dari: ' + esc_(d.dari));
  if (d.dok) L.push('Dok: ' + esc_(d.dok));
  if (d.status) L.push('Status: <b>' + d.status + '</b>');
  if (d.rujuk) L.push('Rujuk: ' + esc_(d.rujuk));
  if (d.ubat) L.push('Ubat: ' + esc_(d.ubat) + (d.qty != null ? ' (' + (d.qty > 0 ? '+' : '') + d.qty + ')' : ''));
  if (d.sebab) L.push('Sebab: ' + esc_(d.sebab));
  if (d.photos.length) L.push('Gambar: ' + d.photos.length);
  if (s.t === 'harian') { L.push(esc_(d.slot || '')); L.push('Dikira: ' + d.items.length + ' daripada ' + d.fast.length + ' item'); if (d.pem) L.push('Checked by: ' + esc_(d.pem)); return L.join('\n'); }
  d.items.forEach((l, i) => L.push((i + 1) + '. ' + esc_(l.name) + ' → ' + (l.ref != null && s.t === 'terima' && d.status === 'NOT TALLY' ? 'invois ' + l.ref + ' | fizikal ' : '') + l.act + (l.batch ? ' | batch ' + esc_(l.batch) : '') + (l.exp ? ' | luput ' + esc_(l.exp) : '')));
  if (d.pem) L.push('Checked by: ' + esc_(d.pem));
  return L.join('\n');
}
function view_(s, ctx) {
  const d = s.d, cancel = [B_('❌ Batal', 'w:cancel')];
  let ask = '', rows = [];
  switch (s.step) {
    case 'dari': {
      const br = ['HQ', 'Cheras', 'Puchong', 'Sungai Besi'].filter(x => x !== ctx.caw), sup = [];
      rows_(S.REKOD).slice().reverse().forEach(r => { const v = String(r[R.DARI] || '').trim(); if (v && r[R.JENIS] === 'Terima' && br.indexOf(v) < 0 && ['HQ', 'Cheras', 'Puchong', 'Sungai Besi'].indexOf(v) < 0 && sup.indexOf(v) < 0 && sup.length < 6) sup.push(v); });
      s.opts = br.concat(sup);
      ask = '<b>Barang ini datang DARI mana?</b>' + (sup.length ? '\nSupplier terkini ada di bawah.' : '');
      rows = pair_(s.opts.map((x, i) => B_(x, 'w:dari:' + i)));
      rows.push([B_('🏭 Supplier baru (taip nama)', 'w:dari:S')]); break;
    }
    case 'supplier': ask = '<b>Taip nama supplier</b> (cth: Pharmaniaga) dan hantar sebagai mesej biasa.'; break;
    case 'dok': ask = '<b>Nombor invois / PO / DO</b>\nTak perlu taip: nombor akan dibaca daripada gambar yang anda hantar nanti. Tekan butang di bawah.'; rows.push([B_('📷 Ikut gambar (tak perlu taip)', 'w:dk')], [B_('⌨️ Saya nak taip nombor', 'w:dkt')]); break;
    case 'dokt': ask = '<b>Taip nombor invois / PO / DO</b> dan hantar.'; break;
    case 'foto': ask = '<b>Hantar GAMBAR</b> invois/PO/DO (boleh beberapa keping). Pastikan nombor dokumen nampak jelas.' + (d.photos.length ? '\n✅ ' + d.photos.length + ' gambar diterima. Tekan Seterusnya bila siap.' : '');
      if (d.photos.length) rows.push([B_('➡️ Seterusnya', 'w:fnext')]); break;
    case 'status': ask = '<b>Semakan: kuantiti fizikal sama dengan invois, dan semua item betul?</b>';
      rows.push([B_('✅ TALLY (semua sama)', 'w:st:T')], [B_('⚠️ NOT TALLY (ada beza)', 'w:st:N')]); break;
    case 'imenu': {
      const n = d.items.length;
      if (s.t === 'terima' && d.status === 'TALLY') ask = n ? '<b>Tambah ubat lagi?</b>' : '<b>Mahu masukkan senarai ubat?</b> Ini mengemas kini stok. Boleh langkau jika hanya mahu simpan rekod dan gambar.';
      else if (s.t === 'terima') ask = '<b>Tambah ubat yang tidak tally.</b> Masukkan setiap item bermasalah.';
      else ask = '<b>Tambah ubat yang dikira</b> (kira di rak, jangan lihat stok sistem).';
      rows.push([B_('➕ Tambah ubat', 'w:iadd')]);
      if (n) rows.push([B_('✔ Selesai senarai ubat', 'w:idone')]);
      else if (s.t === 'terima' && d.status === 'TALLY') rows.push([B_('⏭ Langkau, tiada senarai', 'w:idone')]);
      break;
    }
    case 'icat': s.opts = cats_(); ask = '<b>Pilih jenis ubat</b>'; rows = pair_(s.opts.map((x, i) => B_(x, 'w:cat:' + i))); rows.push([B_('🔍 Taip nama ubat', 'w:again')]); break;
    case 'igrp': {
      const all = s.cats2 || (s.cats2 = grps_(s.cat)); s.opts = all;
      const p = s.pg || 0, sl = all.slice(p * PG, p * PG + PG);
      ask = '<b>' + esc_(s.cat) + '</b>: pilih kumpulan';
      rows = sl.map((x, i) => [B_(x.length > 50 ? x.slice(0, 48) + '…' : x, 'w:grp:' + (p * PG + i))]);
      pager_(s, all.length).forEach(r => rows.push(r));
      rows.push([B_('⬅ Jenis', 'w:iadd'), B_('🔍 Taip nama', 'w:again')]); break;
    }
    case 'iname': ask = '<b>Taip nama ubat</b> (cth: paracetamol 500). Bot akan cadangkan padanan.'; break;
    case 'ipick': {
      const p = s.pg || 0, sl = s.opts.slice(p * PG, p * PG + PG);
      ask = '<b>Pilih ubat' + (s.grp ? ' (' + esc_(s.grp) + ')' : ' yang betul') + ':</b>';
      rows = sl.map((x, i) => [B_(x.length > 60 ? x.slice(0, 58) + '…' : x, 'w:pk:' + (p * PG + i))]);
      pager_(s, s.opts.length).forEach(r => rows.push(r));
      rows.push([B_(s.grp ? '⬅ Kumpulan' : '⬅ Jenis', s.grp ? 'w:igrpb' : 'w:iadd'), B_('🔍 Taip nama', 'w:again')]); break;
    }
    case 'iref': ask = '<b>' + esc_(s.cur.name) + '</b>\nKuantiti pada <b>INVOIS</b>: <b>' + (d.buf || '_') + '</b>'; rows = kpad_(); break;
    case 'iact': ask = '<b>' + esc_(s.cur.name) + '</b>\n' + (s.t === 'terima' ? 'Kuantiti <b>FIZIKAL</b> diterima' : 'Kiraan di rak') + ': <b>' + (d.buf || '_') + '</b>'; rows = kpad_(); break;
    case 'ibatch': ask = '<b>Nombor batch?</b> Taip, atau tekan Langkau.'; rows.push([B_('⏭ Langkau', 'w:bskip')]); break;
    case 'iexp': { const y = new Date().getFullYear(); ask = '<b>Tarikh luput: pilih tahun</b> (atau taip cth 05/27).'; rows.push([0, 1, 2, 3, 4, 5].map(i => B_(String(y + i), 'w:ey:' + (y + i)))); rows.push([B_('⏭ Langkau', 'w:eskip')]); break; }
    case 'iexm': { ask = '<b>Tarikh luput ' + s.cur.ey + ': pilih bulan</b>'; const M = ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ogo', 'Sep', 'Okt', 'Nov', 'Dis']; for (let i = 0; i < 12; i += 4) rows.push(M.slice(i, i + 4).map((m, j) => B_(m, 'w:em:' + (i + j + 1)))); rows.push([B_('⬅ Tahun', 'w:ebk')]); break; }
    case 'qty': ask = '<b>' + esc_(s.d.ubat) + '</b>\nBerapa laras? Taip <b>-5</b> (kurang) atau <b>+10</b> (tambah).'; break;
    case 'sebab': ask = '<b>Sebab adjustment?</b>'; rows = SEBAB.map((x, i) => B_(x, 'w:sb:' + i)).reduce((a, b, i) => { if (i % 2 === 0) a.push([b]); else a[a.length - 1].push(b); return a; }, []); break;
    case 'rujuk': {
      const rc = rows_(S.REKOD).filter(r => r[R.CAW] === ctx.caw && r[R.JENIS] === 'Stok take' && r[R.STATUS] === WAIT).slice(-5);
      s.opts = rc.map(r => r[R.ID]);
      ask = '<b>Recount untuk stock take yang mana?</b>' + (rc.length ? '' : '\nTiada stock take menunggu. Boleh langkau.');
      rows = s.opts.map((x, i) => [B_(x, 'w:rj:' + i)]); rows.push([B_('⏭ Langkau', 'w:rj:N')]); break;
    }
    case 'pem': {
      s.opts = staf_(ctx.caw);
      ask = '<b>Siapa pemeriksa (Checked by)?</b>';
      s.opts.forEach((x, i) => { const b = B_(x, 'w:pem:' + i); if (i % 3 === 0) rows.push([b]); else rows[rows.length - 1].push(b); });
      rows.push([B_('✍️ Nama lain (taip)', 'w:pemx')]); break;
    }
    case 'pemtxt': ask = '<b>Taip nama pemeriksa.</b>'; break;
    case 'confirm': ask = '<b>Semak maklumat di atas.</b> Tekan Hantar jika betul.'; rows.push([B_('✅ Hantar', 'w:ok')]); break;
    case 'hcount': {
      const nm = d.fast[d.idx];
      const sys = SHOW_SYS ? getStok_(ctx.caw, nm) : null;
      ask = '<b>Item ' + (d.idx + 1) + ' / ' + d.fast.length + '</b>\n<b>' + esc_(nm) + '</b>' + (SHOW_SYS ? '\nSistem: ' + sys : '') + '\nKiraan di rak: <b>' + (d.buf || '_') + '</b> (tekan nombor, kosong = 0 tekan 0)';
      if (SHOW_SYS) rows.push([B_('✔ Tally, ' + sys, 'w:ht')]);
      kpad_().forEach(r => rows.push(r));
      rows.push([B_('⬅ Balik', 'w:hback'), B_('⏭ Langkau', 'w:hskip'), B_('✔ Siap, hantar', 'w:hdone')]); break;
    }
    case 'stoksearch': ask = '<b>Taip nama ubat</b> untuk ' + (s.t === 'gerak' ? 'lihat pergerakan stok' : 'semak stok') + ' (cth: paracetamol 500).'; break;
  }
  rows.push(cancel);
  const sm = summ_(s);
  const text = '<b>' + TITLE[s.t] + '</b> · ' + esc_(ctx.caw) + (sm ? '\n\n' + sm : '') + (s.err ? '\n\n⚠️ ' + s.err : '') + '\n\n' + ask;
  return { text: text, kb: { inline_keyboard: rows } };
}
function wShow_(ctx, s) {
  const v = view_(s, ctx); s.err = '';
  if (s.mid) {
    const r = edit_(ctx.chat, s.mid, v.text, v.kb);
    if (r && r.ok === false && !/not modified/i.test(r.description || '')) { s.mid = null; }
  }
  if (!s.mid) { const r = say_(ctx.chat, v.text, null, v.kb); if (r && r.ok) s.mid = r.result.message_id; }
  wset_(ctx.uid, s);
}
function finishItem_(s) {
  const c = s.cur; s.cur = null;
  s.d.items.push({ name: c.name, ref: c.ref == null ? c.act : c.ref, act: c.act, batch: c.batch || '', exp: c.exp || '' });
  s.step = 'imenu';
}
function pickUbat_(s, name) {
  s.cur = { name: name };
  if (s.t === 'adjust') { s.d.ubat = name; s.step = 'qty'; }
  else if (s.t === 'terima' && s.d.status === 'NOT TALLY') s.step = 'iref';
  else s.step = 'iact';
}
function onWiz_(ctx, cb, p) {
  const s = wget_(ctx.uid);
  if (!s) return ans_(cb, 'Sesi tamat atau bukan sesi anda. Tekan /menu untuk mula semula.', true);
  if (s.mid && cb.message.message_id !== s.mid) return ans_(cb, 'Ini sesi lama atau bukan sesi anda. Tekan /menu.', true);
  const act = p[1], arg = p[2];
  if (act === 'cancel') { wdel_(ctx.uid); ans_(cb); return edit_(ctx.chat, s.mid, '❌ <b>' + TITLE[s.t] + '</b> dibatalkan oleh ' + esc_(ctx.nama) + '. Tiada rekod disimpan.'); }
  if (act === 'ok') return wSubmit_(ctx, cb, s);
  ans_(cb);
  switch (act) {
    case 'dari': if (arg === 'S') s.step = 'supplier'; else { s.d.dari = s.opts[Number(arg)]; s.step = 'dok'; } break;
    case 'dk': s.d.dok = 'Ikut gambar'; s.step = 'foto'; break;
    case 'dkt': s.step = 'dokt'; break;
    case 'fnext': if (!s.d.photos.length) { s.err = 'Hantar sekurang-kurangnya satu gambar.'; break; } s.step = s.t === 'adjust' ? 'pem' : 'status'; break;
    case 'st': s.d.status = arg === 'N' ? 'NOT TALLY' : 'TALLY'; s.step = 'imenu'; break;
    case 'iadd': s.pg = 0; s.grp = null; s.cats2 = null; s.step = 'icat'; break;
    case 'again': s.step = 'iname'; break;
    case 'noop': return;
    case 'cat': s.cat = s.opts[Number(arg)]; s.cats2 = null; s.pg = 0; s.step = 'igrp'; break;
    case 'grp': s.grp = s.opts[Number(arg)]; s.opts = itemsIn_(s.cat, s.grp); s.pg = 0; s.step = 'ipick'; break;
    case 'igrpb': s.grp = null; s.pg = 0; s.step = 'igrp'; break;
    case 'pg': s.pg = Number(arg) || 0; break;
    case 'k': {
      if (arg === 'b') s.d.buf = String(s.d.buf || '').slice(0, -1);
      else if (arg === 'ok') {
        const b = String(s.d.buf || ''); s.d.buf = '';
        if (!b) { s.err = 'Tekan nombor dahulu.'; break; }
        return onText_(ctx, b, s);
      } else if (String(s.d.buf || '').length < 5) s.d.buf = String(s.d.buf || '') + arg;
      break;
    }
    case 'ht': { const nm = s.d.fast[s.d.idx], v = getStok_(ctx.caw, nm); s.d.buf = ''; s.d.items.push({ name: nm, ref: v, act: v, batch: '', exp: '' }); s.d.idx++; s.step = s.d.idx >= s.d.fast.length ? 'pem' : 'hcount'; break; }
    case 'hback': if (s.d.idx > 0) { s.d.idx--; const nm = s.d.fast[s.d.idx]; s.d.items = s.d.items.filter(x => x.name !== nm); } s.d.buf = ''; s.step = 'hcount'; break;
    case 'ey': s.cur.ey = arg; s.step = 'iexm'; break;
    case 'ebk': s.step = 'iexp'; break;
    case 'em': setExp_(s, s.cur.ey + '-' + String(arg).padStart(2, '0')); break;
    case 'idone': s.step = 'pem'; break;
    case 'pk': pickUbat_(s, s.opts[Number(arg)]); break;
    case 'bskip': s.step = 'iexp'; break;
    case 'eskip': finishItem_(s); break;
    case 'sb': s.d.sebab = SEBAB[Number(arg)]; s.step = 'foto'; break;
    case 'rj': s.d.rujuk = arg === 'N' ? '' : s.opts[Number(arg)]; s.step = 'imenu'; break;
    case 'pem': s.d.pem = s.opts[Number(arg)]; s.step = 'confirm'; break;
    case 'pemx': s.step = 'pemtxt'; break;
    case 'hskip': s.d.buf = ''; s.d.idx++; s.step = s.d.idx >= s.d.fast.length ? 'pem' : 'hcount'; break;
    case 'hdone': if (!s.d.items.length) { s.err = 'Kira sekurang-kurangnya satu item dahulu.'; break; } s.step = 'pem'; break;
  }
  if (s.step === 'imenu' && s.t === 'terima' && !s.d.status) s.step = 'status';
  wShow_(ctx, s);
}
function onText_(ctx, text, s) {
  const t = text.trim().slice(0, 80), n = num_(t);
  if (s.d) s.d.buf = '';
  switch (s.step) {
    case 'supplier': s.d.dari = t; s.step = 'dok'; break;
    case 'dok': case 'dokt': s.d.dok = t; s.step = 'foto'; break;
    case 'icat': case 'igrp': case 'ipick': case 'iname': {
      s.grp = null; s.pg = 0;
      const c = searchUbat_(t, 6);
      if (!c.length) s.err = '"' + esc_(t) + '" tiada dalam senarai. Cuba ejaan lain atau kata kunci lebih pendek.';
      else if (c.length === 1) pickUbat_(s, c[0]);
      else { s.opts = c; s.step = 'ipick'; }
      break;
    }
    case 'iref': if (isNaN(n) || n < 0) s.err = 'Taip nombor sahaja, cth 100.'; else { s.cur.ref = n; s.step = 'iact'; } break;
    case 'iact':
      if (isNaN(n) || n < 0) { s.err = 'Taip nombor sahaja, cth 90.'; break; }
      s.cur.act = n;
      if (s.t === 'terima') { if (s.d.status === 'TALLY') s.cur.ref = n; s.step = 'ibatch'; } else finishItem_(s);
      break;
    case 'ibatch': s.cur.batch = t; s.step = 'iexp'; break;
    case 'iexp': setExp_(s, t); break;
    case 'qty': {
      if (isNaN(n) || n === 0) { s.err = 'Taip nombor bukan sifar, cth -5 atau +10.'; break; }
      const sys = getStok_(ctx.caw, s.d.ubat);
      if (sys + n < 0) { s.err = 'Stok sistem ' + sys + '. Laras ' + n + ' akan jadi negatif.'; break; }
      s.d.qty = n; s.step = 'sebab'; break;
    }
    case 'hcount':
      if (isNaN(n) || n < 0) { s.err = 'Taip nombor sahaja (0 ke atas).'; break; }
      s.d.items.push({ name: s.d.fast[s.d.idx], ref: n, act: n, batch: '', exp: '' }); s.d.idx++;
      s.step = s.d.idx >= s.d.fast.length ? 'pem' : 'hcount'; break;
    case 'pemtxt': s.d.pem = t; s.step = 'confirm'; break;
    case 'stoksearch': wdel_(ctx.uid); if (s.mid) edit_(ctx.chat, s.mid, '🔎 Semakan stok'); return s.t === 'gerak' ? cmdGerak_(ctx, t) : cmdStok_(ctx, t);
    default: return;
  }
  wShow_(ctx, s);
}
function wSubmit_(ctx, cb, s) {
  const d = s.d;
  const items = d.items.map(l => l.name + (s.t === 'terima' ? ' | invois ' + l.ref + ' | fizikal ' + l.act + (l.batch ? ' | batch ' + l.batch : '') + (l.exp ? ' | luput ' + l.exp : '') : ' | ' + l.act)).join('\n');
  let cmd, body;
  if (s.t === 'terima') { cmd = cmdTerima_; body = d.status + '\nDari: ' + d.dari + '\nDok: ' + d.dok + '\nChecked by: ' + d.pem + '\n' + items; }
  else if (s.t === 'adjust') { cmd = cmdAdjust_; body = 'Ubat: ' + d.ubat + '\nQty: ' + d.qty + '\nSebab: ' + d.sebab + '\nChecked by: ' + d.pem; }
  else if (s.t === 'harian') { cmd = cmdCount_; body = 'Checked by: ' + d.pem + '\n' + items; }
  else { cmd = cmdCount_; body = 'Checked by: ' + d.pem + (d.rujuk ? '\nRujuk: ' + d.rujuk : '') + '\n' + items; }
  ans_(cb, 'Menghantar…');
  ctx.cmd = s.t; ctx.links = d.photos.slice(); ctx.msg = s.mid;
  const ok = cmd(ctx, body);
  if (ok) { wdel_(ctx.uid); edit_(ctx.chat, s.mid, '✔ <b>' + TITLE[s.t] + '</b> dihantar oleh ' + esc_(ctx.nama) + '. Lihat mesej pengesahan di bawah.'); }
}
