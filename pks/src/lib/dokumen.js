// Satu pintu pembuatan dokumen per jenis perjanjian.
//   PKS = Perjanjian Homepass (template PDF terkunci, isian kuning ditimpa langsung pada PDF)
//   MS  = PKS MS & SPK MS (template Word, dikonversi ke PDF lewat Google, digabung jadi satu PDF)
import { FIELDS as PKS_FIELDS, buatMaster, cetakNomor, batasKarakter, HALAMAN } from './template.js';
import { MS_FIELDS, buatMs, kurangMs, siapkanIsianMs } from './ms.js';
import { fail } from './util.js';

export const JENIS = ['PKS', 'MS'];
const PKS_LENGKAPI = ['domisili', 'alamat', 'telp', 'email', 'up'];

export function fieldsUntuk(jenis) {
  if (jenis === 'MS') return MS_FIELDS;
  return PKS_FIELDS.map((f) => ({ ...f, lengkapi: PKS_LENGKAPI.includes(f.key), bawaan: f.key === 'jabatan' ? 'Direktur' : undefined }));
}

export async function infoTemplate(jenis) {
  if (jenis === 'MS') return { fields: MS_FIELDS, maks: Object.fromEntries(MS_FIELDS.map((f) => [f.key, f.key.includes('alamat') ? 300 : 160])) };
  return { fields: fieldsUntuk('PKS'), maks: await batasKarakter(), halaman: HALAMAN };
}

const kosong = (v) => !String(v ?? '').trim() || String(v).trim() === '-';

/** Isian Homepass: yang boleh dilengkapi mitra diisi "-" bila kosong agar draf tetap bisa dibuat. */
function lengkapiPks(isi) {
  const out = { ...isi };
  for (const f of fieldsUntuk('PKS')) {
    if (kosong(out[f.key])) out[f.key] = f.bawaan || (f.lengkapi ? '-' : out[f.key]);
  }
  return out;
}

/** Draf dokumen dari isian. Mengembalikan { bytes, isian, halaman }. */
export async function buatDraf(env, jenis, isi) {
  if (jenis === 'MS') { const r = await buatMs(env, isi); return { bytes: r.bytes, isian: r.isian, halaman: r.halaman }; }
  const { bytes, isian } = await buatMaster(lengkapiPks(isi));
  return { bytes, isian, halaman: HALAMAN };
}

/** Dokumen bernomor: Homepass mencetak nomor di atas master; MS dibuat ulang dengan nomor PKS & SPK. */
export async function buatBernomor(env, p, isian, masterBytes, { nomor, nomor_spk }) {
  if (p.jenis === 'MS') return (await buatMs(env, isian, { nomor, nomor_spk })).bytes;
  return cetakNomor(masterBytes, nomor);
}

/** Isian yang belum lengkap (label) — wajib lengkap sebelum diteruskan ke Legal. */
export function belumLengkap(jenis, isian) {
  if (jenis === 'MS') return kurangMs(isian);
  return fieldsUntuk('PKS').filter((f) => f.lengkapi && kosong(isian?.[f.key])).map((f) => f.label);
}

/** Normalisasi isian MS tanpa membuat dokumen (untuk validasi cepat). */
export const cekIsian = (jenis, isi) => (jenis === 'MS' ? siapkanIsianMs(isi) : isi);

export function cekJenis(jenis) {
  if (!JENIS.includes(jenis)) fail(400, 'Jenis perjanjian tidak dikenal');
  return jenis;
}
