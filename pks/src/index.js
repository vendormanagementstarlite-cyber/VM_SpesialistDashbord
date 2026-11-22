import { Hono } from 'hono';
import { HttpError, now, fail, escapeHtml, uiUrl } from './lib/util.js';
import { requireUser, allow, cekLogin, buatSesi, akhiriSesi, cabutSemuaSesi, sesiSaatIni } from './lib/auth.js';
import { hashPassword, verifyPassword, passwordSementara, passwordValid, POLA_PASSWORD } from './lib/password.js';
import { listMitra, getMitra } from './lib/mitra.js';
import { googleEnabled, gmailThreadReplies, cekJembatan } from './lib/google.js';
import { sendMail, templates } from './lib/mail.js';
import * as K from './lib/kelompok.js';
import * as F from './lib/flow.js';
import * as L from './lib/legal.js';
import { infoTemplate, buatDraf, cekJenis, belumLengkap } from './lib/dokumen.js';
import { sinkronAntre, sinkronSatu, progresDari, PROGRES, SHEET } from './lib/sheet.js';
import * as TA from './lib/ttdadmin.js';

const sinkDeps = { isianTerkini: F.isianTerkini, loadP: F.loadP };

const app = new Hono();

app.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.message }, err.status);
  console.error(err);
  return c.json({ error: 'Terjadi kesalahan pada server. Coba lagi atau hubungi Admin.', detail: c.env.APP_ENV === 'dev' ? String(err.message) : undefined }, 500);
});

app.use('/api/*', async (c, next) => {
  await next();
  c.header('cache-control', 'no-store');
  c.header('x-content-type-options', 'nosniff');
  // Setiap perubahan data menandai perjanjian "antre"; kirim ke spreadsheet di latar belakang (tidak menunda respons).
  if (c.req.method !== 'GET' && c.req.method !== 'OPTIONS' && c.res.status < 400) {
    try { c.executionCtx.waitUntil(sinkronAntre(c.env, sinkDeps, 6).catch((e) => console.error('sinkron sheet', e.message))); } catch {}
  }
});

// CORS: frontend boleh dihosting di domain lain (mis. GitHub Pages) hanya bila origin-nya terdaftar di CORS_ORIGIN.
// Tanpa cookie lintas situs: sesi memakai header Authorization, jadi tidak ada risiko CSRF dari situs lain.
const originBoleh = (env, o) => !!o && String(env.CORS_ORIGIN || '').split(',').map((x) => x.trim().replace(/\/$/, '')).filter(Boolean).includes(o);
app.use('/api/*', async (c, next) => {
  const o = c.req.header('origin');
  const boleh = originBoleh(c.env, o);
  if (c.req.method === 'OPTIONS') {
    if (!boleh) return c.body(null, 403);
    c.header('access-control-allow-origin', o);
    c.header('vary', 'Origin');
    c.header('access-control-allow-methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    c.header('access-control-allow-headers', 'authorization,content-type,x-portal-token,x-legal-sesi,x-vm-token,x-ttd-sesi');
    c.header('access-control-max-age', '600');
    return c.body(null, 204);
  }
  // Perlindungan CSRF: permintaan yang mengubah data harus berasal dari origin yang sama atau origin terdaftar.
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD' && o && !boleh && new URL(o).host !== new URL(c.req.url).host)
    return c.json({ error: 'Permintaan ditolak (origin tidak cocok)' }, 403);
  await next();
  // Header CORS dipasang SETELAH handler: respons mentah (PDF/berkas) tidak membawa header yang diset sebelum next().
  if (boleh) {
    c.res.headers.set('access-control-allow-origin', o);
    c.res.headers.append('vary', 'Origin');
    c.res.headers.set('access-control-expose-headers', 'content-disposition');
  }
});

const user = (c) => requireUser(c);
const json = async (c) => { try { return await c.req.json(); } catch { return {}; } };

// ---------- Sesi & konfigurasi ----------
app.get('/api/me', async (c) => {
  const u = await requireUser(c, { skipGanti: true, bolehNonAdmin: true });
  return c.json({ ...u, wajib_ganti: c.get('viaDashboard') ? 0 : u.wajib_ganti, terkunci: u.peran !== 'admin', mode: { google: googleEnabled(c.env), env: c.env.APP_ENV } });
});

app.post('/api/login', async (c) => {
  const b = await json(c);
  let email;
  try { email = await cekLogin(c.env, b.email, b.password); }
  catch (err) { await F.audit(c.env, String(b.email || '').slice(0, 120).toLowerCase(), null, 'login_gagal'); throw err; }
  const token = await buatSesi(c, email);
  await F.audit(c.env, email, null, 'login');
  return c.json({ ok: true, token });
});

app.post('/api/logout', async (c) => {
  let email = null;
  try { email = (await requireUser(c, { skipGanti: true, bolehNonAdmin: true })).email; } catch {}
  await akhiriSesi(c);
  if (email) await F.audit(c.env, email, null, 'logout');
  return c.json({ ok: true });
});

app.post('/api/ganti-password', async (c) => {
  const u = await requireUser(c, { skipGanti: true });
  const b = await json(c);
  const row = await c.env.DB.prepare('SELECT password_hash FROM pks_pengguna WHERE email = ?').bind(u.email).first();
  // Password sementara dari admin/secret awal: password lama = yang sedang dipakai masuk; verifikasi hanya bila ada hash.
  if (row.password_hash && !(await verifyPassword(String(b.lama || ''), row.password_hash))) fail(400, 'Password lama salah');
  if (!row.password_hash && !(c.env.ADMIN_PASSWORD_AWAL && String(b.lama || '') === c.env.ADMIN_PASSWORD_AWAL)) fail(400, 'Password lama salah');
  if (!passwordValid(b.baru)) fail(400, 'Password baru tidak memenuhi syarat. ' + POLA_PASSWORD);
  if (b.baru === b.lama) fail(400, 'Password baru harus berbeda dari yang lama');
  await c.env.DB.prepare('UPDATE pks_pengguna SET password_hash = ?, wajib_ganti = 0, gagal_login = 0, terkunci_sampai = NULL WHERE email = ?').bind(await hashPassword(b.baru), u.email).run();
  await cabutSemuaSesi(c.env, u.email, await sesiSaatIni(c));
  await F.audit(c.env, u.email, null, 'password_diganti');
  return c.json({ ok: true });
});

app.get('/api/meta', async (c) => {
  await user(c);
  const jenis = (await c.env.DB.prepare('SELECT kode, nama, masa_bulan FROM pks_jenis ORDER BY kode').all()).results;
  return c.json({ tahap: F.TAHAP, langkah: F.LANGKAH, jenis });
});

// Daftar isian kuning pada template (satu-satunya bagian dokumen yang dapat diisi) dan batas panjangnya.
app.get('/api/template', async (c) => {
  await user(c);
  return c.json(await infoTemplate(cekJenis(c.req.query('jenis') || 'PKS')));
});

// Pratinjau dokumen master dari isian kuning (tidak disimpan).
app.post('/api/pratinjau', async (c) => {
  const u = await user(c); allow(u, 'vm');
  const b = await json(c);
  const { bytes } = await buatDraf(c.env, cekJenis(b.jenis || 'PKS'), b.isi || {});
  return new Response(bytes, { headers: { 'content-type': 'application/pdf', 'content-disposition': 'inline; filename="pratinjau.pdf"', 'cache-control': 'no-store' } });
});

app.get('/api/perjanjian/:id/isian', async (c) => { await user(c); return c.json(await F.isianTerkini(c.env, c.req.param('id'))); });
app.post('/api/perjanjian/:id/isian', async (c) => {
  const u = await user(c); allow(u, 'vm');
  const p = await F.loadP(c.env, c.req.param('id'));
  return c.json({ ok: true, ...(await F.ubahIsian(c.env, p, (await json(c)).isi || {}, u.email, 'vm')) });
});

// ---------- Mitra (info perseroan, baca) ----------
app.get('/api/mitra', async (c) => {
  await user(c);
  const cfg = await F.konfig(c.env);
  const batch = c.req.query('batch') === '1';
  const list = await listMitra(c.env, batch ? { ids: cfg.batchAwal } : { q: c.req.query('q') || '', limit: 500 });
  const counts = Object.fromEntries((await c.env.DB.prepare("SELECT mitra_row, COUNT(*) n FROM pks_perjanjian WHERE status != 'batal' GROUP BY mitra_row").all()).results.map((r) => [r.mitra_row, r.n]));
  const set = new Set(cfg.batchAwal);
  return c.json(list.map((m) => ({ ...m, batch_awal: set.has(m.row), perjanjian: counts[m.row] || 0 })));
});

app.get('/api/mitra/:row', async (c) => {
  await user(c);
  const m = await getMitra(c.env, c.req.param('row'));
  const perjanjian = (await c.env.DB.prepare('SELECT id, kode, judul, nomor_surat, tahap, status, tenggat, tgl_berakhir FROM pks_perjanjian WHERE mitra_row = ? ORDER BY dibuat_pada DESC').bind(m.row).all()).results;
  return c.json({ ...m, perjanjian: perjanjian.map((p) => ({ ...p, tampil: F.statusTampil(p) })) });
});

// ---------- Perjanjian ----------
app.get('/api/perjanjian', async (c) => {
  await user(c);
  const { q = '', tahap = '', status = '', jenis = '' } = c.req.query();
  let sql = 'SELECT id, kode, mitra_row, snapshot_mitra, jenis, judul, nomor_surat, nomor_spk, tahap, sub_progres, status, pic_vm, tenggat, tgl_efektif, tgl_berakhir, sheet_status, dibuat_pada, diperbarui_pada FROM pks_perjanjian WHERE 1=1';
  const b = [];
  if (q) { sql += ' AND (upper(snapshot_mitra) LIKE ? OR upper(kode) LIKE ? OR upper(COALESCE(nomor_surat,\'\')) LIKE ? OR upper(COALESCE(nomor_spk,\'\')) LIKE ? OR upper(judul) LIKE ?)'; const l = `%${q.toUpperCase()}%`; b.push(l, l, l, l, l); }
  if (tahap !== '') { const l = F.LANGKAH.find((x) => x.tahap.includes(Number(tahap))); const ts = Number(tahap) === 7 ? [7] : l ? l.tahap : [Number(tahap)]; sql += ` AND tahap IN (${ts.map(() => '?').join(',')}) AND status != 'batal'`; b.push(...ts); }
  if (status === 'batal') sql += " AND status = 'batal'";
  if (jenis) { sql += ' AND jenis = ?'; b.push(cekJenis(jenis)); }
  sql += ' ORDER BY diperbarui_pada DESC LIMIT 1000';
  const rows = (await c.env.DB.prepare(sql).bind(...b).all()).results;
  let out = rows.map((p) => { const m = JSON.parse(p.snapshot_mitra); delete p.snapshot_mitra; return { ...p, mitra_nama: m.nama, tampil: F.statusTampil(p) }; });
  if (status && status !== 'batal') out = out.filter((p) => p.tampil === status);
  return c.json(out);
});

app.post('/api/perjanjian', async (c) => {
  const u = await user(c); allow(u, 'vm');
  const id = await F.create(c.env, u, await c.req.formData());
  return c.json({ id }, 201);
});

app.get('/api/perjanjian/:id', async (c) => {
  await user(c);
  const id = c.req.param('id');
  const p = await F.loadP(c.env, id);
  delete p.snapshot_mitra;
  const [tahap, dokumen, feedback, email, auditLog] = await Promise.all([
    c.env.DB.prepare('SELECT tahap, mulai, selesai, tenggat, pic, catatan FROM pks_tahap WHERE perjanjian_id = ? ORDER BY id').bind(id).all(),
    c.env.DB.prepare('SELECT d.id, d.jenis, d.versi, d.penanda, d.nama, d.ukuran, d.halaman, d.sha256, d.storage, d.status, d.pengunggah, u.nama pengunggah_nama, d.dibuat_pada FROM pks_dokumen d LEFT JOIN pks_pengguna u ON u.email = d.pengunggah WHERE d.perjanjian_id = ? ORDER BY d.dibuat_pada DESC, d.versi DESC').bind(id).all(),
    c.env.DB.prepare('SELECT id, putaran, sumber, pengirim, isi, setuju, diterima_pada FROM pks_feedback WHERE perjanjian_id = ? ORDER BY diterima_pada').bind(id).all(),
    c.env.DB.prepare('SELECT tipe, penerima, subjek, mode, status, galat, waktu FROM pks_email_log WHERE perjanjian_id = ? ORDER BY waktu DESC').bind(id).all(),
    c.env.DB.prepare('SELECT a.waktu, a.aktor, u.nama aktor_nama, a.aksi, a.data FROM pks_audit a LEFT JOIN pks_pengguna u ON u.email = a.aktor WHERE a.perjanjian_id = ? ORDER BY a.id DESC LIMIT 200').bind(id).all(),
  ]);
  const picNama = (await c.env.DB.prepare('SELECT nama FROM pks_pengguna WHERE email = ?').bind(p.pic_vm).first())?.nama;
  return c.json({ ...p, pic_nama: picNama || p.pic_vm, tampil: F.statusTampil(p), progres: await progresDari(c.env, p), sheet: SHEET[p.jenis], riwayat: tahap.results, dokumen: dokumen.results, feedback: feedback.results, email: email.results, audit: auditLog.results });
});

const act = (roles, fn) => async (c) => {
  const u = await user(c); allow(u, ...roles);
  const r = await fn(c, u, c.req.param('id'));
  return c.json({ ok: true, ...(r || {}) });
};

app.post('/api/perjanjian/:id/kirim', act(['vm'], (c, u, id) => F.kirim(c.env, u, id)));
app.post('/api/perjanjian/:id/feedback', act(['vm'], async (c, u, id) => {
  const b = await json(c);
  const p = await F.loadP(c.env, id);
  await F.addFeedback(c.env, p, { sumber: 'vm', pengirim: b.pengirim || u.email, isi: b.isi, setuju: !!b.setuju }, u.email);
}));
app.post('/api/perjanjian/:id/legal', act(['vm'], (c, u, id) => F.keLegal(c.env, u, id)));
app.post('/api/perjanjian/:id/nomor', act(['legal'], async (c, u, id) => F.terbitNomor(c.env, u, id, await c.req.formData())));
app.post('/api/perjanjian/:id/bagikan', act(['vm'], (c, u, id) => F.bagikan(c.env, u, id)));
app.post('/api/perjanjian/:id/ttd-mitra', act(['vm'], async (c, u, id) => {
  const f = await c.req.formData();
  const p = await F.loadP(c.env, id);
  await F.unggahTtdMitra(c.env, p, String(f.get('opsi')), f.get('berkas'), u.email, true);
}));
app.post('/api/perjanjian/:id/ttd-mitra/review', act(['vm'], async (c, u, id) => F.reviewTtdMitra(c.env, u, id, await json(c))));
app.post('/api/perjanjian/:id/ttd-ije', act(['vm'], async (c, u, id) => F.ttdIje(c.env, u, id, await c.req.formData(), c.executionCtx)));
app.post('/api/perjanjian/:id/arsip', act(['vm'], async (c, u, id) => F.arsipUlang(c.env, u, id)));
app.post('/api/perjanjian/:id/sub-progres', act(['vm'], async (c, u, id) => F.setSubProgres(c.env, u, id, (await json(c)).nilai)));
app.post('/api/perjanjian/:id/catatan', act(['vm'], async (c, u, id) => F.catatVm(c.env, u, id, (await json(c)).catatan)));
app.post('/api/perjanjian/:id/sinkron', act(['vm'], async (c, u, id) => {
  await F.loadP(c.env, id);
  const r = await sinkronSatu(c.env, id, sinkDeps);
  if (!r.ok) fail(502, `Gagal menulis ke spreadsheet: ${r.galat}`);
  return r;
}));
app.post('/api/perjanjian/:id/mundur', act(['vm'], async (c, u, id) => F.mundur(c.env, u, id, await json(c))));
app.post('/api/perjanjian/:id/email', act(['vm'], async (c, u, id) => F.ubahEmail(c.env, u, id, (await json(c)).emails)));
app.post('/api/perjanjian/:id/ingatkan', act(['vm'], async (c, u, id) => F.ingatkan(c.env, u, id)));
app.post('/api/perjanjian/:id/perpanjang', act(['vm'], async (c, u, id) => F.perpanjang(c.env, u, id)));
app.post('/api/perjanjian/:id/batal', act(['vm'], async (c, u, id) => F.batal(c.env, u, id, await json(c))));

// Pratinjau TTD opsi 1 (tidak disimpan)
app.post('/api/perjanjian/:id/pratinjau-ttd', async (c) => {
  const u = await user(c); allow(u, 'vm');
  const f = await c.req.formData();
  const p = await F.loadP(c.env, c.req.param('id'));
  const pihak = f.get('pihak') === 'ije' ? 'ije' : 'mitra';
  const { bytes } = await F.tempelTtd(c.env, p, pihak, f.get('berkas'));
  return new Response(bytes, { headers: { 'content-type': 'application/pdf', 'cache-control': 'no-store' } });
});

app.get('/api/dokumen/:id', async (c) => {
  const u = await user(c);
  const doc = await c.env.DB.prepare('SELECT * FROM pks_dokumen WHERE id = ?').bind(c.req.param('id')).first();
  if (!doc) fail(404, 'Dokumen tidak ditemukan');
  const bytes = await F.readDoc(c.env, doc);
  await F.audit(c.env, u.email, doc.perjanjian_id, 'dokumen_diunduh', { dokumen: doc.id });
  return new Response(bytes, { headers: { 'content-type': doc.mime, 'content-disposition': `inline; filename="${encodeURIComponent(doc.nama)}"`, 'cache-control': 'no-store' } });
});

// ---------- Dashboard ----------
app.get('/api/dashboard', async (c) => {
  const u = await user(c);
  const DB = c.env.DB;
  const t = now();
  const one = (sql, ...b) => DB.prepare(sql).bind(...b).first();
  const all = async (sql, ...b) => (await DB.prepare(sql).bind(...b).all()).results;
  const bulan = t.slice(0, 7);
  const [berjalan, legal, telat, selesai] = await Promise.all([
    one("SELECT COUNT(*) n FROM pks_perjanjian WHERE status != 'batal' AND tahap BETWEEN 1 AND 6"),
    one("SELECT COUNT(*) n FROM pks_perjanjian WHERE status != 'batal' AND tahap = 3"),
    one("SELECT COUNT(*) n FROM pks_perjanjian WHERE status != 'batal' AND tahap BETWEEN 1 AND 6 AND tenggat < ?", t),
    one("SELECT COUNT(*) n FROM pks_tahap WHERE tahap = 7 AND substr(mulai,1,7) = ?", bulan),
  ]);
  // Seri 8 minggu untuk sparkline
  const weeks = [...Array(8)].map((_, i) => new Date(Date.now() - (7 - i) * 7 * 86400_000).toISOString().slice(0, 10));
  const since = new Date(Date.now() - 8 * 7 * 86400_000).toISOString();
  const series = async (sql) => {
    const rows = await all(sql, since);
    return weeks.map((w, i) => { const next = weeks[i + 1] || '9999'; return rows.filter((r) => r.d >= w && r.d < next).length; });
  };
  const spark = {
    berjalan: await series('SELECT substr(dibuat_pada,1,10) d FROM pks_perjanjian WHERE dibuat_pada >= ?'),
    legal: await series('SELECT substr(mulai,1,10) d FROM pks_tahap WHERE tahap = 3 AND mulai >= ?'),
    telat: await series("SELECT substr(tenggat,1,10) d FROM pks_tahap WHERE tenggat >= ? AND ((selesai IS NOT NULL AND selesai > tenggat) OR (selesai IS NULL AND tenggat < strftime('%Y-%m-%dT%H:%M:%fZ','now')))"),
    selesai: await series('SELECT substr(mulai,1,10) d FROM pks_tahap WHERE tahap = 7 AND mulai >= ?'),
  };
  const pipeline = await all("SELECT tahap, COUNT(*) n FROM pks_perjanjian WHERE status != 'batal' GROUP BY tahap");
  const tepat = await one('SELECT SUM(CASE WHEN selesai <= tenggat THEN 1 ELSE 0 END) ok, COUNT(*) n FROM pks_tahap WHERE tenggat IS NOT NULL AND selesai IS NOT NULL');
  let tindakanSql = "SELECT id, kode, judul, snapshot_mitra, tahap, tenggat, nomor_surat FROM pks_perjanjian WHERE status != 'batal' AND tahap BETWEEN 0 AND 6";
  if (u.peran === 'legal') tindakanSql += ' AND tahap = 3';
  const tindakan = (await all(tindakanSql + ' ORDER BY tenggat IS NULL, tenggat LIMIT 8')).map((p) => ({ id: p.id, kode: p.kode, judul: p.judul, nomor_surat: p.nomor_surat, tahap: p.tahap, tenggat: p.tenggat, mitra: JSON.parse(p.snapshot_mitra).nama }));
  const durasi = await all('SELECT tahap, ROUND(AVG(julianday(selesai) - julianday(mulai)), 1) hari, COUNT(*) n FROM pks_tahap WHERE selesai IS NOT NULL AND tahap BETWEEN 1 AND 6 GROUP BY tahap');
  const tren = await all("SELECT m, SUM(masuk) masuk, SUM(selesai) selesai FROM (SELECT substr(dibuat_pada,1,7) m, 1 masuk, 0 selesai FROM pks_perjanjian UNION ALL SELECT substr(mulai,1,7), 0, 1 FROM pks_tahap WHERE tahap = 7) WHERE m >= ? GROUP BY m ORDER BY m", new Date(Date.now() - 180 * 86400_000).toISOString().slice(0, 7));
  const pic = await all("SELECT p.pic_vm email, COALESCE(u.nama, p.pic_vm) nama, COUNT(*) n FROM pks_perjanjian p LEFT JOIN pks_pengguna u ON u.email = p.pic_vm WHERE p.status != 'batal' AND p.tahap BETWEEN 1 AND 6 GROUP BY p.pic_vm ORDER BY n DESC");
  const aktivitas = (await all("SELECT a.waktu, a.aktor, u.nama aktor_nama, a.aksi, p.kode, p.snapshot_mitra, p.id FROM pks_audit a LEFT JOIN pks_perjanjian p ON p.id = a.perjanjian_id LEFT JOIN pks_pengguna u ON u.email = a.aktor WHERE a.aksi NOT LIKE 'dokumen_diunduh%' AND a.aksi NOT LIKE 'login%' AND a.aksi NOT LIKE 'logout%' ORDER BY a.id DESC LIMIT 7"))
    .map((r) => ({ waktu: r.waktu, aktor: r.aktor, aktor_nama: r.aktor_nama, aksi: r.aksi, kode: r.kode, id: r.id, mitra: r.snapshot_mitra ? JSON.parse(r.snapshot_mitra).nama : null }));
  const berakhir = (await all("SELECT id, kode, nomor_surat, snapshot_mitra, tgl_berakhir FROM pks_perjanjian WHERE tahap = 7 AND status != 'batal' AND tgl_berakhir <= date('now','+90 day') ORDER BY tgl_berakhir LIMIT 8"))
    .map((r) => ({ id: r.id, kode: r.kode, nomor_surat: r.nomor_surat, tgl_berakhir: r.tgl_berakhir, mitra: JSON.parse(r.snapshot_mitra).nama }));
  return c.json({
    kpi: { berjalan: berjalan.n, legal: legal.n, telat: telat.n, selesai: selesai.n }, spark, weeks,
    pipeline: [...F.LANGKAH.slice(1), { nama: 'Selesai', tahap: [7] }].map((s) => ({ n: s.tahap[0], tahap: s.tahap, nama: s.nama, jumlah: pipeline.filter((p) => s.tahap.includes(p.tahap)).reduce((a, p) => a + p.n, 0) })),
    tepat_waktu: tepat.n ? Math.round((tepat.ok / tepat.n) * 100) : null,
    tindakan, durasi, tren, pic, aktivitas, berakhir,
  });
});

// ---------- Admin ----------
// ---------- Portal Legal (tanpa akun: tautan email + PIN 4 angka) ----------
const legalTok = (c) => c.req.header('x-portal-token');
const legalCtx = (c) => L.cekSesi(c.env, legalTok(c), c.req.header('x-legal-sesi'));
app.post('/api/legal/cek', async (c) => c.json(await L.cekEmail(c.env, legalTok(c), (await json(c)).email)));
app.post('/api/legal/masuk', async (c) => c.json({ ok: true, ...(await L.masuk(c.env, legalTok(c), await json(c))) }));
app.get('/api/legal/perjanjian', async (c) => c.json(await L.ringkasan(c.env, await legalCtx(c))));
app.get('/api/legal/dokumen', async (c) => {
  const d = await L.dokumen(c.env, await legalCtx(c));
  return new Response(d.bytes, { headers: { 'content-type': 'application/pdf', 'content-disposition': `inline; filename="${encodeURIComponent(d.nama)}"`, 'cache-control': 'no-store' } });
});
app.post('/api/legal/nomor', async (c) => {
  const ctx = await legalCtx(c);
  const r = await L.terbitkan(c.env, ctx, await json(c));
  return c.json({ ok: true, ...r });
});

// ---------- Overview perjanjian (khusus akun utama) ----------
app.get('/api/overview', async (c) => {
  const u = await user(c); allow(u);
  const jenis = (await c.env.DB.prepare('SELECT kode, nama FROM pks_jenis ORDER BY nama').all()).results;
  const k = c.req.query('jenis') || '';
  return c.json({ jenis, ...(await K.overview(c.env, { jenis: k })) });
});
app.get('/api/overview/mitra', async (c) => { const u = await user(c); allow(u); return c.json(await K.daftarMitra(c.env, { jenis: cekJenis(c.req.query('jenis') || 'PKS') })); });
app.post('/api/overview/kirim-sekaligus', async (c) => {
  const u = await user(c); allow(u);
  const b = await json(c);
  const rows = Array.isArray(b.rows) ? b.rows.map(Number).filter(Boolean).slice(0, 1000) : null;
  const lewati = Array.isArray(b.lewati) ? b.lewati.map(Number).filter(Boolean).slice(0, 500) : [];
  return c.json({ ok: true, ...(await F.kirimMitra(c.env, u, { rows, batas: Number(b.batas) || 4, lewati, jenis: b.jenis || 'PKS' })) });
});
app.post('/api/overview/arsip-semua', async (c) => {
  const u = await user(c); allow(u);
  const l = (await c.env.DB.prepare("SELECT id FROM pks_perjanjian WHERE tahap = 7 AND status != 'batal' AND arsip_url IS NULL LIMIT 4").all()).results;
  const hasil = [];
  for (const r of l) { try { await F.arsipUlang(c.env, u, r.id); hasil.push({ id: r.id, ok: true }); } catch (e) { hasil.push({ id: r.id, ok: false, galat: e.message }); } }
  const sisa = (await c.env.DB.prepare("SELECT COUNT(*) n FROM pks_perjanjian WHERE tahap = 7 AND status != 'batal' AND arsip_url IS NULL").first()).n;
  return c.json({ ok: true, hasil, sisa: hasil.some((h) => !h.ok) ? 0 : sisa });
});
app.post('/api/overview/sinkron', async (c) => {
  const u = await user(c); allow(u);
  const r = await K.sinkronInnerCity(c.env);
  await F.audit(c.env, u.email, null, 'kelompok_disinkron', { cocok: r.cocok, tidak_ketemu: r.tidak_ketemu.length, ganda: r.ganda.length });
  return c.json({ ok: true, ...r });
});

// ---------- Spreadsheet (VM Starlite Sheet) ----------
app.get('/api/sheet/status', async (c) => {
  const u = await user(c); allow(u);
  const rows = (await c.env.DB.prepare("SELECT CASE WHEN sheet_status LIKE 'gagal%' THEN 'gagal' ELSE COALESCE(sheet_status,'belum') END s, COUNT(*) n FROM pks_perjanjian GROUP BY s").all()).results;
  const gagal = (await c.env.DB.prepare("SELECT id, kode, sheet_status, sheet_waktu FROM pks_perjanjian WHERE sheet_status LIKE 'gagal%' ORDER BY sheet_waktu DESC LIMIT 20").all()).results;
  return c.json({ ringkas: Object.fromEntries(rows.map((r) => [r.s, r.n])), gagal, sheet: SHEET, progres: PROGRES, aktif: googleEnabled(c.env) });
});
app.post('/api/sheet/sinkron', async (c) => {
  const u = await user(c); allow(u);
  if (!googleEnabled(c.env)) fail(503, 'Jembatan Google belum aktif');
  if ((await json(c)).semua) await c.env.DB.prepare("UPDATE pks_perjanjian SET sheet_status = 'antre'").run();
  const hasil = await sinkronAntre(c.env, sinkDeps, 15);
  const sisa = (await c.env.DB.prepare("SELECT COUNT(*) n FROM pks_perjanjian WHERE sheet_status = 'antre'").first()).n;
  await F.audit(c.env, u.email, null, 'sheet_disinkron', { dikirim: hasil.length, gagal: hasil.filter((h) => !h.ok).length });
  return c.json({ ok: true, hasil, sisa: hasil.some((h) => !h.ok) ? 0 : sisa });
});

// ---------- Kesiapan: hal yang membuat alur berhenti bila belum diatur ----------
app.get('/api/kesiapan', async (c) => {
  const u = await user(c); allow(u);
  const [legal, ttd, jembatan] = await Promise.all([
    c.env.DB.prepare("SELECT COUNT(*) n FROM pks_pengguna WHERE peran = 'legal' AND aktif = 1").first(),
    c.env.DB.prepare('SELECT COUNT(*) n FROM pks_ttd_admin WHERE aktif = 1').first(),
    cekJembatan(c.env),
  ]);
  return c.json({ legal: legal.n, admin_ttd: ttd.n, jembatan });
});

// ---------- Akses Legal & Admin TTD (dikelola Akun Utama) ----------
const emailValid = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
app.get('/api/admin/akses', async (c) => {
  const u = await user(c); allow(u);
  const [legal, ttd] = await Promise.all([
    c.env.DB.prepare("SELECT p.email, p.nama, p.aktif, CASE WHEN a.email IS NULL THEN 0 ELSE 1 END pin FROM pks_pengguna p LEFT JOIN pks_legal_akses a ON a.email = p.email WHERE p.peran = 'legal' ORDER BY p.aktif DESC, p.nama").all(),
    c.env.DB.prepare('SELECT email, nama, aktif, CASE WHEN pin_hash IS NULL THEN 0 ELSE 1 END pin FROM pks_ttd_admin ORDER BY aktif DESC, nama').all(),
  ]);
  return c.json({ legal: legal.results, admin_ttd: ttd.results, portal_ttd: `${c.env.APP_URL}/admin-ttd.html` });
});
app.post('/api/admin/akses', async (c) => {
  const u = await user(c); allow(u);
  const b = await json(c);
  const email = String(b.email || '').trim().toLowerCase();
  const nama = String(b.nama || '').trim().slice(0, 120) || email;
  const aktif = b.aktif === false ? 0 : 1;
  if (!emailValid(email)) fail(400, 'Email tidak valid');
  if (b.jenis === 'legal') {
    const ada = await c.env.DB.prepare('SELECT peran FROM pks_pengguna WHERE email = ?').bind(email).first();
    if (ada && ada.peran !== 'legal') fail(409, `Email ini sudah dipakai dengan peran ${ada.peran}`);
    await c.env.DB.prepare("INSERT INTO pks_pengguna (email, nama, peran, aktif) VALUES (?,?,'legal',?) ON CONFLICT(email) DO UPDATE SET nama = excluded.nama, aktif = excluded.aktif").bind(email, nama, aktif).run();
  } else if (b.jenis === 'admin_ttd') {
    await c.env.DB.prepare('INSERT INTO pks_ttd_admin (email, nama, aktif, dibuat_pada) VALUES (?,?,?,?) ON CONFLICT(email) DO UPDATE SET nama = excluded.nama, aktif = excluded.aktif').bind(email, nama, aktif, now()).run();
    if (!aktif) await c.env.DB.prepare('DELETE FROM pks_ttd_sesi WHERE email = ?').bind(email).run();
  } else fail(400, 'Jenis akses tidak dikenal');
  await F.audit(c.env, u.email, null, 'akses_disimpan', { jenis: b.jenis, email, aktif });
  return c.json({ ok: true });
});
app.post('/api/admin/akses/reset-pin', async (c) => {
  const u = await user(c); allow(u);
  const b = await json(c);
  const email = String(b.email || '').trim().toLowerCase();
  if (b.jenis === 'legal') { await c.env.DB.prepare('DELETE FROM pks_legal_akses WHERE email = ?').bind(email).run(); await c.env.DB.prepare('DELETE FROM pks_legal_sesi WHERE email = ?').bind(email).run(); }
  else if (b.jenis === 'admin_ttd') { await c.env.DB.prepare('UPDATE pks_ttd_admin SET pin_hash = NULL, hp = NULL, gagal = 0, terkunci_sampai = NULL WHERE email = ?').bind(email).run(); await c.env.DB.prepare('DELETE FROM pks_ttd_sesi WHERE email = ?').bind(email).run(); }
  else fail(400, 'Jenis akses tidak dikenal');
  await F.audit(c.env, u.email, null, 'pin_direset', { jenis: b.jenis, email });
  return c.json({ ok: true });
});

app.get('/api/admin', async (c) => {
  const u = await user(c); allow(u);
  const [pengguna, konfig, jenis] = await Promise.all([
    c.env.DB.prepare('SELECT email, nama, peran, penandatangan, aktif FROM pks_pengguna ORDER BY peran, nama').all(),
    c.env.DB.prepare("SELECT k, v FROM pks_konfig WHERE k != 'batch_awal'").all(),
    c.env.DB.prepare('SELECT * FROM pks_jenis').all(),
  ]);
  return c.json({ pengguna: pengguna.results, konfig: konfig.results, jenis: jenis.results });
});

app.post('/api/admin/pengguna', async (c) => {
  const u = await user(c); allow(u);
  const b = await json(c);
  const email = String(b.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail(400, 'Email tidak valid');
  if (!['admin', 'vm', 'legal', 'manajemen'].includes(b.peran)) fail(400, 'Peran tidak valid');
  if (email === u.email && (b.aktif === false || b.peran !== 'admin')) fail(400, 'Anda tidak dapat menonaktifkan atau menurunkan peran akun sendiri');
  const ada = await c.env.DB.prepare('SELECT email FROM pks_pengguna WHERE email = ?').bind(email).first();
  await c.env.DB.prepare('INSERT INTO pks_pengguna (email, nama, peran, penandatangan, aktif) VALUES (?,?,?,?,?) ON CONFLICT(email) DO UPDATE SET nama=excluded.nama, peran=excluded.peran, penandatangan=excluded.penandatangan, aktif=excluded.aktif')
    .bind(email, String(b.nama || email).trim(), b.peran, b.penandatangan ? 1 : 0, b.aktif === false ? 0 : 1).run();
  if (b.aktif === false) await cabutSemuaSesi(c.env, email);
  let password_awal = null;
  if (!ada) {
    password_awal = passwordSementara();
    await c.env.DB.prepare('UPDATE pks_pengguna SET password_hash = ?, wajib_ganti = 1 WHERE email = ?').bind(await hashPassword(password_awal), email).run();
  }
  await F.audit(c.env, u.email, null, 'pengguna_disimpan', { email, peran: b.peran });
  return c.json({ ok: true, password_awal });
});

app.post('/api/admin/pengguna/reset', async (c) => {
  const u = await user(c); allow(u);
  const email = String((await json(c)).email || '').trim().toLowerCase();
  const ada = await c.env.DB.prepare('SELECT email FROM pks_pengguna WHERE email = ?').bind(email).first();
  if (!ada) fail(404, 'Pengguna tidak ditemukan');
  const password_awal = passwordSementara();
  await c.env.DB.prepare('UPDATE pks_pengguna SET password_hash = ?, wajib_ganti = 1, gagal_login = 0, terkunci_sampai = NULL WHERE email = ?').bind(await hashPassword(password_awal), email).run();
  await cabutSemuaSesi(c.env, email);
  await F.audit(c.env, u.email, null, 'password_direset', { email });
  return c.json({ ok: true, password_awal });
});

app.post('/api/admin/konfig', async (c) => {
  const u = await user(c); allow(u);
  const b = await json(c);
  const allowed = ['sla_hari_kerja', 'format_nomor', 'token_hari', 'email_to_tambahan', 'email_cc', 'email_subjek', 'email_badan'];
  for (const [k, v] of Object.entries(b)) {
    if (!allowed.includes(k)) continue;
    if (k === 'sla_hari_kerja') JSON.parse(v);
    if (k === 'format_nomor') new RegExp(v);
    if (k === 'email_to_tambahan' || k === 'email_cc') {
      const l = String(v).split(/[;,\s]+/).filter(Boolean);
      if (l.some((x) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x))) fail(400, 'Alamat email tidak valid');
      b[k] = l.join(', ');
    }
    if (k === 'email_subjek' && String(v).length > 200) fail(400, 'Subjek terlalu panjang');
    if (k === 'email_badan' && String(v).length > 4000) fail(400, 'Isi email terlalu panjang');
    await c.env.DB.prepare('INSERT INTO pks_konfig (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind(k, String(b[k] ?? v)).run();
  }
  await F.audit(c.env, u.email, null, 'konfig_diubah', b);
  return c.json({ ok: true });
});

app.post('/api/admin/jenis', async (c) => {
  const u = await user(c); allow(u);
  const b = await json(c);
  const pos = typeof b.posisi_ttd === 'string' ? JSON.parse(b.posisi_ttd) : b.posisi_ttd;
  for (const k of ['mitra', 'ije']) for (const f of ['page', 'x', 'y', 'w']) if (typeof pos?.[k]?.[f] !== 'number') fail(400, `Posisi TTD ${k}.${f} wajib angka`);
  await c.env.DB.prepare('INSERT INTO pks_jenis (kode, nama, posisi_ttd, masa_bulan) VALUES (?,?,?,?) ON CONFLICT(kode) DO UPDATE SET nama=excluded.nama, posisi_ttd=excluded.posisi_ttd, masa_bulan=excluded.masa_bulan')
    .bind(String(b.kode).toUpperCase(), b.nama, JSON.stringify(pos), Number(b.masa_bulan || 12)).run();
  await F.audit(c.env, u.email, null, 'jenis_disimpan', { kode: b.kode });
  return c.json({ ok: true });
});

// ---------- Portal Admin TTD (email + PIN, tanpa akun dashboard) ----------
const ttdSesi = (c) => c.req.header('x-ttd-sesi');
const ttdUser = (c) => TA.cekSesi(c.env, ttdSesi(c));
app.post('/api/ttd-admin/cek', async (c) => c.json(await TA.cekEmail(c.env, (await json(c)).email)));
app.post('/api/ttd-admin/masuk', async (c) => c.json({ ok: true, ...(await TA.masuk(c.env, await json(c))) }));
app.post('/api/ttd-admin/keluar', async (c) => { await TA.keluar(c.env, ttdSesi(c)); return c.json({ ok: true }); });
app.get('/api/ttd-admin/daftar', async (c) => { const u = await ttdUser(c); return c.json({ nama: u.nama, daftar: await TA.daftar(c.env) }); });
app.get('/api/ttd-admin/perjanjian/:id', async (c) => { await ttdUser(c); return c.json(await TA.detail(c.env, c.req.param('id'))); });
app.get('/api/ttd-admin/perjanjian/:id/dokumen/:doc', async (c) => {
  const u = await ttdUser(c);
  const d = await TA.dokumen(c.env, c.req.param('id'), c.req.param('doc'));
  await F.audit(c.env, u.email, c.req.param('id'), 'dokumen_diunduh', { dokumen: c.req.param('doc') });
  return new Response(d.bytes, { headers: { 'content-type': 'application/pdf', 'content-disposition': `inline; filename="${encodeURIComponent(d.nama)}"`, 'cache-control': 'no-store' } });
});
const ttdAct = (fn) => async (c) => { const u = await ttdUser(c); const id = c.req.param('id'); await TA.pTtd(c.env, id); return c.json({ ok: true, ...((await fn(c, u, id)) || {}) }); };
app.post('/api/ttd-admin/perjanjian/:id/mitra', ttdAct(async (c, u, id) => {
  const f = await c.req.formData();
  const p = await F.loadP(c.env, id);
  await F.unggahTtdMitra(c.env, p, String(f.get('opsi') || '2'), f.get('berkas'), u.email, true);
}));
app.post('/api/ttd-admin/perjanjian/:id/review', ttdAct(async (c, u, id) => F.reviewTtdMitra(c.env, u, id, await json(c))));
app.post('/api/ttd-admin/perjanjian/:id/sub-progres', ttdAct(async (c, u, id) => F.setSubProgres(c.env, u, id, (await json(c)).nilai)));
app.post('/api/ttd-admin/perjanjian/:id/final', ttdAct(async (c, u, id) => F.ttdIje(c.env, u, id, await c.req.formData(), c.executionCtx)));

// ---------- Portal mitra (tanpa akun, token di header) ----------
const portal = async (c) => F.resolveToken(c.env, c.req.header('x-portal-token'));

app.get('/api/portal', async (c) => {
  const { token, p } = await portal(c);
  const docJenis = token.tujuan === 'feedback' ? 'master' : 'bernomor';
  const doc = await F.latestDoc(c.env, p.id, docJenis);
  const review = await F.latestDoc(c.env, p.id, 'ttd_mitra', 'menunggu_review');
  const feedback = (await c.env.DB.prepare('SELECT putaran, isi, setuju, diterima_pada FROM pks_feedback WHERE perjanjian_id = ? ORDER BY diterima_pada').bind(p.id).all()).results;
  const bisaIsian = [1, 2].includes(p.tahap) && token.tujuan === 'feedback';
  let isian = null;
  if (bisaIsian) {
    const nilai = await F.isianTerkini(c.env, p.id);
    const info = await infoTemplate(p.jenis);
    // Tanggal diatur VM; penandatangan diisi lewat pilihan "Direktur / Diwakili" (bukan kolom bebas).
    const fields = info.fields.filter((f) => !['tanggal', 'tanggal_spk', 'wakil', 'jabatan'].includes(f.key));
    const direksi = p.mitra.direksi || '';
    const samaDireksi = !!direksi && String(nilai.wakil || '').trim().toUpperCase() === direksi.trim().toUpperCase();
    isian = { nilai, fields, maks: info.maks, penandatangan: { direksi, mode: samaDireksi || !nilai.wakil || nilai.wakil === '-' ? 'direktur' : 'wakil', wakil: nilai.wakil, jabatan: nilai.jabatan }, kurang: belumLengkap(p.jenis, nilai) };
  }
  return c.json({
    isian, jenis: p.jenis,
    tujuan: token.tujuan, kode: p.kode, judul: p.judul, nomor_surat: p.nomor_surat, nomor_spk: p.nomor_spk, tahap: p.tahap, tahap_nama: F.TAHAP[p.tahap].nama,
    tenggat: p.tenggat, mitra: { nama: p.mitra.nama }, dokumen: doc ? { id: doc.id, nama: doc.nama, halaman: doc.halaman } : null,
    menunggu_review: !!review, feedback, bisa_feedback: [1, 2].includes(p.tahap) && token.tujuan === 'feedback', bisa_ttd: p.tahap === 5 && token.tujuan === 'ttd',
  });
});

app.post('/api/portal/isian', async (c) => {
  const { token, p } = await portal(c);
  if (token.tujuan !== 'feedback') fail(403, 'Tautan ini tidak dapat mengubah isian dokumen');
  const b = await json(c);
  const isi = { ...(b.isi || {}) };
  for (const k of ['tanggal', 'tanggal_spk']) delete isi[k]; // tanggal tidak diubah mitra
  if (b.penandatangan === 'direktur') {
    if (!p.mitra.direksi) fail(400, 'Nama direktur belum ada di info perseroan. Pilih "Diwakili" dan isi nama penandatangan.');
    isi.wakil = p.mitra.direksi;
    isi.jabatan = String(isi.jabatan || '').trim() || 'Direktur';
  } else if (b.penandatangan === 'wakil') {
    if (String(isi.wakil || '').trim().length < 3) fail(400, 'Nama penandatangan (yang mewakili) wajib diisi');
    if (String(isi.jabatan || '').trim().length < 2) fail(400, 'Jabatan penandatangan wajib diisi');
  }
  return c.json({ ok: true, ...(await F.ubahIsian(c.env, p, isi, `mitra:${p.mitra_row}`, 'mitra')) });
});

app.get('/api/portal/dokumen', async (c) => {
  const { token, p } = await portal(c);
  const doc = await F.latestDoc(c.env, p.id, token.tujuan === 'feedback' ? 'master' : 'bernomor');
  if (!doc) fail(404, 'Dokumen belum tersedia');
  const bytes = await F.readDoc(c.env, doc);
  await F.audit(c.env, `mitra:${p.mitra_row}`, p.id, 'dokumen_diunduh_mitra', { dokumen: doc.id });
  return new Response(bytes, { headers: { 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="${encodeURIComponent(doc.nama)}"`, 'cache-control': 'no-store' } });
});

app.post('/api/portal/feedback', async (c) => {
  const { token, p } = await portal(c);
  if (token.tujuan !== 'feedback') fail(403, 'Tautan ini untuk penandatanganan, bukan tanggapan');
  const b = await json(c);
  await F.addFeedback(c.env, p, { sumber: 'portal', pengirim: String(b.nama || '').slice(0, 120) || p.mitra.nama, isi: String(b.isi || '').slice(0, 5000), setuju: !!b.setuju }, `mitra:${p.mitra_row}`);
  return c.json({ ok: true });
});

app.post('/api/portal/pratinjau-ttd', async (c) => {
  const { token, p } = await portal(c);
  if (token.tujuan !== 'ttd' || p.tahap !== 5) fail(403, 'Penandatanganan belum dibuka untuk perjanjian ini');
  const f = await c.req.formData();
  const { bytes } = await F.tempelTtd(c.env, p, 'mitra', f.get('berkas'));
  return new Response(bytes, { headers: { 'content-type': 'application/pdf', 'cache-control': 'no-store' } });
});

app.post('/api/portal/ttd', async (c) => {
  const { token, p } = await portal(c);
  if (token.tujuan !== 'ttd') fail(403, 'Tautan ini bukan untuk penandatanganan');
  const f = await c.req.formData();
  await F.unggahTtdMitra(c.env, p, String(f.get('opsi') || '2'), f.get('berkas'), `mitra:${p.mitra_row}`, false);
  return c.json({ ok: true });
});


// ---------- Terjadwal: balasan email + pengingat ----------
export async function scheduled(env) {
  const t = now();
  const log = [];
  // 1) Balasan email mitra
  if (googleEnabled(env)) {
    const rows = (await env.DB.prepare("SELECT id FROM pks_perjanjian WHERE status != 'batal' AND tahap IN (1,2) AND gmail_thread_id IS NOT NULL").all()).results;
    for (const r of rows) {
      try {
        const p = await F.loadP(env, r.id);
        const replies = await gmailThreadReplies(env, p.gmail_thread_id, env.MAIL_FROM);
        for (const m of replies) {
          const seen = await env.DB.prepare('SELECT 1 FROM pks_feedback WHERE ext_id = ?').bind(m.id).first();
          if (seen) continue;
          await F.addFeedback(env, p, { sumber: 'email', pengirim: m.from, isi: m.text, setuju: false, extId: m.id, at: m.at }, 'sistem');
          log.push(`balasan ${p.kode}`);
        }
        await env.DB.prepare('UPDATE pks_perjanjian SET gmail_last_check = ? WHERE id = ?').bind(t, p.id).run();
      } catch (e) { console.error('cek balasan', r.id, e.message); }
    }
  }
  // 2) Pengingat tenggat (H-3, H-0, terlambat)
  const aktif = (await env.DB.prepare("SELECT id FROM pks_perjanjian WHERE status != 'batal' AND tahap BETWEEN 1 AND 6 AND tenggat IS NOT NULL").all()).results;
  for (const r of aktif) {
    const p = await F.loadP(env, r.id);
    const sisa = (new Date(p.tenggat) - Date.now()) / 86400_000;
    const jenis = sisa < 0 ? 'telat' : sisa <= 1 ? 'h0' : sisa <= 3 ? 'h3' : null;
    if (!jenis) continue;
    const done = await env.DB.prepare('SELECT 1 FROM pks_pengingat WHERE perjanjian_id = ? AND tahap = ? AND jenis = ?').bind(p.id, p.tahap, jenis).first();
    if (done) continue;
    try {
      const telat = jenis === 'telat';
      if ([1, 5].includes(p.tahap)) {
        await sendMail(env, { perjanjianId: p.id, tipe: 'pengingat', to: p.mitra.emails, ...templates.pengingat_mitra({ p, m: p.mitra, tenggat: p.tenggat, telat, url: await F.tautanPengingat(env, p) }), threadId: p.gmail_thread_id });
      }
      if (p.tahap === 3) {
        // Legal tidak memakai dashboard: pengingat membawa tautan halaman Legal.
        const ke = (await env.DB.prepare("SELECT email FROM pks_pengguna WHERE peran='legal' AND aktif=1").all()).results.map((x) => x.email);
        if (ke.length) await sendMail(env, { perjanjianId: p.id, tipe: 'pengingat', to: ke, ...templates.legal({ p, m: p.mitra, tenggat: p.tenggat, url: await F.tautanPengingat(env, p) }) });
      } else {
        await sendMail(env, { perjanjianId: p.id, tipe: 'pengingat', to: [p.pic_vm], ...templates.pengingat_internal({ p, m: p.mitra, tahapNama: F.TAHAP[p.tahap].nama, tenggat: p.tenggat, telat, appUrl: uiUrl(env) }) });
      }
      await env.DB.prepare('INSERT INTO pks_pengingat (perjanjian_id, tahap, jenis, dikirim_pada) VALUES (?,?,?,?)').bind(p.id, p.tahap, jenis, t).run();
      log.push(`pengingat ${jenis} ${p.kode}`);
    } catch (e) { console.error('pengingat', p.id, e.message); }
  }
  // 3) Antrean spreadsheet (perubahan dari portal/cron, atau yang sebelumnya gagal)
  try { const r = await sinkronAntre(env, sinkDeps, 30); if (r.length) log.push(`sheet ${r.filter((x) => x.ok).length}/${r.length}`); } catch (e) { console.error('sinkron sheet', e.message); }
  // 4) Masa berlaku H-90/60/30
  const fin = (await env.DB.prepare("SELECT id FROM pks_perjanjian WHERE tahap = 7 AND status != 'batal' AND tgl_berakhir <= date('now','+90 day') AND tgl_berakhir >= date('now')").all()).results;
  for (const r of fin) {
    const p = await F.loadP(env, r.id);
    const hari = Math.ceil((new Date(p.tgl_berakhir + 'T00:00:00+07:00') - Date.now()) / 86400_000);
    const jenis = hari <= 30 ? 'berakhir30' : hari <= 60 ? 'berakhir60' : 'berakhir90';
    const done = await env.DB.prepare('SELECT 1 FROM pks_pengingat WHERE perjanjian_id = ? AND tahap = 7 AND jenis = ?').bind(p.id, jenis).first();
    if (done) continue;
    try {
      await sendMail(env, { perjanjianId: p.id, tipe: 'berakhir', to: [p.pic_vm], ...templates.berakhir({ p, m: p.mitra, hari, appUrl: uiUrl(env) }) });
      await env.DB.prepare('INSERT INTO pks_pengingat (perjanjian_id, tahap, jenis, dikirim_pada) VALUES (?,7,?,?)').bind(p.id, jenis, t).run();
      log.push(`${jenis} ${p.kode}`);
    } catch (e) { console.error('berakhir', p.id, e.message); }
  }
  return log;
}

// Pemicu manual tugas terjadwal (khusus mode dev, untuk pengujian)
app.post('/api/dev/cron', async (c) => {
  if (c.env.APP_ENV !== 'dev') fail(404, 'Alamat API tidak dikenal');
  const u = await user(c); allow(u);
  return c.json({ ok: true, log: await scheduled(c.env) });
});

app.all('/api/*', (c) => c.json({ error: 'Alamat API tidak dikenal' }, 404));

export default {
  fetch: app.fetch,
  scheduled: (event, env, ctx) => ctx.waitUntil(scheduled(env)),
};
