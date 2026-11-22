// Kelompok mitra (Inner City). Sumber data mitra tetap info perseroan; daftar nama di bawah hanya acuan pencocokan.
import { listMitra } from './mitra.js';
import { now } from './util.js';

export const INNER_CITY = [
  'PT DESNARUM JAYA AKASHA', 'PT DUTA ANUGRAH DAMAI SEJAHTERA', 'PT KASIH RAJAWALI SEJAHTERA', 'PT KRESA UTAMA MANDIRI',
  'PT LINGKUP TOTAL TECHNOLOGY', 'PT LENTERA DIGITAL NUSANTARA', 'PT PANCA BASWARA SAKTI', 'PT PUTRA MALIK SEJAHTERA',
  'PT TUJUH SINAR ABADI', 'CV TRIZA PRATAMA', 'PT SARANA MANDIRI USAHA UNGGUL', 'PT SALWA CITRA MANDIRI',
  'PT PERSONEL ALIH DAYA', 'PT NURIZ BERKAH ABADI', 'PT MATERIAL SUPPLY INDONESIA', 'PT DAPOER POESAT NOESANTARA GROUP',
  'CV CAHAYA DUA PUTRA', 'PT BERATHI', 'PT ARIOSY SADIA RESWARA', 'PT TELKOM AKSES', 'PT JARING SOLUSI PERSADA',
  'PT METRO DUTA SELARAS', 'PT MIGE TAMA SINERGI', 'PT DELAPAN UNSUR INTI TAMA', 'PT FANIZ AMANAT BERSAMA',
  'PT AZZAHRA RAJAWALI MAKMUR', 'PT FAJAR MITRA KRIDA ABADI', 'PT KHATULISTIWA JARINGAN NUSATECH', 'PT DWI PILAR PRATAMA',
  'PT ERAJAYA MAKMUR PERKASA', 'PT BERKAH SERIKAT MANDIRI', 'PT IDKO ECO JAYA ENERGI', 'PT RAFA TEKNOLOGI SOLUSI',
  'PT KEDIREN NET MEDIA BLORA', 'PT SARANA GUNA MANDIRI', 'PT GENZ PERSADA INDONESIA',
];

// Bandingkan inti nama saja: huruf besar, tanpa titik/koma, tanpa awalan badan usaha (PT/CV).
export const inti = (s) => String(s || '').toUpperCase().replace(/[.,()]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^(PT|CV)\s+/, '').trim();

const badan = (s) => (String(s || '').toUpperCase().replace(/[.,]/g, ' ').trim().match(/^(PT|CV)\b/) || [''])[0];

export function cocokkan(acuan, mitra) {
  const out = {};
  for (const nama of acuan) {
    const k = inti(nama);
    let hit = mitra.filter((m) => inti(m.nama) === k || inti(m.singkat) === k);
    if (!hit.length) hit = mitra.filter((m) => k.length >= 6 && (inti(m.nama).includes(k) || inti(m.singkat).includes(k)));
    out[nama] = hit;
  }
  return out;
}

// Cocokkan ulang ke info perseroan. Tidak ketemu/ganda dicatat, tidak ditebak.
export async function sinkronInnerCity(env) {
  const mitra = await listMitra(env, { limit: 5000 });
  const hasil = cocokkan(INNER_CITY, mitra);
  const t = now();
  const stmts = [env.DB.prepare("DELETE FROM pks_mitra_kelompok WHERE kelompok = 'inner_city'"), env.DB.prepare("DELETE FROM pks_kelompok_acuan WHERE kelompok = 'inner_city'")];
  const ringkas = { cocok: 0, tidak_ketemu: [], ganda: [] };
  for (const nama of INNER_CITY) {
    const h = hasil[nama];
    if (h.length === 1) {
      ringkas.cocok++;
      stmts.push(env.DB.prepare("INSERT INTO pks_mitra_kelompok (source_row, kelompok, nama_acuan, dicocokkan_pada) VALUES (?, 'inner_city', ?, ?)").bind(h[0].row, nama, t));
      stmts.push(env.DB.prepare("INSERT INTO pks_kelompok_acuan (kelompok, nama_acuan, source_row, catatan) VALUES ('inner_city', ?, ?, ?)").bind(nama, h[0].row, badan(h[0].nama) !== badan(nama) ? `Di info perseroan tertulis ${h[0].nama}` : null));
    } else {
      (h.length ? ringkas.ganda : ringkas.tidak_ketemu).push(h.length ? { nama, kandidat: h.map((x) => x.nama) } : nama);
      stmts.push(env.DB.prepare("INSERT INTO pks_kelompok_acuan (kelompok, nama_acuan, source_row, catatan) VALUES ('inner_city', ?, NULL, ?)").bind(nama, h.length ? 'Ganda: ' + h.map((x) => x.nama).join(' | ') : 'Tidak ketemu di info perseroan'));
    }
  }
  await env.DB.batch(stmts);
  return { total: INNER_CITY.length, ...ringkas };
}

const hariIni = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
export function statusKontrak(p, today = hariIni()) {
  if (!p) return 'belum_ada';
  if (p.tahap < 7) return 'proses';
  if (p.tgl_berakhir && p.tgl_berakhir < today) return 'berakhir';
  if (p.tgl_berakhir && p.tgl_berakhir <= new Date(Date.parse(today) + 90 * 86400_000).toISOString().slice(0, 10)) return 'akan_berakhir';
  return 'aktif';
}

// Satu baris per mitra inner city: kontrak terbaru (final dahulu, lalu yang masih berjalan).
export async function overview(env, { jenis = '' } = {}) {
  const acuan = (await env.DB.prepare("SELECT nama_acuan, source_row, catatan FROM pks_kelompok_acuan WHERE kelompok = 'inner_city'").all()).results;
  const rows = (await env.DB.prepare("SELECT id, kode, mitra_row, snapshot_mitra, jenis, judul, nomor_surat, tahap, status, tenggat, tgl_efektif, tgl_berakhir FROM pks_perjanjian WHERE status != 'batal'" + (jenis ? ' AND jenis = ?' : '') + ' ORDER BY dibuat_pada DESC').bind(...(jenis ? [jenis] : [])).all()).results;
  const mitra = await listMitra(env, { ids: acuan.filter((a) => a.source_row).map((a) => a.source_row) });
  const mm = new Map(mitra.map((m) => [m.row, m]));
  const today = hariIni();
  const daftar = acuan.map((a) => {
    const m = a.source_row ? mm.get(a.source_row) : null;
    const ps = rows.filter((r) => r.mitra_row === a.source_row);
    const p = ps.find((r) => r.tahap === 7) || ps[0] || null;
    return { acuan: a.nama_acuan, catatan: a.catatan, mitra: m ? { row: m.row, nama: m.nama, jenis: m.jenis, status: m.status, ada_email: (m.emails || []).length > 0 } : null, status: a.source_row ? statusKontrak(p, today) : 'tidak_ketemu', perjanjian: p ? { id: p.id, kode: p.kode, nomor_surat: p.nomor_surat, tahap: p.tahap, tgl_efektif: p.tgl_efektif, tgl_berakhir: p.tgl_berakhir } : null };
  }).sort((a, b) => a.acuan.localeCompare(b.acuan));
  const hitung = {};
  for (const d of daftar) hitung[d.status] = (hitung[d.status] || 0) + 1;
  const ic = new Set(acuan.filter((a) => a.source_row).map((a) => a.source_row));
  const semua = rows.map((r) => {
    let nama = ''; try { nama = JSON.parse(r.snapshot_mitra).nama; } catch {}
    return { id: r.id, kode: r.kode, judul: r.judul, jenis: r.jenis, mitra: nama, inner_city: ic.has(r.mitra_row), nomor_surat: r.nomor_surat, tahap: r.tahap, tgl_berakhir: r.tgl_berakhir, tenggat: r.tenggat, status: statusKontrak(r, today) };
  });
  const jml = (f) => semua.filter(f).length;
  const kpi = { total: semua.length, berjalan: jml((x) => x.tahap < 7), aktif: jml((x) => x.status === 'aktif'), akan_berakhir: jml((x) => x.status === 'akan_berakhir'), berakhir: jml((x) => x.status === 'berakhir'), telat: jml((x) => x.tahap < 7 && x.tenggat && x.tenggat < today) };
  const pipeline = [0, 1, 2, 3, 4, 5, 6, 7].map((n) => ({ tahap: n, jumlah: semua.filter((x) => x.tahap === n).length }));
  return { total: INNER_CITY.length, tersinkron: acuan.length > 0, hitung, daftar, semua, kpi, pipeline };
}

// Seluruh mitra di info perseroan + penanda Inner City + status perjanjian terbarunya (untuk daftar kirim sekaligus).
export async function daftarMitra(env) {
  const mitra = await listMitra(env, { limit: 5000 });
  const ic = new Set((await env.DB.prepare("SELECT source_row FROM pks_mitra_kelompok WHERE kelompok = 'inner_city' AND source_row IS NOT NULL").all()).results.map((r) => r.source_row));
  const rows = (await env.DB.prepare("SELECT id, mitra_row, tahap, tgl_berakhir FROM pks_perjanjian WHERE status != 'batal' ORDER BY dibuat_pada DESC").all()).results;
  const today = hariIni();
  return mitra.map((m) => {
    const ps = rows.filter((r) => r.mitra_row === m.row);
    const p = ps.find((r) => r.tahap === 7) || ps[0] || null;
    return { row: m.row, nama: m.nama, jenis: m.jenis, status_mitra: m.status, ada_email: m.emails.length > 0, inner_city: ic.has(m.row), status: statusKontrak(p, today), perjanjian_id: p ? p.id : null };
  });
}
