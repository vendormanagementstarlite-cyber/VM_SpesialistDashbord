// Menguji apps-script/Starlite.gs (dijalankan dengan stub layanan Google) bersama klien src/lib/google.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { cekJembatan, driveArsip, googleEnabled, drivePath, driveUpload, driveDownload, gmailSend, gmailThreadReplies, sheetUpsert, docxKePdf } from '../src/lib/google.js';

const ROOT = 'ROOT_ID';
function makeGoogle() {
  let n = 0;
  const items = new Map(); // id -> {id,name,parents:[],trashed,folder,bytes,mime}
  items.set(ROOT, { id: ROOT, name: 'root', parents: [], folder: true });
  items.set('OUTSIDE', { id: 'OUTSIDE', name: 'luar', parents: [], folder: true });
  const wrap = (o) => ({
    getId: () => o.id, getName: () => o.name, isTrashed: () => !!o.trashed,
    getParents: () => { const l = o.parents.map((p) => wrap(items.get(p))); let i = 0; return { hasNext: () => i < l.length, next: () => l[i++] }; },
    getFoldersByName(name) { const l = [...items.values()].filter((x) => x.folder && x.parents.includes(o.id) && x.name === name).map(wrap); let i = 0; return { hasNext: () => i < l.length, next: () => l[i++] }; },
    getFilesByName(name) { const l = [...items.values()].filter((x) => !x.folder && x.parents.includes(o.id) && x.name === name).map(wrap); let i = 0; return { hasNext: () => i < l.length, next: () => l[i++] }; },
    createFolder(name) { const id = 'F' + ++n; items.set(id, { id, name, parents: [o.id], folder: true }); return wrap(items.get(id)); },
    createFile(blob) { const id = 'X' + ++n; items.set(id, { id, name: blob.name, parents: [o.id], bytes: blob.bytes, mime: blob.mime }); return wrap(items.get(id)); },
    getBlob: () => ({ getBytes: () => o.bytes }),
  });
  const sent = [];
  const threads = {};
  // Spreadsheet di memori: { nama: { grid: [[...]], valid: {} } }
  const sheets = {
    'PKS PJ': { grid: [['TANGGAL', 'NAMA MITRA', 'PROGRES', 'REMARK', 'RUMUS', 'NO ID']] },
    'PKS MS & SPK MS': { grid: [['NAMA MITRA', 'Nama Pemilik Rekening ', 'PROGRES SPK MS', 'NO REKENING', 'NO ID']] },
  };
  const sheetObj = (nm) => {
    const sh = sheets[nm]; sh.valid ||= {};
    const cols = () => sh.grid[0].length;
    const cell = (r, c) => (sh.grid[r - 1] || [])[c - 1] ?? '';
    return {
      getLastColumn: () => cols(), getLastRow: () => sh.grid.length, getMaxRows: () => Math.max(sh.grid.length, 1000), insertRowsAfter() {},
      getRange: (r, c, nr = 1, nc = 1) => ({
        getValues: () => [...Array(nr)].map((_, i) => [...Array(nc)].map((_, j) => { const v = cell(r + i, c + j); return typeof v === 'string' && v.startsWith('=') ? 'HASIL' : v; })),
        getDisplayValues() { return this.getValues().map((row) => row.map(String)); },
        getFormulas: () => [...Array(nr)].map((_, i) => [...Array(nc)].map((_, j) => { const v = cell(r + i, c + j); return typeof v === 'string' && v.startsWith('=') ? v : ''; })),
        setValues: (vals) => vals.forEach((row, i) => { const rr = r + i - 1; while (sh.grid.length <= rr) sh.grid.push(Array(cols()).fill('')); row.forEach((v, j) => { sh.grid[rr][c + j - 1] = v; }); }),
        getDataValidation: () => sh.valid[c] || null,
        setDataValidation: (v) => { sh.valid[c] = v; },
      }),
    };
  };
  const drive = { uploads: 0, trashed: [] };
  const props = { KEY: 'rahasia' };
  const g = {
    JSON, String, Array, Error, Math,
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] ?? null }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ text: t, setMimeType() { return this; } }) },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'vendor.management@weave.co.id' }) },
    DriveApp: { getFolderById: (id) => wrap(items.get(id)), getFileById: (id) => (items.get(id) ? wrap(items.get(id)) : { setTrashed: () => drive.trashed.push(id) }) },
    SpreadsheetApp: {
      openById: () => ({ getName: () => 'VM Starlite Sheet', getSheetByName: (nm) => (sheets[nm] ? sheetObj(nm) : null) }),
      flush() {},
      newDataValidation: () => { const v = { list: null }; const b = { requireValueInList: (l) => { v.list = l; return b; }, setAllowInvalid: () => b, build: () => v }; return b; },
    },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: {
      newBlob: (bytes, mime, name) => ({ bytes, mime, name, getBytes: () => (typeof bytes === 'string' ? [...Buffer.from(bytes)] : bytes) }),
      base64Decode: (s) => [...Buffer.from(s, 'base64')],
      base64Encode: (b) => Buffer.from(b).toString('base64'),
      getUuid: () => '1234-5678',
    },
    Logger: { log() {} },
    GmailApp: { getAliases: () => [] },
    ScriptApp: { getOAuthToken: () => 'tok' },
    UrlFetchApp: { fetch: (url, opt) => {
      assert.equal(opt.headers.Authorization, 'Bearer tok');
      let code = 200, body;
      if (url.startsWith('https://www.googleapis.com/upload/drive/v3/files')) {
        drive.uploads++; drive.lastType = opt.contentType; drive.lastBody = Buffer.from(opt.payload).toString('latin1'); body = { id: 'DOC' + drive.uploads };
      } else if (/\/drive\/v3\/files\/DOC\d+\/export\?mimeType=application\/pdf$/.test(url)) {
        return { getResponseCode: () => 200, getBlob: () => ({ getBytes: () => [...Buffer.from('%PDF-1.4 hasil')] }) };
      } else if (url.endsWith('/messages/send') && opt.method === 'post') {
        const res = JSON.parse(opt.payload); const id = 'a' + ++n; const threadId = res.threadId || 'f' + n;
        sent.push({ ...res, id }); body = { id, threadId };
      } else {
        const m = url.match(/\/threads\/([^?]+)/); body = m && threads[m[1]]; if (!body) { code = 404; body = { error: 'not found' }; }
      }
      return { getResponseCode: () => code, getContentText: () => JSON.stringify(body) };
    } },
  };
  vm.createContext(g);
  vm.runInContext(readFileSync(new URL('../apps-script/Starlite.gs', import.meta.url), 'utf8'), g);
  vm.runInContext("globalThis.__ROOT = DEFAULT_ROOT; globalThis.doPost = doPost; globalThis.doGet = doGet;", g);
  props.DRIVE_ROOT_FOLDER = ROOT;
  return { g, items, sent, threads, props, sheets, drive };
}

function env(g) {
  return { APPS_SCRIPT_URL: 'https://script.google.com/macros/s/x/exec', APPS_SCRIPT_KEY: 'rahasia', __g: g };
}
function installFetch(g) {
  const real = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    const out = g.doPost({ postData: { contents: init.body } });
    return new Response(out.text, { status: 200 });
  };
  return () => { globalThis.fetch = real; };
}

test('googleEnabled butuh URL dan KEY', () => {
  assert.equal(googleEnabled({}), false);
  assert.equal(googleEnabled({ APPS_SCRIPT_URL: 'u' }), false);
  assert.equal(googleEnabled({ APPS_SCRIPT_URL: 'u', APPS_SCRIPT_KEY: 'k' }), true);
});

test('Drive: folder bertingkat dibuat sekali, unggah lalu unduh identik', async () => {
  const { g, items } = makeGoogle(); const restore = installFetch(g); const e = env(g);
  try {
    const f1 = await drivePath(e, ['PT A', 'PKS-01', '01 Master']);
    const f2 = await drivePath(e, ['PT A', 'PKS-01', '01 Master']);
    assert.equal(f1, f2, 'folder yang sama tidak diduplikasi');
    assert.equal([...items.values()].filter((x) => x.folder).length, 2 + 3);
    const bytes = new Uint8Array(70000).map((_, i) => (i * 7) % 256);
    const id = await driveUpload(e, f1, 'a.pdf', 'application/pdf', bytes);
    assert.deepEqual(await driveDownload(e, id), bytes);
  } finally { restore(); }
});

test('Drive: menolak folder/berkas di luar folder induk', async () => {
  const { g } = makeGoogle(); const restore = installFetch(g); const e = env(g);
  try {
    await assert.rejects(driveUpload(e, 'OUTSIDE', 'x.pdf', 'application/pdf', new Uint8Array([1])), /luar folder induk/);
    await assert.rejects(driveDownload(e, 'OUTSIDE'), /luar folder induk/);
  } finally { restore(); }
});

test('kunci salah atau aksi asing ditolak', async () => {
  const { g } = makeGoogle(); const restore = installFetch(g);
  try {
    await assert.rejects(drivePath({ ...env(g), APPS_SCRIPT_KEY: 'salah' }, ['A']), /tidak berwenang/);
    await assert.rejects(drivePath({ ...env(g), APPS_SCRIPT_KEY: '' }, ['A']), /tidak berwenang/);
    const r = JSON.parse(g.doPost({ postData: { contents: JSON.stringify({ key: 'rahasia', action: 'hapus_semua' }) } }).text);
    assert.equal(r.ok, false);
    await assert.rejects(drivePath(env(g), ['a', 'b', 'c', 'd', 'e', 'f', 'g']), /segments/);
  } finally { restore(); }
});

test('Gmail: kirim membawa raw + thread, balasan memfilter pesan sendiri', async () => {
  const { g, sent, threads } = makeGoogle(); const restore = installFetch(g); const e = env(g);
  try {
    const r = await gmailSend(e, { from: 'vendor.management@weave.co.id', to: ['mitra@x.id'], subject: 'Perjanjian', html: '<p>Halo</p>', attachments: [{ name: 'a.pdf', mime: 'application/pdf', bytes: new Uint8Array([37, 80, 68, 70]) }] });
    assert.ok(r.threadId && r.id);
    const mime = Buffer.from(sent[0].raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString();
    assert.match(mime, /From: vendor\.management@weave\.co\.id/);
    assert.match(mime, /filename="a\.pdf"/);
    await gmailSend(e, { from: 'a@b', to: ['m@x'], subject: 's', html: 'h' }, r.threadId);
    assert.equal(sent[1].threadId, r.threadId, 'balasan dalam thread yang sama');

    const body = (t) => Buffer.from(t).toString('base64url');
    threads[r.threadId] = { messages: [
      { id: 'm1', internalDate: '1700000000000', payload: { headers: [{ name: 'From', value: 'VM <vendor.management@weave.co.id>' }], mimeType: 'text/plain', body: { data: body('kita') } } },
      { id: 'm2', internalDate: '1700000100000', payload: { headers: [{ name: 'From', value: 'Mitra <mitra@x.id>' }], mimeType: 'text/plain', body: { data: body('Setuju.\nOn Mon wrote:\nkutipan') } } },
    ] };
    const rep = await gmailThreadReplies(e, r.threadId, 'vendor.management@weave.co.id');
    assert.equal(rep.length, 1);
    assert.equal(rep[0].text, 'Setuju.');
  } finally { restore(); }
});

test('Gmail: threadId tidak valid ditolak, galat Gmail diteruskan', async () => {
  const { g } = makeGoogle(); const restore = installFetch(g); const e = env(g);
  try {
    await assert.rejects(gmailThreadReplies(e, '../x', 'a@b'), /threadId tidak valid/);
    await assert.rejects(gmailThreadReplies(e, 'abc123', 'a@b'), /Gmail 404/);
  } finally { restore(); }
});

test('fungsi izinkan berjalan tanpa galat', () => {
  const { g } = makeGoogle();
  vm.runInContext('izinkan()', g);
});

test('balasan bukan JSON (mis. halaman login Google) memberi pesan jelas tanpa mengulang sia-sia', async () => {
  const real = globalThis.fetch; let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response('<html>masuk dulu</html>', { status: 200 }); };
  try {
    await assert.rejects(drivePath({ APPS_SCRIPT_URL: 'u', APPS_SCRIPT_KEY: 'k' }, ['A']), /membalas tidak valid/);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = real; }
});

test('galat server (5xx) diulang sampai 3 kali', async () => {
  const real = globalThis.fetch; let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response('gangguan', { status: 503 }); };
  try {
    await assert.rejects(drivePath({ APPS_SCRIPT_URL: 'u', APPS_SCRIPT_KEY: 'k' }, ['A']), /membalas tidak valid/);
    assert.equal(calls, 3);
  } finally { globalThis.fetch = real; }
});

test('driveArsip: folder bernama mitra, berkas langsung di dalamnya, tautan membuka berkas, idempoten', async () => {
  const { g, items } = makeGoogle();
  const restore = installFetch(g); const e = env(g);
  try {
    const r1 = await driveArsip(e, 'PT Contoh/Satu', 'PKS-1 Final 001.pdf', 'application/pdf', new Uint8Array([1, 2, 3]));
    const fol = items.get(r1.folderId);
    assert.equal(fol.name, 'PT Contoh Satu');
    assert.deepEqual(fol.parents, [ROOT]);
    const file = items.get(r1.id);
    assert.deepEqual(file.parents, [r1.folderId]);
    assert.equal(r1.url, 'https://drive.google.com/file/d/' + r1.id + '/view');
    assert.equal(r1.folderUrl, 'https://drive.google.com/drive/folders/' + r1.folderId);
    const r2 = await driveArsip(e, 'PT Contoh/Satu', 'PKS-1 Final 001.pdf', 'application/pdf', new Uint8Array([1, 2, 3]));
    assert.equal(r2.id, r1.id); assert.equal(r2.folderId, r1.folderId);
    const r3 = await driveArsip(e, 'PT Contoh/Satu', 'PKS-2 Final 002.pdf', 'application/pdf', new Uint8Array([9]));
    assert.equal(r3.folderId, r1.folderId); assert.notEqual(r3.id, r1.id);
    await assert.rejects(driveArsip(e, '', 'x.pdf', 'application/pdf', new Uint8Array([1])), /wajib/);
  } finally { restore(); }
});

test('Spreadsheet: baris baru lalu diperbarui berdasarkan NO ID; rumus & kolom lain tetap; dropdown PROGRES dipasang', async () => {
  const { g, sheets } = makeGoogle(); const restore = installFetch(g); const e = env(g);
  try {
    sheets['PKS PJ'].grid.push(['', 'MITRA LAMA', '', 'catatan manual', '=A2', 'PKS-2026-0001']);
    const r1 = await sheetUpsert(e, 'PKS PJ', 'PKS-2026-0002', { 'TANGGAL': '2026-11-23', 'NAMA MITRA': 'PT BARU', 'PROGRES': 'DRAFT DI BUAT', 'KOLOM ASING': 'x' });
    assert.equal(r1.row, 3); assert.deepEqual(r1.tidak_ada, ['KOLOM ASING']);
    const baris = sheets['PKS PJ'].grid[2];
    assert.ok(baris[0] instanceof Date || Object.prototype.toString.call(baris[0]) === '[object Date]', 'tanggal jadi Date');
    assert.equal(baris[1], 'PT BARU'); assert.equal(baris[5], 'PKS-2026-0002');
    assert.ok(sheets['PKS PJ'].valid[3]?.list.includes('DONE'), 'dropdown PROGRES');
    const r2 = await sheetUpsert(e, 'PKS PJ', 'PKS-2026-0001', { 'PROGRES': 'DONE' });
    assert.equal(r2.row, 2);
    assert.deepEqual(sheets['PKS PJ'].grid[1], ['', 'MITRA LAMA', 'DONE', 'catatan manual', '=A2', 'PKS-2026-0001']);
    // judul kolom berspasi di ujung tetap cocok; nomor rekening sebagai teks
    await sheetUpsert(e, 'PKS MS & SPK MS', 'MS-2026-0001', { 'NAMA PEMILIK REKENING': 'PT X', 'NO REKENING': "'0012345" });
    assert.deepEqual(sheets['PKS MS & SPK MS'].grid[1], ['', 'PT X', '', "'0012345", 'MS-2026-0001']);
    await assert.rejects(sheetUpsert(e, 'Info Perseroan', 'x', {}), /lembar tidak diizinkan/);
  } finally { restore(); }
});

test('Word → PDF lewat Drive: konversi, ekspor, berkas sementara dibuang', async () => {
  const { g, drive } = makeGoogle(); const restore = installFetch(g); const e = env(g);
  try {
    const pdf = await docxKePdf(e, 'PKS MS.docx', new Uint8Array([80, 75, 3, 4]));
    assert.equal(Buffer.from(pdf).toString(), '%PDF-1.4 hasil');
    assert.match(drive.lastType, /^multipart\/related; boundary=/);
    assert.match(drive.lastBody, /application\/vnd.google-apps.document/);
    assert.deepEqual(drive.trashed, ['DOC1']);
  } finally { restore(); }
});

test('cekJembatan: versi baru "ok", versi lama "lama", tanpa URL "nonaktif", tanpa menulis apa pun', async () => {
  const G = makeGoogle(); G.props.KEY = 'rahasia';
  const restore = installFetch(G.g);
  try {
    const before = JSON.stringify(G.sheets);
    assert.equal((await cekJembatan(env(G.g))).status, 'ok');
    assert.equal(JSON.stringify(G.sheets), before, 'cek versi tidak mengubah spreadsheet');
  } finally { restore(); }
  const real = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: false, error: 'aksi tidak dikenal' }), { status: 200 });
  try { const r = await cekJembatan(env(null)); assert.equal(r.status, 'lama'); assert.match(r.pesan, /versi baru/); } finally { globalThis.fetch = real; }
  assert.equal((await cekJembatan({})).status, 'nonaktif');
});
