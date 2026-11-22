// Akses info perseroan di database starlite-vm. HANYA BACA.
import { clean, parseEmails, fail } from './util.js';

const COLS = 'source_row, nama_perusahaan, nama_singkat, jenis_mitra, alamat, direksi, telepon, email, kontak_lain, status_mitra';

function assertSelect(sql) {
  if (!/^\s*select\b/i.test(sql) || /;\s*\S/.test(sql)) throw new Error('Akses starlite-vm hanya SELECT tunggal');
}

async function vmAll(env, sql, ...binds) {
  assertSelect(sql);
  const r = await env.VM.prepare(sql).bind(...binds).all();
  return r.results || [];
}

export function mapMitra(r) {
  if (!r) return null;
  return {
    row: r.source_row,
    nama: clean(r.nama_perusahaan),
    singkat: clean(r.nama_singkat),
    jenis: clean(r.jenis_mitra),
    alamat: clean(r.alamat),
    direksi: clean(r.direksi),
    telepon: clean(r.telepon),
    emails: parseEmails(r.email),
    kontak_lain: clean(r.kontak_lain),
    status: clean(r.status_mitra) || 'Tanpa status',
  };
}

export async function listMitra(env, { q = '', ids = null, limit = 500 } = {}) {
  let rows;
  if (ids && ids.length) {
    const ph = ids.map(() => '?').join(',');
    rows = await vmAll(env, `SELECT ${COLS} FROM mitra WHERE source_row IN (${ph}) ORDER BY nama_perusahaan`, ...ids);
  } else if (q) {
    const like = `%${q.toUpperCase()}%`;
    rows = await vmAll(env, `SELECT ${COLS} FROM mitra WHERE upper(nama_perusahaan) LIKE ? OR upper(nama_singkat) LIKE ? ORDER BY nama_perusahaan LIMIT ?`, like, like, limit);
  } else {
    rows = await vmAll(env, `SELECT ${COLS} FROM mitra ORDER BY nama_perusahaan LIMIT ?`, limit);
  }
  return rows.map(mapMitra);
}

export async function getMitra(env, row) {
  const rows = await vmAll(env, `SELECT ${COLS} FROM mitra WHERE source_row = ?`, Number(row));
  const m = mapMitra(rows[0]);
  if (!m) fail(404, 'Mitra tidak ditemukan di info perseroan');
  return m;
}

export function snapshot(m) {
  return { row: m.row, nama: m.nama, singkat: m.singkat, alamat: m.alamat, direksi: m.direksi, emails: m.emails, diambil_pada: new Date().toISOString() };
}
