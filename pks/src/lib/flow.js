// Inti alur perjanjian Starlite (tahap 0–7 + pasca-selesai).
import { parseEmails, now, uid, sha256Hex, randomToken, addWorkdays, addMonths, fail, uiUrl, escapeHtml } from './util.js';
import { getMitra, snapshot } from './mitra.js';
import { putFile, getFile } from './storage.js';
import { googleEnabled, driveArsip, sheetHapus } from './google.js';
import { pageCount, stampSignature } from './pdf.js';
import { sendMail, templates, emailKirim } from './mail.js';
import { POSISI_TTD } from './template.js';
import { buatDraf, buatBernomor, belumLengkap, cekJenis } from './dokumen.js';
import { tandaiSheet, SHEET } from './sheet.js';

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
    env.DB.prepare("UPDATE pks_perjanjian SET tahap = ?, status = ?, tenggat = ?, sub_progres = NULL, sheet_status = 'antre', diperbarui_pada = ? WHERE id = ?")
      .bind(tahap, TAHAP[tahap].key, tenggat, t, p.id),
  ]);
  if (tahap === 7) await env.DB.prepare('UPDATE pks_tahap SET selesai = ? WHERE perjanjian_id = ? AND tahap = 7').bind(t, p.id).run();
  Object.assign(p, { tahap, status: TAHAP[tahap].key, tenggat, sub_progres: null });
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
  const snap = snapshot(m);
  const manual = p.mitra?.emails_manual;
  if (manual?.length) { snap.emails = manual; snap.emails_manual = manual; } // email tujuan yang diisi VM di halaman perjanjian
  if (!snap.emails.length) fail(422, `Email ${m.nama} kosong. Isi email tujuan di halaman perjanjian (Ubah email) atau lengkapi di Info Perseroan.`);
  p.mitra = snap;
  await env.DB.prepare('UPDATE pks_perjanjian SET snapshot_mitra = ? WHERE id = ?').bind(JSON.stringify(p.mitra), p.id).run();
  return p.mitra;
}

async function bytesOf(file) { return new Uint8Array(await file.arrayBuffer()); }

// ---------------- Tahap 0: buat ----------------
export async function create(env, user, form) {
  const mitraRow = Number(form.get('mitra_row'));
  const jenis = cekJenis(String(form.get('jenis') || 'PKS'));
  const judul = String(form.get('judul') || '').trim();
  if (!mitraRow) fail(400, 'Pilih mitra');
  if (judul.length < 3) fail(400, 'Judul perjanjian wajib diisi');
  const j = await env.DB.prepare('SELECT * FROM pks_jenis WHERE kode = ?').bind(jenis).first();
  if (!j) fail(400, 'Jenis perjanjian belum terpasang di database (jalankan migrasi 0006)');
  let isi;
  try { isi = JSON.parse(String(form.get('isi') || '{}')); } catch { fail(400, 'Isian dokumen tidak valid'); }
  const m = await getMitra(env, mitraRow);
  const draf = await buatDraf(env, jenis, isi); // hanya isian; sisa dokumen terkunci pada template
  const t = now();
  const p = { id: uid('pks_'), mitra_row: mitraRow, mitra: snapshot(m), jenis, judul, pic_vm: user.email };
  // Kode unik per jenis per tahun; ulangi bila bentrok (mis. dua pembuatan bersamaan).
  for (let coba = 0; ; coba++) {
    const seq = await env.DB.prepare('SELECT COUNT(*) + 1 + ? AS n FROM pks_perjanjian WHERE jenis = ? AND substr(dibuat_pada,1,4) = ?').bind(coba, jenis, t.slice(0, 4)).first();
    p.kode = `${jenis}-${t.slice(0, 4)}-${String(seq.n).padStart(4, '0')}`;
    try {
      await env.DB.prepare("INSERT INTO pks_perjanjian (id, kode, mitra_row, snapshot_mitra, jenis, judul, tahap, status, pic_vm, sheet_status, dibuat_pada, diperbarui_pada) VALUES (?,?,?,?,?,?,0,?,?,'antre',?,?)")
        .bind(p.id, p.kode, mitraRow, JSON.stringify(p.mitra), jenis, judul, 'draf', user.email, t, t).run();
      break;
    } catch (e) { if (coba >= 5 || !/UNIQUE/i.test(String(e.message))) throw e; }
  }
  await env.DB.prepare('INSERT INTO pks_tahap (perjanjian_id, tahap, mulai, pic) VALUES (?,0,?,?)').bind(p.id, t, 'vm').run();
  await audit(env, user.email, p.id, 'perjanjian_dibuat', { kode: p.kode, mitra_row: mitraRow, jenis, isian: draf.isian });
  await addDoc(env, p, { jenis: 'master', name: `${p.kode} Master.pdf`, mime: 'application/pdf', bytes: draf.bytes, aktor: user.email, halaman: draf.halaman });
  return p.id;
}

// ---------------- Isian kuning (satu-satunya bagian dokumen yang dapat diubah) ----------------
/** Isian terakhir yang tertanam di dokumen master (dari jejak audit), termasuk tanggal asli. */
export async function isianTerkini(env, id) {
  const r = await env.DB.prepare("SELECT data FROM pks_audit WHERE perjanjian_id = ? AND aksi IN ('perjanjian_dibuat','isian_diubah') ORDER BY id DESC LIMIT 1").bind(id).first();
  const isian = r ? JSON.parse(r.data || '{}').isian : null;
  if (!isian) fail(404, 'Isian dokumen tidak ditemukan');
  return isian.tanggal ? isian : { ...isian, tanggal: `2026-${isian.mm}-${isian.dd}` };
}

/** Buat ulang dokumen master dari template dengan isian baru (versi baru). Hanya sebelum nomor surat terbit. */
export async function ubahIsian(env, p, isi, aktor, sumber) {
  need(p, 0, 1, 2);
  const lama = await isianTerkini(env, p.id);
  const { bytes, isian, halaman } = await buatDraf(env, p.jenis, { ...lama, ...isi });
  const berubah = Object.keys(isian).filter((k) => isian[k] !== lama[k] && (p.jenis === 'MS' || k !== 'tanggal'));
  if (!berubah.length) fail(400, 'Tidak ada isian yang berubah');
  await addDoc(env, p, { jenis: 'master', name: `${p.kode} Master.pdf`, mime: 'application/pdf', bytes, aktor, halaman });
  await audit(env, aktor, p.id, 'isian_diubah', { isian, berubah, sumber });
  await env.DB.prepare("UPDATE pks_perjanjian SET sheet_status = 'antre', diperbarui_pada = ? WHERE id = ?").bind(now(), p.id).run();
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
  if (setuju) {
    // Cek kelengkapan sebelum mencatat persetujuan, agar persetujuan yang ditolak tidak meninggalkan jejak/tahap setengah jalan.
    const kurang = belumLengkap(p.jenis, await isianTerkini(env, p.id));
    if (kurang.length) fail(422, `Data dokumen belum lengkap: ${kurang.join(', ')}. Lengkapi dulu sebelum menyetujui.`);
  }
  const fid = uid('fb_');
  await env.DB.prepare('INSERT INTO pks_feedback (id, perjanjian_id, putaran, sumber, pengirim, isi, setuju, ext_id, diterima_pada) VALUES (?,?,?,?,?,?,?,?,?)')
    .bind(fid, p.id, await putaran(env, p.id), sumber, pengirim || null, isi || 'Setuju tanpa catatan', setuju ? 1 : 0, extId, at).run();
  await audit(env, aktor, p.id, 'feedback_diterima', { sumber, setuju: !!setuju });
  if (p.tahap === 1) await setTahap(env, p, 2, aktor, setuju ? 'Mitra setuju tanpa catatan' : 'Feedback diterima');
  else await tandaiSheet(env, p.id);
  if (setuju) { // mitra setuju: langsung ke Legal. Bila daftar Legal kosong, persetujuan tetap tercatat dan VM meneruskan nanti.
    try { await keLegal(env, aktor, p.id); }
    catch (e) { if (e.status !== 422) throw e; await audit(env, 'sistem', p.id, 'menunggu_legal', { alasan: e.message }); }
  }
  return fid;
}

// ---------------- Tahap 3: ke Legal ----------------
export async function keLegal(env, user, id) {
  const aktor = aktorDari(user);
  const p = await loadP(env, id);
  need(p, 1, 2);
  const kurang = belumLengkap(p.jenis, await isianTerkini(env, id));
  if (kurang.length) fail(422, `Data dokumen belum lengkap: ${kurang.join(', ')}. Lengkapi dulu (oleh mitra lewat tautan atau oleh VM di "Ubah isian").`);
  const legal = (await env.DB.prepare("SELECT email FROM pks_pengguna WHERE peran = 'legal' AND aktif = 1").all()).results.map((r) => r.email);
  if (!legal.length) fail(422, 'Daftar Legal masih kosong. Tambahkan email Legal di Pengaturan → Akses, lalu teruskan lagi.');
  const tenggat = await setTahap(env, p, 3, aktor);
  if (legal.length) {
    const raw = await issueToken(env, id, 'legal');
    await sendMail(env, { perjanjianId: id, tipe: 'legal', to: legal, ...templates.legal({ p, m: p.mitra, tenggat, url: legalUrl(env, raw) }) }).catch(() => {});
  }
  await audit(env, aktor, id, 'diserahkan_ke_legal', { legal });
  await kabarAdminTtd(env, p, 'legal');
}

// ---------------- Tahap 4: nomor surat ----------------
export async function terbitNomor(env, user, id, form) {
  const p = await loadP(env, id);
  need(p, 3);
  const nomor = String(form.get('nomor_surat') || '').trim();
  const nomorSpk = String(form.get('nomor_spk') || '').trim();
  const catatan = String(form.get('catatan') || '').trim().slice(0, 500);
  const cfg = await konfig(env);
  const label = p.jenis === 'MS' ? 'Nomor PKS MS' : 'Nomor surat';
  if (!cfg.formatNomor.test(nomor)) fail(400, `Format ${label.toLowerCase()} tidak sesuai ketentuan Legal`);
  const dup = await env.DB.prepare('SELECT kode FROM pks_perjanjian WHERE (nomor_surat = ? OR nomor_spk = ?) AND id != ?').bind(nomor, nomor, id).first();
  if (dup) fail(409, `${label} sudah dipakai perjanjian ${dup.kode}`);
  if (p.jenis === 'MS') {
    if (!cfg.formatNomor.test(nomorSpk)) fail(400, 'Nomor SPK MS wajib diisi sesuai ketentuan Legal');
    if (nomorSpk === nomor) fail(400, 'Nomor SPK MS harus berbeda dari nomor PKS MS');
    const dup2 = await env.DB.prepare('SELECT kode FROM pks_perjanjian WHERE (nomor_surat = ? OR nomor_spk = ?) AND id != ?').bind(nomorSpk, nomorSpk, id).first();
    if (dup2) fail(409, `Nomor SPK MS sudah dipakai perjanjian ${dup2.kode}`);
  }
  // Nomor dicetak otomatis pada dokumen; dokumen lain tidak berubah.
  const master = await latestDoc(env, id, 'master');
  if (!master) fail(409, 'Dokumen master belum tersedia');
  const isian = await isianTerkini(env, id);
  const bytes = await buatBernomor(env, p, isian, await readDoc(env, master), { nomor, nomor_spk: nomorSpk });
  const hal = await pageCount(bytes);
  await env.DB.prepare('UPDATE pks_perjanjian SET nomor_surat = ?, nomor_spk = ?, remark_legal = COALESCE(?, remark_legal), diperbarui_pada = ? WHERE id = ?')
    .bind(nomor, p.jenis === 'MS' ? nomorSpk : null, catatan || null, now(), id).run();
  Object.assign(p, { nomor_surat: nomor, nomor_spk: p.jenis === 'MS' ? nomorSpk : null, remark_legal: catatan || p.remark_legal });
  await addDoc(env, p, { jenis: 'bernomor', name: `${p.kode} Bernomor.pdf`, mime: 'application/pdf', bytes, aktor: user.email, halaman: hal });
  await setTahap(env, p, 4, user.email, p.jenis === 'MS' ? `PKS MS ${nomor}, SPK MS ${nomorSpk}` : `Nomor ${nomor}`);
  await audit(env, user.email, id, 'nomor_terbit', { nomor_surat: nomor, nomor_spk: p.nomor_spk || undefined });
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
  await kabarAdminTtd(env, p, 'siap');
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

/** Scan PDF bertanda tangan basah (atau hasil fitur Signing): semua halaman wajib ada. */
async function scanTtd(env, p, opsi, file) {
  if (opsi === '1') fail(400, 'Tanda tangan ditempel tidak dipakai lagi. Unggah scan dokumen yang ditandatangani basah (PDF), atau hasil fitur Signing.');
  if (opsi !== '2' && opsi !== 'signing') fail(400, 'Pilih cara unggah: scan tanda tangan basah atau hasil fitur Signing');
  checkFile(file, ['application/pdf']);
  const bytes = await bytesOf(file);
  const halaman = await pageCount(bytes);
  const ref = await latestDoc(env, p.id, 'bernomor');
  if (ref?.halaman && halaman !== ref.halaman) fail(422, `Jumlah halaman berkas (${halaman}) berbeda dengan dokumen bernomor (${ref.halaman}). Pastikan semua halaman ikut dipindai.`);
  return { bytes, halaman, penanda: opsi === '2' ? 'scan_asli' : null, label: opsi === 'signing' ? ' (Signing)' : '' };
}

export async function unggahTtdMitra(env, p, opsi, file, aktor, olehVm) {
  need(p, 5);
  const s = await scanTtd(env, p, opsi, file);
  await env.DB.prepare("UPDATE pks_dokumen SET status = 'ditolak' WHERE perjanjian_id = ? AND jenis = 'ttd_mitra' AND status = 'menunggu_review'").bind(p.id).run();
  const doc = await addDoc(env, p, { jenis: 'ttd_mitra', penanda: s.penanda, name: `${p.kode} TTD Mitra${s.label}.pdf`, mime: 'application/pdf', bytes: s.bytes, aktor, halaman: s.halaman, status: olehVm ? 'aktif' : 'menunggu_review' });
  if (olehVm) await setTahap(env, p, 6, aktor, opsi === 'signing' ? 'TTD mitra lewat fitur Signing' : 'Scan TTD mitra diunggah internal');
  else await kabarAdminTtd(env, p, 'masuk');
  return doc.id;
}

export async function reviewTtdMitra(env, user, id, { setuju, alasan }) {
  const aktor = aktorDari(user);
  const p = await loadP(env, id);
  need(p, 5);
  const doc = await latestDoc(env, id, 'ttd_mitra', 'menunggu_review');
  if (!doc) fail(409, 'Belum ada unggahan TTD mitra untuk diperiksa');
  if (setuju) {
    await env.DB.prepare("UPDATE pks_dokumen SET status = 'aktif' WHERE id = ?").bind(doc.id).run();
    await setTahap(env, p, 6, aktor, 'TTD mitra disetujui');
    await audit(env, aktor, id, 'ttd_mitra_disetujui', { dokumen: doc.id });
  } else {
    if (!alasan || alasan.trim().length < 5) fail(400, 'Tuliskan alasan penolakan agar mitra dapat memperbaiki');
    await env.DB.prepare("UPDATE pks_dokumen SET status = 'ditolak' WHERE id = ?").bind(doc.id).run();
    const raw = await issueToken(env, id, 'ttd');
    await sendMail(env, { perjanjianId: id, tipe: 'ttd_ditolak', to: p.mitra.emails, ...templates.ttd_ditolak({ p, m: p.mitra, alasan, url: portalUrl(env, raw) }), threadId: p.gmail_thread_id });
    await audit(env, aktor, id, 'ttd_mitra_ditolak', { dokumen: doc.id, alasan });
    return { portal: env.APP_ENV === 'dev' ? portalUrl(env, raw) : undefined };
  }
}

/** Status rinci tahap 6: dokumen sudah di penandatangan PT IJE (PROGRES "PROSES SIGN IJE"). */
export async function setSubProgres(env, user, id, nilai) {
  const aktor = aktorDari(user);
  const p = await loadP(env, id);
  need(p, 6);
  const v = nilai === 'PROSES SIGN IJE' ? nilai : null;
  await env.DB.prepare("UPDATE pks_perjanjian SET sub_progres = ?, sheet_status = 'antre', diperbarui_pada = ? WHERE id = ?").bind(v, now(), id).run();
  await audit(env, aktor, id, 'progres_ttd', { sub_progres: v || 'DONE SIGN MITRA' });
}

/** Catatan VM (REMARK / REMARK SANS di spreadsheet). */
export async function catatVm(env, user, id, teks) {
  const p = await loadP(env, id);
  const t = String(teks || '').trim().slice(0, 500);
  await env.DB.prepare("UPDATE pks_perjanjian SET remark_vm = ?, sheet_status = 'antre', diperbarui_pada = ? WHERE id = ?").bind(t || null, now(), p.id).run();
  await audit(env, aktorDari(user), id, 'catatan_vm', { catatan: t });
}

/**
 * Penyelesaian: scan dokumen bertanda tangan kedua pihak (basah) atau hasil fitur Signing.
 * Dari tahap 6; hasil Signing yang sudah memuat TTD kedua pihak juga boleh dari tahap 5 (`lengkap=1`).
 */
export async function ttdIje(env, user, id, form, ctx) {
  const boleh = user.peran === 'admin' || user.peran === 'admin_ttd' || user.penandatangan;
  if (!boleh) fail(403, 'Hanya Akun Utama atau Admin TTD yang dapat menyelesaikan penandatanganan');
  const aktor = aktorDari(user);
  const p = await loadP(env, id);
  const opsi = String(form.get('opsi'));
  const lengkap = opsi === 'signing' && String(form.get('lengkap') || '') === '1';
  need(p, ...(lengkap ? [5, 6] : [6]));
  const s = await scanTtd(env, p, opsi, form.get('berkas'));
  const efektif = String(form.get('tgl_efektif') || '').trim() || new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(efektif)) fail(400, 'Tanggal efektif tidak valid');
  const { masa } = await posisi(env, p, 'ije');
  const bulan = Number(form.get('masa_bulan') || masa);
  if (!(bulan >= 1 && bulan <= 120)) fail(400, 'Masa berlaku 1–120 bulan');
  const berakhir = addMonths(efektif, bulan);
  if (p.tahap === 5) {
    // Hasil Signing berisi TTD kedua pihak: catat juga sebagai TTD mitra agar riwayat lengkap.
    await env.DB.prepare("UPDATE pks_dokumen SET status = 'ditolak' WHERE perjanjian_id = ? AND jenis = 'ttd_mitra' AND status = 'menunggu_review'").bind(id).run();
    await addDoc(env, p, { jenis: 'ttd_mitra', penanda: null, name: `${p.kode} TTD Mitra (Signing).pdf`, mime: 'application/pdf', bytes: s.bytes, aktor, halaman: s.halaman });
    await setTahap(env, p, 6, aktor, 'TTD kedua pihak lewat fitur Signing');
  }
  const doc = await addDoc(env, p, { jenis: 'final', penanda: s.penanda, name: `${p.kode} Final ${p.nomor_surat}${s.label}.pdf`.replace(/[\\/]/g, '-'), mime: 'application/pdf', bytes: s.bytes, aktor, halaman: s.halaman });
  await env.DB.prepare('UPDATE pks_perjanjian SET tgl_efektif = ?, tgl_berakhir = ? WHERE id = ?').bind(efektif, berakhir, id).run();
  Object.assign(p, { tgl_efektif: efektif, tgl_berakhir: berakhir });
  await setTahap(env, p, 7, aktor, opsi === 'signing' ? 'Ditandatangani kedua pihak (fitur Signing)' : 'Ditandatangani basah kedua pihak');
  await env.DB.prepare('UPDATE pks_token SET dicabut = 1 WHERE perjanjian_id = ?').bind(id).run();
  await audit(env, aktor, id, 'perjanjian_selesai', { dokumen: doc.id, tgl_efektif: efektif, tgl_berakhir: berakhir, cara: opsi });
  // Arsip Drive dan email ke mitra berjalan di latar belakang agar pengguna tidak menunggu.
  const arsip = arsipkan(env, aktor, p, doc, s.bytes).catch((e) => audit(env, 'sistem', id, 'arsip_gagal', { galat: e.message }));
  if (ctx?.waitUntil) ctx.waitUntil(arsip); else await arsip;
  const surel = sendMail(env, { perjanjianId: id, tipe: 'final', to: p.mitra.emails, ...templates.final({ p, m: p.mitra }), attachments: [{ name: doc.nama, mime: 'application/pdf', bytes: s.bytes }], threadId: p.gmail_thread_id })
    .catch((e) => audit(env, 'sistem', id, 'email_final_gagal', { galat: e.message }));
  const kabar = arsip.then(() => kabarLegal(env, p, 'final'));
  if (ctx?.waitUntil) { ctx.waitUntil(surel); ctx.waitUntil(kabar); } else { await surel; await kabar; }
  return doc.id;
}

/** Kabar ke Admin TTD (email). `siap`: dokumen bernomor sudah ke mitra; `masuk`: mitra mengunggah scan. */
export async function kabarAdminTtd(env, p, kejadian) {
  const ke = (await env.DB.prepare('SELECT email FROM pks_ttd_admin WHERE aktif = 1').all()).results.map((r) => r.email);
  const pic = kejadian === 'masuk' ? (await env.DB.prepare('SELECT email FROM pks_pengguna WHERE email = ? AND aktif = 1').bind(p.pic_vm).first())?.email : null;
  const to = [...new Set([...ke, ...(pic ? [pic] : [])])];
  if (!to.length) return;
  await sendMail(env, { perjanjianId: p.id, tipe: 'ttd_admin', to, ...templates.ttd_admin({ p, m: p.mitra, kejadian, url: `${env.APP_URL}/admin-ttd.html` }) }).catch(() => {});
}


// Arsip final: hanya dokumen yang sudah ditandatangani kedua pihak. Disalin ke folder bernama mitra
// (langsung berkas, tanpa subfolder) dan tautannya membuka berkas itu. Gagal arsip tidak menggagalkan tahap.
export async function arsipkan(env, aktor, p, doc, bytes) {
  if (!googleEnabled(env)) return null;
  const nama = String(doc.nama).replace(/[\\/:*?"<>|]+/g, ' ').trim();
  const r = await driveArsip(env, p.mitra.nama, nama, 'application/pdf', bytes);
  await env.DB.prepare("UPDATE pks_perjanjian SET arsip_url = ?, arsip_folder_url = ?, sheet_status = 'antre' WHERE id = ?").bind(r.url, r.folderUrl, p.id).run();
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
export async function kirimMitra(env, user, { rows = null, batas = 4, lewati = [], jenis = 'PKS' } = {}) {
  jenis = cekJenis(jenis);
  const skip = new Set((Array.isArray(lewati) ? lewati : []).map(Number));
  const sudah = new Set((await env.DB.prepare("SELECT DISTINCT mitra_row FROM pks_perjanjian WHERE status != 'batal' AND jenis = ?").bind(jenis).all()).results.map((r) => r.mitra_row));
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
      form.set('mitra_row', String(r.source_row)); form.set('jenis', jenis);
      form.set('judul', jenis === 'MS' ? `PKS MS & SPK MS ${m.nama}` : `Perjanjian Homepass ${m.nama}`);
      form.set('isi', JSON.stringify({ tanggal: hari, tanggal_spk: hari, nama: m.nama, domisili: '-', wakil: m.direksi || '-', jabatan: 'Direktur', alamat: m.alamat || '-', telp: m.telepon || '-', email: m.emails.join('; '), up: m.kontak_lain || '-' }));
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
  await env.DB.prepare('UPDATE pks_perjanjian SET remark_vm = ? WHERE id = ?').bind(`Dikembalikan: ${alasan.trim()}`.slice(0, 500), id).run();
  await setTahap(env, p, ke, user.email, `Dikembalikan: ${alasan}`);
  await audit(env, user.email, id, 'tahap_dikembalikan', { ke, alasan });
}

export async function batal(env, user, id, { alasan }) {
  const p = await loadP(env, id);
  if (p.tahap === 7) fail(409, 'Perjanjian yang sudah selesai tidak dapat dibatalkan');
  if (!alasan || alasan.trim().length < 5) fail(400, 'Alasan pembatalan wajib diisi');
  const t = now();
  await env.DB.batch([
    env.DB.prepare("UPDATE pks_perjanjian SET status = 'batal', alasan_batal = ?, tenggat = NULL, sheet_status = 'antre', diperbarui_pada = ? WHERE id = ?").bind(alasan, t, id),
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


// ---------------- Email tujuan (disimpan di perjanjian ini saja; Info Perseroan tidak diubah) ----------------
export async function ubahEmail(env, user, id, teks) {
  const p = await loadP(env, id);
  if (p.status === 'batal' || p.tahap >= 7) fail(409, 'Perjanjian sudah selesai atau dibatalkan');
  const list = parseEmails(String(teks || ''));
  if (!list.length) fail(400, 'Isi minimal satu email yang valid');
  if (list.length > 5) fail(400, 'Maksimal 5 email');
  p.mitra.emails = list; p.mitra.emails_manual = list;
  await env.DB.prepare('UPDATE pks_perjanjian SET snapshot_mitra = ?, diperbarui_pada = ? WHERE id = ?').bind(JSON.stringify(p.mitra), now(), id).run();
  await audit(env, aktorDari(user), id, 'email_tujuan_diubah', { emails: list });
  return { emails: list };
}

// ---------------- Pengingat manual ----------------
// Tautan tambahan tanpa mencabut tautan lama (tautan di email sebelumnya tetap berlaku).
async function tokenTambahan(env, pid, tujuan) {
  const cfg = await konfig(env);
  const raw = randomToken();
  await env.DB.prepare('INSERT INTO pks_token (token_hash, perjanjian_id, tujuan, kedaluwarsa, dibuat_pada) VALUES (?,?,?,?,?)')
    .bind(await sha256Hex(raw), pid, tujuan, new Date(Date.now() + cfg.tokenHari * 86400_000).toISOString(), now()).run();
  return raw;
}
export const tautanPengingat = async (env, p) => {
  if ([1, 2].includes(p.tahap)) return portalUrl(env, await tokenTambahan(env, p.id, 'feedback'));
  if (p.tahap === 5) return portalUrl(env, await tokenTambahan(env, p.id, 'ttd'));
  if (p.tahap === 3) return legalUrl(env, await tokenTambahan(env, p.id, 'legal'));
  return null;
};
export async function ingatkan(env, user, id) {
  const aktor = aktorDari(user);
  const p = await loadP(env, id);
  if (p.status === 'batal') fail(409, 'Perjanjian sudah dibatalkan');
  if (![1, 2, 3, 5].includes(p.tahap)) fail(409, 'Pengingat hanya untuk tahap Review mitra, Nomor surat, dan TTD mitra');
  const last = await env.DB.prepare("SELECT waktu FROM pks_audit WHERE perjanjian_id = ? AND aksi = 'pengingat_manual' AND json_extract(data, '$.tahap') = ? ORDER BY id DESC LIMIT 1").bind(id, p.tahap).first();
  if (last && Date.now() - Date.parse(last.waktu) < 3600_000) fail(429, 'Pengingat baru saja dikirim. Coba lagi 1 jam lagi.');
  const telat = !!(p.tenggat && p.tenggat < now());
  const tenggat = p.tenggat || now();
  let to;
  if (p.tahap === 3) {
    to = (await env.DB.prepare("SELECT email FROM pks_pengguna WHERE peran = 'legal' AND aktif = 1").all()).results.map((r) => r.email);
    if (!to.length) fail(422, 'Daftar Legal masih kosong. Tambahkan di Pengaturan → Akses.');
    await sendMail(env, { perjanjianId: id, tipe: 'pengingat', to, ...templates.legal({ p, m: p.mitra, tenggat, url: await tautanPengingat(env, p) }) });
  } else {
    to = p.mitra.emails || [];
    if (!to.length) fail(422, 'Email tujuan mitra kosong. Isi lewat "Ubah email" dulu.');
    await sendMail(env, { perjanjianId: id, tipe: 'pengingat', to, ...templates.pengingat_mitra({ p, m: p.mitra, tenggat, telat, url: await tautanPengingat(env, p) }), threadId: p.gmail_thread_id });
  }
  await audit(env, aktor, id, 'pengingat_manual', { tahap: p.tahap, penerima: to });
  return { penerima: to };
}

// ---------------- Perpanjangan: draf baru dari perjanjian yang sudah selesai ----------------
export async function perpanjang(env, user, id) {
  const p = await loadP(env, id);
  if (p.tahap !== 7 || p.status === 'batal') fail(409, 'Perpanjangan hanya untuk perjanjian yang sudah selesai');
  const ada = await env.DB.prepare("SELECT data FROM pks_audit WHERE perjanjian_id = ? AND aksi = 'diperpanjang' ORDER BY id DESC LIMIT 1").bind(id).first();
  if (ada) {
    const baru = JSON.parse(ada.data || '{}').baru;
    const masih = baru && await env.DB.prepare("SELECT kode FROM pks_perjanjian WHERE id = ? AND status != 'batal'").bind(baru).first();
    if (masih) fail(409, `Sudah ada draf perpanjangan: ${masih.kode}`);
  }
  const isian = await isianTerkini(env, id);
  const hariIni = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  const isi = { ...isian, tanggal: hariIni, ...(p.jenis === 'MS' ? { tanggal_spk: hariIni } : {}) };
  delete isi.dd; delete isi.mm;
  const fd = new FormData();
  fd.set('mitra_row', String(p.mitra_row)); fd.set('jenis', p.jenis);
  fd.set('judul', /perpanjangan/i.test(p.judul) ? p.judul : `${p.judul} (perpanjangan)`.slice(0, 200));
  fd.set('isi', JSON.stringify(isi));
  const baru = await create(env, user, fd);
  if (p.mitra.emails_manual?.length) await ubahEmail(env, user, baru, p.mitra.emails_manual.join(', '));
  await audit(env, aktorDari(user), id, 'diperpanjang', { baru });
  await audit(env, aktorDari(user), baru, 'perpanjangan_dari', { asal: p.id, kode: p.kode, nomor: p.nomor_surat });
  return { id: baru };
}


// ---------------- Ubah data perjanjian (bukan isian dokumen) ----------------
const TGL = /^\d{4}-\d{2}-\d{2}$/;
export async function ubahData(env, user, id, b) {
  const p = await loadP(env, id);
  if (p.status === 'batal') fail(409, 'Perjanjian sudah dibatalkan');
  const ubah = {};
  if (b.judul !== undefined) {
    const j = String(b.judul || '').trim();
    if (j.length < 3 || j.length > 200) fail(400, 'Judul 3–200 karakter');
    if (j !== p.judul) ubah.judul = j;
  }
  const cfg = await konfig(env);
  for (const k of ['nomor_surat', 'nomor_spk']) {
    if (b[k] === undefined) continue;
    const v = String(b[k] || '').trim();
    if (v === (p[k] || '')) continue;
    if (p.tahap < 4) fail(409, 'Nomor surat baru bisa diubah setelah diterbitkan Legal');
    if (k === 'nomor_spk' && p.jenis !== 'MS') continue;
    if (!cfg.formatNomor.test(v)) fail(400, `Format ${k === 'nomor_spk' ? 'nomor SPK MS' : 'nomor surat'} tidak sesuai`);
    const dup = await env.DB.prepare('SELECT kode FROM pks_perjanjian WHERE (nomor_surat = ? OR nomor_spk = ?) AND id != ?').bind(v, v, id).first();
    if (dup) fail(409, `Nomor ${v} sudah dipakai perjanjian ${dup.kode}`);
    ubah[k] = v;
  }
  for (const k of ['tgl_efektif', 'tgl_berakhir']) {
    if (b[k] === undefined) continue;
    const v = String(b[k] || '').trim();
    if (v === (p[k] || '')) continue;
    if (p.tahap !== 7) fail(409, 'Masa berlaku hanya bisa diubah setelah perjanjian selesai');
    if (!TGL.test(v)) fail(400, 'Tanggal tidak valid');
    ubah[k] = v;
  }
  const ef = ubah.tgl_efektif || p.tgl_efektif, ak = ubah.tgl_berakhir || p.tgl_berakhir;
  if (ef && ak && ak < ef) fail(400, 'Tanggal berakhir tidak boleh sebelum tanggal efektif');
  const keys = Object.keys(ubah);
  if (!keys.length) fail(400, 'Tidak ada data yang berubah');
  await env.DB.prepare(`UPDATE pks_perjanjian SET ${keys.map((k) => `${k} = ?`).join(', ')}, sheet_status = 'antre', diperbarui_pada = ? WHERE id = ?`).bind(...keys.map((k) => ubah[k]), now(), id).run();
  await audit(env, aktorDari(user), id, 'data_diubah', { sebelum: Object.fromEntries(keys.map((k) => [k, p[k] ?? null])), sesudah: ubah });
  return { berubah: keys };
}

// ---------------- Hapus permanen (Akun Utama) ----------------
// Semua jejak perjanjian dihapus, termasuk baris spreadsheet (NO ID). Arsip final di Drive tidak disentuh.
// Pengaman trigger (dokumen & audit tidak boleh dihapus) dilewati hanya untuk perjanjian yang ditandai di pks_hapus.
export async function hapus(env, user, id, { konfirmasi } = {}) {
  const p = await loadP(env, id);
  if (String(konfirmasi || '').trim() !== p.kode) fail(400, `Ketik kode ${p.kode} untuk mengonfirmasi penghapusan`);
  const docs = (await env.DB.prepare('SELECT storage, storage_id FROM pks_dokumen WHERE perjanjian_id = ?').bind(id).all()).results;
  const blob = docs.filter((d) => d.storage === 'd1').map((d) => d.storage_id);
  const q = (sql, ...a) => env.DB.prepare(sql).bind(...a);
  await env.DB.batch([
    q('INSERT OR IGNORE INTO pks_hapus (perjanjian_id) VALUES (?)', id),
    ...blob.flatMap((b) => [q('DELETE FROM pks_blob_part WHERE id = ?', b), q('DELETE FROM pks_blob WHERE id = ?', b)]),
    ...['pks_tahap', 'pks_dokumen', 'pks_feedback', 'pks_email_log', 'pks_token', 'pks_pengingat', 'pks_legal_sesi', 'pks_audit'].map((t) => q(`DELETE FROM ${t} WHERE perjanjian_id = ?`, id)),
    q('DELETE FROM pks_perjanjian WHERE id = ?', id),
    q('DELETE FROM pks_hapus WHERE perjanjian_id = ?', id),
  ]);
  let sheet = 'tidak ada';
  if (googleEnabled(env)) {
    try { const r = await sheetHapus(env, SHEET[p.jenis], p.kode); sheet = r?.dihapus ? 'dihapus' : 'tidak ada'; }
    catch (e) { sheet = 'gagal: ' + String(e.message || e).slice(0, 160); }
  }
  await audit(env, aktorDari(user), null, 'perjanjian_dihapus', { kode: p.kode, jenis: p.jenis, mitra: p.mitra.nama, nomor_surat: p.nomor_surat, tahap: p.tahap, sheet });
  return { sheet };
}
