// Template Perjanjian (Word -> PDF terkunci). Hanya isian kuning yang dapat diisi; selain itu tidak dapat diubah.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { fail } from './util.js';
import { BIDANG, HALAMAN, pdfBytes } from '../templates/pks-jasa.js';

export { HALAMAN };

const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const TAHUN = 2026; // tertulis tetap pada template ("Dua Ribu Dua Puluh Enam", "-2026")

/** Isian yang diisi pengguna (tanggal menurunkan hari, tanggal, bulan, dd-mm). Nomor surat diisi Legal pada tahap 4. */
export const FIELDS = [
  { key: 'tanggal', label: 'Tanggal perjanjian', type: 'date', hint: `Harus tahun ${TAHUN}, mengikuti tulisan di template.` },
  { key: 'nama', label: 'Nama perusahaan mitra', prefill: 'nama' },
  { key: 'domisili', label: 'Berkedudukan di', hint: 'Kota, mis. Jakarta Selatan' },
  { key: 'wakil', label: 'Diwakili oleh', prefill: 'direksi' },
  { key: 'jabatan', label: 'Jabatan perwakilan', hint: 'Mis. Direktur' },
  { key: 'alamat', label: 'Alamat korespondensi (Pasal 24)', prefill: 'alamat' },
  { key: 'telp', label: 'Telepon', prefill: 'telepon' },
  { key: 'email', label: 'Email', prefill: 'email' },
  { key: 'up', label: 'Up. (untuk perhatian)', prefill: 'kontak_lain' },
];

const MIN_SKALA = 0.62;
const bersih = (s) => String(s ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim()
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/…/g, '...')
  .replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');

const bidangDari = (kunci) => BIDANG.filter((b) => b.kunci === kunci);

async function fonts(doc) {
  return { reg: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold) };
}

/** Ukuran huruf agar teks muat di lebar isian; null bila terlalu panjang. */
function ukuranMuat(font, teks, b, toleransi = 0) {
  const lebar = (b.x1maks || b.x1) - b.x0 + toleransi;
  const w = font.widthOfTextAtSize(teks, b.ukuran);
  if (w <= lebar) return b.ukuran;
  const s = b.ukuran * (lebar / w);
  return s >= b.ukuran * MIN_SKALA ? s : null;
}

function tulis(doc, f, b, teks) {
  const page = doc.getPage(b.hal);
  const font = b.tebal ? f.bold : f.reg;
  const size = ukuranMuat(font, teks, b);
  const w = font.widthOfTextAtSize(teks, size);
  const x = b.rata === 'tengah' ? (b.x0 + b.x1) / 2 - w / 2 : b.x0;
  const kiri = Math.min(b.x0, x) - 1, kanan = Math.max(b.x1, x + w) + 1;
  // Tinggi penutup mengikuti tinta kurung siku (lebih tinggi dari blok kuning), tanpa menyentuh baris lain.
  const bawah = b.dasar - 0.28 * b.ukuran, atas = b.dasar + 0.98 * b.ukuran;
  page.drawRectangle({ x: kiri, y: bawah, width: kanan - kiri, height: atas - bawah, color: rgb(1, 1, 1) });
  page.drawText(teks, { x, y: b.dasar, size, font, color: rgb(0, 0, 0) });
  if (b.garis) page.drawLine({ start: { x, y: b.dasar - 1.5 }, end: { x: x + w, y: b.dasar - 1.5 }, thickness: 0.6, color: rgb(0, 0, 0) });
}

function cekMuat(font, bold, kunci, teks) {
  for (const b of bidangDari(kunci)) {
    if (ukuranMuat(b.tebal ? bold : font, teks, b) === null) return false;
  }
  return true;
}

/** Perkiraan jumlah karakter maksimum per isian (huruf mengecil otomatis sampai batas ini). */
export async function batasKarakter() {
  const doc = await PDFDocument.create();
  const f = await fonts(doc);
  const out = {};
  for (const fd of FIELDS) {
    if (fd.key === 'tanggal') continue;
    out[fd.key] = Math.min(...bidangDari(fd.key).map((b) => {
      const font = b.tebal ? f.bold : f.reg;
      const rata = font.widthOfTextAtSize('abcdefghijklmnoprstu 0123', b.ukuran * MIN_SKALA) / 25;
      return Math.floor(((b.x1maks || b.x1) - b.x0) / rata);
    }));
  }
  return out;
}

/** Turunkan nilai isian dari form. Melempar 400 dengan pesan jelas bila ada yang salah. */
export async function siapkanIsian(input) {
  const doc = await PDFDocument.create();
  const f = await fonts(doc);
  const v = {};
  for (const fd of FIELDS) {
    const raw = bersih(input?.[fd.key]);
    if (!raw) fail(400, `${fd.label} wajib diisi`);
    v[fd.key] = raw;
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.tanggal);
  const d = m && new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (!d || d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) fail(400, 'Tanggal perjanjian tidak valid');
  if (+m[1] !== TAHUN) fail(400, `Tanggal perjanjian harus di tahun ${TAHUN}, sesuai tulisan tetap pada template`);
  const turunan = { hari: HARI[d.getUTCDay()], tgl: String(+m[3]), bulan: BULAN[+m[2] - 1], dd: m[3], mm: m[2] };
  const semua = { ...turunan, ...Object.fromEntries(Object.entries(v).filter(([k]) => k !== 'tanggal')) };
  for (const fd of FIELDS) {
    if (fd.key === 'tanggal') continue;
    if (!cekMuat(f.reg, f.bold, fd.key, semua[fd.key])) fail(400, `${fd.label} terlalu panjang untuk kolom pada template. Persingkat teksnya.`);
  }
  return semua;
}

/** Buat dokumen master dari template + isian. Mengembalikan bytes PDF. */
export async function buatMaster(input) {
  const semua = await siapkanIsian(input);
  const doc = await PDFDocument.load(pdfBytes(), { updateMetadata: false });
  const f = await fonts(doc);
  for (const b of BIDANG) {
    if (b.kunci === 'nomor') continue; // diisi Legal saat nomor terbit
    tulis(doc, f, b, semua[b.kunci]);
  }
  doc.setTitle('Perjanjian Kerja Sama Pengadaan Jasa');
  doc.setProducer('Starlite');
  return { bytes: await doc.save({ useObjectStreams: true }), isian: semua };
}

/** Cetak nomor surat pada kolom "No." dokumen master. Mengembalikan bytes PDF baru. */
export async function cetakNomor(masterBytes, nomor) {
  const teks = bersih(nomor);
  const doc = await PDFDocument.load(masterBytes, { updateMetadata: false });
  const f = await fonts(doc);
  const [b] = bidangDari('nomor');
  if (ukuranMuat(b.tebal ? f.bold : f.reg, teks, b) === null) fail(400, 'Nomor surat terlalu panjang untuk kolom pada template');
  tulis(doc, f, b, teks);
  return doc.save({ useObjectStreams: true });
}

/** Posisi tanda tangan pada halaman 19 (indeks 18): PT IJE di kiri, MITRA di kanan. */
export const POSISI_TTD = {
  ije: { page: 18, x: 70, y: 540, w: 130 },
  mitra: { page: 18, x: 345, y: 540, w: 130 },
};
