// Salinan data perjanjian ke spreadsheet (VM Starlite Sheet). Spreadsheet = catatan resmi data; dokumen tetap di Cloudflare.
// Setiap perubahan menandai perjanjian "antre"; antrean dikirim di akhir permintaan (latar belakang) dan oleh cron bila gagal.
import { googleEnabled, sheetUpsert } from './google.js';
import { now, uiUrl } from './util.js';

export const SHEET = { PKS: 'PKS PJ', MS: 'PKS MS & SPK MS' };

/** Nilai dropdown PROGRES (urutan sama dengan di spreadsheet). */
export const PROGRES = ['DRAFT DI BUAT', 'REVIEW DRAFT', 'DONE EMAIL TO MITRA', 'FEEDBACK MITRA', 'REVIEW LEGAL IJE', 'NO PKS RILIS', 'PROSES SIGN MITRA', 'DONE SIGN MITRA', 'PROSES SIGN IJE', 'DONE SIGN IJE', 'DONE'];

export async function tandaiSheet(env, id) {
  await env.DB.prepare("UPDATE pks_perjanjian SET sheet_status = 'antre' WHERE id = ?").bind(id).run();
}

const sama = (a, b) => String(a || '').trim().toUpperCase().replace(/\s+/g, ' ') === String(b || '').trim().toUpperCase().replace(/\s+/g, ' ');
const kosong = (v) => !v || v === '-';
const isi = (v) => (kosong(v) ? '' : v);

/** PROGRES menurut tahap + kejadian (revisi draf, sub-status TTD, arsip). */
export async function progresDari(env, p) {
  const t = p.tahap;
  if (t === 0 || t === 2) {
    const m = await env.DB.prepare("SELECT COUNT(*) n, MAX(dibuat_pada) akhir FROM pks_dokumen WHERE perjanjian_id = ? AND jenis = 'master'").bind(p.id).first();
    if (t === 0) return m.n > 1 ? 'REVIEW DRAFT' : 'DRAFT DI BUAT';
    const fb = await env.DB.prepare('SELECT MAX(diterima_pada) akhir FROM pks_feedback WHERE perjanjian_id = ?').bind(p.id).first();
    return fb.akhir && m.akhir && m.akhir > fb.akhir ? 'REVIEW DRAFT' : 'FEEDBACK MITRA';
  }
  if (t === 1) return 'DONE EMAIL TO MITRA';
  if (t === 3) return 'REVIEW LEGAL IJE';
  if (t === 4) return 'NO PKS RILIS';
  if (t === 5) return 'PROSES SIGN MITRA';
  if (t === 6) return p.sub_progres === 'PROSES SIGN IJE' ? 'PROSES SIGN IJE' : 'DONE SIGN MITRA';
  return p.arsip_url ? 'DONE' : 'DONE SIGN IJE';
}

/** Isi baris spreadsheet (nama kolom = judul kolom di baris 1). */
export async function barisSheet(env, p, isian) {
  const m = p.mitra || {};
  const wakil = isian.wakil, direksi = m.direksi || '';
  const beda = !kosong(wakil) && !!direksi && !sama(wakil, direksi);
  const fb = await env.DB.prepare("SELECT isi, pengirim FROM pks_feedback WHERE perjanjian_id = ? AND sumber != 'vm' ORDER BY diterima_pada DESC LIMIT 1").bind(p.id).first();
  const pic = await env.DB.prepare('SELECT nama FROM pks_pengguna WHERE email = ?').bind(p.pic_vm).first();
  const progres = await progresDari(env, p);
  const tautan = p.arsip_url || `${uiUrl(env)}/#/pks/perjanjian/${p.id}`;
  const batal = p.status === 'batal' ? `DIBATALKAN: ${p.alasan_batal || ''}` : '';
  const umum = {
    'NAMA MITRA': isian.nama || m.nama,
    'JABATAN': beda ? 'Direktur' : (isi(isian.jabatan) || 'Direktur'),
    'NAMA DIREKSI': direksi || isi(wakil),
    'WAKIL': beda ? wakil : '',
    'JABATAN WAKIL': beda ? isi(isian.jabatan) : '',
    'EMAIL': isi(isian.email) || (m.emails || []).join('; '),
    'PIC': pic?.nama || p.pic_vm,
    'NO ID': p.kode,
  };
  if (p.jenis === 'MS') {
    return {
      ...umum,
      'KONTAK': isi(isian.telp) || m.telepon || '',
      'JENIS KONTRAKTOR': m.jenis || '',
      'ALAMAT': isi(isian.alamat) || m.alamat || '',
      'NAMA PEMILIK REKENING': isi(isian.atas_nama),
      'NAMA BANK': isi(isian.bank),
      'CABANG': isi(isian.cabang),
      'REMARK SANS': [batal, p.remark_vm].filter(Boolean).join(' | '),
      'REMARK LEGAL IJE': p.remark_legal || '',
      'REMARK MITRA': fb ? String(fb.isi).slice(0, 500) : '',
      'PROGRES SPK MS': progres,
      'PROGRES PKS MS': progres,
      'ATC PKS MS & SPK MS': tautan,
      'NO REKENING': kosong(isian.no_rek) ? '' : `'${isian.no_rek}`,
      'TANGGAL PKS MS': isian.tanggal || '',
      'NO PKS MS': p.nomor_surat || '',
      'TANGGAL SPK MS': isian.tanggal_spk || '',
      'NO SPK MS': p.nomor_spk || '',
      'ALAMAT GUDANG': isi(isian.gudang_alamat),
      'KOTA GUDANG': isi(isian.gudang_kota),
      'LEAD TIME IKR (JAM)': kosong(isian.lead_ikr) ? '' : Number(isian.lead_ikr),
    };
  }
  const remark = [batal, fb ? `Mitra: ${fb.isi}` : '', p.remark_legal ? `Legal: ${p.remark_legal}` : '', p.remark_vm ? `VM: ${p.remark_vm}` : ''].filter(Boolean).join(' | ').slice(0, 800);
  return {
    ...umum,
    'TANGGAL': isian.tanggal || '',
    'ALAMAT PERUSAHAN': m.alamat || isi(isian.alamat),
    'NO PKS': p.nomor_surat || '',
    'PROGRES': progres,
    'REMARK': remark,
    'ATC FINAL DRAF': tautan,
    'DOMISILI': isi(isian.domisili),
    'TELP': isi(isian.telp) || m.telepon || '',
  };
}

/** Kirim satu perjanjian ke spreadsheet. Tidak melempar galat; status tercatat di sheet_status. */
export async function sinkronSatu(env, id, { isianTerkini, loadP }) {
  if (!googleEnabled(env)) return { id, ok: false, galat: 'jembatan Google nonaktif' };
  // 'kirim' = sedang dikirim. Bila ada perubahan baru di tengah jalan, status kembali 'antre' dan tidak ditimpa 'ok'.
  await env.DB.prepare("UPDATE pks_perjanjian SET sheet_status = 'kirim', sheet_waktu = ? WHERE id = ?").bind(now(), id).run();
  try {
    const p = await loadP(env, id);
    let isian = {};
    try { isian = await isianTerkini(env, id); } catch {}
    const data = await barisSheet(env, p, isian);
    const r = await sheetUpsert(env, SHEET[p.jenis] || SHEET.PKS, p.kode, data);
    await env.DB.prepare("UPDATE pks_perjanjian SET sheet_status = 'ok', sheet_waktu = ? WHERE id = ? AND sheet_status = 'kirim'").bind(now(), id).run();
    return { id, ok: true, baris: r?.row };
  } catch (e) {
    await env.DB.prepare("UPDATE pks_perjanjian SET sheet_status = ?, sheet_waktu = ? WHERE id = ? AND sheet_status = 'kirim'").bind(`gagal: ${String(e.message).slice(0, 180)}`, now(), id).run();
    return { id, ok: false, galat: e.message };
  }
}

/** Kirim antrean (antre dulu, lalu yang gagal). */
export async function sinkronAntre(env, deps, batas = 10) {
  if (!googleEnabled(env)) return [];
  const rows = (await env.DB.prepare("SELECT id FROM pks_perjanjian WHERE sheet_status = 'antre' OR sheet_status LIKE 'gagal%' OR (sheet_status = 'kirim' AND sheet_waktu < ?) OR sheet_status IS NULL ORDER BY CASE WHEN sheet_status = 'antre' THEN 0 ELSE 1 END, diperbarui_pada DESC LIMIT ?").bind(new Date(Date.now() - 600_000).toISOString(), batas).all()).results;
  const out = [];
  for (const r of rows) out.push(await sinkronSatu(env, r.id, deps));
  return out;
}
