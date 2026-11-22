// Menguji apps-script/Starlite.gs (dijalankan dengan stub layanan Google) bersama klien src/lib/google.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { driveArsip, googleEnabled, drivePath, driveUpload, driveDownload, gmailSend, gmailThreadReplies } from '../src/lib/google.js';

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
  const props = { KEY: 'rahasia' };
  const g = {
    JSON, String, Array, Error, Math,
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] ?? null }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ text: t, setMimeType() { return this; } }) },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'vendor.management@weave.co.id' }) },
    DriveApp: { getFolderById: (id) => wrap(items.get(id)), getFileById: (id) => wrap(items.get(id)) },
    Utilities: {
      newBlob: (bytes, mime, name) => ({ bytes, mime, name }),
      base64Decode: (s) => [...Buffer.from(s, 'base64')],
      base64Encode: (b) => Buffer.from(b).toString('base64'),
    },
    Logger: { log() {} },
    GmailApp: { getAliases: () => [] },
    ScriptApp: { getOAuthToken: () => 'tok' },
    UrlFetchApp: { fetch: (url, opt) => {
      assert.equal(opt.headers.Authorization, 'Bearer tok');
      let code = 200, body;
      if (url.endsWith('/messages/send') && opt.method === 'post') {
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
  return { g, items, sent, threads, props };
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
