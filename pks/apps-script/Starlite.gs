/**
 * Starlite — jembatan Google (Drive + Gmail) untuk akun vendor.management@weave.co.id
 * Dipasang sebagai Web App oleh pemilik akun tersebut. Dipanggil Worker Starlite lewat POST JSON.
 *
 * Cukup satu file ini (tanpa appsscript.json). Deploy → Web app: Execute as "Me", Who has access "Anyone".
 *
 * Properti Skrip (Project Settings → Script properties):
 *   KEY               wajib  kunci rahasia, sama dengan secret APPS_SCRIPT_KEY di Worker
 *   DRIVE_ROOT_FOLDER opsional  ID folder induk Drive (bawaan: folder Starlite di bawah)
 */
const DEFAULT_ROOT = '1vJu2toTDvc6-ReOtxPgd-RP_ckBUw6dp';

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function prop_(k) { return PropertiesService.getScriptProperties().getProperty(k); }
function root_() { return prop_('DRIVE_ROOT_FOLDER') || DEFAULT_ROOT; }

function safeEq_(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// Berkas/folder hanya boleh di dalam folder induk Starlite.
function inRoot_(item) {
  const root = root_();
  let cur = [item];
  for (let depth = 0; depth < 8 && cur.length; depth++) {
    const next = [];
    for (const it of cur) {
      if (it.getId() === root) return true;
      const ps = it.getParents();
      while (ps.hasNext()) next.push(ps.next());
    }
    cur = next;
  }
  return false;
}

function ensureFolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  while (it.hasNext()) { const f = it.next(); if (!f.isTrashed()) return f; }
  return parent.createFolder(name);
}

// Gmail REST dengan token akun pemilik skrip. Tidak perlu mengaktifkan layanan lanjutan.
function gmailApi_(method, path, body) {
  const opt = { method: method, headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true };
  if (body) { opt.contentType = 'application/json'; opt.payload = JSON.stringify(body); }
  const r = UrlFetchApp.fetch('https://gmail.googleapis.com/gmail/v1/users/me' + path, opt);
  const code = r.getResponseCode();
  if (code >= 300) throw new Error('Gmail ' + code + ': ' + r.getContentText().slice(0, 200));
  return JSON.parse(r.getContentText());
}

// Jalankan sekali dari editor (pilih fungsi "izinkan" → Run) untuk memberi izin Gmail dan Drive.
// Referensi GmailApp/DriveApp di sini juga membuat Apps Script meminta izin yang dibutuhkan.
function izinkan() {
  Logger.log('Akun: ' + Session.getEffectiveUser().getEmail());
  Logger.log('Alias Gmail: ' + GmailApp.getAliases().join(', '));
  Logger.log('Folder induk: ' + DriveApp.getFolderById(root_()).getName());
  Logger.log('KEY terpasang: ' + (prop_('KEY') ? 'ya' : 'BELUM'));
}

const actions_ = {
  ping() {
    return { email: Session.getEffectiveUser().getEmail(), root: root_() };
  },

  drive_path(p) {
    if (!Array.isArray(p.segments) || p.segments.length > 6) throw new Error('segments tidak valid');
    let f = DriveApp.getFolderById(root_());
    for (const s of p.segments) {
      const name = String(s).trim();
      if (!name || name.length > 150) throw new Error('nama folder tidak valid');
      f = ensureFolder_(f, name);
    }
    return { id: f.getId() };
  },

  drive_upload(p) {
    const folder = DriveApp.getFolderById(p.folderId);
    if (!inRoot_(folder)) throw new Error('folder di luar folder induk');
    const blob = Utilities.newBlob(Utilities.base64Decode(p.b64), p.mime || 'application/octet-stream', p.name);
    return { id: folder.createFile(blob).getId() };
  },

  // Arsip final: berkas langsung di folder bernama mitra (di bawah folder induk), tanpa subfolder.
  // Bila berkas bernama sama sudah ada, dipakai ulang (aman dipanggil berulang).
  drive_arsip(p) {
    const mitra = String(p.mitra || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
    const name = String(p.name || '').trim();
    if (!mitra || !name) throw new Error('nama mitra/berkas wajib');
    const folder = ensureFolder_(DriveApp.getFolderById(root_()), mitra);
    let file = null;
    const it = folder.getFilesByName(name);
    while (it.hasNext()) { const f = it.next(); if (!f.isTrashed()) { file = f; break; } }
    if (!file) file = folder.createFile(Utilities.newBlob(Utilities.base64Decode(p.b64), p.mime || 'application/pdf', name));
    return { id: file.getId(), url: 'https://drive.google.com/file/d/' + file.getId() + '/view', folderId: folder.getId(), folderUrl: 'https://drive.google.com/drive/folders/' + folder.getId() };
  },

  drive_download(p) {
    const file = DriveApp.getFileById(p.id);
    if (!inRoot_(file)) throw new Error('berkas di luar folder induk');
    return { b64: Utilities.base64Encode(file.getBlob().getBytes()) };
  },

  // raw = pesan MIME base64url (dibuat Worker); kirim dari akun pemilik skrip.
  gmail_send(p) {
    const res = gmailApi_('post', '/messages/send', p.threadId ? { raw: p.raw, threadId: p.threadId } : { raw: p.raw });
    return { id: res.id, threadId: res.threadId };
  },

  gmail_thread(p) {
    if (!/^[0-9a-f]+$/i.test(String(p.threadId || ''))) throw new Error('threadId tidak valid');
    return gmailApi_('get', '/threads/' + p.threadId + '?format=full');
  },
};

function doPost(e) {
  try {
    const req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const key = prop_('KEY');
    if (!key || !safeEq_(String(req.key || ''), key)) return out_({ ok: false, error: 'tidak berwenang' });
    const fn = actions_[req.action];
    if (!fn) return out_({ ok: false, error: 'aksi tidak dikenal' });
    return out_({ ok: true, data: fn(req) });
  } catch (err) {
    return out_({ ok: false, error: String(err && err.message ? err.message : err).slice(0, 300) });
  }
}

// Buka URL di browser → hanya penanda hidup, tanpa data.
function doGet() { return out_({ ok: true, app: 'starlite-bridge' }); }
