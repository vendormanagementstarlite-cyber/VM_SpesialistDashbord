// Penyimpanan berkas. Semua tahap berjalan di Cloudflare (D1, dipotong <1 MB per baris).
// Google Drive hanya untuk arsip final (lihat flow.arsipkan). Berkas lama berstatus 'drive' tetap terbaca dari Drive.
import { driveDownload } from './google.js';
import { uid, fail } from './util.js';

const PART = 900_000; // batas BLOB D1 ~2 MB per baris

export async function putFile(env, { bytes }) {
  const id = uid('blob_');
  const stmts = [];
  for (let n = 0, off = 0; off < bytes.length || n === 0; n++, off += PART) {
    stmts.push(env.DB.prepare('INSERT INTO pks_blob_part (id, n, data) VALUES (?, ?, ?)').bind(id, n, bytes.slice(off, off + PART)));
  }
  await env.DB.batch(stmts);
  return { storage: 'd1', storage_id: id };
}

export async function getFile(env, doc) {
  if (doc.storage === 'drive') return driveDownload(env, doc.storage_id);
  if (doc.storage === 'd1') {
    const rows = (await env.DB.prepare('SELECT data FROM pks_blob_part WHERE id = ? ORDER BY n').bind(doc.storage_id).all()).results;
    if (!rows.length) fail(404, 'Berkas tidak ditemukan');
    const parts = rows.map((r) => new Uint8Array(r.data));
    const out = new Uint8Array(parts.reduce((a, x) => a + x.length, 0));
    let o = 0; for (const x of parts) { out.set(x, o); o += x.length; }
    return out;
  }
  const r = await env.DB.prepare('SELECT data FROM pks_blob WHERE id = ?').bind(doc.storage_id).first();
  if (!r) fail(404, 'Berkas tidak ditemukan');
  return new Uint8Array(r.data);
}
