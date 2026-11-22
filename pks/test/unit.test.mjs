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
