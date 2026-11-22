import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { parseEmails, addWorkdays, addMonths, sha256Hex, b64url, b64urlDecode } from '../src/lib/util.js';
import { buildMime } from '../src/lib/google.js';
import { stampSignature } from '../src/lib/pdf.js';
import { mapMitra } from '../src/lib/mitra.js';

test('parseEmails: format campuran dari tabel mitra', () => {
  assert.deepEqual(parseEmails('a@x.com ; B@x.com, c@y.co.id'), ['a@x.com', 'b@x.com', 'c@y.co.id']);
  assert.deepEqual(parseEmails('cahyanul.uswah@persada.id <cahyanul.uswah@persada.id>'), ['cahyanul.uswah@persada.id']);
  assert.deepEqual(parseEmails('adhibima@gmail.com: firman@gmail.com'), ['adhibima@gmail.com', 'firman@gmail.com']);
  assert.deepEqual(parseEmails('bagus@lingkup.co.id sugih@gmail.com'), ['bagus@lingkup.co.id', 'sugih@gmail.com']);
  assert.deepEqual(parseEmails(null), []);
  assert.deepEqual(parseEmails('NULL'), []);
});

test('addWorkdays: melewati Sabtu–Minggu, tenggat 23:59 WIB', () => {
  // Jumat 20 Nov 2026 10:00 WIB + 1 hari kerja = Senin 23 Nov 23:59 WIB
  assert.equal(addWorkdays('2026-11-20T03:00:00Z', 1), '2026-11-23T16:59:00.000Z');
  // Rabu 18 Nov + 5 hari kerja = Rabu 25 Nov
  assert.equal(addWorkdays('2026-11-18T03:00:00Z', 5), '2026-11-25T16:59:00.000Z');
});

test('addMonths: masa berlaku 12 bulan berakhir sehari sebelum ulang tanggal', () => {
  assert.equal(addMonths('2026-11-20', 12), '2027-11-19');
  assert.equal(addMonths('2026-01-01', 6), '2026-06-30');
});

test('sha256 & base64url', async () => {
  assert.equal(await sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  const bytes = new Uint8Array([250, 251, 252, 0, 1]);
  assert.deepEqual(b64urlDecode(b64url(bytes)), bytes);
});

test('buildMime: subjek UTF-8, lampiran base64', () => {
  const m = buildMime({ from: 'a@x.com', to: ['b@y.com'], subject: 'Perjanjian — Uji', html: '<p>Halo</p>', attachments: [{ name: 'p.pdf', mime: 'application/pdf', bytes: new Uint8Array([37, 80, 68, 70]) }] });
  assert.match(m, /Subject: =\?UTF-8\?B\?/);
  assert.match(m, /Content-Disposition: attachment; filename="p.pdf"/);
  assert.match(m, /JVBERg==/);
});

test('stampSignature: menempel di halaman terakhir tanpa mengubah jumlah halaman', async () => {
  const d = await PDFDocument.create(); d.addPage([595, 842]); d.addPage([595, 842]);
  const src = await d.save();
  const out = await stampSignature(src, readFileSync('test/fixtures/ttd-scan.png'), 'image/png', { page: -1, x: 360, y: 110, w: 170 });
  const res = await PDFDocument.load(out);
  assert.equal(res.getPageCount(), 2);
  assert.ok(out.length > src.length, 'gambar tertanam');
});

test('mapMitra: kolom NULL menjadi kosong, status default', () => {
  const m = mapMitra({ source_row: 400, nama_perusahaan: 'PT LENTERA DIGITAL NUSANTARA', nama_singkat: 'LENTERA', jenis_mitra: 'ISP Akuisisi', email: null, status_mitra: null, alamat: 'NULL' });
  assert.equal(m.alamat, ''); assert.deepEqual(m.emails, []); assert.equal(m.status, 'Tanpa status');
});

import { hashPassword, verifyPassword, passwordSementara, passwordValid } from '../src/lib/password.js';
test('password: hash unik per garam, verifikasi benar/salah, format rusak ditolak', async () => {
  const a = await hashPassword('Rahasia-12345'), b = await hashPassword('Rahasia-12345');
  assert.notEqual(a, b);
  assert.ok(a.startsWith('pbkdf2$100000$'));
  assert.equal(await verifyPassword('Rahasia-12345', a), true);
  assert.equal(await verifyPassword('rahasia-12345', a), false);
  assert.equal(await verifyPassword('x', 'bukan-hash'), false);
  assert.equal(await verifyPassword('x', null), false);
});
test('password sementara: 12 karakter tanpa karakter ambigu; aturan minimal 10', () => {
  const p = passwordSementara();
  assert.match(p, /^[A-HJ-NP-Za-km-z2-9]{12}$/);
  assert.equal(passwordValid('123456789'), false);
  assert.equal(passwordValid('1234567890'), true);
});

import { INNER_CITY, inti, cocokkan, statusKontrak } from '../src/lib/kelompok.js';
test('inner city: 36 nama unik, pencocokan inti nama (PT/CV/titik diabaikan), tidak menebak', () => {
  assert.equal(INNER_CITY.length, 36); assert.equal(new Set(INNER_CITY).size, 36);
  assert.equal(inti('PT. KRESA UTAMA MANDIRI'), 'KRESA UTAMA MANDIRI');
  const mitra = [{ row: 1, nama: 'PT. KRESA UTAMA MANDIRI', singkat: 'KRESA' }, { row: 2, nama: 'CV TRIZA PRATAMA', singkat: '' }, { row: 3, nama: 'PT SARANA MANDIRI USAHA UNGGUL', singkat: '' }, { row: 4, nama: 'PT SARANA MANDIRI USAHA UNGGUL 2', singkat: '' }];
  const h = cocokkan(['PT KRESA UTAMA MANDIRI', 'PT TRIZA PRATAMA', 'PT SARANA MANDIRI USAHA UNGGUL', 'PT TIDAK ADA'], mitra);
  assert.deepEqual(h['PT KRESA UTAMA MANDIRI'].map((m) => m.row), [1]);
  assert.deepEqual(h['PT TRIZA PRATAMA'].map((m) => m.row), [2]);
  assert.deepEqual(h['PT SARANA MANDIRI USAHA UNGGUL'].map((m) => m.row), [3]);
  assert.deepEqual(h['PT TIDAK ADA'], []);
});
test('status kontrak', () => {
  const t = '2026-11-18';
  assert.equal(statusKontrak(null, t), 'belum_ada');
  assert.equal(statusKontrak({ tahap: 3 }, t), 'proses');
  assert.equal(statusKontrak({ tahap: 7, tgl_berakhir: '2026-11-01' }, t), 'berakhir');
  assert.equal(statusKontrak({ tahap: 7, tgl_berakhir: '2027-01-30' }, t), 'akan_berakhir');
  assert.equal(statusKontrak({ tahap: 7, tgl_berakhir: '2027-12-31' }, t), 'aktif');
});

import { emailKirim } from '../src/lib/mail.js';
test('format email: placeholder nama mitra, tautan, dan aman dari HTML', () => {
  const ctx = { p: { kode: 'PKS-1', judul: 'Judul <b>' }, m: { nama: 'PT A & B' }, tenggat: '2026-12-01T00:00:00Z', url: 'https://x.test/p#t=abc' };
  const d = emailKirim(ctx, {});
  assert.match(d.subject, /PT A & B — PKS-1/);
  assert.ok(d.html.includes('https://x.test/p#t=abc') && !d.html.includes('Judul <b>'));
  const k = emailKirim(ctx, { subjek: 'Halo {nama_mitra}\nX', badan: 'Yth {nama_mitra}\n\nBuka {tautan} sekarang' });
  assert.equal(k.subject, 'Halo PT A & B X');
  assert.ok(k.html.includes('Yth PT A &amp; B') && k.html.includes('<a href="https://x.test/p#t=abc">'));
});

import { requireUser } from '../src/lib/auth.js';
const ctxUji = (peran, env = {}) => ({
  req: { header: (k) => (k === 'x-dev-user' ? 'u@x.id' : undefined) },
  env: { APP_ENV: 'dev', ...env, DB: { prepare: () => ({ bind: () => ({ first: async () => ({ email: 'u@x.id', nama: 'U', peran, penandatangan: 0, wajib_ganti: 0 }) }) }) } },
});
test('kunci aplikasi: hanya admin; /api/me tetap boleh; produksi tidak bisa dibuka', async () => {
  await assert.rejects(() => requireUser(ctxUji('vm')), (e) => e.status === 403);
  await assert.rejects(() => requireUser(ctxUji('legal')), (e) => e.status === 403);
  assert.equal((await requireUser(ctxUji('admin'))).peran, 'admin');
  assert.equal((await requireUser(ctxUji('vm'), { bolehNonAdmin: true })).peran, 'vm');
  assert.equal((await requireUser(ctxUji('vm', { PKS_TERBUKA: '1' }))).peran, 'vm');
  const prod = ctxUji('vm', { PKS_TERBUKA: '1' }); prod.env.APP_ENV = 'production'; prod.req.header = () => 'Bearer x';
  await assert.rejects(() => requireUser(prod), () => true); // produksi: bendera dev diabaikan (tanpa sesi valid tetap ditolak)
});

// ---------- PKS MS & SPK MS ----------
import { MS_FIELDS, siapkanIsianMs, kurangMs, nilaiToken, isiDocx, tokenDocx, buatMs } from '../src/lib/ms.js';
import { PKS_MS_DOCX, SPK_MS_DOCX } from '../src/templates/ms-docx.js';
import { unzipSync, strFromU8 } from 'fflate';
import { belumLengkap, buatDraf, fieldsUntuk } from '../src/lib/dokumen.js';

const isiMs = { tanggal: '2026-11-23', nama: 'PT KARYA & MITRA', wakil: 'BUDI SANTOSO', alamat: 'Jl. Melati No. 10, Kebayoran Baru, Jakarta Selatan, DKI Jakarta 12110', telp: '0812', email: 'a@b.id', up: 'Budi', domisili: 'Jakarta Selatan' };

test('MS: template bertanda lengkap dan semua tanda punya nilai', () => {
  assert.deepEqual(tokenDocx(PKS_MS_DOCX).sort(), ['alamat', 'bulan', 'dd', 'domisili', 'email', 'hari', 'jabatan', 'mm', 'nama', 'nomor', 'penandatangan', 'tahun_kata', 'telp', 'tgl', 'up', 'y1']);
  assert.deepEqual(tokenDocx(SPK_MS_DOCX).sort(), ['alamat1', 'alamat2', 'atas_nama', 'bank', 'cabang', 'gudang_alamat', 'gudang_kota', 'jabatan', 'lead_ikr', 'nama', 'no_rek', 'nomor', 'nomor_spk', 'penandatangan', 'tgl_pks_teks', 'tgl_spk_teks']);
  const nilai = nilaiToken(siapkanIsianMs(isiMs));
  for (const t of [...tokenDocx(PKS_MS_DOCX), ...tokenDocx(SPK_MS_DOCX)]) assert.ok(t in nilai, `nilai untuk ${t}`);
});

test('MS: isian dinormalisasi, tanggal/angka divalidasi, kekurangan terdeteksi', () => {
  const v = siapkanIsianMs(isiMs);
  assert.equal(v.tanggal_spk, '2026-11-23'); assert.equal(v.jabatan, 'Direktur'); assert.equal(v.no_rek, '-');
  assert.deepEqual(kurangMs(v), ['Nama pemilik rekening', 'Nomor rekening', 'Nama bank', 'Cabang bank', 'Alamat gudang', 'Kota gudang', 'Lead time pemasangan IKR (jam)']);
  assert.throws(() => siapkanIsianMs({ ...isiMs, tanggal: '2030-01-02' }), /2026–2029/);
  assert.throws(() => siapkanIsianMs({ ...isiMs, tanggal: '2026-02-30' }), /tidak valid/);
  assert.throws(() => siapkanIsianMs({ ...isiMs, lead_ikr: '24 jam' }), /angka jam/);
  assert.throws(() => siapkanIsianMs({ ...isiMs, no_rek: 'abc' }), /angka/);
  assert.throws(() => siapkanIsianMs({ ...isiMs, nama: '' }), /wajib diisi/);
  const lengkap = siapkanIsianMs({ ...isiMs, atas_nama: 'PT K', no_rek: '0012 345', bank: 'Mandiri', cabang: 'KCP', gudang_alamat: 'Jl. G', gudang_kota: 'Jakarta', lead_ikr: '24' });
  assert.deepEqual(kurangMs(lengkap), []);
  assert.deepEqual(belumLengkap('MS', lengkap), []);
});

test('MS: nilai tanggal & alamat dua baris; nomor kosong tampil titik-titik', () => {
  const n = nilaiToken(siapkanIsianMs(isiMs));
  assert.equal(n.hari, 'Senin'); assert.equal(n.tgl, '23'); assert.equal(n.bulan, 'November'); assert.equal(n.tahun_kata, 'Enam'); assert.equal(n.dd, '23'); assert.equal(n.mm, '11'); assert.equal(n.y1, '6');
  assert.equal(n.tgl_spk_teks, '23 November 2026');
  assert.ok(n.alamat1.endsWith(',') && n.alamat2.length > 0, 'alamat panjang dibagi di koma');
  assert.match(n.nomor, /^…+$/);
  assert.equal(nilaiToken(siapkanIsianMs(isiMs), { nomor: '01/PKS', nomor_spk: '02/SPK' }).nomor_spk, '02/SPK');
});

test('MS: isi Word mengganti semua tanda dan meng-escape XML', () => {
  const n = nilaiToken(siapkanIsianMs(isiMs), { nomor: 'A<1>', nomor_spk: 'B' });
  for (const tpl of [PKS_MS_DOCX, SPK_MS_DOCX]) {
    const out = unzipSync(isiDocx(tpl, n));
    const x = strFromU8(out['word/document.xml']);
    assert.ok(!/\{\{\w+\}\}/.test(x), 'tidak ada tanda tersisa');
    assert.ok(x.includes('PT KARYA &amp; MITRA'));
    if (tpl === PKS_MS_DOCX) assert.ok(x.includes('A&lt;1&gt;'));
    assert.ok(out['[Content_Types].xml'] && out['word/styles.xml'], 'struktur docx utuh');
  }
});

test('MS: PDF gabungan (mode dev tanpa Google) = PKS MS 20 hal + SPK MS 15 hal', async () => {
  const r = await buatMs({ APP_ENV: 'dev' }, isiMs);
  assert.equal(r.halaman, 35); assert.equal(r.halPks, 20);
  await assert.rejects(buatMs({ APP_ENV: 'production' }, isiMs), /Jembatan Google belum aktif/);
});

test('Homepass: draf dengan isian minimal (sisanya "-" dilengkapi mitra) dan cek kelengkapan', async () => {
  const d = await buatDraf({}, 'PKS', { tanggal: '2026-11-23', nama: 'PT UJI', wakil: 'BUDI' });
  assert.equal(d.isian.domisili, '-'); assert.equal(d.isian.jabatan, 'Direktur');
  assert.deepEqual(belumLengkap('PKS', d.isian), ['Berkedudukan di', 'Alamat korespondensi (Pasal 24)', 'Telepon', 'Email', 'Up. (untuk perhatian)']);
  assert.ok(fieldsUntuk('PKS').find((f) => f.key === 'domisili').lengkapi);
  assert.equal(MS_FIELDS.length, 17);
});

// ---------- Spreadsheet ----------
import { barisSheet, progresDari, PROGRES } from '../src/lib/sheet.js';
function dbPalsu(map) {
  return { prepare: (sql) => ({ bind: () => ({ first: async () => { for (const [k, v] of Object.entries(map)) if (sql.includes(k)) return v; return null; } }) }) };
}
test('Spreadsheet: PROGRES per tahap sesuai dropdown', async () => {
  const env = { DB: dbPalsu({ "jenis = 'master'": { n: 2, akhir: '2026-11-02' }, 'pks_feedback': { akhir: '2026-11-01' } }) };
  const cek = async (p) => progresDari(env, { id: 'x', ...p });
  assert.equal(await cek({ tahap: 0 }), 'REVIEW DRAFT');
  assert.equal(await cek({ tahap: 1 }), 'DONE EMAIL TO MITRA');
  assert.equal(await cek({ tahap: 2 }), 'REVIEW DRAFT');
  assert.equal(await cek({ tahap: 3 }), 'REVIEW LEGAL IJE');
  assert.equal(await cek({ tahap: 4 }), 'NO PKS RILIS');
  assert.equal(await cek({ tahap: 5 }), 'PROSES SIGN MITRA');
  assert.equal(await cek({ tahap: 6 }), 'DONE SIGN MITRA');
  assert.equal(await cek({ tahap: 6, sub_progres: 'PROSES SIGN IJE' }), 'PROSES SIGN IJE');
  assert.equal(await cek({ tahap: 7 }), 'DONE SIGN IJE');
  assert.equal(await cek({ tahap: 7, arsip_url: 'https://drive' }), 'DONE');
  const env2 = { DB: dbPalsu({ "jenis = 'master'": { n: 1, akhir: '2026-11-01' }, 'pks_feedback': { akhir: '2026-11-02' } }) };
  assert.equal(await progresDari(env2, { id: 'x', tahap: 0 }), 'DRAFT DI BUAT');
  assert.equal(await progresDari(env2, { id: 'x', tahap: 2 }), 'FEEDBACK MITRA');
  for (const v of ['DRAFT DI BUAT', 'DONE']) assert.ok(PROGRES.includes(v));
});

test('Spreadsheet: WAKIL hanya terisi bila penandatangan bukan direktur; kolom MS & Homepass', async () => {
  const env = { UI_URL: 'https://ui', DB: dbPalsu({ pks_feedback: { isi: 'ok setuju', pengirim: 'x' }, pks_pengguna: { nama: 'Vendor Management' }, "jenis = 'master'": { n: 1, akhir: 'a' } }) };
  const p = { id: 'p1', kode: 'PKS-2026-0001', jenis: 'PKS', tahap: 4, nomor_surat: '01/PKS', pic_vm: 'vm@x', mitra: { nama: 'PT A', direksi: 'BUDI', alamat: 'Jl. A', emails: ['a@x'] } };
  let r = await barisSheet(env, p, { tanggal: '2026-11-23', nama: 'PT A', wakil: 'budi', jabatan: 'Direktur Utama', domisili: 'Jakarta', telp: '08', email: 'a@x' });
  assert.equal(r.WAKIL, ''); assert.equal(r['JABATAN WAKIL'], ''); assert.equal(r.JABATAN, 'Direktur Utama'); assert.equal(r['NAMA DIREKSI'], 'BUDI');
  assert.equal(r.PROGRES, 'NO PKS RILIS'); assert.equal(r['NO ID'], 'PKS-2026-0001'); assert.equal(r['ATC FINAL DRAF'], 'https://ui/#/pks/perjanjian/p1'); assert.match(r.REMARK, /Mitra: ok setuju/);
  r = await barisSheet(env, p, { tanggal: '2026-11-23', nama: 'PT A', wakil: 'SITI', jabatan: 'Manajer Operasional' });
  assert.equal(r.WAKIL, 'SITI'); assert.equal(r['JABATAN WAKIL'], 'Manajer Operasional'); assert.equal(r.JABATAN, 'Direktur');
  const ms = await barisSheet(env, { ...p, jenis: 'MS', kode: 'MS-2026-0001', nomor_spk: '02/SPK', arsip_url: 'https://drive/f', tahap: 7, remark_legal: 'cek lampiran' }, { ...siapkanIsianMs(isiMs), no_rek: '00123', lead_ikr: '24' });
  assert.equal(ms['NO REKENING'], "'00123"); assert.equal(ms['LEAD TIME IKR (JAM)'], 24); assert.equal(ms['NO SPK MS'], '02/SPK'); assert.equal(ms['TANGGAL SPK MS'], '2026-11-23');
  assert.equal(ms['PROGRES PKS MS'], 'DONE'); assert.equal(ms['ATC PKS MS & SPK MS'], 'https://drive/f'); assert.equal(ms['REMARK LEGAL IJE'], 'cek lampiran'); assert.equal(ms['NAMA BANK'], '');
});
