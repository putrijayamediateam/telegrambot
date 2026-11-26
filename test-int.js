const { spawn } = require('child_process'), assert = require('assert'), crypto = require('crypto');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
(async () => {
  const fake = spawn('node', ['fake-apis.js'], { stdio: 'inherit' });
  await sleep(500);
  const sa = { client_email: 'a@b.iam', private_key: privateKey, token_uri: 'http://localhost:9911/token' };
  const srv = spawn('node', ['server.js'], { env: Object.assign({}, process.env, { SHEET_ID: 'S1', GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify(sa), BOT_TOKEN: 'TOK', GROUP_ID: '-100', SECRET: 'sec', PUBLIC_URL: 'http://localhost:8099', PORT: '8099', TELEGRAM_API: 'http://localhost:9911', SHEETS_API: 'http://localhost:9911', PROPS_FILE: '/tmp/props-test.json' }), stdio: 'inherit' });
  try {
    let ok = false; for (let i = 0; i < 30 && !ok; i++) { try { ok = (await fetch('http://localhost:8099/health')).ok; } catch (e) { await sleep(200); } }
    assert(ok, 'pelayan tak hidup');
    const hook = (u) => fetch('http://localhost:8099/hook?k=sec', { method: 'POST', body: JSON.stringify(u) });
    const state = async () => (await fetch('http://localhost:9911/_state')).json();
    let id = 1; const msg = (from, text) => ({ update_id: id++, message: { message_id: 500 + id, from: { id: from }, chat: { id: -100 }, text } });
    const t0 = Date.now();
    assert.strictEqual((await hook(msg(222, '/menu'))).status, 200);
    let st; for (let i = 0; i < 40; i++) { await sleep(100); st = await state(); if (st.tg.some(x => x.m === 'sendMessage')) break; }
    const ms = Date.now() - t0;
    assert(st.tg.some(x => x.m === 'sendMessage' && /MENU STOK/.test(x.p.text)), 'menu tak dihantar');
    console.log('Masa menu:', ms, 'ms');
    // tetapan salah rahsia diabaikan
    await fetch('http://localhost:8099/hook?k=salah', { method: 'POST', body: JSON.stringify(msg(222, '/menu')) }); await sleep(300);
    assert.strictEqual((await state()).tg.filter(x => x.m === 'sendMessage').length, 1, 'rahsia salah patut diabaikan');
    // kiraan harian ringkas melalui perintah (satu mesej), kemudian HQ lulus
    await hook(msg(222, '/harian\nChecked by: Yaya\nParacetamol 500 | 90\nAmoxicillin 500 | 0')); await sleep(800);
    st = await state();
    const last = st.tg.filter(x => x.m === 'sendMessage').pop().p.text;
    assert(/KH-0001/.test(last) && /1 ada beza/.test(last), last);
    assert(st.sheets.Rekod.some(r => r[0] === 'KH-0001' && r[4] === 'MENUNGGU HQ'), 'rekod tak sampai ke Sheet');
    await hook(msg(111, '/lulus KH-0001')); await sleep(800); st = await state();
    assert.strictEqual(st.sheets.Stok.find(r => r[0] === 'Cheras' && r[1] === 'Paracetamol Tab 500Mg')[2], 90);
    assert(st.sheets.Sistem && st.sheets.Sistem.some(r => r[0] === 'n_KH' && r[1] === '1'), 'kaunter tak disimpan');
    assert(st.sheets.Pergerakan.length >= 2, 'pergerakan');
    const h = await (await fetch('http://localhost:8099/health')).json(); assert.strictEqual(h.gagal, 0);
    console.log('INTEGRASI LULUS: Sheet dikemas kini dan Telegram dipanggil; Stok Cheras=90; kaunter disimpan');
  } finally { srv.kill(); fake.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
