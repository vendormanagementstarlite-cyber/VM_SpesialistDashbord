// Uji end-to-end terhadap `wrangler dev` lokal (mode dev). Jalankan: node test/e2e.mjs
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const ADMIN = 'vendormanagement@pmosurge.co.id', LEGAL = 'legal.uji@pmosurge.co.id', MGMT = 'direksi.uji@pmosurge.co.id';
mkdirSync('test/out', { recursive: true });

let pass = 0, failN = 0;
const ok = (cond, name, extra = '') => { if (cond) { pass++; console.log('  ✓', name); } else { failN++; console.log('  ✗', name, extra); } };

async function api(path, { method = 'GET', body, user = ADMIN, token, form, raw } = {}) {
  const headers = { 'x-dev-user': user };
  if (token) headers['x-portal-token'] = token;
  let b;
  if (form) { b = new FormData(); for (const [k, v] of Object.entries(form)) b.append(k, v); }
  else if (body !== undefined) { headers['content-type'] = 'application/json'; b = JSON.stringify(body); }
  const r = await fetch(BASE + path, { method, headers, body: b });
  if (raw) return r;
  const j = await r.json().catch(() => ({}));
  return { status: r.status, ...j, _json: j };
}

async function pdf(pages, label) {
  const d = await PDFDocument.create();
  const f = await d.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= pages; i++) {
    const p = d.addPage([595, 842]);
    p.drawText(`${label} — halaman ${i}/${pages}`, { x: 60, y: 780, size: 14, font: f, color: rgb(0.04, 0.23, 0.46) });
    if (i === pages) { p.drawText('PIHAK KEDUA (Mitra)', { x: 60, y: 260, size: 11, font: f }); p.drawText('PIHAK PERTAMA (PT IJE)', { x: 360, y: 260, size: 11, font: f }); }
  }
  return new Blob([await d.save()], { type: 'application/pdf' });
}
// PNG tanda tangan sederhana (dibuat dengan pdf-lib tidak bisa; pakai PNG 1x1 diperbesar? gunakan PNG valid kecil)
import { readFileSync } from 'node:fs';
function pngSig() {
  return new Blob([readFileSync('test/fixtures/ttd-scan.png')], { type: 'image/png' });
}
function _unused() {
  // PNG 4x2 RGBA biru tua, cukup untuk uji embed
  const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAQAAAACCAYAAACZgbYnAAAAFklEQVR4nGNgYGD4z4AKGBkYGEgFAA0DAQEz9vC1AAAAAElFTkSuQmCC';
  return new Blob([Buffer.from(b64, 'base64')], { type: 'image/png' });
}
const tokenOf = (url) => url.split('#t=')[1];
const d1 = (sql) => { try { return execSync(`npx wrangler d1 execute starlite-pks --local --command ${JSON.stringify(sql)} 2>&1`).toString(); } catch (e) { return e.stdout.toString() + e.stderr?.toString(); } };

console.log('Starlite — uji end-to-end\n');

console.log('Sesi & data mitra');
const me = await api('/api/me');
ok(me.status === 200 && me.peran === 'admin', 'login dev sebagai admin');
ok((await api('/api/me', { user: 'orang.luar@gmail.com' })).status === 403, 'akun tidak terdaftar ditolak (403)');
const mitra = await api('/api/mitra?batch=1');
ok(Array.isArray(mitra._json) && mitra._json.length === 10, 'daftar batch awal terbaca dari starlite-vm (10 mitra di seed lokal)', JSON.stringify(mitra).slice(0, 200));
const genz = mitra._json.find((m) => m.row === 126);
ok(genz && genz.emails.length === 3, 'email multi-alamat dinormalisasi (3 alamat GENZ)');
const pad = mitra._json.find((m) => m.row === 241);
ok(pad && pad.emails.length === 1, 'format <alamat> tidak menggandakan email');

console.log('\nTahap 0 — buat perjanjian');
const ISI = { tanggal: '2026-11-18', nama: 'PT DESNARUM UJI', domisili: 'Jakarta Selatan', wakil: 'Budi Santoso', jabatan: 'Direktur', alamat: 'Jl. Uji Coba No. 1, Jakarta', telp: '021 5551234', email: 'legal@desnarum.example', up: 'Siti - Legal' };
const isi = (o = {}) => JSON.stringify({ ...ISI, ...o });
const tpl = await api('/api/template');
ok(tpl.status === 200 && tpl.fields.length === 9 && tpl.halaman === 29 && tpl.maks.nama > 20, 'daftar isian template (9 isian kuning, 29 halaman)');
ok((await api('/api/perjanjian', { method: 'POST', form: { mitra_row: 94, judul: 'PKS Jasa FTTH', isi: isi({ nama: 'X'.repeat(80) }) } })).status === 400, 'isian terlalu panjang untuk kolom template ditolak');
ok((await api('/api/perjanjian', { method: 'POST', form: { mitra_row: 94, judul: 'PKS Jasa FTTH', isi: isi({ tanggal: '2027-01-05' }) } })).status === 400, 'tanggal di luar tahun template ditolak');
ok((await api('/api/perjanjian', { method: 'POST', form: { mitra_row: 94, judul: 'PKS Jasa FTTH', isi: isi({ wakil: '' }) } })).status === 400, 'isian kosong ditolak');
ok((await api('/api/perjanjian', { method: 'POST', user: MGMT, form: { mitra_row: 94, judul: 'x', isi: isi() } })).status === 403, 'peran Manajemen tidak bisa membuat perjanjian');
const c1 = await api('/api/perjanjian', { method: 'POST', form: { mitra_row: 94, jenis: 'PKS', judul: 'Perjanjian Kerja Sama Jasa FTTH 2026', isi: isi() } });
ok(c1.status === 201 && c1.id, 'perjanjian dibuat', JSON.stringify(c1));
const id = c1.id;
let det = await api(`/api/perjanjian/${id}`);
ok(det.tahap === 0 && det.dokumen.length === 1 && det.dokumen[0].halaman === 29 && det.dokumen[0].sha256.length === 64, 'master tersimpan dengan hash & jumlah halaman');

const c2 = await api('/api/perjanjian', { method: 'POST', form: { mitra_row: 400, judul: 'PKS Lentera', isi: isi() } });
const k2 = await api(`/api/perjanjian/${c2.id}/kirim`, { method: 'POST' });
ok(k2.status === 422 && /Email/.test(k2.error), 'kirim ke mitra tanpa email ditolak dengan pesan jelas', JSON.stringify(k2));

console.log('\nTahap 1 — kirim ke mitra');
ok((await api(`/api/perjanjian/${id}/legal`, { method: 'POST' })).status === 409, 'tidak bisa lompat ke Legal dari Draf');
const k1 = await api(`/api/perjanjian/${id}/kirim`, { method: 'POST' });
ok(k1.status === 200 && k1.mode === 'simulasi' && k1.portal, 'email terkirim (simulasi) + tautan portal');
const tFeedback = tokenOf(k1.portal);
det = await api(`/api/perjanjian/${id}`);
ok(det.tahap === 1 && det.tenggat && det.email[0].penerima.includes('desnarum'), 'tahap 1, tenggat SLA terisi, penerima benar');

console.log('\nIsian kuning lewat aplikasi (VM dan mitra)');
const ik = await api(`/api/perjanjian/${id}/isian`);
ok(ik.status === 200 && ik.nama === 'PT DESNARUM UJI' && ik.tanggal === '2026-11-18' && ik.hari === 'Rabu', 'isian terkini terbaca (tanggal dan hari turunan)');
ok((await api(`/api/perjanjian/${id}/isian`, { method: 'POST', body: { isi: ISI } })).status === 400, 'simpan tanpa perubahan ditolak');
ok((await api(`/api/perjanjian/${id}/isian`, { method: 'POST', user: LEGAL, body: { isi: { ...ISI, jabatan: 'Komisaris' } } })).status === 403, 'hanya VM yang dapat mengubah isian');
const ub = await api(`/api/perjanjian/${id}/isian`, { method: 'POST', body: { isi: { ...ISI, jabatan: 'Direktur Utama' } } });
det = await api(`/api/perjanjian/${id}`);
ok(ub.ok && ub.berubah.join() === 'jabatan' && det.dokumen.filter((d) => d.jenis === 'master').length === 2, 'VM mengubah isian: master versi 2 dibuat, hanya "jabatan" berubah', JSON.stringify(ub));
ok((await api(`/api/perjanjian/${id}/isian`)).jabatan === 'Direktur Utama', 'isian terkini mengikuti versi terbaru');

console.log('\nTahap 2 — feedback mitra (portal)');
ok((await api('/api/portal', { token: 'salah-token-xxxxxxxxxxxxxxx' })).status === 401, 'token palsu ditolak');
const pv = await api('/api/portal', { token: tFeedback });
ok(pv.status === 200 && pv.bisa_feedback && !pv.bisa_ttd, 'portal mitra terbuka untuk tanggapan');
const dl = await api('/api/portal/dokumen', { token: tFeedback, raw: true });
ok(dl.status === 200 && (await dl.arrayBuffer()).byteLength > 500, 'mitra dapat mengunduh dokumen');
ok((await api('/api/portal/ttd', { method: 'POST', token: tFeedback, form: { opsi: '2', berkas: await pdf(29, 'scan') } })).status === 403, 'token tanggapan tidak bisa dipakai untuk TTD');
ok(pv.isian && pv.isian.fields.length === 9 && pv.isian.nilai.jabatan === 'Direktur Utama', 'portal memuat isian kuning untuk mitra');
const mi = await api('/api/portal/isian', { method: 'POST', token: tFeedback, body: { isi: { ...pv.isian.nilai, wakil: 'Budi Santoso, S.H.', alamat: 'Jl. Baru No. 9, Bandung' } } });
ok(mi.ok && mi.berubah.sort().join() === 'alamat,wakil', 'mitra memperbarui isian lewat portal', JSON.stringify(mi));
ok((await api('/api/portal/isian', { method: 'POST', token: tFeedback, body: { isi: { ...pv.isian.nilai, wakil: '' } } })).status === 400, 'isian kosong dari mitra ditolak');
ok(det && (await api(`/api/perjanjian/${id}`)).email.some((e) => e.tipe === 'isian'), 'PIC VM diberi tahu bahwa mitra memperbarui isian');
await api('/api/portal/feedback', { method: 'POST', token: tFeedback, body: { nama: 'Budi (Direktur)', isi: 'Mohon pasal 5 tentang termin pembayaran dijelaskan.' } });
det = await api(`/api/perjanjian/${id}`);
ok(det.tahap === 2, 'catatan mitra: tetap di langkah Review mitra');
ok((await api(`/api/perjanjian/${id}/legal`, { method: 'POST', user: LEGAL })).status === 403, 'Legal tidak bisa meneruskan ke dirinya');
await api('/api/portal/feedback', { method: 'POST', token: tFeedback, body: { setuju: true } });
det = await api(`/api/perjanjian/${id}`);
ok(det.tahap === 3 && det.feedback.length === 2 && det.feedback[1].setuju === 1, 'mitra setuju: otomatis diteruskan ke Legal');

console.log('\nNomor surat (Legal) — otomatis dikirim ke mitra untuk TTD');
ok((await api(`/api/perjanjian/${id}/nomor`, { method: 'POST', user: LEGAL, form: { nomor_surat: 'x' } })).status === 400, 'format nomor tidak valid ditolak');
ok((await api(`/api/perjanjian/${id}/nomor`, { method: 'POST', user: LEGAL, form: { nomor_surat: 'N'.repeat(70) } })).status === 400, 'nomor terlalu panjang untuk kolom template ditolak');
ok((await api(`/api/perjanjian/${id}/isian`, { method: 'POST', body: { isi: { ...ISI, jabatan: 'Direktur' } } })).status === 409, 'isian terkunci setelah diserahkan ke Legal');
const n1 = await api(`/api/perjanjian/${id}/nomor`, { method: 'POST', user: LEGAL, form: { nomor_surat: '001/PKS/IJE/XI/2026' } });
ok(n1.ok && n1.otomatis && n1.portal, 'nomor terbit dan dokumen bernomor otomatis dikirim ke mitra', JSON.stringify(n1));
det = await api(`/api/perjanjian/${id}`);
ok(det.tahap === 5 && det.email.some((e) => e.tipe === 'bagikan'), 'langsung masuk langkah TTD mitra');
const tTtd = tokenOf(n1.portal);
ok((await api('/api/portal', { token: tFeedback })).status === 401, 'tautan lama otomatis dicabut');

console.log('\nTahap 6 — TTD mitra (dua opsi)');
const prev = await api('/api/portal/pratinjau-ttd', { method: 'POST', token: tTtd, form: { berkas: pngSig() }, raw: true });
const prevBytes = new Uint8Array(await prev.arrayBuffer());
ok(prev.status === 200 && prev.headers.get('content-type') === 'application/pdf', 'pratinjau opsi 1 menghasilkan PDF');
writeFileSync('test/out/pratinjau-ttd.pdf', prevBytes);
det = await api(`/api/perjanjian/${id}`);
ok(det.dokumen.filter((d) => d.jenis === 'ttd_mitra').length === 0, 'pratinjau tidak menyimpan dokumen');
ok((await api('/api/portal/ttd', { method: 'POST', token: tTtd, form: { opsi: '2', berkas: await pdf(1, 'scan') } })).status === 422, 'opsi 2: scan kurang halaman ditolak');
ok((await api('/api/portal/ttd', { method: 'POST', token: tTtd, form: { opsi: '1', berkas: new Blob(['x'], { type: 'image/gif' }) } })).status === 400, 'opsi 1: format gambar tidak didukung ditolak');
ok((await api('/api/portal/ttd', { method: 'POST', token: tTtd, form: { opsi: '1', berkas: pngSig() } })).ok, 'opsi 1: TTD ditempel otomatis, menunggu review');
ok((await api(`/api/perjanjian/${id}/ttd-mitra/review`, { method: 'POST', body: { setuju: false, alasan: '' } })).status === 400, 'penolakan tanpa alasan ditolak');
const rj = await api(`/api/perjanjian/${id}/ttd-mitra/review`, { method: 'POST', body: { setuju: false, alasan: 'Meterai tidak terlihat jelas pada scan' } });
ok(rj.ok && rj.portal, 'VM menolak TTD, tautan unggah ulang terkirim');
const tTtd2 = tokenOf(rj.portal);
ok((await api('/api/portal/ttd', { method: 'POST', token: tTtd2, form: { opsi: '2', berkas: await pdf(29, 'SCAN BERTANDA TANGAN') } })).ok, 'opsi 2: scan dokumen penuh diunggah');
ok((await api(`/api/perjanjian/${id}/ttd-mitra/review`, { method: 'POST', body: { setuju: true } })).ok, 'VM menyetujui TTD mitra');
det = await api(`/api/perjanjian/${id}`);
const ttdDocs = det.dokumen.filter((d) => d.jenis === 'ttd_mitra');
ok(det.tahap === 6 && ttdDocs.some((d) => d.penanda === 'hasil_tempel' && d.status === 'ditolak') && ttdDocs.some((d) => d.penanda === 'scan_asli' && d.status === 'aktif'), 'penanda Hasil Tempel/Scan Asli & status tersimpan');

console.log('\nTahap 7 — TTD PT IJE & arsip final');
ok((await api(`/api/perjanjian/${id}/ttd-ije`, { method: 'POST', user: MGMT, form: { opsi: '1', berkas: pngSig() } })).status === 403, 'bukan penandatangan ditolak');
const f1 = await api(`/api/perjanjian/${id}/ttd-ije`, { method: 'POST', form: { opsi: '1', berkas: pngSig(), tgl_efektif: '2026-11-20' } });
ok(f1.ok, 'PT IJE TTD (opsi 1), perjanjian selesai', JSON.stringify(f1));
det = await api(`/api/perjanjian/${id}`);
ok(det.tahap === 7 && det.tgl_berakhir === '2027-11-19' && det.tampil === 'aktif', 'tanggal efektif & berakhir (12 bulan) benar');
const final = det.dokumen.find((d) => d.jenis === 'final');
const fr = await api(`/api/dokumen/${final.id}`, { raw: true });
const finalBytes = new Uint8Array(await fr.arrayBuffer());
writeFileSync('test/out/final.pdf', finalBytes);
ok((await PDFDocument.load(finalBytes)).getPageCount() === 29, 'dokumen final terbaca, 29 halaman');
ok(det.email.some((e) => e.tipe === 'final'), 'salinan final dikirim ke mitra');
ok((await api(`/api/perjanjian/${id}/batal`, { method: 'POST', body: { alasan: 'uji batal setelah final' } })).status === 409, 'perjanjian final tidak bisa dibatalkan');

console.log('\nIntegritas & audit');
const masterDoc = det.dokumen.find((d) => d.jenis === 'master');
const out1 = d1(`UPDATE pks_dokumen SET sha256='abc' WHERE id='${masterDoc.id}'`);
ok(/terkunci/i.test(out1), 'metadata dokumen terkunci (trigger DB)');
const out2 = d1(`DELETE FROM pks_audit`);
ok(/tidak dapat dihapus/i.test(out2), 'audit log tidak dapat dihapus (trigger DB)');
d1(`UPDATE pks_blob_part SET data = X'00' WHERE id = (SELECT storage_id FROM pks_dokumen WHERE id='${masterDoc.id}')`);
const tam = await api(`/api/dokumen/${masterDoc.id}`);
ok(tam.status === 409 && /tidak sesuai/.test(tam.error), 'berkas diubah di luar aplikasi terdeteksi "tidak sesuai"');
ok(det.audit.length >= 15, `audit log lengkap (${det.audit.length} entri)`);

console.log('\nKoreksi alur, pengingat, dashboard');
const c3 = await api('/api/perjanjian', { method: 'POST', form: { mitra_row: 336, judul: 'PKS Triza', isi: isi() } });
await api(`/api/perjanjian/${c3.id}/kirim`, { method: 'POST' });
ok((await api(`/api/perjanjian/${c3.id}/mundur`, { method: 'POST', body: { ke: 0, alasan: '' } })).status === 400, 'pengembalian tanpa alasan ditolak');
ok((await api(`/api/perjanjian/${c3.id}/mundur`, { method: 'POST', body: { ke: 0, alasan: 'Lampiran salah, kirim ulang' } })).ok, 'tahap dikembalikan dengan alasan');
await api(`/api/perjanjian/${c3.id}/kirim`, { method: 'POST' });
d1(`UPDATE pks_perjanjian SET tenggat='2026-01-01T00:00:00.000Z' WHERE id='${c3.id}'`);
const cr = await api('/api/dev/cron', { method: 'POST' });
ok(cr.ok && cr.log.some((l) => l.includes('telat')), 'cron kirim pengingat terlambat', JSON.stringify(cr));
const cr2 = await api('/api/dev/cron', { method: 'POST' });
ok(cr2.ok && !cr2.log.some((l) => l.includes(c3.id)) && cr2.log.filter((l) => l.includes('telat')).length === 0, 'pengingat tidak terkirim ganda');
ok((await api(`/api/perjanjian/${c2.id}/batal`, { method: 'POST', body: { alasan: 'Email mitra belum tersedia' } })).ok, 'perjanjian dibatalkan dengan alasan');
const dash = await api('/api/dashboard');
ok(dash.kpi.berjalan === 1 && dash.kpi.telat === 1 && dash.kpi.selesai === 1 && dash.pipeline.length === 5, 'dashboard: KPI & pipeline sesuai', JSON.stringify(dash.kpi));
ok(dash.tindakan.length === 1 && dash.aktivitas.length > 0, 'dashboard: tindakan & aktivitas');
const ld = await api('/api/dashboard', { user: LEGAL });
ok(ld.tindakan.length === 0, 'Legal hanya melihat antreannya (kosong)');
const list = await api('/api/perjanjian?q=TRIZA');
ok(list._json.length === 1 && list._json[0].tampil === 'terlambat', 'pencarian & status tampil "terlambat"');

console.log('\nLogin (database Cloudflare)');
const PW = 'Uji-Starlite-2026';
const login = (email, password, extra = {}) => fetch(BASE + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json', ...extra }, body: JSON.stringify({ email, password }) });
const cookieOf = (r) => (r.headers.get('set-cookie') || '').split(';')[0];
const withCookie = (ck, path, init = {}) => fetch(BASE + path, { ...init, headers: { cookie: ck, ...(init.headers || {}) } });
ok((await fetch(BASE + '/api/me')).status === 401, 'tanpa sesi: /api/me = 401');
const salah = await login(ADMIN, 'salah-banget-12');
ok(salah.status === 401 && (await salah.json()).error === 'Email atau password salah', 'password salah ditolak dengan pesan umum');
const takAda = await login('tidak.ada@x.id', 'salah-banget-12');
ok(takAda.status === 401 && (await takAda.json()).error === 'Email atau password salah', 'email tak terdaftar: pesan sama (tidak membocorkan akun)');
const asing = await login(ADMIN, PW, { origin: 'https://situs-lain.example' });
ok(asing.status === 403, 'permintaan dari origin lain ditolak (CSRF)');
const lg = await login(ADMIN, PW);
const ck = cookieOf(lg);
ok(lg.status === 200 && ck.startsWith('starlite_sesi=') && /httponly/i.test(lg.headers.get('set-cookie')) && /samesite=lax/i.test(lg.headers.get('set-cookie')), 'login benar: cookie sesi HttpOnly + SameSite=Lax');
ok((await (await withCookie(ck, '/api/me')).json()).peran === 'admin', 'sesi cookie dikenali');
ok(!JSON.stringify(await (await withCookie(ck, '/api/admin')).json()).includes('password_hash'), 'hash password tidak pernah dikirim ke klien');
const rawDb = d1("SELECT id FROM pks_sesi");
ok(!rawDb.includes(ck.split('=')[1]), 'token sesi tidak disimpan polos di database');

// Pengguna baru: password sementara, wajib ganti
const baru = 'staf.baru@pmosurge.co.id';
const mk = await api('/api/admin/pengguna', { method: 'POST', body: { email: baru, nama: 'Staf Baru', peran: 'vm' } });
ok(mk.ok && typeof mk.password_awal === 'string' && mk.password_awal.length === 12, 'admin membuat pengguna → password sementara tampil sekali');
const l2 = await login(baru, mk.password_awal), ck2 = cookieOf(l2);
const me2 = await (await withCookie(ck2, '/api/me')).json();
ok(l2.status === 200 && me2.wajib_ganti === 1, 'pengguna baru wajib ganti password');
ok((await withCookie(ck2, '/api/perjanjian')).status === 403, 'sebelum ganti password, fitur lain terkunci');
const gp = (ck, lama, baruPw) => withCookie(ck, '/api/ganti-password', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lama, baru: baruPw }) });
ok((await gp(ck2, 'bukan-lama-123', 'PasswordBaru-2026')).status === 400, 'ganti password: password lama salah ditolak');
ok((await gp(ck2, mk.password_awal, 'pendek')).status === 400, 'ganti password: password pendek ditolak');
ok((await gp(ck2, mk.password_awal, 'PasswordBaru-2026')).status === 200, 'ganti password berhasil');
ok((await withCookie(ck2, '/api/perjanjian')).status === 200, 'setelah ganti password, akses normal');
ok((await login(baru, mk.password_awal)).status === 401 && (await login(baru, 'PasswordBaru-2026')).status === 200, 'password sementara tidak berlaku lagi');

// Reset & penonaktifan mengakhiri sesi
const ck3 = cookieOf(await login(baru, 'PasswordBaru-2026'));
const rs = await api('/api/admin/pengguna/reset', { method: 'POST', body: { email: baru } });
ok(rs.ok && rs.password_awal && (await withCookie(ck3, '/api/me')).status === 401, 'reset password mengakhiri semua sesi pengguna');
const ck4 = cookieOf(await login(baru, rs.password_awal));
await api('/api/admin/pengguna', { method: 'POST', body: { email: baru, nama: 'Staf Baru', peran: 'vm', aktif: false } });
ok((await withCookie(ck4, '/api/me')).status === 401 && (await login(baru, rs.password_awal)).status === 401, 'pengguna dinonaktifkan: sesi berakhir dan tidak bisa masuk');
ok((await api('/api/admin/pengguna', { method: 'POST', body: { email: ADMIN, nama: 'x', peran: 'vm' } })).status === 400, 'admin tidak bisa menurunkan perannya sendiri');

// Penguncian setelah 5 kali gagal
const korban = 'direksi.uji@pmosurge.co.id';
for (let i = 0; i < 5; i++) await login(korban, 'tebakan-salah-' + i);
const kunci = await login(korban, PW);
ok(kunci.status === 429, 'akun terkunci setelah 5 kali gagal (walau password benar)');
d1("UPDATE pks_pengguna SET terkunci_sampai = NULL, gagal_login = 0 WHERE email = 'direksi.uji@pmosurge.co.id'");
ok((await login(korban, PW)).status === 200, 'kunci terbuka setelah masa tunggu');

// Frontend di domain lain (GitHub Pages): CORS + token Bearer
const PAGES = 'https://vendormanagementstarlite-cyber.github.io'; // dashboard VM (satu aplikasi)
const pre = await fetch(BASE + '/api/login', { method: 'OPTIONS', headers: { origin: PAGES, 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization,content-type' } });
ok(pre.status === 204 && pre.headers.get('access-control-allow-origin') === PAGES && /authorization/.test(pre.headers.get('access-control-allow-headers')), 'preflight dari GitHub Pages diizinkan');
const preAsing = await fetch(BASE + '/api/login', { method: 'OPTIONS', headers: { origin: 'https://situs-lain.example', 'access-control-request-method': 'POST' } });
ok(preAsing.status === 403 && !preAsing.headers.get('access-control-allow-origin'), 'preflight dari origin lain ditolak');
const lp = await login(ADMIN, PW, { origin: PAGES });
const lpj = await lp.json();
ok(lp.status === 200 && lp.headers.get('access-control-allow-origin') === PAGES && typeof lpj.token === 'string' && lpj.token.length >= 32, 'login dari Pages: CORS benar + token dikembalikan');
const bearer = (path, init = {}) => fetch(BASE + path, { ...init, headers: { origin: PAGES, authorization: `Bearer ${lpj.token}`, ...(init.headers || {}) } });
const mb = await bearer('/api/me');
ok(mb.status === 200 && (await mb.json()).peran === 'admin' && mb.headers.get('access-control-allow-origin') === PAGES, 'sesi Bearer dikenali');
ok((await bearer('/api/admin/pengguna/reset', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status !== 403, 'POST dari origin Pages tidak ditolak CSRF');
ok((await fetch(BASE + '/api/me', { headers: { origin: PAGES, authorization: 'Bearer salah' } })).status === 401, 'token Bearer salah ditolak');
const pdfCors = await bearer(`/api/dokumen/${final.id}`);
ok(pdfCors.status === 200 && pdfCors.headers.get('access-control-allow-origin') === PAGES && /pdf/.test(pdfCors.headers.get('content-type')), 'PDF dokumen dari dashboard: header CORS ikut terkirim');
const pvc = await bearer("/api/pratinjau", { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ isi: {} }) });
ok([200, 400, 422].includes(pvc.status) && pvc.headers.get('access-control-allow-origin') === PAGES, 'pratinjau dari dashboard: CORS benar');
const kel = await bearer('/api/logout', { method: 'POST' });
ok(kel.status === 200 && (await bearer('/api/me')).status === 401, 'keluar dengan Bearer mencabut sesi');

// Keluar
const out = await withCookie(ck, '/api/logout', { method: 'POST' });
ok(out.status === 200 && (await withCookie(ck, '/api/me')).status === 401, 'keluar: sesi dihapus di server');
const jejak = d1("SELECT aksi FROM pks_audit WHERE aksi LIKE 'login%' OR aksi LIKE 'password%' OR aksi='logout'");
ok(/login_gagal/.test(jejak) && /password_diganti/.test(jejak) && /logout/.test(jejak), 'kejadian login tercatat di audit log');

// ---- Kirim ke semua mitra info perseroan (bukan hanya Inner City) ----
await api('/api/overview/sinkron', { method: 'POST', body: {} });
const om = (await api('/api/overview/mitra'))._json;
ok(Array.isArray(om) && om.length >= 10 && om.some((m) => m.row === 900 && !m.inner_city && m.ada_email && m.status === 'belum_ada'), 'daftar kirim memuat semua mitra info perseroan dengan penanda Inner City');
ok(om.some((m) => m.inner_city) && om.some((m) => m.row === 901 && !m.ada_email), 'penanda Inner City dan email kosong ada');
const ks = await api('/api/overview/kirim-sekaligus', { method: 'POST', body: { rows: [900, 901], batas: 4 } });
ok(ks.hasil.find((h) => h.row === 900)?.ok === true && ks.hasil.find((h) => h.row === 901)?.ok === false, 'kirim sekaligus ke mitra bukan Inner City berhasil; tanpa email ditolak');
const om2 = (await api('/api/overview/mitra'))._json;
ok(om2.find((m) => m.row === 900).status === 'proses', 'mitra non Inner City kini berstatus proses');
console.log(`\nHasil: ${pass} lulus, ${failN} gagal`);
process.exit(failN ? 1 : 0);
