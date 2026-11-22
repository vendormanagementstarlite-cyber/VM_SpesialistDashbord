// Template PKS MS & SPK MS (Word). Isian bertanda {{kunci}} diganti di XML, lalu Word → PDF lewat jembatan Google.
// Kedua dokumen digabung jadi satu PDF (PKS MS di depan, SPK MS di belakang) agar alur, TTD, dan arsip tetap satu berkas.
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { PKS_MS_DOCX, SPK_MS_DOCX } from '../templates/ms-docx.js';
import { googleEnabled, docxKePdf } from './google.js';
import { fail } from './util.js';

const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
// Template menulis "Dua Ribu Dua Puluh [____]" dan "202[_]": hanya tahun 2026–2029 yang dapat ditulis.
const TAHUN_KATA = { 6: 'Enam', 7: 'Tujuh', 8: 'Delapan', 9: 'Sembilan' };
const KOSONG = '……………………';

/** Isian PKS MS & SPK MS. `lengkapi`: boleh kosong saat draf, wajib sebelum ke Legal (biasanya dilengkapi mitra). */
export const MS_FIELDS = [
  { key: 'tanggal', label: 'Tanggal PKS MS', type: 'date', hint: 'Tahun 2026–2029.' },
  { key: 'tanggal_spk', label: 'Tanggal SPK MS', type: 'date', hint: 'Biasanya sama dengan tanggal PKS MS.' },
  { key: 'nama', label: 'Nama perusahaan mitra', prefill: 'nama' },
  { key: 'domisili', label: 'Berkedudukan di', hint: 'Kota, mis. Jakarta Selatan', lengkapi: true },
  { key: 'wakil', label: 'Penandatangan mitra', prefill: 'direksi', hint: 'Bawaan: direktur di info perseroan.' },
  { key: 'jabatan', label: 'Jabatan penandatangan', hint: 'Mis. Direktur', bawaan: 'Direktur' },
  { key: 'alamat', label: 'Alamat korespondensi', prefill: 'alamat', lengkapi: true },
  { key: 'telp', label: 'Telepon', prefill: 'telepon', lengkapi: true },
  { key: 'email', label: 'Email', prefill: 'email', lengkapi: true },
  { key: 'up', label: 'Up. (untuk perhatian)', prefill: 'kontak_lain', lengkapi: true },
  { key: 'atas_nama', label: 'Nama pemilik rekening', lengkapi: true, grup: 'rekening' },
  { key: 'no_rek', label: 'Nomor rekening', lengkapi: true, grup: 'rekening' },
  { key: 'bank', label: 'Nama bank', lengkapi: true, grup: 'rekening' },
  { key: 'cabang', label: 'Cabang bank', lengkapi: true, grup: 'rekening' },
  { key: 'gudang_alamat', label: 'Alamat gudang', lengkapi: true, grup: 'gudang' },
  { key: 'gudang_kota', label: 'Kota gudang', lengkapi: true, grup: 'gudang' },
  { key: 'lead_ikr', label: 'Lead time pemasangan IKR (jam)', type: 'number', lengkapi: true, grup: 'gudang' },
];
const MAKS = { alamat: 300, gudang_alamat: 300 };

const bersih = (s) => String(s ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
const kosong = (v) => !v || v === '-';

function tanggalValid(s, label) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  const d = m && new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (!d || d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) fail(400, `${label} tidak valid`);
  if (+m[1] < 2026 || +m[1] > 2029) fail(400, `${label} harus di tahun 2026–2029, sesuai tulisan tetap pada template`);
  return d;
}

/** Normalisasi isian MS. Isian yang boleh dilengkapi belakangan disimpan "-" bila kosong. */
export function siapkanIsianMs(input) {
  const v = {};
  for (const f of MS_FIELDS) {
    let raw = bersih(input?.[f.key]);
    if (!raw && f.bawaan) raw = f.bawaan;
    if (!raw && f.key === 'tanggal_spk') raw = bersih(input?.tanggal);
    if (!raw && !f.lengkapi) fail(400, `${f.label} wajib diisi`);
    if (raw.length > (MAKS[f.key] || 160)) fail(400, `${f.label} terlalu panjang (maks. ${MAKS[f.key] || 160} karakter)`);
    v[f.key] = raw || '-';
  }
  tanggalValid(v.tanggal, 'Tanggal PKS MS');
  tanggalValid(v.tanggal_spk, 'Tanggal SPK MS');
  if (!kosong(v.lead_ikr) && !/^\d{1,3}$/.test(v.lead_ikr)) fail(400, 'Lead time IKR harus angka jam (1–999)');
  if (!kosong(v.no_rek) && !/^[\d\s.-]{5,30}$/.test(v.no_rek)) fail(400, 'Nomor rekening hanya boleh angka');
  return v;
}

/** Isian yang wajib lengkap sebelum diteruskan ke Legal. */
export function kurangMs(isian) {
  return MS_FIELDS.filter((f) => f.lengkapi && kosong(isian?.[f.key])).map((f) => f.label);
}

const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const teksTanggal = (s) => { const [y, m, d] = s.split('-').map(Number); return `${d} ${BULAN[m - 1]} ${y}`; };

/** Bagi alamat jadi dua baris untuk blok "Kepada" SPK MS (dipotong di koma terdekat dari tengah). */
function duaBaris(alamat) {
  if (kosong(alamat)) return [KOSONG, ''];
  if (alamat.length <= 60) return [alamat, ''];
  const tengah = alamat.length / 2;
  let best = -1;
  for (let i = alamat.indexOf(','); i >= 0; i = alamat.indexOf(',', i + 1)) if (best < 0 || Math.abs(i - tengah) < Math.abs(best - tengah)) best = i;
  return best < 0 ? [alamat, ''] : [alamat.slice(0, best + 1).trim(), alamat.slice(best + 1).trim()];
}

/** Nilai untuk setiap tanda {{kunci}} pada kedua template. */
export function nilaiToken(isian, { nomor = '', nomor_spk = '' } = {}) {
  const t = (k) => (kosong(isian[k]) ? KOSONG : isian[k]);
  const [y, m, d] = isian.tanggal.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const [a1, a2] = duaBaris(isian.alamat);
  return {
    nama: t('nama'), nomor: nomor || KOSONG, nomor_spk: nomor_spk || KOSONG,
    hari: HARI[dt.getUTCDay()], tgl: String(d), bulan: BULAN[m - 1], tahun_kata: TAHUN_KATA[y - 2020], dd: String(d).padStart(2, '0'), mm: String(m).padStart(2, '0'), y1: String(y - 2020),
    domisili: t('domisili'), penandatangan: t('wakil'), jabatan: t('jabatan'),
    alamat: t('alamat'), telp: t('telp'), email: t('email'), up: t('up'),
    tgl_spk_teks: teksTanggal(isian.tanggal_spk), tgl_pks_teks: teksTanggal(isian.tanggal),
    alamat1: a1, alamat2: a2,
    no_rek: t('no_rek'), bank: t('bank'), cabang: t('cabang'), atas_nama: t('atas_nama'),
    gudang_alamat: t('gudang_alamat'), gudang_kota: t('gudang_kota'), lead_ikr: kosong(isian.lead_ikr) ? '…' : isian.lead_ikr,
  };
}

const b64keBytes = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** Isi template Word. Mengembalikan bytes .docx. Tanda yang tidak dikenal dibiarkan agar mudah terlihat saat uji. */
export function isiDocx(templateB64, nilai) {
  const files = unzipSync(b64keBytes(templateB64));
  for (const name of Object.keys(files)) {
    if (!/^word\/(document|header\d*|footer\d*)\.xml$/.test(name)) continue;
    const s = strFromU8(files[name]);
    const out = s.replace(/\{\{(\w+)\}\}/g, (all, k) => (k in nilai ? xml(nilai[k]) : all));
    files[name] = strToU8(out);
  }
  return zipSync(files, { level: 6 });
}

export function tokenDocx(templateB64) {
  const files = unzipSync(b64keBytes(templateB64));
  return [...new Set([...strFromU8(files['word/document.xml']).matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]))];
}

/** PDF sederhana pengganti konversi Google (hanya mode dev / uji). */
async function pdfSimulasi(judul, nilai, halaman) {
  const doc = await PDFDocument.create();
  const f = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= halaman; i++) {
    const p = doc.addPage([595, 842]);
    p.drawText(`${judul} (simulasi, halaman ${i}/${halaman})`, { x: 50, y: 790, size: 12, font: f, color: rgb(0.04, 0.23, 0.46) });
    if (i === 1) Object.entries(nilai).forEach(([k, v], j) => p.drawText(`${k}: ${String(v).replace(/[^\x20-\x7E]/g, '.')}`.slice(0, 95), { x: 50, y: 760 - j * 16, size: 9, font: f }));
  }
  return doc.save();
}

async function keePdf(env, nama, docx, judul, nilai, halSimulasi) {
  if (googleEnabled(env)) return docxKePdf(env, nama, docx);
  if (env.APP_ENV === 'dev') return pdfSimulasi(judul, nilai, halSimulasi);
  fail(503, 'Jembatan Google belum aktif: dokumen PKS MS & SPK MS tidak dapat dibuat. Periksa APPS_SCRIPT_URL dan APPS_SCRIPT_KEY.');
}

/** Buat PDF gabungan PKS MS + SPK MS dari isian (dan nomor bila sudah terbit). */
export async function buatMs(env, input, nomor = {}) {
  const isian = siapkanIsianMs(input);
  const nilai = nilaiToken(isian, nomor);
  const [pks, spk] = await Promise.all([
    keePdf(env, 'PKS MS.docx', isiDocx(PKS_MS_DOCX, nilai), 'PKS MS', nilai, 20),
    keePdf(env, 'SPK MS.docx', isiDocx(SPK_MS_DOCX, nilai), 'SPK MS', nilai, 15),
  ]);
  const out = await PDFDocument.create();
  let halPks = 0;
  for (const [i, bytes] of [pks, spk].entries()) {
    const src = await PDFDocument.load(bytes, { updateMetadata: false });
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((pg) => out.addPage(pg));
    if (i === 0) halPks = pages.length;
  }
  out.setTitle('PKS MS & SPK MS'); out.setProducer('Starlite');
  return { bytes: await out.save({ useObjectStreams: true }), isian, halaman: out.getPageCount(), halPks };
}
