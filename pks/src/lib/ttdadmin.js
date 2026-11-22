// Admin Follow-up (dulu Admin TTD): bukan penanda tangan. Mendorong Legal memberi nomor surat dan Direktur PT IJE
// menandatangani. Masuk dengan email terdaftar + PIN 4 angka (pertama kali: + nomor HP). Melihat tahap Nomor surat s.d. TTD PT IJE.
import { hashPassword, verifyPassword } from './password.js';
import { now, fail, sha256Hex, randomToken } from './util.js';
import * as F from './flow.js';

const MAKS_GAGAL = 5, KUNCI_MENIT = 15, SESI_JAM = 8;
const normEmail = (s) => String(s || '').trim().toLowerCase();
const normHp = (s) => String(s || '').replace(/[^\d+]/g, '');
const TAHAP_TTD = [3, 4, 5, 6];

async function akun(env, email) {
  const a = await env.DB.prepare('SELECT * FROM pks_ttd_admin WHERE email = ? AND aktif = 1').bind(email).first();
  if (!a) fail(403, 'Email ini tidak terdaftar sebagai Admin Follow-up. Hubungi Vendor Management.');
  return a;
}

export async function cekEmail(env, emailIn) {
  const a = await akun(env, normEmail(emailIn));
  return { terdaftar: !!a.pin_hash, nama: a.nama };
}

export async function masuk(env, { email: emailIn, hp, pin }) {
  const email = normEmail(emailIn);
  const a = await akun(env, email);
  if (!/^\d{4}$/.test(String(pin || ''))) fail(400, 'PIN harus 4 angka');
  if (!a.pin_hash) {
    const nomor = normHp(hp);
    if (nomor.replace(/\D/g, '').length < 8) fail(400, 'Nomor HP wajib diisi untuk pendaftaran pertama');
    await env.DB.prepare('UPDATE pks_ttd_admin SET hp = ?, pin_hash = ?, gagal = 0, terkunci_sampai = NULL WHERE email = ?').bind(nomor, await hashPassword(String(pin)), email).run();
    await F.audit(env, `ttd:${email}`, null, 'admin_ttd_terdaftar', { hp: nomor });
  } else {
    if (a.terkunci_sampai && a.terkunci_sampai > now()) fail(429, 'Terlalu banyak PIN salah. Coba lagi beberapa menit lagi.');
    if (!(await verifyPassword(String(pin), a.pin_hash))) {
      const g = a.gagal + 1;
      await env.DB.prepare('UPDATE pks_ttd_admin SET gagal = ?, terkunci_sampai = ? WHERE email = ?').bind(g >= MAKS_GAGAL ? 0 : g, g >= MAKS_GAGAL ? new Date(Date.now() + KUNCI_MENIT * 60000).toISOString() : null, email).run();
      fail(401, 'PIN salah');
    }
    await env.DB.prepare('UPDATE pks_ttd_admin SET gagal = 0, terkunci_sampai = NULL WHERE email = ?').bind(email).run();
  }
  const sesi = randomToken();
  await env.DB.prepare('DELETE FROM pks_ttd_sesi WHERE kedaluwarsa < ?').bind(now()).run();
  await env.DB.prepare('INSERT INTO pks_ttd_sesi (token_hash, email, kedaluwarsa) VALUES (?,?,?)').bind(await sha256Hex(sesi), email, new Date(Date.now() + SESI_JAM * 3600_000).toISOString()).run();
  await F.audit(env, `ttd:${email}`, null, 'admin_ttd_masuk');
  return { sesi, nama: a.nama };
}

/** Sesi Admin TTD dari header x-ttd-sesi. Mengembalikan pengguna semu untuk fungsi alur. */
export async function cekSesi(env, sesi) {
  if (!sesi) fail(401, 'Silakan masuk');
  const s = await env.DB.prepare('SELECT * FROM pks_ttd_sesi WHERE token_hash = ?').bind(await sha256Hex(String(sesi))).first();
  if (!s || s.kedaluwarsa < now()) fail(401, 'Sesi berakhir. Masukkan PIN lagi.');
  const a = await akun(env, s.email);
  return { email: `ttd:${a.email}`, nama: a.nama, peran: 'admin_ttd', penandatangan: 0 };
}

export async function keluar(env, sesi) {
  if (sesi) await env.DB.prepare('DELETE FROM pks_ttd_sesi WHERE token_hash = ?').bind(await sha256Hex(String(sesi))).run();
}

export async function daftar(env) {
  const rows = (await env.DB.prepare(`SELECT id, kode, jenis, judul, snapshot_mitra, nomor_surat, nomor_spk, tahap, sub_progres, tenggat, diperbarui_pada FROM pks_perjanjian
    WHERE status != 'batal' AND tahap IN (${TAHAP_TTD.join(',')}) ORDER BY tenggat IS NULL, tenggat LIMIT 300`).all()).results;
  const review = new Set((await env.DB.prepare("SELECT DISTINCT perjanjian_id FROM pks_dokumen WHERE jenis = 'ttd_mitra' AND status = 'menunggu_review'").all()).results.map((r) => r.perjanjian_id));
  return rows.map((p) => ({ ...p, snapshot_mitra: undefined, mitra: JSON.parse(p.snapshot_mitra).nama, menunggu_review: review.has(p.id), tahap_nama: F.TAHAP[p.tahap].nama }));
}

async function pTtd(env, id) {
  const p = await F.loadP(env, id);
  if (p.status === 'batal' || !TAHAP_TTD.includes(p.tahap)) fail(403, 'Perjanjian ini tidak sedang menunggu nomor surat atau tanda tangan');
  return p;
}

export async function detail(env, id) {
  const p = await pTtd(env, id);
  const docs = (await env.DB.prepare("SELECT id, jenis, versi, nama, halaman, status, dibuat_pada FROM pks_dokumen WHERE perjanjian_id = ? AND jenis IN ('bernomor','ttd_mitra') ORDER BY dibuat_pada DESC").bind(id).all()).results;
  const legal = p.tahap === 3 ? (await env.DB.prepare("SELECT nama, email FROM pks_pengguna WHERE peran = 'legal' AND aktif = 1 ORDER BY nama").all()).results : [];
  const ingat = (await env.DB.prepare("SELECT waktu FROM pks_audit WHERE perjanjian_id = ? AND aksi = 'pengingat_manual' ORDER BY id DESC LIMIT 1").bind(id).first())?.waktu || null;
  const masa = (await env.DB.prepare('SELECT masa_bulan FROM pks_jenis WHERE kode = ?').bind(p.jenis).first())?.masa_bulan || 12;
  return {
    id: p.id, kode: p.kode, jenis: p.jenis, judul: p.judul, mitra: p.mitra.nama, emails: p.mitra.emails, nomor_surat: p.nomor_surat, nomor_spk: p.nomor_spk,
    tahap: p.tahap, tahap_nama: F.TAHAP[p.tahap].nama, sub_progres: p.sub_progres, tenggat: p.tenggat, masa_bulan: masa, dokumen: docs, legal, pengingat_terakhir: ingat,
  };
}

/** Berkas yang boleh dibuka Admin TTD: hanya dokumen bernomor & TTD mitra milik perjanjian itu. */
export async function dokumen(env, id, docId) {
  await pTtd(env, id);
  const doc = await env.DB.prepare("SELECT * FROM pks_dokumen WHERE id = ? AND perjanjian_id = ? AND jenis IN ('bernomor','ttd_mitra')").bind(docId, id).first();
  if (!doc) fail(404, 'Dokumen tidak ditemukan');
  return { bytes: await F.readDoc(env, doc), nama: doc.nama };
}

export { pTtd };
