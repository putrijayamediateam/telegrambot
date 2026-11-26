// API palsu Telegram + Google Sheets untuk ujian integrasi (proses berasingan)
const http = require('http');
const sheets = {
  Akaun: [['User ID', 'Nama', 'Cawangan', 'Peranan'], [111, 'Sheren', 'HQ', 'HQ'], [222, 'Cheras', 'Cheras', 'Staff']],
  Ubat: [['Nama', 'Kategori', 'Kumpulan', 'Fast moving'], ['Paracetamol Tab 500Mg', 'TABLET', 'X', 'Ya'], ['Amoxicillin Tab 500Mg', 'TABLET', 'X', 'Ya'], ['Cetirizine Tab 10Mg', 'TABLET', 'X', '']],
  Rekod: [new Array(14).fill('h')], Baris: [new Array(8).fill('h')], Stok: [['Cawangan', 'Ubat', 'Qty', 'Kemas kini'], ['Cheras', 'Paracetamol Tab 500Mg', 100, 'x']],
  Gambar: [['Masa', 'Mesej', 'Album', 'Akaun', 'Pautan', 'Rekod']], Staf: [['Cawangan', 'Nama'], ['Cheras', 'Yaya']],
  Pergerakan: [['Masa', 'Cawangan', 'Ubat', 'Jenis', 'Perubahan', 'Sebelum', 'Selepas', 'Rekod', 'Pihak lain', 'Oleh']],
  Jadual: [['Cawangan', 'Hari', 'Tamat shift', 'Kiraan sebelum (min)'], ['Cheras', 'Semua', 0.625, 30]]
};
const tg = []; let mid = 900;
const rd = r => new Promise(ok => { let b = ''; r.on('data', c => b += c); r.on('end', () => ok(b)); });
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x'), body = await rd(req);
  const send = (o, c) => { res.writeHead(c || 200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  const unq = s => decodeURIComponent(s).replace(/^'|'$/g, '').replace(/''/g, "'");
  if (u.pathname === '/token') return send({ access_token: 'tok', expires_in: 3600 });
  if (u.pathname === '/_state') return send({ tg, sheets });
  let m;
  if ((m = u.pathname.match(/^\/bot[^/]+\/(\w+)$/))) { const p = body ? JSON.parse(body) : {}; tg.push({ m: m[1], p }); return send(m[1] === 'sendMessage' ? { ok: true, result: { message_id: ++mid } } : { ok: true, result: {} }); }
  if (u.pathname === '/v4/spreadsheets/S1' && req.method === 'GET') return send({ sheets: Object.keys(sheets).map(t => ({ properties: { title: t } })) });
  if (u.pathname === '/v4/spreadsheets/S1/values:batchGet') return send({ valueRanges: u.searchParams.getAll('ranges').map(r => ({ values: sheets[unq(r.replace(/^'|'$/g, "'"))] ? sheets[unq(r)].map(x => x.slice()) : [] })) });
  if (u.pathname === '/v4/spreadsheets/S1:batchUpdate') { const t = JSON.parse(body).requests[0].addSheet.properties.title; if (sheets[t]) return send({ error: 'already exists' }, 400); sheets[t] = []; return send({}); }
  if ((m = u.pathname.match(/^\/v4\/spreadsheets\/S1\/values\/(.+):append$/))) { const [t] = decodeURIComponent(m[1]).split('!'); sheets[unq(t)].push(JSON.parse(body).values[0]); return send({}); }
  if ((m = u.pathname.match(/^\/v4\/spreadsheets\/S1\/values\/(.+)$/)) && req.method === 'PUT') {
    const [t, a] = decodeURIComponent(m[1]).split('!'), mm = a.match(/^([A-Z]+)(\d+)$/); let c = 0; for (const ch of mm[1]) c = c * 26 + ch.charCodeAt(0) - 64;
    const s = sheets[unq(t)]; JSON.parse(body).values.forEach((vr, i) => { const r = +mm[2] - 1 + i; while (s.length <= r) s.push([]); vr.forEach((v, j) => { while (s[r].length < c + j) s[r].push(''); s[r][c - 1 + j] = v; }); }); return send({});
  }
  send({ error: 'tidak dikenali ' + req.method + ' ' + u.pathname }, 404);
}).listen(9911, () => console.log('fake ready'));
