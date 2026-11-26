'use strict';
/* Backend Google Sheets API (akaun perkhidmatan). Tiada pakej luaran. */
const crypto = require('crypto');
const b64u = b => Buffer.from(b).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
const q = n => "'" + String(n).replace(/'/g, "''") + "'";
const colName = n => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

class GoogleSheets {
  constructor(sheetId, sa, base) { this.id = sheetId; this.sa = sa; this.base = base || 'https://sheets.googleapis.com'; this.tok = null; this.exp = 0; }
  async token() {
    if (this.tok && Date.now() < this.exp - 60000) return this.tok;
    const now = Math.floor(Date.now() / 1000);
    const head = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claim = b64u(JSON.stringify({ iss: this.sa.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets', aud: this.sa.token_uri || 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
    const sig = crypto.createSign('RSA-SHA256').update(head + '.' + claim).sign(this.sa.private_key);
    const r = await fetch(this.sa.token_uri || 'https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + head + '.' + claim + '.' + b64u(sig) });
    const j = await r.json();
    if (!j.access_token) throw new Error('Token Google gagal: ' + JSON.stringify(j).slice(0, 200));
    this.tok = j.access_token; this.exp = Date.now() + (j.expires_in || 3600) * 1000; return this.tok;
  }
  async api(method, path, body) {
    const r = await fetch(this.base + '/v4/spreadsheets/' + this.id + path, { method, headers: { Authorization: 'Bearer ' + await this.token(), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const t = await r.text();
    if (!r.ok) throw new Error('Sheets ' + r.status + ': ' + t.slice(0, 300));
    return t ? JSON.parse(t) : {};
  }
  async load() {
    const meta = await this.api('GET', '?fields=sheets.properties.title');
    const names = meta.sheets.map(s => s.properties.title);
    const out = {};
    for (let i = 0; i < names.length; i += 20) {
      const part = names.slice(i, i + 20);
      const qs = part.map(n => 'ranges=' + encodeURIComponent(q(n))).join('&');
      const d = await this.api('GET', '/values:batchGet?' + qs + '&majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING');
      d.valueRanges.forEach((v, k) => { out[part[k]] = (v.values || []).map(r => r.slice()); });
    }
    return out;
  }
  async apply(op) {
    if (op.t === 'append') return this.api('POST', '/values/' + encodeURIComponent(q(op.tab) + '!A1') + ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS', { values: [op.row] });
    if (op.t === 'set') return this.api('PUT', '/values/' + encodeURIComponent(q(op.tab) + '!' + colName(op.c) + op.r) + '?valueInputOption=RAW', { values: op.vals });
    if (op.t === 'add') {
      try { return await this.api('POST', ':batchUpdate', { requests: [{ addSheet: { properties: { title: op.tab } } }] }); }
      catch (e) { if (/already exists/i.test(e.message)) return; throw e; }
    }
  }
}
module.exports = { GoogleSheets };
