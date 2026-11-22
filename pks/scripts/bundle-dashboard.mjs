// Menyusun antarmuka PKS (public/app.js + app.css) menjadi satu skrip untuk dashboard VM.
// Hasil: dist/pks-dashboard.js — dipasang di index.html dashboard; tampil di dalam #pks-host.
// Jalankan: node scripts/bundle-dashboard.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const API = 'https://starlite.hsans-din.workers.dev';
const ganti = (s, a, b, semua = false) => {
  if (!s.includes(a)) throw new Error('Pola tidak ditemukan: ' + a.slice(0, 80));
  return semua ? s.split(a).join(b) : s.replace(a, () => b);
};

// ---------- CSS: dipasang di Shadow DOM (terisolasi dari gaya dashboard) ----------
function scopeCss(css, root) {
  let out = '', i = 0;
  const sel = (s) => s.split(',').map((x) => {
    x = x.trim(); if (!x) return x;
    if (/^(:root|html|body)$/.test(x)) return ':host';
    if (/^(html|body)\s/.test(x)) return x.replace(/^(html|body)/, ':host');
    return x;
  }).join(', ');
  while (i < css.length) {
    const open = css.indexOf('{', i);
    if (open < 0) { out += css.slice(i); break; }
    const head = css.slice(i, open).trim();
    if (head.startsWith('@media') || head.startsWith('@supports')) {
      let d = 1, j = open + 1; while (d && j < css.length) { if (css[j] === '{') d++; else if (css[j] === '}') d--; j++; }
      out += head + '{' + scopeCss(css.slice(open + 1, j - 1), root) + '}';
      i = j; continue;
    }
    if (head.startsWith('@keyframes') || head.startsWith('@font-face')) {
      let d = 1, j = open + 1; while (d && j < css.length) { if (css[j] === '{') d++; else if (css[j] === '}') d--; j++; }
      out += css.slice(i, j); i = j; continue;
    }
    const close = css.indexOf('}', open);
    const komentar = head.replace(/\/\*[\s\S]*?\*\//g, '').trim();
    out += (komentar ? sel(komentar) : '') + css.slice(open, close + 1) + '\n';
    i = close + 1;
  }
  return out;
}
let css = readFileSync('public/app.css', 'utf8');
const potong = css.indexOf('/* ---------- Indikator proses (muat.js)');
const cssMuat = potong > 0 ? css.slice(potong) : '';
if (potong > 0) css = css.slice(0, potong);
css = scopeCss(css.replace(/\/\*[\s\S]*?\*\//g, ''), ':host');
// penyesuaian di dalam dashboard: tanpa latar penuh/tinggi layar, dialog tetap terbaca di mode gelap dashboard
css += `:host{display:block;background:transparent;color:var(--ink,#1D2A3A);font-family:inherit;font-size:14px;line-height:1.5;border-radius:0;min-height:0;color-scheme:light}
.main{padding:0;min-height:60vh;outline:none}.main:focus,.main:focus-visible{outline:none}
.top{flex-wrap:wrap;row-gap:10px;margin-bottom:16px;gap:10px}.top .greet{flex:1 1 220px}.top .greet h1{font-size:20px;margin:0}.top .search{flex:0 1 320px;width:auto}.login{min-height:60vh}
@media (max-width:640px){.top .search{flex:1 1 100%}}
:host(.gelap){color-scheme:dark;--surface:#111c2f;--canvas:#0b1424;--line:#26354d;--ink:#E5ECF6;--muted:#93A4BA;--navy:#A9D1FF;--navy-2:#8dbbf0;--sky:#1b3454;--ok:#4cd39a;--ok-bg:#12372b;--warn:#f0b255;--warn-bg:#3a2b10;--late:#ff8585;--late-bg:#3d1b1d;--idle:#9fb0c6;--idle-bg:#1d2a3f;--shadow:none}
:host(.gelap) .input,:host(.gelap) input,:host(.gelap) select,:host(.gelap) textarea{background:#0e1829;color:var(--ink);border-color:var(--line)}
:host(.gelap) .btn.ghost{color:var(--ink)}
`;

// ---------- JS ----------
// Tanda tangan ditempel (ttd.js) tidak dipakai lagi: TTD basah + scan, atau fitur Signing dashboard.
let app = readFileSync('public/app.js', 'utf8');
app = ganti(app, "const $ = (s, r = document) => r.querySelector(s);", 'let ROOT = null;\nconst $ = (s, r = ROOT || document) => r.querySelector(s);');
app = ganti(app, "const $$ = (s, r = document) => [...r.querySelectorAll(s)];", 'const $$ = (s, r = ROOT || document) => [...r.querySelectorAll(s)];');
app = ganti(app, "const app = $('#app');", 'let app = null;');
app = ganti(app, "const BASE = String(window.STARLITE_API || '').replace(/\\/$/, '');", `const BASE = '${API}';`);
app = ganti(app, "const TKEY = 'starlite_token';", "const TKEY = 'pks_token';");
// sesi: diingat 12 jam (sama dengan masa sesi server) bila "Ingat saya" dicentang
app = ganti(app, "const tokenGet = () => { try { return sessionStorage.getItem(TKEY); } catch { return null; } };",
  "const tokenGet = () => { try { return sessionStorage.getItem(TKEY) || localStorage.getItem(TKEY); } catch { return null; } };");
app = ganti(app, "const tokenSet = (t) => { try { t ? sessionStorage.setItem(TKEY, t) : sessionStorage.removeItem(TKEY); } catch {} };",
  "const tokenSet = (t, ingat) => { try { sessionStorage.removeItem(TKEY); localStorage.removeItem(TKEY); if (t) (ingat ? localStorage : sessionStorage).setItem(TKEY, t); } catch {} };");
app = ganti(app, "const r = await fetch(BASE + path,", 'const r = await pfetch(BASE + path,');
// tanpa login kedua: sesi dashboard (token Akun Utama) dikirim ke backend PKS untuk diverifikasi
app = ganti(app, "const t = tokenGet();\n  const headers = { ...(opts.headers || {}), ...(t ? { authorization: `Bearer ${t}` } : {}) };",
  "let vm = ''; try { vm = (typeof currentUser !== 'undefined' && currentUser && currentUser.token) || ''; } catch {}\n  const headers = { ...(opts.headers || {}), ...(vm ? { 'x-vm-token': vm } : {}) };");
app = ganti(app, "S.me) { S.me = null; showLogin('Sesi berakhir, silakan masuk lagi.'); }", "S.me) { S.me = null; sesiHabis(); }");
app = ganti(app, "if (e.status === 401) { showLogin(); return; }", "if (e.status === 401 || e.status === 403) { sesiHabis(e.message); return; }");
app = ganti(app, 'function showLogin(pesan = \'\') {', "function sesiHabis(m) { app.innerHTML = `<div class=\"card\" style=\"max-width:520px;margin:10vh auto\"><div class=\"empty\"><b>Sesi dashboard berakhir</b>${esc(m || 'Masuk ulang ke dashboard dengan Akun Utama.')}</div></div>`; }\nfunction showLogin(pesan = '') {");
app = ganti(app, 'document.body.append(dlg)', 'ROOT.append(dlg)', true);
app = ganti(app, '  document.body.append(t);', '  if (typeof window.showToast === \'function\') { t.remove(); window.showToast(msg, err ? \'error\' : \'success\'); return; }\n  ROOT.append(t);');
// rute di dalam dashboard memakai awalan #/pks
app = app.replace(/(["'`])#\//g, '$1#/pks/');
app = ganti(app, "(location.hash.slice(1) || '/').split('?')", "(location.hash.replace(/^#\\/pks/, '') || '/').split('?')");
app = ganti(app, "const key = parts[0] || 'home';", "const key = parts[0] || 'home';\n  if (key === 'home' || key === 'mitra') { location.replace('#/pks/overview'); return; }");
// menu PKS sendiri diganti submenu di sidebar dashboard
app = ganti(app, 'function renderNav(active) {', "function renderNav(active) { if (window.pksNav) window.pksNav(active); }\nfunction renderNavLama(active) {");
app = ganti(app, "function shell(tampil) { $('.side').hidden = !tampil; $('.shell').classList.toggle('tanpa-menu', !tampil); }", 'function shell() {}');
app = ganti(app, 'src="logo.png"', `src="${API}/logo.png"`);
// form masuk: opsi ingat saya
app = ganti(app, `<button class="btn" style="width:100%;justify-content:center">Masuk</button></form></div>\`;`,
  `<label class="row small" style="margin:-4px 0 14px"><input type="checkbox" name="ingat" checked> Ingat saya selama 12 jam</label><button class="btn" style="width:100%;justify-content:center">Masuk</button></form></div>\`;`);
app = ganti(app, 'tokenSet(r.token); }', 'tokenSet(r.token, f.ingat?.checked); }');
app = ganti(app, '<h1>Masuk ke Starlite</h1><p class="muted">Pemantauan perjanjian kerja sama mitra</p>', '<h1>Masuk ke Perjanjian</h1><p class="muted">Gunakan akun Admin aplikasi Perjanjian.</p>');
// akun (ganti password/keluar) pindah ke bilah atas
// bilah atas ringkas (dashboard sudah punya header, pengguna, dan lonceng): hanya judul dan pencarian
{
  const a0 = app.indexOf('<a class="icon-btn" href="#/pks/perjanjian?status=terlambat"');
  const a1 = a0 < 0 ? -1 : app.indexOf('</a>', a0) + 4;
  const w0 = app.indexOf('<div class="who">', a1);
  const w1 = app.indexOf('</div></div>', w0) + '</div></div>'.length;
  if (a0 < 0 || w0 < 0) throw new Error('topbar: pola tidak ditemukan');
  app = app.slice(0, a0) + app.slice(w1); // Pengaturan kini submenu di sidebar dashboard
}
app = ganti(app, "function bindSearch() {", "function bindSearch() {\n  $('[data-keluar]')?.addEventListener('click', keluar);\n  $('[data-ganti]')?.addEventListener('click', () => bukaGanti(false));");
app = ganti(app, "if (!mulai.terikat) { window.addEventListener('hashchange', () => S.me && route()); mulai.terikat = true; }",
  "if (!mulai.terikat) { window.addEventListener('hashchange', () => { if (S.me && /^#\\/pks/.test(location.hash) && ROOT && ROOT.isConnected) route(); }); mulai.terikat = true; }");
app = ganti(app, "location.reload(); });", "tokenSet(null); S.me = null; showLogin(''); });");
app = ganti(app, "document.addEventListener('click', async (e) => {\n  const a = e.target.closest('[data-dok]');", "const __dokKlik = async (e) => {\n  const a = e.target.closest('[data-dok]');");
app = ganti(app, "  catch (ex) { w?.close(); toast(ex.message, true); }\n});", "  catch (ex) { w?.close(); toast(ex.message, true); }\n};");
app = ganti(app, '\nmulai();\n', '\n');
app = ganti(app, 'window.scrollTo({ top: 0 });', "if (ROOT.host.getBoundingClientRect().top < 0) ROOT.host.scrollIntoView({ block: 'start' });");

const muat = `
// ---------- indikator proses (khusus PKS di dashboard) ----------
let __jalan = 0, __tunda = null, __bar = null, __panel = null;
function __mulai() { __jalan++; if (__jalan === 1) { clearTimeout(__tunda); __tunda = setTimeout(() => { if (__jalan && ROOT) { if (!__bar || !__bar.isConnected) { __bar = document.createElement('div'); __bar.className = 'muat-bar'; __bar.innerHTML = '<i></i>'; document.body.appendChild(__bar); } __bar.classList.add('on'); } }, 120); } }
function __selesai() { __jalan = Math.max(0, __jalan - 1); if (!__jalan) { clearTimeout(__tunda); if (__bar) { __bar.classList.add('habis'); setTimeout(() => { if (!__jalan && __bar) __bar.classList.remove('on', 'habis'); }, 260); } } }
function __ukuran(b) { let n = 0; if (b instanceof FormData) b.forEach((v) => { if (v && typeof v === 'object' && 'size' in v) n += v.size; }); return n; }
function __namaBerkas(b) { const s = []; b.forEach((v) => { if (v && typeof v === 'object' && v.name && v.size > 0) s.push(v.name); }); return s.join(', '); }
function __tampil(pct, nama) {
  if (!__panel) { __panel = document.createElement('div'); __panel.className = 'muat-unggah'; __panel.setAttribute('role', 'status'); __panel.innerHTML = '<div class="muat-kartu"><span class="muat-putar"></span><div style="min-width:0;flex:1"><b></b><small></small><div class="muat-jalur"><i></i></div></div><span class="muat-pct"></span></div>'; document.body.appendChild(__panel); }
  __panel.classList.add('on'); __panel.querySelector('small').textContent = nama || '';
  __panel.querySelector('.muat-jalur i').style.width = pct + '%'; __panel.querySelector('.muat-pct').textContent = pct >= 100 ? '' : pct + '%';
  __panel.querySelector('b').textContent = pct >= 100 ? 'Memproses di server…' : 'Mengunggah berkas…';
}
function __unggah(url, init) {
  return new Promise((ok, gagal) => {
    const x = new XMLHttpRequest(); x.open(init.method || 'POST', url, true); x.responseType = 'blob';
    Object.entries(init.headers || {}).forEach(([k, v]) => { if (v != null) x.setRequestHeader(k, v); });
    const nama = __namaBerkas(init.body); __tampil(0, nama);
    x.upload.onprogress = (e) => { if (e.lengthComputable) __tampil(Math.min(99, Math.round(e.loaded / e.total * 100)), nama); };
    x.upload.onload = () => __tampil(100, nama);
    x.onload = () => { __panel?.classList.remove('on'); const h = new Headers(); x.getAllResponseHeaders().trim().split(/[\\r\\n]+/).forEach((l) => { const i = l.indexOf(':'); if (i > 0) { try { h.append(l.slice(0, i).trim(), l.slice(i + 1).trim()); } catch {} } }); ok(new Response(x.response, { status: x.status, headers: h })); };
    x.onerror = () => { __panel?.classList.remove('on'); gagal(new TypeError('Koneksi terputus saat mengunggah. Periksa jaringan lalu coba lagi.')); };
    x.send(init.body);
  });
}
async function pfetch(url, init = {}) {
  __mulai();
  try { return await (__ukuran(init.body) > 20000 ? __unggah(url, init) : fetch(url, init)); } finally { __selesai(); }
}
function __amatiTombol() {
  new MutationObserver((ms) => ms.forEach((m) => { const b = m.target; if (b.tagName !== 'BUTTON') return; if (b.disabled) { const cek = () => { if (b.disabled && __jalan) b.classList.add('sibuk'); }; cek(); setTimeout(cek, 60); } else b.classList.remove('sibuk'); }))
    .observe(ROOT, { attributes: true, attributeFilter: ['disabled'], subtree: true });
}
`;

const pasang = `
// ---------- pemasangan di dashboard ----------
window.pksMount = function (host) {
  if (!ROOT) {
    ROOT = host.shadowRoot || host.attachShadow({ mode: 'open' });
    ROOT.innerHTML = '<style>' + CSS + '</style><main class="main" tabindex="-1"></main>';
    app = ROOT.querySelector('.main');
    ROOT.addEventListener('click', __dokKlik);
    { const gelap = () => host.classList.toggle('gelap', document.documentElement.classList.contains('dark')); gelap(); new MutationObserver(gelap).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] }); }
    __amatiTombol();
    if (!document.getElementById('pks-font')) { const l = document.createElement('link'); l.id = 'pks-font'; l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap'; document.head.appendChild(l); }
    return mulai();
  }
  if (S.me) return route();
  return mulai();
};
`;

const style = `const CSS = ${JSON.stringify(css + "\n" + cssMuat)};\n(function(){if(document.getElementById('pks-css'))return;var s=document.createElement('style');s.id='pks-css';s.textContent=${JSON.stringify(cssMuat)};document.head.appendChild(s);})();`;
const out = `/* ===== Perjanjian (PKS) — dibangun otomatis dari folder pks/ (scripts/bundle-dashboard.mjs). Jangan diedit langsung. ===== */
(function () {
'use strict';
${style}
${muat}
${app}
${pasang}
})();
`;
mkdirSync('dist', { recursive: true });
writeFileSync('dist/pks-dashboard.js', out);
console.log('dist/pks-dashboard.js', (out.length / 1024).toFixed(1), 'KB');
