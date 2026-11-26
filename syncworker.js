// Thread kecil untuk panggilan HTTP segerak (menyekat thread utama sehingga siap).
const { parentPort } = require('worker_threads');
parentPort.on('message', async ({ sab, port, url, opts }) => {
  const flag = new Int32Array(sab);
  try {
    const r = await fetch(url, { method: opts.method, headers: opts.headers, body: opts.body });
    const text = await r.text();
    port.postMessage({ ok: true, status: r.status, text });
  } catch (e) {
    port.postMessage({ ok: false, error: String(e && e.message || e) });
  }
  Atomics.store(flag, 0, 1);
  Atomics.notify(flag, 0);
});
