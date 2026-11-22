// Inti alur perjanjian Starlite (tahap 0–7 + pasca-selesai).
import { parseEmails, now, uid, sha256Hex, randomToken, addWorkdays, addMonths, fail, uiUrl, escapeHtml } from './util.js';
import { getMitra, snapshot } from './mitra.js';
import { putFile, getFile } from './storage.js';
import { googleEnabled, driveArsip } from './google.js';
import { pageCount, stampSignature } from './pdf.js';
import { sendMail, templates, emailKirim } from './mail.js';
import { buatMaster, cetakNomor, POSISI_TTD, HALAMAN } from './template.js';

// Status internal (tetap 0–7 agar data lama aman). Pengguna melihat 5 langkah sederhana (LANGKAH).
export const TAHAP = [
  { n: 0, key: 'draf', nama: 'Draf', langkah: 0 },
  { n: 1, key: 'dikirim', nama: 'Review mitra', langkah: 1 },
  { n: 2, key: 'feedback', nama: 'Review mitra (ada catatan)', langkah: 1 },
  { n: 3, key: 'di_legal', nama: 'Nomor surat', langkah: 2 },
  { n: 4, key: 'nomor_terbit', nama: 'Nomor terbit', langkah: 2 },
  { n: 5, key: 'menunggu_ttd_mitra', nama: 'TTD mitra', langkah: 3 },
  { n: 6, key: 'ttd_mitra_diterima', nama: 'TTD PT IJE', langkah: 4 },
  { n: 7, key: 'selesai', nama: 'Selesai', langkah: 5 },
];
export const LANGKAH = [
  { n: 0, nama: 'Draf', tahap: [0] },
  { n: 1, nama: 'Review mitra', tahap: [1, 2] },
  { n: 2, nama: 'Nomor surat', tahap: [3, 4] },
  { n: 3, nama: 'TTD mitra', tahap: [5] },
  { n: 4, nama: 'TTD PT IJE', tahap: [6] },
];
const aktorDari = (u) => (typeof u === 'string' ? u : u.email);
const PIC_TAHAP = { 1: 'mitra', 2: 'vm', 3: 'legal', 4: 'vm', 5: 'mitra', 6: 'vm' };
const MAX_UPLOAD = 20 * 1024 * 1024;

export async function konfig(env) {
  const rows = (await env.DB.prepare('SELECT k, v FROM pks_konfig').all()).results;
  const k = Object.fromEntries(rows.map((r) => [r.k, r.v]));
  return {
    sla: JSON.parse(k.sla_hari_kerja || '{}'),
    formatNomor: new RegExp(k.format_nomor || '^.{3,80}$'),
    tokenHari: Number(k.token_hari || 30),
    batchAwal: JSON.parse(k.batch_awal || '[]'),
    email: { to: parseEmails(k.email_to_tambahan || ''), cc: parseEmails(k.email_cc || ''), subjek: k.email_subjek || '', badan: k.email_badan || '' },
  };
}

export async function audit(env, aktor, perjanjianId, aksi, data = null) {
  await env.DB.prepare('INSERT INTO pks_audit (waktu, aktor, perjanjian_id, aksi, data) VALUES (?,?,?,?,?)')
    .bind(now(), aktor, perjanjianId, aksi, data ? JSON.stringify(data) : null).run();
}

export async function loadP(env, id) {
  const p = await env.DB.prepare('SELECT * FROM pks_perjanjian WHERE id = ?').bind(id).first();
  if (!p) fail(404, 'Perjanjian tidak ditemukan');
  p.mitra = JSON.parse(p.snapshot_mitra);
  return p;
}

const need = (p, ...tahap) => {
  if (p.status === 'batal') fail(409, 'Perjanjian sudah dibatalkan');
  if (!tahap.includes(p.tahap)) fail(409, `Tindakan tidak sesuai tahap saat ini (${TAHAP[p.tahap].nama})`);
};

async function setTahap(env, p, tahap, aktor, catatan = null) {
  const t = now();
  const cfg = await konfig(env);
  const sla = cfg.sla[String(tahap)];
  const tenggat = sla ? addWorkdays(t, sla) : null;
  await env.DB.batch([
    env.DB.prepare('UPDATE pks_tahap SET selesai = ? WHERE perjanjian_id = ? AND selesai IS NULL').bind(t, p.id),
    env.DB.prepare('INSERT INTO pks_tahap (perjanjian_id, tahap, mulai, tenggat, pic, catatan) VALUES (?,?,?,?,?,?)')
      .bind(p.id, tahap, t, tenggat, tahap === 7 ? null : PIC_TAHAP[tahap] || 'vm', catatan),
    env.DB.prepare('UPDATE pks_perjanjian SET tahap = ?, status = ?, tenggat = ?, diperbarui_pada = ? WHERE id = ?')
      .bind(tahap, TAHAP[tahap].key, tenggat, t, p.id),
  ]);
  if (tahap === 7) await env.DB.prepare('UPDATE pks_tahap SET selesai = ? WHERE perjanjian_id = ? AND tahap = 7').bind(t, p.id).run();
  Object.assign(p, { tahap, status: TAHAP[tahap].key, tenggat });
  return tenggat;
}

function checkFile(file, kinds) {
  if (!file || typeof file === 'string') fail(400, 'Berkas wajib diunggah');
  if (file.size > MAX_UPLOAD) fail(413, 'Ukuran berkas maksimal 20 MB');
  const mime = file.type || 'application/octet-stream';
  if (!kinds.includes(mime)) fail(400, `Format berkas harus ${kinds.map((k) => k.split('/')[1].toUpperCase()).join('/')}`);
  return mime;
}

async function addDoc(env, p, { jenis, penanda = null, name, mime, bytes, aktor, status = 'aktif', halaman }) {
  const v = await env.DB.prepare('SELECT COALESCE(MAX(versi),0) + 1 AS v FROM pks_dokumen WHERE perjanjian_id = ? AND jenis = ?').bind(p.id, jenis).first();
  const sha = await sha256Hex(bytes);
  if (halaman === undefined && mime === 'application/pdf') halaman = await pageCount(bytes);
  const st = await putFile(env, { mitraNama: p.mitra.nama, kode: p.kode, jenis, name, mime, bytes });
  const doc = { id: uid('doc_'), perjanjian_id: p.id, jenis, versi: v.v, penanda, nama: name, mime, ukuran: bytes.length, halaman: halaman ?? null, sha256: sha, ...st, status, pengunggah: aktor, dibuat_pada: now() };
  await env.DB.prepare('INSERT INTO pks_dokumen (id, perjanjian_id, jenis, versi, penanda, nama, mime, ukuran, halaman, sha256, storage, storage_id, status, pengunggah, dibuat_pada) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(doc.id, doc.perjanjian_id, doc.jenis, doc.versi, doc.penanda, doc.nama, doc.mime, doc.ukuran, doc.halaman, doc.sha256, doc.storage, doc.storage_id, doc.status, doc.pengunggah, doc.dibuat_pada).run();
  await audit(env, aktor, p.id, 'dokumen_diunggah', { dokumen: doc.id, jenis, versi: doc.versi, penanda, sha256: sha });
  return doc;
}

export async function latestDoc(env, pid, jenis, status = 'aktif') {
  return env.DB.prepare('SELECT * FROM pks_dokumen WHERE perjanjian_id = ? AND jenis = ? AND status = ? ORDER BY versi DESC LIMIT 1').bind(pid, jenis, status).first();
}

/** Baca berkas dan verifikasi integritas; bila hash beda, tandai "tidak_sesuai". */
export async function readDoc(env, doc) {
  const bytes = await getFile(env, doc);
  if ((await sha256Hex(bytes)) !== doc.sha256) {
    await env.DB.prepare("UPDATE pks_dokumen SET status = 'tidak_sesuai' WHERE id = ?").bind(doc.id).run();
    await audit(env, 'sistem', doc.perjanjian_id, 'dokumen_tidak_sesuai', { dokumen: doc.id });
    fail(409, 'Berkas di penyimpanan berubah di luar Starlite dan ditandai tidak sesuai');
  }
  return bytes;
}

export async function issueToken(env, pid, tujuan) {
  const cfg = await konfig(env);
  const raw = randomToken();
  const exp = new Date(Date.now() + cfg.tokenHari * 86400_000).toISOString();
  await env.DB.batch([
    env.DB.prepare(tujuan === 'legal' ? "UPDATE pks_token SET dicabut = 1 WHERE perjanjian_id = ? AND tujuan = 'legal'" : "UPDATE pks_token SET dicabut = 1 WHERE perjanjian_id = ? AND tujuan != 'legal'").bind(pid),
    env.DB.prepare('INSERT INTO pks_token (token_hash, perjanjian_id, tujuan, kedaluwarsa, dibuat_pada) VALUES (?,?,?,?,?)').bind(await sha256Hex(raw), pid, tujuan, exp, now()),
  ]);
  return raw;
}
export const legalUrl = (env, raw) => `${env.APP_URL}/legal.html#t=${raw}`;
const portalUrl = (env, raw) => `${env.APP_URL}/portal.html#t=${raw}`;

export async function resolveToken(env, raw) {
  if (!raw || raw.length < 20) fail(401, 'Tautan tidak valid');
  const t = await env.DB.prepare('SELECT * FROM pks_token WHERE token_hash = ?').bind(await sha256Hex(raw)).first();
  if (!t || t.dicabut) fail(401, 'Tautan sudah tidak berlaku. Gunakan tautan terbaru dari email kami.');
  if (t.kedaluwarsa < now()) fail(401, 'Tautan kedaluwarsa. Hubungi Vendor Management untuk tautan baru.');
  return { token: t, p: await loadP(env, t.perjanjian_id) };
}

async function refreshSnapshot(env, p) {
  const m = await getMitra(env, p.mitra_row);
  if (!m.emails.length) fail(422, `Email ${m.nama} kosong di info perseroan. Lengkapi dulu di Cloudflare (tabel mitra).`);
  p.mitra = snapshot(m);
  await env.DB.prepare('UPDATE pks_perjanjian SET snapshot_mitra = ? WHERE id = ?').bind(JSON.stringify(p.mitra), p.id).run();
  return p.mitra;
}

async function bytesOf(file) { return new Uint8Array(await file.arrayBuffer()); }

// ---------------- Tahap 0: buat ----------------
export async function create(env, user, form) {
  const mitraRow = Number(form.get('mitra_row'));
  const jenis = String(form.get('jenis') || 'PKS');
  const judul = String(form.get('judul') || '').trim();
  if (!mitraRow) fail(400, 'Pilih mitra');
  if (judul.length < 3) fail(400, 'Judul perjanjian wajib diisi');
  const j = await env.DB.prepare('SELECT * FROM pks_jenis WHERE kode = ?').bind(jenis).first();
  if (!j) fail(400, 'Jenis perjanjian tidak dikenal');
  let isi;
  try { isi = JSON.parse(String(form.get('isi') || '{}')); } catch { fail(400, 'Isian dokumen tidak valid'); }
  const { bytes: masterBytes, isian } = await buatMaster(isi); // hanya isian kuning; sisanya terkunci pada template
  const m = await getMitra(env, mitraRow);
  const t = now();
  const seq = await env.DB.prepare("SELECT COUNT(*) + 1 AS n FROM pks_perjanjian WHERE substr(dibuat_pada,1,4) = ?").bind(t.slice(0, 4)).first();
  const kode = `${jenis}-${t.slice(0, 4)}-${String(seq.n).padStart(4, '0')}`;
  const p = { id: uid('pks_'), kode, mitra_row: mitraRow, mitra: snapshot(m), jenis, judul, pic_vm: user.email };
  await env.DB.prepare('INSERT INTO pks_perjanjian (id, kode, mitra_row, snapshot_mitra, jenis, judul, tahap, status, pic_vm, dibuat_pada, diperbarui_pada) VALUES (?,?,?,?,?,?,0,?,?,?,?)')
    .bind(p.id, kode, mitraRow, JSON.stringify(p.mitra), jenis, judul, 'draf', user.email, t, t).run();
  await env.DB.prepare('INSERT INTO pks_tahap (perjanjian_id, tahap, mulai, pic) VALUES (?,0,?,?)').bind(p.id, t, 'vm').run();
  await audit(env, user.email, p.id, 'perjanjian_dibuat', { kode, mitra_row: mitraRow, jenis, isian });
  await addDoc(env, p, { jenis: 'master', name: `${kode} Master.pdf`, mime: 'application/pdf', bytes: masterBytes, aktor: user.email, halaman: HALAMAN });
  return p.id;
}

// ---------------- Isian kuning (satu-satunya bagian dokumen yang dapat diubah) ----------------
/** Isian terakhir yang tertanam di dokumen master (dari jejak audit), termasuk tanggal asli. */
export async function isianTerkini(env, id) {
  const r = await env.DB.prepare("SELECT data FROM pks_audit WHERE perjanjian_id = ? AND aksi IN ('perjanjian_dibuat','isian_diubah') ORDER BY id DESC LIMIT 1").bind(id).first();
  const isian = r ? JSON.parse(r.data || '{}').isian : null;
  if (!isian) fail(404, 'Isian dokumen tidak ditemukan');
  return { ...isian, tanggal: `2026-${isian.mm}-${isian.dd}` };
}

/** Buat ulang dokumen master dari template dengan isian baru (versi baru). Hanya sebelum nomor surat terbit. */
export async function ubahIsian(env, p, isi, aktor, sumber) {
  need(p, 0, 1, 2);
  const lama = await isianTerkini(env, p.id);
  const { bytes, isian } = await buatMaster(isi);
  const berubah = Object.keys(isian).filter((k) => isian[k] !== lama[k] && k !== 'tanggal');
  if (!berubah.length) fail(400, 'Tidak ada isian yang berubah');
  await addDoc(env, p, { jenis: 'master', name: `${p.kode} Master.pdf`, mime: 'application/pdf', bytes, aktor, halaman: HALAMAN });
  await audit(env, aktor, p.id, 'isian_diubah', { isian, berubah, sumber });
  if (sumber === 'mitra') {
    const pic = await env.DB.prepare('SELECT email FROM pks_pengguna WHERE email = ? AND aktif = 1').bind(p.pic_vm).first();
    if (pic) await sendMail(env, { perjanjianId: p.id, tipe: 'isian', to: [pic.email], subject: `[Starlite] ${p.mitra.nama} memperbarui isian dokumen`, html: `<p>${escapeHtml(p.mitra.nama)} memperbarui isian dokumen perjanjian ${escapeHtml(p.kode)} melalui aplikasi: ${berubah.map(escapeHtml).join(', ')}. Dokumen master versi baru sudah dibuat. Periksa di: ${escapeHtml(uiUrl(env))}/#/pks/perjanjian/${escapeHtml(p.id)}</p>` }).catch(() => {});
  }
  return { berubah };
}

// ---------------- Tahap 1: kirim ----------------
export async function kirim(env, user, id) {
  const p = await loadP(env, id);
  need(p, 0);
  const m = await refreshSnapshot(env, p);
  const master = await latestDoc(env, id, 'master');
  const bytes = await readDoc(env, master);
  const cfg0 = await konfig(env);
  const tenggat = addWorkdays(now(), cfg0.sla['1'] || 5);
  const raw = await issueToken(env, id, 'feedback');
  const cfg = cfg0;
  const tpl = emailKirim({ p, m, tenggat, url: portalUrl(env, raw) }, cfg.email);
  const to = [...new Set([...m.emails, ...cfg.email.to])];
  const res = await sendMail(env, { perjanjianId: id, tipe: 'kirim', to, cc: cfg.email.cc.filter((x) => !to.includes(x)), ...tpl, attachments: [{ name: master.nama, mime: 'application/pdf', bytes }] });
  await env.DB.prepare('UPDATE pks_perjanjian SET gmail_thread_id = ?, gmail_last_check = ? WHERE id = ?').bind(res.threadId, now(), id).run();
  await setTahap(env, p, 1, user.email);
  await audit(env, user.email, id, 'dikirim_ke_mitra', { penerima: m.emails, mode: res.mode });
  return { mode: res.mode, portal: env.APP_ENV === 'dev' ? portalUrl(env, raw) : undefined };
}

// ---------------- Tahap 2: feedback ----------------
async function putaran(env, id) {
  return (await env.DB.prepare('SELECT COUNT(*) + 1 AS n FROM pks_feedback WHERE perjanjian_id = ?').bind(id).first()).n;
}
export async function addFeedback(env, p, { sumber, pengirim, isi, setuju, extId = null, at = now() }, aktor) {
  need(p, 1, 2);
  isi = String(isi || '').trim();
  if (!setuju && isi.length < 3) fail(400, 'Isi tanggapan wajib diisi');
  const fid = uid('fb_');
  await env.DB.prepare('INSERT INTO pks_feedback (id, perjanjian_id, putaran, sumber, pengirim, isi, setuju, ext_id, diterima_pada) VALUES (?,?,?,?,?,?,?,?,?)')
    .bind(fid, p.id, await putaran(env, p.id), sumber, pengirim || null, isi || 'Setuju tanpa catatan', setuju ? 1 : 0, extId, at).run();
  await audit(env, aktor, p.id, 'feedback_diterima', { sumber, setuju: !!setuju });
  if (p.tahap === 1) await setTahap(env, p, 2, aktor, setuju ? 'Mitra setuju tanpa catatan' : 'Feedback diterima');
  if (setuju) await keLegal(env, aktor, p.id); // mitra setuju: langsung ke Legal
  return fid;
}

// ---------------- Tahap 3: ke Legal ----------------
export async function keLegal(env, user, id) {
  const aktor = aktorDari(user);
  const p = await loadP(env, id);
  need(p, 1, 2);
  const tenggat = await setTahap(env, p, 3, aktor);
  const legal = (await env.DB.prepare("SELECT email FROM pks_pengguna WHERE peran = 'legal' AND aktif = 1").all()).results.map((r) => r.email);
  if (legal.length) {
    const raw = await issueToken(env, id, 'legal');
    await sendMail(env, { perjanjianId: id, tipe: 'legal', to: legal, ...templates.legal({ p, m: p.mitra, tenggat, url: legalUrl(env, raw) }) }).catch(() => {});
  }
  await audit(env, aktor, id, 'diserahkan_ke_legal', { legal });
}

// ---------------- Tahap 4: nomor surat ----------------
export async function terbitNomor(env, user, id, form) {
  const p = await loadP(env, id);
  need(p, 3);
  const nomor = String(form.get('nomor_surat') || '').trim();
  const cfg = await konfig(env);
  if (!cfg.formatNomor.test(nomor)) fail(400, 'Format nomor surat tidak sesuai ketentuan Legal');
  const dup = await env.DB.prepare('SELECT kode FROM pks_perjanjian WHERE nomor_surat = ? AND id != ?').bind(nomor, id).first();
  if (dup) fail(409, `Nomor surat sudah dipakai perjanjian ${dup.kode}`);
  // Nomor dicetak otomatis pada kolom "No." di dokumen master; dokumen tidak dapat diganti.
  const master = await latestDoc(env, id, 'master');
  if (!master) fail(409, 'Dokumen master belum tersedia');
  const bytes = await cetakNomor(await readDoc(env, master), nomor);
  const hal = await pageCount(bytes);
  await env.DB.prepare('UPDATE pks_perjanjian SET nomor_surat = ?, diperbarui_pada = ? WHERE id = ?').bind(nomor, now(), id).run();
  p.nomor_surat = nomor;
  await addDoc(env, p, { jenis: 'bernomor', name: `${p.kode} Bernomor.pdf`, mime: 'application/pdf', bytes, aktor: user.email, halaman: hal });
  await setTahap(env, p, 4, user.email, `Nomor ${nomor}`);
  await audit(env, user.email, id, 'nomor_terbit', { nomor_surat: nomor });
  const pic = await env.DB.prepare('SELECT email FROM pks_pengguna WHERE email = ?').bind(p.pic_vm).first();
  await kabarLegal(env, p, 'nomor');
  // Langsung dibagikan ke mitra untuk TTD. Bila gagal (mis. email mitra kosong), VM dapat mengirim ulang dari aplikasi.
  try { return { otomatis: true, ...(await bagikan(env, user, id)) }; }
  catch (e) {
    if (pic) await sendMail(env, { perjanjianId: id, tipe: 'nomor', to: [pic.email], ...templates.nomor({ p, m: p.mitra, appUrl: uiUrl(env) }) }).catch(() => {});
    return { otomatis: false, galat: e.message };
  }
}

// ---------------- Tahap 5: bagikan ----------------
export async function bagikan(env, user, id) {
  const aktor = aktorDari(user);
  const p = await loadP(env, id);
  need(p, 4);
  const m = await refreshSnapshot(env, p);
  const doc = await latestDoc(env, id, 'bernomor');
  const bytes = await readDoc(env, doc);
  const tenggat = addWorkdays(now(), (await konfig(env)).sla['5'] || 5);
  const raw = await issueToken(env, id, 'ttd');
  const tpl = templates.bagikan({ p, m, tenggat, url: portalUrl(env, raw) });
  const res = await sendMail(env, { perjanjianId: id, tipe: 'bagikan', to: m.emails, ...tpl, attachments: [{ name: `Perjanjian ${p.nomor_surat}.pdf`.replace(/[\\/]/g, '-'), mime: 'application/pdf', bytes }], threadId: p.gmail_thread_id });
  await setTahap(env, p, 5, aktor);
  await audit(env, aktor, id, 'dibagikan_ke_mitra', { mode: res.mode });
  return { mode: res.mode, portal: env.APP_ENV === 'dev' ? portalUrl(env, raw) : undefined };
}

// ---------------- Tahap 6 & 7: tanda tangan ----------------
async function posisi(env, p, pihak) {
  const j = await env.DB.prepare('SELECT masa_bulan FROM pks_jenis WHERE kode = ?').bind(p.jenis).first();
  return { pos: POSISI_TTD[pihak], masa: j.masa_bulan };
}
async function sumberTtd(env, p, pihak) {
  const doc = pihak === 'mitra' ? await latestDoc(env, p.id, 'bernomor') : await latestDoc(env, p.id, 'ttd_mitra');
  if (!doc) fail(409, 'Dokumen sumber tanda tangan belum tersedia');
  return doc;
}

/** Opsi 1: tempel gambar TTD. Mengembalikan bytes PDF (untuk pratinjau atau disimpan). */
export async function tempelTtd(env, p, pihak, file) {
  const mime = checkFile(file, ['image/png', 'image/jpeg']);
  const src = await sumberTtd(env, p, pihak);
  const { pos } = await posisi(env, p, pihak);
  return { bytes: await stampSignature(await readDoc(env, src), await bytesOf(file), mime, pos), halaman: src.halaman };
}

export async function unggahTtdMitra(env, p, opsi, file, aktor, olehVm) {
  need(p, 5);
  let bytes, penanda, halaman;
  if (opsi === '1') {
    ({ bytes, halaman } = await tempelTtd(env, p, 'mitra', file));
    penanda = 'hasil_tempel';
  } else if (opsi === '2') {
    checkFile(file, ['application/pdf']);
    bytes = await bytesOf(file);
    halaman = await pageCount(bytes);
    const ref = await latestDoc(env, p.id, 'bernomor');
    if (ref?.halaman && halaman !== ref.halaman) fail(422, `Jumlah halaman scan (${halaman}) berbeda dengan dokumen bernomor (${ref.halaman}). Pastikan semua halaman ikut dipindai.`);
    penanda = 'scan_asli';
  } else fail(400, 'Pilih opsi tanda tangan');
  await env.DB.prepare("UPDATE pks_dokumen SET status = 'ditolak' WHERE perjanjian_id = ? AND jenis = 'ttd_mitra' AND status = 'menunggu_review'").bind(p.id).run();
  const doc = await addDoc(env, p, { jenis: 'ttd_mitra', penanda, name: `${p.kode} TTD Mitra.pdf`, mime: 'application/pdf', bytes, aktor, halaman, status: olehVm ? 'aktif' : 'menunggu_review' });
  if (olehVm) await setTahap(env, p, 6, aktor, 'TTD mitra diunggah VM');
  return doc.id;
}

export async function reviewTtdMitra(env, user, id, { setuju, alasan }) {
  const p = await loadP(env, id);
  need(p, 5);
  const doc = await latestDoc(env, id, 'ttd_mitra', 'menunggu_review');
  if (!doc) fail(409, 'Belum ada unggahan TTD mitra untuk diperiksa');
  if (setuju) {
    await env.DB.prepare("UPDATE pks_dokumen SET status = 'aktif' WHERE id = ?").bind(doc.id).run();
    await setTahap(env, p, 6, user.email, 'TTD mitra disetujui');
    await audit(env, user.email, id, 'ttd_mitra_disetujui', { dokumen: doc.id });
  } else {
    if (!alasan || alasan.trim().length < 5) fail(400, 'Tuliskan alasan penolakan agar mitra dapat memperbaiki');
    await env.DB.prepare("UPDATE pks_dokumen SET status = 'ditolak' WHERE id = ?").bind(doc.id).run();
    const raw = await issueToken(env, id, 'ttd');
    await sendMail(env, { perjanjianId: id, tipe: 'ttd_ditolak', to: p.mitra.emails, ...templates.ttd_ditolak({ p, m: p.mitra, alasan, url: portalUrl(env, raw) }), threadId: p.gmail_thread_id });
    await audit(env, user.email, id, 'ttd_mitra_ditolak', { dokumen: doc.id, alasan });
    return { portal: env.APP_ENV === 'dev' ? portalUrl(env, raw) : undefined };
  }
}

export async function ttdIje(env, user, id, form, ctx) {
  if (!user.penandatangan && user.peran !== 'admin') fail(403, 'Hanya penandatangan berwenang PT IJE yang dapat mengunggah TTD');
  const p = await loadP(env, id);
  need(p, 6);
  const opsi = String(form.get('opsi'));
  const file = form.get('berkas');
  let bytes, penanda, halaman;
  if (opsi === '1') { ({ bytes, halaman } = await tempelTtd(env, p, 'ije', file)); penanda = 'hasil_tempel'; }
  else if (opsi === '2') {
    checkFile(file, ['application/pdf']);
    bytes = await bytesOf(file);
    halaman = await pageCount(bytes);
    const ref = await latestDoc(env, id, 'bernomor');
    if (ref?.halaman && halaman !== ref.halaman) fail(422, `Jumlah halaman scan (${halaman}) berbeda dengan dokumen bernomor (${ref.halaman})`);
    penanda = 'scan_asli';
  } else fail(400, 'Pilih opsi tanda tangan');
  const efektif = String(form.get('tgl_efektif') || '').trim() || new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(efektif)) fail(400, 'Tanggal efektif tidak valid');
  const { masa } = await posisi(env, p, 'ije');
  const bulan = Number(form.get('masa_bulan') || masa);
  const berakhir = addMonths(efektif, bulan);
  const doc = await addDoc(env, p, { jenis: 'final', penanda, name: `${p.kode} Final ${p.nomor_surat}.pdf`.replace(/[\\/]/g, '-'), mime: 'application/pdf', bytes, aktor: user.email, halaman });
  await env.DB.prepare('UPDATE pks_perjanjian SET tgl_efektif = ?, tgl_berakhir = ? WHERE id = ?').bind(efektif, berakhir, id).run();
  Object.assign(p, { tgl_efektif: efektif, tgl_berakhir: berakhir });
  await setTahap(env, p, 7, user.email, 'Ditandatangani kedua pihak');
  await env.DB.prepare('UPDATE pks_token SET dicabut = 1 WHERE perjanjian_id = ?').bind(id).run();
  await audit(env, user.email, id, 'perjanjian_selesai', { dokumen: doc.id, tgl_efektif: efektif, tgl_berakhir: berakhir });
  // Arsip Drive dan email ke mitra berjalan di latar belakang agar penandatangan tidak menunggu.
  const arsip = arsipkan(env, user.email, p, doc, bytes).catch((e) => audit(env, 'sistem', id, 'arsip_gagal', { galat: e.message }));
  if (ctx?.waitUntil) ctx.waitUntil(arsip); else await arsip;
  const surel = sendMail(env, { perjanjianId: id, tipe: 'final', to: p.mitra.emails, ...templates.final({ p, m: p.mitra }), attachments: [{ name: doc.nama, mime: 'application/pdf', bytes }], threadId: p.gmail_thread_id })
    .catch((e) => audit(env, 'sistem', id, 'email_final_gagal', { galat: e.message }));
  const kabar = arsip.then(() => kabarLegal(env, p, 'final'));
  if (ctx?.waitUntil) { ctx.waitUntil(surel); ctx.waitUntil(kabar); } else { await surel; await kabar; }
  return doc.id;
}


// Arsip final: hanya dokumen yang sudah ditandatangani kedua pihak. Disalin ke folder bernama mitra
// (langsung berkas, tanpa subfolder) dan tautannya membuka berkas itu. Gagal arsip tidak menggagalkan tahap.
export async function arsipkan(env, aktor, p, doc, bytes) {
  if (!googleEnabled(env)) return null;
  const nama = String(doc.nama).replace(/[\\/:*?"<>|]+/g, ' ').trim();
  const r = await driveArsip(env, p.mitra.nama, nama, 'application/pdf', bytes);
  await env.DB.prepare('UPDATE pks_perjanjian SET arsip_url = ?, arsip_folder_url = ? WHERE id = ?').bind(r.url, r.folderUrl, p.id).run();
  Object.assign(p, { arsip_url: r.url, arsip_folder_url: r.folderUrl });
  await audit(env, aktor, p.id, 'diarsipkan', { berkas: r.id, folder: r.folderId });
  return r;
}

// Kabar perkembangan perjanjian untuk Legal (email, tanpa login).
export async function kabarLegal(env, p, kejadian) {
  const legal = (await env.DB.prepare("SELECT email FROM pks_pengguna WHERE peran = 'legal' AND aktif = 1").all()).results.map((r) => r.email);
  if (!legal.length) return;
  await sendMail(env, { perjanjianId: p.id, tipe: 'legal_update', to: legal, ...templates.legalUpdate({ p, m: p.mitra, kejadian }) }).catch(() => {});
}

export async function arsipUlang(env, user, id) {
  const p = await loadP(env, id);
  if (p.tahap !== 7 || p.status === 'batal') fail(409, 'Hanya perjanjian yang sudah ditandatangani kedua pihak yang diarsipkan');
  const doc = await latestDoc(env, id, 'final');
  if (!doc) fail(404, 'Dokumen final tidak ditemukan');
  const r = await arsipkan(env, user.email, p, doc, await readDoc(env, doc));
  if (!r) fail(500, 'Kredensial Google Drive belum dipasang');
  return { arsip_url: r.url, arsip_folder_url: r.folderUrl };
}

// ---------------- Kirim sekaligus (Inner City) ----------------
// Membuat draf + mengirim ke mitra memakai format email di Pengaturan. Diproses per kelompok kecil agar tidak melewati batas waktu Worker.
// Isian yang tidak ada di info perseroan (domisili, jabatan) diisi "-"/"Direktur"; mitra melengkapinya lewat tautan (bagian kuning).
export async function kirimMitra(env, user, { rows = null, batas = 4, lewati = [] } = {}) {
  const skip = new Set((Array.isArray(lewati) ? lewati : []).map(Number));
  const sudah = new Set((await env.DB.prepare("SELECT DISTINCT mitra_row FROM pks_perjanjian WHERE status != 'batal'").all()).results.map((r) => r.mitra_row));
  // Dengan `rows`: mitra mana pun di info perseroan (urutan dipertahankan). Tanpa `rows`: seluruh Inner City.
  const target = Array.isArray(rows)
    ? [...new Set(rows.map(Number).filter(Boolean))].map((r) => ({ source_row: r, nama_acuan: '' })).filter((r) => !sudah.has(r.source_row) && !skip.has(r.source_row))
    : (await env.DB.prepare("SELECT source_row, nama_acuan FROM pks_mitra_kelompok WHERE kelompok = 'inner_city' ORDER BY nama_acuan").all()).results
      .filter((r) => !sudah.has(r.source_row) && !skip.has(r.source_row));
  const kerja = target.slice(0, Math.max(1, Math.min(10, batas)));
  const hari = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  const hasil = [];
  for (const r of kerja) {
    let nama = r.nama_acuan, id = null;
    try {
      const m = await getMitra(env, r.source_row);
      nama = m.nama;
      if (!m.emails.length) fail(422, 'Email mitra kosong di info perseroan');
      const form = new FormData();
      form.set('mitra_row', String(r.source_row)); form.set('jenis', 'PKS'); form.set('judul', `Perjanjian Kerja Sama ${m.nama}`);
      form.set('isi', JSON.stringify({ tanggal: hari, nama: m.nama, domisili: '-', wakil: m.direksi || '-', jabatan: 'Direktur', alamat: m.alamat || '-', telp: m.telepon || '-', email: m.emails.join('; '), up: m.kontak_lain || '-' }));
      id = await create(env, user, form);
      await kirim(env, user, id);
      hasil.push({ row: r.source_row, nama, ok: true, id });
    } catch (e) {
      hasil.push({ row: r.source_row, nama, ok: false, id, galat: e.message });
    }
  }
  await audit(env, user.email, null, 'kirim_sekaligus', { diproses: hasil.length, gagal: hasil.filter((h) => !h.ok).length });
  const gagalRow = new Set(hasil.filter((h) => !h.ok).map((h) => h.row));
  // Yang gagal tidak dihitung "sisa" agar pengulangan di klien berhenti; dilaporkan terpisah.
  return { hasil, sisa: target.filter((x) => !kerja.includes(x) && !gagalRow.has(x.source_row)).length };
}

// ---------------- Koreksi alur ----------------
export async function mundur(env, user, id, { ke, alasan }) {
  const p = await loadP(env, id);
  ke = Number(ke);
  if (p.status === 'batal' || p.tahap === 7) fail(409, 'Perjanjian sudah final atau dibatalkan');
  if (!(ke >= 0 && ke < p.tahap)) fail(400, 'Tahap tujuan harus sebelum tahap saat ini');
  if (!alasan || alasan.trim().length < 5) fail(400, 'Alasan pengembalian wajib diisi');
  await env.DB.prepare('UPDATE pks_token SET dicabut = 1 WHERE perjanjian_id = ?').bind(id).run();
  await setTahap(env, p, ke, user.email, `Dikembalikan: ${alasan}`);
  await audit(env, user.email, id, 'tahap_dikembalikan', { ke, alasan });
}

export async function batal(env, user, id, { alasan }) {
  const p = await loadP(env, id);
  if (p.tahap === 7) fail(409, 'Perjanjian yang sudah selesai tidak dapat dibatalkan');
  if (!alasan || alasan.trim().length < 5) fail(400, 'Alasan pembatalan wajib diisi');
  const t = now();
  await env.DB.batch([
    env.DB.prepare("UPDATE pks_perjanjian SET status = 'batal', alasan_batal = ?, tenggat = NULL, diperbarui_pada = ? WHERE id = ?").bind(alasan, t, id),
    env.DB.prepare('UPDATE pks_tahap SET selesai = ? WHERE perjanjian_id = ? AND selesai IS NULL').bind(t, id),
    env.DB.prepare('UPDATE pks_token SET dicabut = 1 WHERE perjanjian_id = ?').bind(id),
  ]);
  await audit(env, user.email, id, 'perjanjian_dibatalkan', { alasan });
}

export function statusTampil(p) {
  if (p.status === 'batal') return 'batal';
  if (p.tahap === 0) return 'draf';
  if (p.tahap < 7) return p.tenggat && p.tenggat < now() ? 'terlambat' : 'berjalan';
  if (!p.tgl_berakhir) return 'aktif';
  const hari = (new Date(p.tgl_berakhir + 'T23:59:59+07:00') - Date.now()) / 86400_000;
  return hari < 0 ? 'berakhir' : hari <= 90 ? 'akan_berakhir' : 'aktif';
}

export const kirimInnerCity = kirimMitra;
