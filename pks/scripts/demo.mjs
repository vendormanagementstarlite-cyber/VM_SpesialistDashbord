// Data demo LOKAL untuk meninjau tampilan. Jangan dijalankan ke produksi.
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { readFileSync } from 'node:fs';
const BASE = 'http://127.0.0.1:8787';
const H = (u = 'vendormanagement@pmosurge.co.id') => ({ 'x-dev-user': u });
async function pdf(n, t) { const d = await PDFDocument.create(); const f = await d.embedFont(StandardFonts.Helvetica); for (let i = 1; i <= n; i++) d.addPage([595, 842]).drawText(`${t} ${i}/${n}`, { x: 60, y: 780, size: 14, font: f }); return new Blob([await d.save()], { type: 'application/pdf' }); }
const sig = () => new Blob([readFileSync('test/fixtures/ttd-scan.png')], { type: 'image/png' });
async function call(path, { form, body, user, token } = {}) {
  const h = { ...H(user) }; if (token) h['x-portal-token'] = token; let b;
  if (form) { b = new FormData(); for (const [k, v] of Object.entries(form)) b.append(k, v); } else if (body) { h['content-type'] = 'application/json'; b = JSON.stringify(body); }
  const r = await fetch(BASE + path, { method: 'POST', headers: h, body: b }); const j = await r.json(); if (!r.ok) throw new Error(path + ': ' + j.error); return j;
}
const tok = (u) => u.split('#t=')[1];
let no = 1;
async function make(row, judul, target) {
  const { id } = await call('/api/perjanjian', { form: { mitra_row: row, judul, master: await pdf(3, judul) } });
  if (target < 1) return id;
  const k = await call(`/api/perjanjian/${id}/kirim`); if (target < 2) return id;
  await call('/api/portal/feedback', { token: tok(k.portal), body: { nama: 'Direktur', isi: 'Mohon kejelasan termin pembayaran pada pasal 6.' } }); if (target < 3) return id;
  await call(`/api/perjanjian/${id}/legal`); if (target < 4) return id;
  const nomor = `${String(no++).padStart(3, '0')}/PKS/IJE/XI/2026`;
  await call(`/api/perjanjian/${id}/nomor`, { user: 'legal.uji@pmosurge.co.id', form: { nomor_surat: nomor, dokumen: await pdf(3, nomor) } }); if (target < 5) return id;
  const b = await call(`/api/perjanjian/${id}/bagikan`); if (target < 5.5) return id;
  await call('/api/portal/ttd', { token: tok(b.portal), form: { opsi: '1', berkas: sig() } }); if (target < 6) return id;
  await call(`/api/perjanjian/${id}/ttd-mitra/review`, { body: { setuju: true } }); if (target < 7) return id;
  await call(`/api/perjanjian/${id}/ttd-ije`, { form: { opsi: '1', berkas: sig(), tgl_efektif: '2026-11-18' } });
  return id;
}
const ids = {};
ids.selesai = await make(94, 'Perjanjian Kerja Sama Jasa FTTH Karangantu', 7);
ids.selesai2 = await make(271, 'Perjanjian Kerja Sama Jasa Instalasi', 7);
ids.review = await make(126, 'Perjanjian Kerja Sama Jasa Pemeliharaan', 5.5);
ids.ttd = await make(378, 'Perjanjian Kerja Sama Jasa Aktivasi', 5);
ids.ije = await make(316, 'Perjanjian Kerja Sama Jasa Backbone', 6);
ids.legal = await make(241, 'Perjanjian Kerja Sama Alih Daya Teknisi', 3);
ids.nomor = await make(167, 'Perjanjian Kerja Sama Jasa IKR', 4);
ids.feedback = await make(336, 'Perjanjian Kerja Sama Jasa Penarikan Kabel', 2);
ids.kirim = await make(358, 'Perjanjian Kerja Sama Jasa Survei', 1);
ids.draf = await make(400, 'Perjanjian Kerja Sama ISP Akuisisi', 0);
console.log(JSON.stringify(ids));
