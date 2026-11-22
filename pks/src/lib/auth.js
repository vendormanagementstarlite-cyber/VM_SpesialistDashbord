// Login Starlite: email + password di database starlite-pks, sesi lewat cookie HttpOnly (token di-hash di DB).
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { fail, now, randomToken, sha256Hex } from './util.js';
import { hashPassword, verifyPassword, samaAman } from './password.js';

const COOKIE = 'starlite_sesi';
const SESI_JAM = 12;
const MAKS_GAGAL = 5;
const KUNCI_MENIT = 15;
const enc = new TextEncoder();
const secure = (env) => env.APP_ENV !== 'dev';

/** Token sesi: header Authorization: Bearer (frontend di domain lain) atau cookie (frontend satu domain). */
const ambilToken = (c) => {
  const h = c.req.header('authorization') || '';
  return /^Bearer /i.test(h) ? h.slice(7).trim() : getCookie(c, COOKIE);
};

export async function buatSesi(c, email) {
  const token = randomToken(32);
  const t = Date.now();
  await c.env.DB.prepare('DELETE FROM pks_sesi WHERE kedaluwarsa < ?').bind(new Date(t).toISOString()).run();
  await c.env.DB.prepare('INSERT INTO pks_sesi (id, email, dibuat_pada, kedaluwarsa) VALUES (?,?,?,?)')
    .bind(await sha256Hex(token), email, new Date(t).toISOString(), new Date(t + SESI_JAM * 3600_000).toISOString()).run();
  setCookie(c, COOKIE, token, { httpOnly: true, secure: secure(c.env), sameSite: 'Lax', path: '/', maxAge: SESI_JAM * 3600 });
  return token;
}

export async function akhiriSesi(c) {
  const token = ambilToken(c);
  if (token) await c.env.DB.prepare('DELETE FROM pks_sesi WHERE id = ?').bind(await sha256Hex(token)).run();
  deleteCookie(c, COOKIE, { path: '/', secure: secure(c.env) });
}

export const cabutSemuaSesi = (env, email, kecuali = null) =>
  env.DB.prepare('DELETE FROM pks_sesi WHERE email = ? AND id != ?').bind(email, kecuali || '').run();

export async function sesiSaatIni(c) {
  const token = ambilToken(c);
  return token ? sha256Hex(token) : null;
}

// Sesi dashboard VM: token dashboard diverifikasi ke backend dashboard (aksi "me"). Hanya Akun Utama (owner + mainOwner) yang lolos.
// Hasil verifikasi disimpan singkat di memori agar tidak memanggil Apps Script di setiap permintaan.
const VM_BACKEND = 'https://script.google.com/macros/s/AKfycby9hJGo8rN0atk6OguUTA4v4Eq2skh1j3ic-jm1U6Rf-AE_JlHgW9MzPZCrlXHSpW-Y/exec';
const cacheVm = new Map();
const CACHE_VM_MS = 120_000;
async function verifikasiDashboard(c, token) {
  const kunci = await sha256Hex(token);
  const t = Date.now();
  const hit = cacheVm.get(kunci);
  if (hit && hit.sampai > t) return hit.ok;
  let ok = false;
  try {
    const r = await fetch(c.env.VM_BACKEND_URL || VM_BACKEND, { method: 'POST', redirect: 'follow', headers: { 'content-type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'me', token }) });
    const j = await r.json();
    ok = !!(j && j.ok && j.role === 'owner' && j.perms && j.perms.mainOwner);
  } catch { fail(503, 'Tidak dapat memeriksa sesi dashboard. Coba lagi sebentar.'); }
  if (cacheVm.size > 200) cacheVm.clear();
  cacheVm.set(kunci, { ok, sampai: t + CACHE_VM_MS });
  return ok;
}

async function resolveEmail(c) {
  if (c.env.APP_ENV === 'dev' && c.req.header('x-dev-user')) return c.req.header('x-dev-user').toLowerCase();
  const vm = c.req.header('x-vm-token');
  if (vm) {
    if (!(await verifikasiDashboard(c, vm))) fail(401, 'Sesi dashboard berakhir atau bukan Akun Utama. Masuk ulang ke dashboard.');
    const a = await c.env.DB.prepare("SELECT email FROM pks_pengguna WHERE peran = 'admin' AND aktif = 1 ORDER BY email LIMIT 1").first();
    if (!a) fail(403, 'Belum ada pengguna Admin aktif di aplikasi Perjanjian.');
    c.set('viaDashboard', true);
    return a.email;
  }
  const id = await sesiSaatIni(c);
  if (!id) fail(401, 'Silakan masuk');
  const s = await c.env.DB.prepare('SELECT email FROM pks_sesi WHERE id = ? AND kedaluwarsa > ?').bind(id, now()).first();
  if (!s) fail(401, 'Sesi berakhir, silakan masuk lagi');
  return s.email;
}

/** Pengguna aktif dari sesi. Akun dengan password sementara hanya boleh ganti password (skipGanti = true untuk endpoint itu). */
export async function requireUser(c, { skipGanti = false, bolehNonAdmin = false } = {}) {
  const email = await resolveEmail(c);
  const u = await c.env.DB.prepare('SELECT email, nama, peran, penandatangan, wajib_ganti FROM pks_pengguna WHERE email = ? AND aktif = 1').bind(email).first();
  if (!u) fail(c.env.APP_ENV === 'dev' && c.req.header('x-dev-user') ? 403 : 401, `Akun ${email} belum terdaftar di Starlite atau dinonaktifkan. Hubungi Admin.`);
  // Kunci: aplikasi PKS hanya untuk akun utama (Admin). Pengecualian hanya untuk /api/me & logout (agar layar terkunci bisa tampil).
  // Hanya di mode dev, PKS_TERBUKA=1 membuka kunci agar uji peran tetap bisa jalan; di produksi tidak berlaku.
  const terbuka = c.env.APP_ENV === 'dev' && c.env.PKS_TERBUKA === '1';
  if (u.peran !== 'admin' && !bolehNonAdmin && !terbuka) fail(403, 'Aplikasi PKS saat ini hanya dapat diakses oleh akun utama (Admin).');
  if (u.wajib_ganti && !skipGanti && !c.get('viaDashboard')) fail(403, 'Ganti password sementara Anda terlebih dahulu');
  return u;
}

export function allow(user, ...roles) {
  if (user.peran === 'admin') return;
  if (!roles.includes(user.peran)) fail(403, 'Peran Anda tidak memiliki akses untuk tindakan ini');
}

const SALAH = 'Email atau password salah';

/** Verifikasi login dengan penguncian akun setelah beberapa kali gagal. Mengembalikan email pengguna. */
export async function cekLogin(env, emailRaw, password) {
  const email = String(emailRaw || '').trim().toLowerCase();
  const pw = String(password || '');
  const u = await env.DB.prepare('SELECT email, peran, aktif, password_hash, gagal_login, terkunci_sampai FROM pks_pengguna WHERE email = ?').bind(email).first();
  if (u?.terkunci_sampai && u.terkunci_sampai > now()) {
    const mnt = Math.ceil((Date.parse(u.terkunci_sampai) - Date.now()) / 60000);
    fail(429, `Terlalu banyak percobaan. Coba lagi dalam ${mnt} menit.`);
  }
  let benar = false, awal = false;
  if (u?.aktif) {
    if (u.password_hash) benar = await verifyPassword(pw, u.password_hash);
    else if (u.peran === 'admin' && env.ADMIN_PASSWORD_AWAL && pw.length >= 8) {
      // Admin pertama yang belum punya password masuk dengan secret ADMIN_PASSWORD_AWAL lalu wajib menggantinya.
      benar = samaAman(enc.encode(pw.padEnd(256)), enc.encode(String(env.ADMIN_PASSWORD_AWAL).padEnd(256)));
      awal = benar;
    } else await hashPassword(pw); // samakan waktu respons
  } else await hashPassword(pw);
  if (!benar) {
    if (u) {
      const g = (u.gagal_login || 0) + 1;
      await env.DB.prepare('UPDATE pks_pengguna SET gagal_login = ?, terkunci_sampai = ? WHERE email = ?')
        .bind(g >= MAKS_GAGAL ? 0 : g, g >= MAKS_GAGAL ? new Date(Date.now() + KUNCI_MENIT * 60000).toISOString() : null, email).run();
    }
    fail(401, SALAH);
  }
  await env.DB.prepare('UPDATE pks_pengguna SET gagal_login = 0, terkunci_sampai = NULL' + (awal ? ', wajib_ganti = 1' : '') + ' WHERE email = ?').bind(email).run();
  return email;
}
