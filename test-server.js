const fs = require('fs'), vm = require('vm'), assert = require('assert');
function mk() {
  const sheets = {};
  const H = { Akaun: ['User ID', 'Nama', 'Cawangan', 'Peranan'], Ubat: ['Nama', 'Kategori', 'Kumpulan'], Rekod: new Array(14).fill('h'), Baris: new Array(8).fill('h'), Stok: ['Cawangan', 'Ubat', 'Qty', 'Kemas kini'], Gambar: ['Masa', 'Mesej', 'Album', 'Akaun', 'Pautan', 'Rekod'], Staf: ['Cawangan', 'Nama'], Pergerakan: ['Masa', 'Cawangan', 'Ubat', 'Jenis', 'Perubahan', 'Sebelum', 'Selepas', 'Rekod', 'Pihak lain', 'Oleh'], Jadual: ['Cawangan', 'Hari', 'Tamat shift', 'Kiraan sebelum (min)'] };
  Object.keys(H).forEach(k => sheets[k] = [H[k]]);
  sheets.Akaun.push([1707087128, 'Sheren', 'HQ', 'HQ'], [984716962, 'Kak Ema', 'HQ', 'HQ'], [9061979531, 'Cheras', 'Cheras', 'Staff'], [7188180808, 'Puchong', 'Puchong', 'Staff']);
  ['Paracetamol Tab 500Mg', 'Paracetamol Tab 650Mg', 'Amoxicillin Tab 500Mg', 'Cetirizine Syrup 60Ml (Paeds)'].forEach((n, i) => sheets.Ubat.push([n, 'TABLET', 'X', i === 0 || i === 2 ? 'Ya' : '']));
  sheets.Jadual.push(['Cheras', 'Semua', '15:00', 30], ['Puchong', 'Isnin-Jumaat', '22:15', 30], ['Puchong', 'Sabtu-Ahad', '22:00', 30]);
  sheets.Staf.push(['Cheras', 'Yaya'], ['Cheras', 'Haifa'], ['Cheras', 'Ida'], ['HQ', 'Erma']);
  sheets.Stok.push(['Cheras', 'Paracetamol Tab 500Mg', 100, 'x']);
  const sheetObj = n => ({
    getDataRange: () => ({ getValues: () => sheets[n].map(r => r.slice()) }),
    appendRow: r => sheets[n].push(r.slice()),
    getRange: (r, c, nr, nc) => ({
      getValue: () => (sheets[n][r - 1] || [])[c - 1],
      setValue: v => { sheets[n][r - 1][c - 1] = v; },
      setValues: vs => { vs[0].forEach((v, i) => sheets[n][r - 1][c - 1 + i] = v); }
    })
  });
  const trig = []; let seq = 0; const sent = [], calls = [], files = [], applied = [];
  const { createBot } = require('./shim.js');
  const fakeFetch = (url, o) => {
    let text = '{"ok":true}';
    if (/sendMessage/.test(url)) { const pl = JSON.parse(o.body); pl._n = ++seq; sent.push(pl); text = JSON.stringify({ ok: true, result: { message_id: 5000 + sent.length } }); }
    else if (/getFile/.test(url)) text = '{"ok":true,"result":{"file_path":"p.jpg"}}';
    else if (o && o.body) calls.push({ m: url.split('/').pop(), p: JSON.parse(o.body), _n: ++seq });
    return { status: 200, text };
  };
  const initial = JSON.parse(JSON.stringify(sheets));
  const bot = createBot({ code: fs.readFileSync(__dirname + '/Code.gs', 'utf8'), cfg: { props: { SECRET: 's', GROUP_ID: '-100', BOT_TOKEN: 't' }, photoLink: id => { files.push(id); return 'https://srv/f/IMG' + files.length; } }, backend: { load: async () => ({}), apply: async op => { applied.push(op); } }, syncFetch: fakeFetch });
  bot.mirror.sheets = sheets;
  const ctx = bot.ctx; ctx.__x = bot.x; const props = bot.props;
  ctx.ScriptApp = { getService: () => ({ getUrl: () => 'https://x' }), getProjectTriggers: () => [], newTrigger: () => ({ timeBased: () => ({ everyMinutes: () => ({ create: () => { trig.push(1); } }) }) }) };
  let uid = 1;
  const post = (from, text, extra) => {
    const m = Object.assign({ message_id: uid + 100, from: { id: from }, chat: { id: -100 } }, extra || {});
    if (extra && extra.photo) m.caption = text; else m.text = text;
    return ctx.__x.doPost({ parameter: { k: 's' }, postData: { contents: JSON.stringify({ update_id: uid++, message: m }) } });
  };
  const cbq = (from, data, mid) => ctx.__x.doPost({ parameter: { k: 's' }, postData: { contents: JSON.stringify({ update_id: uid++, callback_query: { id: 'cb' + uid, from: { id: from }, data: data, message: { message_id: mid, chat: { id: -100 } } } }) } });
  return { sheets, sent, calls, post, cbq, x: ctx.__x, props, files, ctx, trig, applied, initial, bot };
}
const PH = { photo: [{ file_id: 'a' }, { file_id: 'b' }] };
let t = mk();
const last = () => t.sent[t.sent.length - 1].text;
const CH = 9061979531, EMA = 984716962;

// 1. TALLY tanpa gambar ditolak
t.post(CH, '/terima TALLY\nDari: HQ\nDok: INV-1\nChecked by: Ema');
assert(/gambar/i.test(last()) && t.sheets.Rekod.length === 1, 'tanpa gambar patut ditolak');
// 2. TALLY dengan gambar + item
t.post(CH, '/terima TALLY\nDari: HQ\nDok: INV-1\nChecked by: Ema\nParacetamol 500 | invois 50 | fizikal 50 | batch A1 | luput 2028-01', PH);
assert(/GRN-0001/.test(last()), last());
assert.strictEqual(t.sheets.Stok.find(r => r[1] === 'Paracetamol Tab 500Mg')[2], 150);
assert.strictEqual(t.sheets.Rekod[1][4], 'DITERIMA');
assert(t.sheets.Rekod[1][9].includes('IMG'), 'pautan gambar');
// 2b. pergerakan: Cheras +50 (100→150), HQ -50 (0→-50) dengan amaran
assert(/Stok HQ dikurangkan/.test(t.sent.filter(x => /GRN-0001/.test(x.text)).pop().text));
assert(/stok HQ jadi -50/.test(t.sent.filter(x => /GRN-0001/.test(x.text)).pop().text));
let pg = t.sheets.Pergerakan.slice(1);
assert.strictEqual(pg.length, 2);
assert.strictEqual(JSON.stringify(pg[0].slice(1, 8)), JSON.stringify(['Cheras', 'Paracetamol Tab 500Mg', 'Terima', 50, 100, 150, 'GRN-0001']));
assert.strictEqual(JSON.stringify(pg[1].slice(1, 8)), JSON.stringify(['HQ', 'Paracetamol Tab 500Mg', 'Keluar', -50, 0, -50, 'GRN-0001']));
assert.strictEqual(t.sheets.Stok.find(r => r[0] === 'HQ' && r[1] === 'Paracetamol Tab 500Mg')[2], -50);
// 3. TALLY tapi qty tak sama
t.post(CH, '/terima TALLY\nDari: HQ\nDok: INV-2\nChecked by: Ema\nParacetamol 500 | invois 50 | fizikal 40', PH);
assert(/NOT TALLY/.test(last()) && t.sheets.Rekod.length === 2);
// 4. NOT TALLY menunggu, stok tak berubah, lulus oleh HQ
t.post(CH, '/terima NOT TALLY\nDari: Pharmaniaga\nDok: INV-3\nChecked by: Ema\nParacetamol 500 | invois 100 | fizikal 90', PH);
assert(/GRN-0002/.test(last()) && /MENUNGGU/.test(t.sheets.Rekod[2][4]));
assert.strictEqual(t.sheets.Stok.find(r => r[0] === 'Cheras' && r[1] === 'Paracetamol Tab 500Mg')[2], 150);
t.post(CH, '/lulus GRN-0002');
assert(/Hanya HQ/.test(last()), 'staff tak boleh lulus');
t.post(EMA, '/lulus GRN-0002');
assert.strictEqual(t.sheets.Stok.find(r => r[0] === 'Cheras' && r[1] === 'Paracetamol Tab 500Mg')[2], 240);
// GRN-0002 dari supplier: stok HQ tidak berubah
assert.strictEqual(t.sheets.Stok.find(r => r[0] === 'HQ' && r[1] === 'Paracetamol Tab 500Mg')[2], -50);
assert.strictEqual(t.sheets.Rekod[2][4], 'DILULUSKAN');
// pergerakan stok take dan /gerak
// 5. luput, tidak sah, samar
t.post(CH, '/terima TALLY\nDari: HQ\nDok: X\nChecked by: E\nParacetamol 500 | 5 | luput 2020-01', PH);
assert(/LUPUT/.test(last()));
t.post(CH, '/terima TALLY\nDari: HQ\nDok: X\nChecked by: E\nParacetamol | 5', PH);
assert(/lebih satu padanan/.test(last()));
t.post(CH, '/terima TALLY\nDari: HQ\nDok: X\nChecked by: E\nUbat entah | 5', PH);
assert(/tiada dalam senarai/.test(last()));
// 6. luput singkat beramaran
t.post(CH, '/terima TALLY\nDari: HQ\nDok: Y\nChecked by: E\nAmoxicillin | invois 5 | fizikal 5 | luput 2027-01', PH);
const w = t.sheets.Rekod[t.sheets.Rekod.length - 1];
assert(/GRN-0003/.test(w[0]));
// 7. stoktake + approve
t.post(CH, '/stoktake\nChecked by: Ema\nParacetamol 500 | 200');
assert(/ST-0001/.test(last()) && /sistem 240/.test(last()), last());
t.post(EMA, '/lulus ST-0001');
assert.strictEqual(t.sheets.Stok.find(r => r[1] === 'Paracetamol Tab 500Mg')[2], 200);
// 8. recount menggantikan
t.post(CH, '/stoktake\nChecked by: Ema\nParacetamol 500 | 190');
t.post(CH, '/recount\nChecked by: Ema\nRujuk: ST-0002\nParacetamol 500 | 195');
assert(/RC-0001/.test(last()), last());
t.post(EMA, '/lulus RC-0001');
assert(/DIGANTI RC-0001/.test(t.sheets.Rekod.find(r => r[0] === 'ST-0002')[4]));
assert.strictEqual(t.sheets.Stok.find(r => r[1] === 'Paracetamol Tab 500Mg')[2], 195);
// 9. adjust
t.post(CH, '/adjust\nUbat: Paracetamol 500\nQty: -5\nSebab: rosak\nChecked by: Ema');
assert(/gambar/i.test(last()));
t.post(CH, '/adjust\nUbat: Paracetamol 500\nQty: -500\nSebab: rosak\nChecked by: Ema', PH);
assert(/negatif/.test(last()));
t.post(CH, '/adjust\nUbat: Paracetamol 500\nQty: -5\nSebab: rosak\nChecked by: Ema', PH);
assert(/ADJ-0001/.test(last()) && /195 → 190/.test(last()), last());
t.post(EMA, '/tolak ADJ-0001');
assert(/Nyatakan sebab/.test(last()));
t.post(EMA, '/tolak ADJ-0001 gambar tak jelas');
assert.strictEqual(t.sheets.Rekod.find(r => r[0] === 'ADJ-0001')[4], 'DITOLAK');
assert.strictEqual(t.sheets.Stok.find(r => r[1] === 'Paracetamol Tab 500Mg')[2], 195);
// 10. /stok, /status, tak berdaftar, group lain, duplikat update
t.post(CH, '/stok paracetamol 500');
assert(/Cheras: 195/.test(last()));
t.post(CH, '/status GRN-0002');
assert(/DILULUSKAN/.test(last()));
const n = t.sent.length;
t.post(111, '/terima TALLY');
assert(/belum didaftarkan/.test(last()));
const r1 = t.sent.length;
t.post(CH, 'hai semua');
assert.strictEqual(t.sent.length, r1, 'sembang biasa diabaikan');
t.x.doPost({ parameter: { k: 'salah' }, postData: { contents: '{}' } });
// 11. album: caption pada foto pertama, foto kedua tiba kemudian
t = mk();
t.post(CH, '/terima TALLY\nDari: HQ\nDok: Z\nChecked by: E', { photo: [{ file_id: 'a' }], media_group_id: 'G1' });
assert(/GRN-0001/.test(last()));
t.post(CH, '', { photo: [{ file_id: 'b' }], media_group_id: 'G1', message_id: 999 });
assert.strictEqual(t.sheets.Rekod[1][9].split('\n').length, 2, 'foto album kedua dilampirkan');
// 11b. /gerak
t = mk();
t.post(CH, '/terima TALLY\nDari: Pharmaniaga\nDok: S1\nChecked by: E\nParacetamol 500 | 10', PH);
assert(!/Stok .* dikurangkan/.test(last()), 'supplier tak kurangkan stok sesiapa');
assert.strictEqual(t.sheets.Pergerakan.length, 2);
t.post(CH, '/gerak paracetamol 500');
assert(/Terima \+10 \(100→110\)/.test(last()), last());
t.post(CH, '/adjust\nUbat: Paracetamol 500\nQty: -3\nSebab: rosak\nChecked by: E', PH);
t.post(EMA, '/lulus ADJ-0001');
t.post(EMA, '/gerak paracetamol 500');
assert(/Adjust -3 \(110→107\)/.test(last()), last());
// pindah dari cawangan ke cawangan: Puchong -> Cheras
t.post(CH, '/terima NOT TALLY\nDari: Puchong\nDok: T1\nChecked by: E\nParacetamol 500 | invois 20 | fizikal 18', PH);
t.post(EMA, '/lulus GRN-0002');
assert.strictEqual(t.sheets.Stok.find(r => r[0] === 'Cheras' && r[1] === 'Paracetamol Tab 500Mg')[2], 125);
assert.strictEqual(t.sheets.Stok.find(r => r[0] === 'Puchong' && r[1] === 'Paracetamol Tab 500Mg')[2], -20);
assert(/Puchong/.test(last()) && /jadi -20/.test(last()), last());
// 12. penghurai tarikh
assert.strictEqual(t.x.parseExp_('05/27').getMonth(), 4);
assert.strictEqual(t.x.parseExp_('2027-05').getDate(), 31);
assert.strictEqual(t.x.parseExp_('abc'), undefined);


// ===== BUTANG DAN PANDUAN =====
t = mk();
const lastKb = () => t.sent[t.sent.length - 1].reply_markup;
const wiz = () => t.calls.filter(c => c.m === 'editMessageText').pop();
const btn = (label) => { // cari butang daripada paparan wizard terkini
  const e = wiz(), sm = t.sent.filter(x => x.reply_markup).pop();
  const kb = ((e && (!sm || e._n > sm._n)) ? e.p.reply_markup : sm.reply_markup).inline_keyboard;
  const b = [].concat(...kb).find(x => x.text.includes(label)); assert(b, 'butang tiada: ' + label + ' dalam ' + JSON.stringify(kb)); return b.callback_data; };
// /menu oleh HQ: ada butang dan pin
t.post(EMA, '/menu');
assert(/MENU STOK/.test(last()) && lastKb().inline_keyboard.length >= 4);
assert(t.calls.some(c => c.m === 'pinChatMessage'), 'menu dipin');
// Terima NOT TALLY melalui butang
t.cbq(CH, 'm:terima', 5001);
let mid = t.sent[t.sent.length - 1] && 5000 + t.sent.length;
assert(/TERIMA INVOIS/.test(last()) && /DARI/.test(last()));
t.cbq(CH, btn('HQ'), mid);
assert(/nombor invois/i.test(wiz().p.text), wiz().p.text);
t.post(CH, 'INV-777');
assert(/GAMBAR/.test(wiz().p.text));
t.post(CH, '', { photo: [{ file_id: 'a' }, { file_id: 'b' }] });
assert(/1 gambar diterima/.test(wiz().p.text), wiz().p.text);
t.cbq(CH, btn('Seterusnya'), mid);
t.cbq(CH, btn('NOT TALLY'), mid);
t.cbq(CH, btn('Tambah ubat'), mid);
t.post(CH, 'paracetamol');                       // samar: dua padanan
assert(/Pilih ubat/.test(wiz().p.text));
t.cbq(CH, btn('500Mg'), mid);
t.post(CH, 'abc');                                // bukan nombor
assert(/nombor sahaja/.test(wiz().p.text));
t.post(CH, '100'); t.post(CH, '90');
t.cbq(CH, btn('Langkau'), mid);                   // batch langkau
t.post(CH, '2020-01');                            // luput -> item digugurkan
assert(/LUPUT/.test(wiz().p.text));
t.cbq(CH, btn('Tambah ubat'), mid);
t.post(CH, 'amoxicillin'); t.post(CH, '20'); t.post(CH, '15'); t.post(CH, 'B9'); t.post(CH, '2028-03');
assert(/Amoxicillin/.test(wiz().p.text) && /invois 20 \| fizikal 15/.test(wiz().p.text), wiz().p.text);
t.cbq(CH, btn('Selesai'), mid);
t.cbq(CH, btn('Yaya'), mid);
assert(/Semak maklumat/.test(wiz().p.text));
// orang lain tak boleh tekan butang sesi ini
t.cbq(7188180808, 'w:ok', mid);
assert(!t.sheets.Rekod.find(r => r[0] === 'GRN-0001'), 'sesi orang lain');
t.cbq(CH, 'w:ok', mid);
assert(/GRN-0001 · NOT TALLY/.test(last()), last());
const rk = t.sheets.Rekod.find(r => r[0] === 'GRN-0001');
assert(rk[4] === 'MENUNGGU HQ' && rk[5] === 'INV-777' && rk[6] === 'HQ' && rk[7] === 'Yaya' && rk[9].split('\n').length === 1);
assert(JSON.stringify(lastKb()).includes('a:ok:GRN-0001'), 'butang lulus pada pengesahan');
// staff tak boleh lulus, HQ boleh melalui butang; stok bertambah 15
t.cbq(CH, 'a:ok:GRN-0001', 6001);
assert(/Hanya HQ/.test(t.calls.filter(c => c.m === 'answerCallbackQuery').pop().p.text));
t.cbq(EMA, 'a:ok:GRN-0001', 6001);
assert(t.sheets.Rekod.find(r => r[0] === 'GRN-0001')[4] === 'DILULUSKAN');
assert.strictEqual(t.sheets.Stok.find(r => r[1] === 'Amoxicillin Tab 500Mg')[2], 15);
// Stock take melalui butang (buta: tidak tunjuk stok sistem)
t.cbq(CH, 'm:stoktake', 1);
mid = 5000 + t.sent.length;
assert(!/sistem \d/i.test(last()));
t.cbq(CH, btn('Tambah ubat'), mid);
t.post(CH, 'cetirizine'); t.post(CH, '12');
t.cbq(CH, btn('Selesai'), mid); t.cbq(CH, btn('Haifa'), mid); t.cbq(CH, 'w:ok', mid);
assert(/ST-0001/.test(last()) && /sistem 0/.test(last()), last());
// Tolak melalui butang dengan sebab
t.cbq(EMA, 'a:rj:ST-0001', 7001);
t.cbq(EMA, 'a:no:ST-0001:1', 7001);
assert(/Kuantiti salah/.test(t.sheets.Rekod.find(r => r[0] === 'ST-0001')[8]) && t.sheets.Rekod.find(r => r[0] === 'ST-0001')[4] === 'DITOLAK');
// Adjustment: gambar -> sebab -> checked by
t.cbq(CH, 'm:adjust', 1); mid = 5000 + t.sent.length;
t.post(CH, 'amoxicillin');
t.post(CH, '-30');
assert(/negatif/.test(wiz().p.text));
t.post(CH, '-5');
t.cbq(CH, btn('Rosak'), mid);
t.cbq(CH, 'w:fnext', mid);
assert(/Hantar sekurang/.test(wiz().p.text) || /Hantar GAMBAR/.test(wiz().p.text));
t.post(CH, '', { photo: [{ file_id: 'a' }] });
t.cbq(CH, 'w:fnext', mid);
t.cbq(CH, btn('Ida'), mid); t.cbq(CH, 'w:ok', mid);
assert(/ADJ-0001/.test(last()) && /15 → 10/.test(last()), last());
// Batal
t.cbq(CH, 'm:recount', 1); mid = 5000 + t.sent.length;
t.cbq(CH, 'w:cancel', mid);
assert(/dibatalkan/.test(wiz().p.text));
// Menunggu HQ (HQ sahaja) dan SOP
t.cbq(CH, 'm:pending', 1); assert(/HQ sahaja/.test(last()));
t.cbq(EMA, 'm:pending', 1); assert(/Menunggu kelulusan/.test(last()) && /ADJ-0001/.test(last()));
t.cbq(CH, 'm:sop', 1); assert(/Cheras \(dari supplier\)/.test(last()));
t.cbq(7188180808, 'm:sop', 1); assert(/Yezza/.test(last()));
// /sesi
t.cbq(CH, 'm:terima', 1); t.post(CH, '/sesi');
assert(/Sesi aktif/.test(last()) && /dari/.test(last()), last());
t.cbq(CH, 'w:cancel', 5000 + t.sent.length - 1);
t.post(CH, '/sesi'); assert(/Tiada sesi aktif/.test(last()), last());
// Sesi tamat
t.cbq(CH, 'w:ok', 999); assert(/Sesi tamat/.test(t.calls.filter(c => c.m === 'answerCallbackQuery').pop().p.text));

// ===== KIRAAN HARIAN FAST MOVING =====
t = mk();
const MY = (h, m) => new Date(Date.UTC(2026, 10, 25, h - 8, m));   // Rabu 25 Nov 2026 waktu Malaysia
t.ctx.NOW_OVERRIDE = MY(14, 31);
t.post(CH, '/fast'); assert(/Paracetamol Tab 500Mg/.test(last()) && /Amoxicillin/.test(last()) && /\(2\)/.test(last()), last());
t.post(CH, '/fast cetirizine'); assert(/Hanya HQ/.test(last()));
t.post(EMA, '/fast cetirizine'); assert(/ditambah/.test(last()) && /3/.test(last()), last());
t.post(EMA, '/fast cetirizine'); assert(/dibuang/.test(last()));
// peringatan 14:31 Cheras (tamat 15:00, 30 min sebelum -> 14:30)
t.ctx.peringatanKiraan();
let rem = t.sent.filter(x => /Waktu kiraan stok harian/.test(x.text));
assert.strictEqual(rem.length, 1, 'satu peringatan'); assert(/Cheras/.test(rem[0].text) && /15:00/.test(rem[0].text) && /m:harian/.test(JSON.stringify(rem[0].reply_markup)));
assert(/tg:\/\/user\?id=9061979531/.test(rem[0].text), 'tag akaun cawangan');
t.ctx.peringatanKiraan();
assert.strictEqual(t.sent.filter(x => /Waktu kiraan stok harian/.test(x.text)).length, 1, 'tiada duplikasi');
// Puchong hari bekerja: 22:15 -> 21:45, belum masa pada 14:31
assert(!t.sent.some(x => /Puchong/.test(x.text) && /Waktu kiraan/.test(x.text)));
// amaran 14:55 jika belum kira
t.ctx.NOW_OVERRIDE = MY(14, 55);
t.ctx.peringatanKiraan();
let warn = t.sent.filter(x => /belum diterima/.test(x.text));
assert.strictEqual(warn.length, 1); assert(/Kak Ema/.test(warn[0].text) && /Cheras/.test(warn[0].text));
t.ctx.peringatanKiraan(); assert.strictEqual(t.sent.filter(x => /belum diterima/.test(x.text)).length, 1);
// wizard harian melalui butang: 2 item fast (Paracetamol 500 sistem 100, Amoxicillin sistem 0)
t.ctx.NOW_OVERRIDE = MY(14, 40);
t.cbq(CH, 'm:harian', 1); let hmid = 5000 + t.sent.length;
assert(/Item 1 \/ 2/.test(last()) && /Paracetamol Tab 500Mg/.test(last()) && /Slot 14:30/.test(last()), last());
assert(!/sistem \d/.test(last()), 'kiraan buta');
t.post(CH, 'abc'); assert(/nombor sahaja/.test(wiz().p.text));
t.post(CH, '95');
assert(/Item 2 \/ 2/.test(wiz().p.text), wiz().p.text);
t.post(CH, '0');
assert(/Checked by/.test(wiz().p.text) && /Dikira: 2 daripada 2/.test(wiz().p.text), wiz().p.text);
t.cbq(CH, btn('Yaya'), hmid); t.cbq(CH, 'w:ok', hmid);
assert(/KH-0001 · KIRAAN HARIAN/.test(last()) && /1 ada beza|2 item, 1 ada beza/.test(last()), last());
let kh = t.sheets.Rekod.find(r => r[0] === 'KH-0001');
assert(kh[3] === 'Kiraan harian' && kh[4] === 'MENUNGGU HQ' && /Slot 14:30/.test(kh[8]), JSON.stringify(kh));
assert(JSON.stringify(lastKb()).includes('a:ok:KH-0001'));
// selepas rekod, amaran tak dihantar lagi dan kelulusan melaraskan stok
t.cbq(EMA, 'a:ok:KH-0001', 8001);
assert.strictEqual(t.sheets.Stok.find(r => r[0] === 'Cheras' && r[1] === 'Paracetamol Tab 500Mg')[2], 95);
// kiraan harian sepadan sepenuhnya -> SELESAI tanpa HQ
t.post(CH, '/harian\nChecked by: Ida\nParacetamol 500 | 95\nAmoxicillin 500 | 0');
assert(/KH-0002/.test(last()) && /sepadan/.test(last()) && !/Menunggu HQ/.test(last()), last());
assert.strictEqual(t.sheets.Rekod.find(r => r[0] === 'KH-0002')[4], 'SELESAI');
// /harian tanpa isi buka wizard; pemasa dipasang
t.post(CH, '/harian'); assert(/Item 1 \/ 2/.test(wiz().p.text) || /Item 1 \/ 2/.test(last()), 'wizard dibuka');
t.ctx.pasangPemasa(); assert.strictEqual(t.trig.length, 1);
// ===== ALIRAN BUTANG PENUH (tanpa menaip nama/nombor) =====
t = mk(); t.ctx.NOW_OVERRIDE = MY(14, 40);
t.cbq(CH, 'm:terima', 1); let bm = 5000 + t.sent.length;
t.cbq(CH, btn('HQ'), bm); t.cbq(CH, btn('Ikut gambar'), bm); t.post(CH, '', { photo: [{ file_id: 'z' }] });
t.cbq(CH, btn('Seterusnya'), bm); t.cbq(CH, btn('TALLY (semua'), bm);
t.cbq(CH, btn('Tambah ubat'), bm);
assert(/jenis ubat/i.test(wiz().p.text) && /TABLET/.test(JSON.stringify(wiz().p.reply_markup)), wiz().p.text);
t.cbq(CH, btn('TABLET'), bm);
assert(/pilih kumpulan/.test(wiz().p.text));
t.cbq(CH, btn('X'), bm);
assert(/Pilih ubat \(X\)/.test(wiz().p.text));
t.cbq(CH, btn('Paracetamol Tab 500Mg'), bm);
assert(/Kuantiti <b>FIZIKAL|FIZIKAL/.test(wiz().p.text) && /w:k:ok/.test(JSON.stringify(wiz().p.reply_markup)));
t.cbq(CH, 'w:k:1', bm); t.cbq(CH, 'w:k:2', bm); t.cbq(CH, 'w:k:b', bm); t.cbq(CH, 'w:k:5', bm);
assert(/<b>15<\/b>/.test(wiz().p.text), wiz().p.text);
t.cbq(CH, 'w:k:ok', bm);                         // terus ke batch
t.cbq(CH, btn('Langkau'), bm);                   // batch
assert(/pilih tahun/.test(wiz().p.text));
t.cbq(CH, 'w:ey:2028', bm); assert(/pilih bulan/.test(wiz().p.text));
t.cbq(CH, 'w:em:3', bm);
assert(/Paracetamol Tab 500Mg → 15 \| luput 2028-03/.test(wiz().p.text), wiz().p.text);
t.cbq(CH, 'w:k:ok', bm); assert(/Tekan nombor dahulu|Selesai|Tambah ubat/.test(wiz().p.text));
// luput bulan lepas melalui butang ditolak
t.cbq(CH, btn('Tambah ubat'), bm); t.cbq(CH, btn('TABLET'), bm); t.cbq(CH, btn('X'), bm);
t.cbq(CH, btn('Amoxicillin'), bm); t.cbq(CH, 'w:k:7', bm); t.cbq(CH, 'w:k:ok', bm); t.cbq(CH, btn('Langkau'), bm);
t.cbq(CH, 'w:ey:' + new Date().getFullYear(), bm); t.cbq(CH, 'w:em:1', bm);
assert(/LUPUT/.test(wiz().p.text), wiz().p.text);
// kiraan harian melalui pad nombor + balik
t = mk(); t.ctx.NOW_OVERRIDE = MY(14, 40);
t.cbq(CH, 'm:harian', 1); let pm = 5000 + t.sent.length;
t.cbq(CH, 'w:k:9', pm); t.cbq(CH, 'w:k:5', pm); t.cbq(CH, 'w:k:ok', pm);
assert(/Item 2 \/ 2/.test(wiz().p.text), wiz().p.text);
t.cbq(CH, btn('Balik'), pm); assert(/Item 1 \/ 2/.test(wiz().p.text) && /Dikira|_/.test(wiz().p.text));
t.cbq(CH, 'w:k:9', pm); t.cbq(CH, 'w:k:5', pm); t.cbq(CH, 'w:k:ok', pm);
t.cbq(CH, 'w:k:0', pm); t.cbq(CH, 'w:k:ok', pm);
assert(/Checked by/.test(wiz().p.text) && /Dikira: 2 daripada 2/.test(wiz().p.text), wiz().p.text);

// ===== SEMAK STOK dan ADJUST melalui butang; supplier dari tab Pembekal =====
t = mk(); t.sheets.Pembekal = [['Nama'], ['Pharmaniaga'], ['Hi-Care']];
t.cbq(CH, 'm:stok', 1); let sm2 = 5000 + t.sent.length;
assert(/jenis ubat/i.test(last()), last());
t.cbq(CH, btn('TABLET'), sm2); t.cbq(CH, btn('X'), sm2); t.cbq(CH, btn('Paracetamol Tab 500Mg'), sm2);
assert(/Paracetamol Tab 500Mg/.test(last()) && /Cheras/.test(last()), last());
t.cbq(CH, 'm:adjust', 1); let am = 5000 + t.sent.length;
t.cbq(CH, btn('TABLET'), am); t.cbq(CH, btn('X'), am); t.cbq(CH, btn('Paracetamol Tab 500Mg'), am);
assert(/Laras stok/.test(wiz().p.text), wiz().p.text);
t.cbq(CH, 'w:k:5', am); t.cbq(CH, 'w:k:ok', am);
assert(/Sebab adjustment/.test(wiz().p.text) && /\(-5\)/.test(wiz().p.text), wiz().p.text);
t.cbq(CH, 'w:cancel', am);
t.cbq(CH, 'm:terima', 1); let tm = 5000 + t.sent.length;
assert(/Pharmaniaga/.test(JSON.stringify(t.sent[t.sent.length - 1].reply_markup)), 'supplier dari tab Pembekal');

// tiada fast moving -> mesej
t = mk(); t.sheets.Ubat.slice(1).forEach(r => r[3] = '');
t.post(CH, '/harian'); assert(/Belum ada item fast moving/.test(last()), last());

// ===== PENGESAHAN: ulang semua tulisan ke Sheet pada salinan asal dan banding dengan memori =====
(async () => {
  const T = mk(); T.post(CH, '/terima TALLY\nDari: HQ\nDok: Z-1\nChecked by: Ema\nParacetamol 500 | invois 10 | fizikal 10', PH);
  T.post(CH, '/stoktake\nChecked by: Ema\nParacetamol 500 | 77'); T.post(EMA, '/lulus ST-0001');
  await T.bot.mirror.drain();
  const rep = JSON.parse(JSON.stringify(T.initial));
  T.applied.forEach(op => {
    if (op.t === 'add') rep[op.tab] = rep[op.tab] || [];
    else if (op.t === 'append') rep[op.tab].push(op.row);
    else if (op.t === 'set') op.vals.forEach((vr, i) => { while (rep[op.tab].length < op.r + i) rep[op.tab].push([]); vr.forEach((v, j) => { rep[op.tab][op.r - 1 + i][op.c - 1 + j] = v; }); });
  });
  const trim = r => { const x = r.slice(); while (x.length && (x[x.length - 1] === '' || x[x.length - 1] === undefined)) x.pop(); return x.map(v => v === undefined ? '' : v); };
  Object.keys(T.sheets).forEach(n => assert.strictEqual(JSON.stringify(T.sheets[n].map(trim)), JSON.stringify((rep[n] || []).map(trim)), 'tulisan Sheet tak sepadan: ' + n));
  console.log('Tulisan Sheet sepadan dengan memori:', T.applied.length, 'operasi');
  console.log('SEMUA UJIAN LULUS (versi pelayan)');
})().catch(e => { console.error(e); process.exit(1); });
