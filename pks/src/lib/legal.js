// Akses Legal tanpa login akun: tautan dari email + PIN 4 angka. Pertama kali: email + nomor HP + buat PIN.
import { hashPassword, verifyPassword } from './password.js';
import { now, fail, sha256Hex, randomToken } from './util.js';
import * as F from './flow.js';

const MAKS_GAGAL = 5, KUNCI_MENIT = 15, SESI_JAM = 2;
const normEmail = (s) => String(s || '').trim().toLowerCase();
const normHp = (s) => String(s || '').replace(/[^\d+]/g, '');

async function penggunaLegal(env, email) {
  const u = await env.DB.prepare("SELECT email, nama FROM pks_pengguna WHERE email = ? AND peran = 'legal' AND aktif = 1").bind(email).first();
  if (!u) fail(403, 'Email ini tidak terdaftar sebagai Legal');
  return u;
}

export async function cekEmail(env, raw, emailIn) {
  await F.resolveToken(env, raw);
  const email = normEmail(emailIn);
  await penggunaLegal(env, email);
  const a = await env.DB.prepare('SELECT 1 FROM pks_legal_akses WHERE email = ?').bind(email).first();
  return { terdaftar: !!a };
}

export async function masuk(env, raw, { email: emailIn, hp, pin }) {
  const { token, p } = await F.resolveToken(env, raw);
  if (token.tujuan !== 'legal') fail(403, 'Tautan ini bukan untuk Legal');
  const email = normEmail(emailIn);
  const u = await penggunaLegal(env, email);
  if (!/^\d{4}$/.test(String(pin || ''))) fail(400, 'PIN harus 4 angka');
  let a = await env.DB.prepare('SELECT * FROM pks_legal_akses WHERE email = ?').bind(email).first();
  if (!a) {
    const nomor = normHp(hp);
    if (nomor.replace(/\D/g, '').length < 8) fail(400, 'Nomor HP wajib diisi untuk pendaftaran pertama');
    await env.DB.prepare('INSERT INTO pks_legal_akses (email, hp, pin_hash, dibuat_pada) VALUES (?,?,?,?)').bind(email, nomor, await hashPassword(String(pin)), now()).run();
    await F.audit(env, email, p.id, 'legal_terdaftar', { hp: nomor });
  } else {
    if (a.terkunci_sampai && a.terkunci_sampai > now()) fail(429, 'Terlalu banyak PIN salah. Coba lagi beberapa menit lagi.');
    if (!(await verifyPassword(String(pin), a.pin_hash))) {
      const g = a.gagal + 1;
      await env.DB.prepare('UPDATE pks_legal_akses SET gagal = ?, terkunci_sampai = ? WHERE email = ?').bind(g >= MAKS_GAGAL ? 0 : g, g >= MAKS_GAGAL ? new Date(Date.now() + KUNCI_MENIT * 60000).toISOString() : null, email).run();
      await F.audit(env, email, p.id, 'legal_pin_salah');
      fail(401, 'PIN salah');
    }
    await env.DB.prepare('UPDATE pks_legal_akses SET gagal = 0, terkunci_sampai = NULL WHERE email = ?').bind(email).run();
  }
  const sesi = randomToken();
  await env.DB.prepare('INSERT INTO pks_legal_sesi (token_hash, email, perjanjian_id, kedaluwarsa) VALUES (?,?,?,?)')
    .bind(await sha256Hex(sesi), email, p.id, new Date(Date.now() + SESI_JAM * 3600_000).toISOString()).run();
  await F.audit(env, email, p.id, 'legal_masuk');
  return { sesi, nama: u.nama };
}

export async function cekSesi(env, raw, sesi) {
  const { token, p } = await F.resolveToken(env, raw);
  if (token.tujuan !== 'legal') fail(403, 'Tautan ini bukan untuk Legal');
  const s = await env.DB.prepare('SELECT * FROM pks_legal_sesi WHERE token_hash = ?').bind(await sha256Hex(String(sesi || ''))).first();
  if (!s || s.perjanjian_id !== p.id || s.kedaluwarsa < now()) fail(401, 'Sesi berakhir. Masukkan PIN lagi.');
  return { email: s.email, p };
}

export async function ringkasan(env, ctx) {
  const { p } = ctx;
  const doc = await F.latestDoc(env, p.id, 'master');
  return {
    kode: p.kode, judul: p.judul, mitra: p.mitra.nama, tahap: p.tahap, tahap_nama: F.TAHAP[p.tahap].nama,
    nomor_surat: p.nomor_surat, tenggat: p.tenggat, bisa_nomor: p.tahap === 3 && p.status !== 'batal',
    dokumen: doc ? { nama: doc.nama, halaman: doc.halaman } : null,
  };
}

export async function dokumen(env, ctx) {
  const doc = (await F.latestDoc(env, ctx.p.id, 'bernomor')) || (await F.latestDoc(env, ctx.p.id, 'master'));
  if (!doc) fail(404, 'Dokumen belum tersedia');
  return { bytes: await F.readDoc(env, doc), nama: doc.nama };
}

export async function terbitkan(env, ctx, nomor) {
  const form = new FormData();
  form.set('nomor_surat', String(nomor || ''));
  return F.terbitNomor(env, { email: ctx.email, peran: 'legal' }, ctx.p.id, form);
}
