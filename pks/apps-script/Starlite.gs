/**
 * Starlite — jembatan Google (Drive + Gmail) untuk akun vendor.management@weave.co.id
 * Dipasang sebagai Web App oleh pemilik akun tersebut. Dipanggil Worker Starlite lewat POST JSON.
 *
 * Cukup satu file ini (tanpa appsscript.json). Deploy → Web app: Execute as "Me", Who has access "Anyone".
 *
 * Properti Skrip (Project Settings → Script properties):
 *   KEY               wajib  kunci rahasia, sama dengan secret APPS_SCRIPT_KEY di Worker
 *   DRIVE_ROOT_FOLDER opsional  ID folder induk Drive (bawaan: folder Starlite di bawah)
 *   SHEET_ID          opsional  ID spreadsheet data perjanjian (bawaan: VM Starlite Sheet)
 *
 * Setelah memperbarui file ini: jalankan "izinkan" sekali (izin Spreadsheet baru), lalu
 * Deploy → Manage deployments → Edit → Version: New version (URL Web App tetap).
 */
const DEFAULT_ROOT = '1vJu2toTDvc6-ReOtxPgd-RP_ckBUw6dp';
const DEFAULT_SHEET = '1xAG3if2KO1NQhi4EM9eQkJJdh_QN0GElrWxiPuRGkPU'; // VM Starlite Sheet
// Hanya lembar ini yang boleh ditulis jembatan.
const SHEET_BOLEH = ['PKS PJ', 'PKS MS & SPK MS'];
const PROGRES_LIST = ['DRAFT DI BUAT', 'REVIEW DRAFT', 'DONE EMAIL TO MITRA', 'FEEDBACK MITRA', 'REVIEW LEGAL IJE', 'NO PKS RILIS', 'PROSES SIGN MITRA', 'DONE SIGN MITRA', 'PROSES SIGN IJE', 'DONE SIGN IJE', 'DONE'];

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
  const ss = SpreadsheetApp.openById(prop_('SHEET_ID') || DEFAULT_SHEET);
  Logger.log('Spreadsheet: ' + ss.getName() + ' — lembar: ' + SHEET_BOLEH.map(function (n) { return n + (ss.getSheetByName(n) ? ' ✓' : ' (TIDAK ADA)'); }).join(', '));
}

const normKol_ = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toUpperCase();

// Ubah nilai kiriman Worker ke nilai sel: "YYYY-MM-DD" → tanggal; selain itu apa adanya.
function nilaiSel_(v) {
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) { const p = v.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
  return v == null ? '' : v;
}

// Dropdown PROGRES dipasang sekali per kolom (bila belum ada aturan validasi).
function pastikanDropdown_(sh, col) {
  const rng = sh.getRange(2, col, Math.max(sh.getMaxRows() - 1, 1), 1);
  if (rng.getDataValidation()) return;
  rng.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(PROGRES_LIST, true).setAllowInvalid(false).build());
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

  // Word → PDF: unggah sebagai Google Docs (konversi), ekspor PDF, lalu hapus berkas sementara.
  docx_pdf(p) {
    const meta = { name: '[sementara] ' + String(p.name || 'dokumen.docx').slice(0, 100), mimeType: 'application/vnd.google-apps.document', parents: [root_()] };
    const boundary = 'sl' + Utilities.getUuid().replace(/-/g, '');
    const head = '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(meta) + '\r\n--' + boundary + '\r\nContent-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document\r\n\r\n';
    const body = Utilities.newBlob(head).getBytes().concat(Utilities.base64Decode(p.b64)).concat(Utilities.newBlob('\r\n--' + boundary + '--').getBytes());
    const auth = { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() };
    const up = UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true', { method: 'post', contentType: 'multipart/related; boundary=' + boundary, payload: body, headers: auth, muteHttpExceptions: true });
    if (up.getResponseCode() >= 300) throw new Error('Konversi Word gagal (' + up.getResponseCode() + '): ' + up.getContentText().slice(0, 160));
    const id = JSON.parse(up.getContentText()).id;
    try {
      const ex = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + id + '/export?mimeType=application/pdf', { headers: auth, muteHttpExceptions: true });
      if (ex.getResponseCode() >= 300) throw new Error('Ekspor PDF gagal (' + ex.getResponseCode() + ')');
      return { b64: Utilities.base64Encode(ex.getBlob().getBytes()) };
    } finally {
      try { DriveApp.getFileById(id).setTrashed(true); } catch (e) {}
    }
  },

  // Tulis satu baris data perjanjian. Kunci = kolom "NO ID". Hanya kolom yang dikirim yang diubah (REMARK manual lain tetap).
  sheet_upsert(p) {
    const name = String(p.sheet || '');
    if (SHEET_BOLEH.indexOf(name) < 0) throw new Error('lembar tidak diizinkan: ' + name);
    const key = String(p.kunci || '').trim(); // bukan p.key (itu kunci rahasia jembatan)
    if (!key) throw new Error('kunci kosong');
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      const sh = SpreadsheetApp.openById(prop_('SHEET_ID') || DEFAULT_SHEET).getSheetByName(name);
      if (!sh) throw new Error('lembar "' + name + '" tidak ditemukan');
      const lastCol = sh.getLastColumn();
      const head = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(normKol_);
      const kunciCol = head.indexOf(normKol_(p.kolomKunci || 'NO ID')) + 1;
      if (!kunciCol) throw new Error('kolom kunci "' + (p.kolomKunci || 'NO ID') + '" tidak ada di baris judul');
      const last = sh.getLastRow();
      let row = 0;
      if (last >= 2) {
        const keys = sh.getRange(2, kunciCol, last - 1, 1).getDisplayValues();
        for (let i = 0; i < keys.length; i++) if (String(keys[i][0]).trim() === key) { row = i + 2; break; }
      }
      if (!row) {
        row = Math.max(last, 1) + 1; // baris baru setelah data terakhir
        if (row > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), 1);
      }
      const data = p.data || {};
      const tidakAda = [];
      // Satu kali tulis per baris: sel yang tidak dikirim dipertahankan (rumus tetap rumus).
      const rng = sh.getRange(row, 1, 1, lastCol);
      const vals = rng.getValues()[0], rumus = rng.getFormulas()[0];
      const out = vals.map(function (v, i) { return rumus[i] ? rumus[i] : v; });
      Object.keys(data).forEach(function (k) {
        const col = head.indexOf(normKol_(k)) + 1;
        if (!col) { tidakAda.push(k); return; }
        if (normKol_(k).indexOf('PROGRES') === 0) pastikanDropdown_(sh, col);
        out[col - 1] = nilaiSel_(data[k]);
      });
      out[kunciCol - 1] = key;
      rng.setValues([out]);
      SpreadsheetApp.flush();
      return { row: row, tidak_ada: tidakAda };
    } finally { lock.releaseLock(); }
  },

  // Hapus baris perjanjian (perjanjian dihapus dari aplikasi). Kunci = kolom "NO ID". Tidak ada baris: tidak apa-apa.
  sheet_hapus(p) {
    const name = String(p.sheet || '');
    if (SHEET_BOLEH.indexOf(name) < 0) throw new Error('lembar tidak diizinkan: ' + name);
    const key = String(p.kunci || '').trim();
    if (!key) throw new Error('kunci kosong');
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      const sh = SpreadsheetApp.openById(prop_('SHEET_ID') || DEFAULT_SHEET).getSheetByName(name);
      if (!sh) throw new Error('lembar "' + name + '" tidak ditemukan');
      const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(normKol_);
      const kunciCol = head.indexOf('NO ID') + 1;
      if (!kunciCol) throw new Error('kolom kunci "NO ID" tidak ada di baris judul');
      const last = sh.getLastRow();
      if (last < 2) return { dihapus: 0 };
      const keys = sh.getRange(2, kunciCol, last - 1, 1).getDisplayValues();
      for (let i = keys.length - 1; i >= 0; i--) if (String(keys[i][0]).trim() === key) { sh.deleteRow(i + 2); SpreadsheetApp.flush(); return { dihapus: 1, row: i + 2 }; }
      return { dihapus: 0 };
    } finally { lock.releaseLock(); }
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
