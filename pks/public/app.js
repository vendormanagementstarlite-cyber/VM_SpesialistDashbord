const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const app = $('#app');
const S = { me: null, meta: null };

// ---------- API ----------
// Frontend boleh di domain lain (GitHub Pages): window.STARLITE_API berisi alamat Worker, kosong bila satu domain.
// Sesi dikirim lewat header Authorization (tanpa cookie lintas situs); token disimpan di sessionStorage.
const BASE = String(window.STARLITE_API || '').replace(/\/$/, '');
const TKEY = 'starlite_token';
const tokenGet = () => { try { return sessionStorage.getItem(TKEY); } catch { return null; } };
const tokenSet = (t) => { try { t ? sessionStorage.setItem(TKEY, t) : sessionStorage.removeItem(TKEY); } catch {} };
async function api(path, opts = {}) {
  const t = tokenGet();
  const headers = { ...(opts.headers || {}), ...(t ? { authorization: `Bearer ${t}` } : {}) };
  const r = await fetch(BASE + path, { credentials: BASE ? 'omit' : 'same-origin', ...opts, headers });
  const ct = r.headers.get('content-type') || '';
  if (r.ok && ct.includes('application/pdf')) return r.blob();
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 401 && !path.startsWith('/api/login') && S.me) { S.me = null; showLogin('Sesi berakhir, silakan masuk lagi.'); }
    throw Object.assign(new Error(j.error || `Permintaan gagal (${r.status})`), { status: r.status });
  }
  return j;
}
const post = (p, body) => api(p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) });
const postForm = (p, fd) => api(p, { method: 'POST', body: fd });

function toast(msg, err = false) {
  $('.toast')?.remove();
  const t = document.createElement('div');
  t.className = 'toast' + (err ? ' err' : '');
  t.setAttribute('role', err ? 'alert' : 'status');
  t.textContent = msg;
  document.body.append(t);
  setTimeout(() => t.remove(), err ? 6000 : 3200);
}
async function busy(btn, fn) {
  const old = btn.innerHTML; btn.disabled = true;
  try { return await fn(); } catch (e) { toast(e.message, true); } finally { btn.disabled = false; btn.innerHTML = old; }
}

// ---------- Ikon ----------
const P = {
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  stamp: '<path d="M5 21h14M6 17h12v-3a3 3 0 0 0-3-3h-1V8a2 2 0 1 0-4 0v3H9a3 3 0 0 0-3 3z"/>',
  send: '<path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
};
const ic = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n]}</svg>`;

// ---------- Format ----------
const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const tgl = (iso) => { if (!iso) return '–'; const d = new Date(iso.length === 10 ? iso + 'T00:00:00+07:00' : iso); return `${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`; };
const jam = (iso) => new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
function sisa(iso) {
  if (!iso) return null;
  const d = (new Date(iso) - Date.now()) / 86400000;
  if (d < 0) return { label: `Lewat ${Math.max(1, Math.round(-d))} hari`, cls: 'c-late' };
  if (d < 1) return { label: 'Hari ini', cls: 'c-warn' };
  const n = Math.ceil(d);
  return { label: `${n} hari lagi`, cls: n <= 3 ? 'c-warn' : 'c-info' };
}
const chipSisa = (iso) => { const s = sisa(iso); return s ? `<span class="chip ${s.cls}">${s.label}</span>` : ''; };
const TAMPIL = { draf: ['Draf', 'c-idle'], berjalan: ['Berjalan', 'c-info'], terlambat: ['Terlambat', 'c-late'], aktif: ['Aktif', 'c-ok'], akan_berakhir: ['Akan berakhir', 'c-warn'], berakhir: ['Berakhir', 'c-idle'], batal: ['Dibatalkan', 'c-idle'] };
const chipTampil = (t) => { const [l, c] = TAMPIL[t] || [t, 'c-idle']; return `<span class="chip ${c}">${l}</span>`; };
const tahapNama = (n) => S.meta?.tahap?.[n]?.nama || `Tahap ${n}`;
const aktor = (a, nama) => nama || (!a ? '' : a === 'sistem' ? 'Sistem' : a.startsWith('mitra:') ? 'Mitra' : a.split('@')[0].replace(/[._]/g, ' '));
const AKSI = {
  perjanjian_dibuat: 'membuat perjanjian', dikirim_ke_mitra: 'mengirim dokumen ke mitra', feedback_diterima: 'mencatat tanggapan mitra',
  diserahkan_ke_legal: 'menyerahkan ke Legal', nomor_terbit: 'menerbitkan nomor surat', dibagikan_ke_mitra: 'membagikan perjanjian bernomor',
  dokumen_diunggah: 'mengunggah dokumen', ttd_mitra_disetujui: 'menyetujui TTD mitra', ttd_mitra_ditolak: 'meminta TTD mitra diunggah ulang',
  perjanjian_selesai: 'menyelesaikan perjanjian', tahap_dikembalikan: 'mengembalikan tahap', perjanjian_dibatalkan: 'membatalkan perjanjian',
  dokumen_diunduh: 'mengunduh dokumen', dokumen_diunduh_mitra: 'mengunduh dokumen', dokumen_tidak_sesuai: 'menandai berkas tidak sesuai',
  pengguna_disimpan: 'memperbarui pengguna', konfig_diubah: 'mengubah pengaturan', jenis_disimpan: 'mengubah jenis perjanjian', email_final_gagal: 'gagal mengirim salinan final', kirim_sekaligus: 'mengirim perjanjian sekaligus', kelompok_disinkron: 'mencocokkan kelompok mitra', diarsipkan: 'mengarsipkan dokumen final ke Drive', arsip_gagal: 'gagal mengarsipkan ke Drive',
};
const JENIS_DOK = { master: 'Master', bernomor: 'Bernomor', ttd_mitra: 'TTD mitra', final: 'Final', lampiran: 'Lampiran' };
const can = (...roles) => S.me && (S.me.peran === 'admin' || roles.includes(S.me.peran));
const ls = { get: (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };

// ---------- Kerangka ----------
function renderNav(active) {
  const items = [['#/', 'home', 'Ringkasan', 'home'], ['#/perjanjian', 'file', 'Perjanjian', 'perjanjian'], ['#/mitra', 'users', 'Mitra', 'mitra']];
  if (can()) items.push(['#/overview', 'chart', 'Overview', 'overview']);
  if (can()) items.push(['#/pengaturan', 'gear', 'Pengaturan', 'pengaturan']);
  $('#nav').innerHTML = items.map(([h, i, l, k]) => `<a href="${h}" ${k === active ? 'aria-current="page"' : ''}>${ic(i)}<span>${l}</span></a>`).join('');
  $('#foot').innerHTML = `<div>${S.me.mode.google ? 'Terhubung ke <b>Google Drive</b> dan <b>Gmail</b>' : '<b>Mode pengembangan</b><br>Email disimulasikan, berkas disimpan sementara.'}</div>
    <div class="foot-acts"><button class="btn ghost sm" data-ganti type="button">Ganti password</button><button class="btn ghost sm" data-keluar type="button">Keluar</button></div>`;
  $('[data-keluar]').addEventListener('click', keluar);
  $('[data-ganti]').addEventListener('click', () => bukaGanti(false));
}

// ---------- Masuk, keluar, ganti password ----------
function shell(tampil) { $('.side').hidden = !tampil; $('.shell').classList.toggle('tanpa-menu', !tampil); }

function showLogin(pesan = '') {
  shell(false);
  app.innerHTML = `<div class="login"><form class="card login-card" data-login novalidate>
    <img src="logo.png" alt="" class="login-logo"><h1>Masuk ke Starlite</h1><p class="muted">Pemantauan perjanjian kerja sama mitra</p>
    <p class="login-err" role="alert" data-err>${esc(pesan)}</p>
    <div class="field"><label for="l-email">Email</label><input class="input" id="l-email" name="email" type="email" autocomplete="username" required autofocus></div>
    <div class="field"><label for="l-pw">Password</label><input class="input" id="l-pw" name="password" type="password" autocomplete="current-password" required></div>
    <button class="btn" style="width:100%;justify-content:center">Masuk</button></form></div>`;
  const f = $('[data-login]');
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const err = $('[data-err]');
    err.textContent = '';
    busy($('button', f), async () => {
      try { const r = await post('/api/login', { email: f.email.value, password: f.password.value }); tokenSet(r.token); }
      catch (ex) { err.textContent = ex.message; f.password.value = ''; f.password.focus(); return; }
      await mulai();
    });
  });
}

function formGanti(wajib) {
  return `<form data-gf class="stack" novalidate>
    ${wajib ? '<p class="muted" style="margin-top:0">Password Anda masih sementara. Buat password baru untuk melanjutkan.</p>' : ''}
    <p class="login-err" role="alert" data-err></p>
    <div class="field"><label for="g-lama">Password ${wajib ? 'sementara' : 'lama'}</label><input class="input" id="g-lama" name="lama" type="password" autocomplete="current-password" required></div>
    <div class="field"><label for="g-baru">Password baru</label><input class="input" id="g-baru" name="baru" type="password" autocomplete="new-password" required minlength="10"><span class="hint">Minimal 10 karakter.</span></div>
    <div class="field"><label for="g-ulang">Ulangi password baru</label><input class="input" id="g-ulang" name="ulang" type="password" autocomplete="new-password" required></div>
    <button class="btn">Simpan password</button></form>`;
}
function ikatGanti(root, selesai) {
  const f = $('[data-gf]', root), err = $('[data-err]', root);
  f.addEventListener('submit', (e) => {
    e.preventDefault(); err.textContent = '';
    if (f.baru.value !== f.ulang.value) { err.textContent = 'Pengulangan password tidak sama'; return; }
    busy($('button', f), async () => {
      try { await post('/api/ganti-password', { lama: f.lama.value, baru: f.baru.value }); }
      catch (ex) { err.textContent = ex.message; return; }
      toast('Password diganti'); selesai();
    });
  });
}
function layarGanti() {
  shell(false);
  app.innerHTML = `<div class="login"><div class="card login-card"><h1>Buat password baru</h1>${formGanti(true)}</div></div>`;
  ikatGanti(app, () => mulai());
}
function bukaGanti(wajib) {
  const dlg = document.createElement('dialog');
  dlg.innerHTML = `<div class="dh"><h2>Ganti password</h2><button class="icon-btn" data-x aria-label="Tutup" type="button">✕</button></div><div class="db" style="padding-bottom:20px">${formGanti(wajib)}</div>`;
  document.body.append(dlg); dlg.showModal();
  dlg.addEventListener('close', () => dlg.remove());
  $('[data-x]', dlg).addEventListener('click', () => dlg.close());
  ikatGanti(dlg, () => dlg.close());
}
async function keluar() {
  try { await post('/api/logout'); } catch {}
  tokenSet(null);
  S.me = null; showLogin('Anda sudah keluar.');
}
function tampilkanPassword(email, password) {
  const dlg = document.createElement('dialog');
  dlg.innerHTML = `<div class="dh"><h2>Password sementara</h2></div>
    <div class="db"><p>Berikan kepada <b>${esc(email)}</b>. Password ini hanya tampil sekali dan wajib diganti saat masuk pertama.</p>
    <p><code class="pw" data-pw>${esc(password)}</code></p></div>
    <div class="df"><button class="btn ghost" data-salin type="button">Salin</button><button class="btn" data-x type="button">Selesai</button></div>`;
  document.body.append(dlg); dlg.showModal();
  dlg.addEventListener('close', () => dlg.remove());
  $('[data-x]', dlg).addEventListener('click', () => dlg.close());
  $('[data-salin]', dlg).addEventListener('click', () => navigator.clipboard?.writeText(password).then(() => toast('Disalin')));
}

function topbar(title, sub, telat = 0) {
  const ini = (S.me.nama || S.me.email).split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return `<header class="top">
    <div class="greet"><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}</div>
    <form class="search" role="search" data-search>${ic('search')}<label class="sr" for="q">Cari perjanjian</label><input id="q" name="q" placeholder="Cari mitra, nomor surat, kode"></form>
    <a class="icon-btn" href="#/perjanjian?status=terlambat" aria-label="${telat} perjanjian terlambat">${ic('bell')}${telat ? `<span class="dot">${telat}</span>` : ''}</a>
    <div class="who"><div class="avatar">${esc(ini)}</div><div><b>${esc(S.me.nama)}</b><span>${esc(S.me.peran === 'vm' ? 'Vendor Management' : S.me.peran)}</span></div></div>
  </header>`;
}
function bindSearch() {
  $('[data-search]')?.addEventListener('submit', (e) => { e.preventDefault(); location.hash = `#/perjanjian?q=${encodeURIComponent(e.target.q.value.trim())}`; });
}
const salam = () => { const h = Number(new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Jakarta' })); return h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 18 ? 'Selamat sore' : 'Selamat malam'; };

// ---------- Ringkasan ----------
function spark(series, color, id) {
  const w = 160, h = 52, max = Math.max(1, ...series);
  const pts = series.map((v, i) => [(i / (series.length - 1)) * w, h - 6 - (v / max) * (h - 14)]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="g${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".28"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
    <path d="${line} L${w},${h} L0,${h} Z" fill="url(#g${id})"/><path d="${line}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`;
}

async function pageDashboard() {
  const d = await api('/api/dashboard');
  const k = d.kpi;
  const kpis = [
    { key: 'berjalan', lbl: 'Perjanjian berjalan', icon: 'file', bg: 'var(--sky)', fg: 'var(--blue-d)', color: '#2F9BEF', chip: ['Dalam proses', 'c-info'], href: '#/perjanjian?status=berjalan' },
    { key: 'legal', lbl: 'Menunggu Legal', icon: 'stamp', bg: '#E8EEF6', fg: 'var(--navy)', color: '#0B3B75', chip: k.legal ? ['Antre nomor surat', 'c-warn'] : ['Tidak ada antrean', 'c-ok'], href: '#/perjanjian?tahap=3' },
    { key: 'telat', lbl: 'Lewat tenggat', icon: 'clock', bg: 'var(--late-bg)', fg: 'var(--late)', color: '#C93838', chip: k.telat ? ['Perlu tindakan', 'c-late'] : ['Semua tepat waktu', 'c-ok'], href: '#/perjanjian?status=terlambat' },
    { key: 'selesai', lbl: 'Selesai bulan ini', icon: 'check', bg: 'var(--ok-bg)', fg: 'var(--ok)', color: '#17885A', chip: ['Ditandatangani', 'c-ok'], href: '#/perjanjian?tahap=7' },
  ];
  const max = Math.max(1, ...d.pipeline.filter((s) => s.n < 7).map((s) => s.jumlah));
  const lvl = (s) => { const v = s.jumlah; if (s.n === 7) return v ? 'done' : 'l0'; const r = v / max; return !v ? 'l0' : r <= .25 ? 'l1' : r <= .5 ? 'l2' : r <= .8 ? 'l3' : 'l4'; };
  const tindakan = d.tindakan.length
    ? `<ul class="list">${d.tindakan.map((t) => `<li><span class="bullet" style="background:${sisa(t.tenggat)?.cls === 'c-late' ? 'var(--late)' : 'var(--blue)'}"></span>
        <a href="#/perjanjian/${t.id}" style="min-width:0;color:inherit;text-decoration:none"><div class="t">${esc(t.mitra)}</div><div class="s">${esc(tahapNama(t.tahap))}, ${esc(t.nomor_surat || t.kode)}</div></a>
        <span class="time">${t.tenggat ? tgl(t.tenggat) : ''}</span>${chipSisa(t.tenggat) || '<span class="chip c-idle">Draf</span>'}</li>`).join('')}</ul>`
    : `<div class="empty"><b>Tidak ada tindakan tertunda</b>${can('vm') ? 'Mulai dengan membuat perjanjian baru.' : 'Antrean Anda kosong.'}</div>`;
  const durOf = (n) => { const l = d.pipeline.find((x) => x.n === n); const v = d.durasi.filter((x) => l?.tahap.includes(x.tahap)); return v.length ? Math.round(v.reduce((a, x) => a + x.hari, 0) * 10) / 10 : null; };
  const trenMax = Math.max(1, ...d.tren.map((t) => Math.max(t.masuk, t.selesai)));
  const bln = (m) => BULAN[Number(m.slice(5, 7)) - 1];
  const sub = d.tindakan.length ? `${d.tindakan.length} perjanjian menunggu tindakan${k.telat ? `, ${k.telat} lewat tenggat` : ''}.` : 'Semua perjanjian berjalan sesuai jadwal.';
  app.innerHTML = `${topbar(`${salam()}, ${esc(S.me.nama)}`, sub, k.telat)}
    ${S.me.mode.env === 'dev' ? '<div class="mode-banner">Mode pengembangan: email disimulasikan dan berkas disimpan di database lokal.</div>' : ''}
    <section class="grid kpis" aria-label="Ringkasan angka">${kpis.map((x) => `
      <a class="card kpi" href="${x.href}">
        <div class="kpi-h"><span class="ic" style="background:${x.bg};color:${x.fg}">${ic(x.icon)}</span><span class="lbl">${x.lbl}</span></div>
        <div class="kpi-b"><div><span class="val num">${k[x.key]}</span><span class="chip ${x.chip[1]}">${x.chip[0]}</span></div>${spark(d.spark[x.key], x.color, x.key)}</div></a>`).join('')}
    </section>
    <section class="grid dash-2">
      <div class="card"><div class="card-head"><h2>Lintasan perjanjian</h2><a class="small" href="#/perjanjian">Lihat semua</a></div>
        <div class="track">${d.pipeline.map((s) => `<a class="seg ${lvl(s)}" href="#/perjanjian?tahap=${s.n}"><div class="bar"><b class="num">${s.jumlah}</b></div><span class="name">${esc(s.nama)}</span><span class="dur">${s.n < 7 ? (durOf(s.n) ? `${durOf(s.n)} hari` : '–') : ''}</span></a>`).join('')}</div>
        <p class="small muted" style="margin:6px 0 0">Angka di bawah nama tahap: rata-rata lama tahap itu berlangsung.</p>
        <div class="track-foot"><div><b>Selesai tepat waktu</b><div class="small muted">Tahap yang ditutup sebelum tenggat</div></div><div class="meter" aria-hidden="true"><i style="width:${d.tepat_waktu ?? 0}%"></i></div><b class="num" style="font-size:22px;color:var(--navy)">${d.tepat_waktu === null ? '–' : d.tepat_waktu + '%'}</b></div>
      </div>
      <div class="card"><div class="card-head"><h2>Tindakan hari ini</h2>${can('vm') ? `<button class="btn sm" data-new>${ic('plus')}Perjanjian baru</button>` : ''}</div>${tindakan}</div>
    </section>
    <section class="grid dash-3">
      <div class="card"><div class="card-head"><h2>Tren bulanan</h2><span class="row small"><span class="lg" style="background:var(--blue)"></span>Masuk <span class="lg" style="background:var(--navy)"></span>Selesai</span></div>
        ${d.tren.length ? `<div class="bars two">${d.tren.map((t) => `<div class="b"><div class="pair"><i style="height:${Math.max(4, (t.masuk / trenMax) * 100)}%" title="${t.masuk} masuk"></i><i class="alt" style="height:${Math.max(4, (t.selesai / trenMax) * 100)}%" title="${t.selesai} selesai"></i></div><span>${bln(t.m)}</span><em class="num">${t.masuk}/${t.selesai}</em></div>`).join('')}</div>` : '<div class="empty"><b>Belum ada data</b></div>'}
      </div>
      <div class="card"><div class="card-head"><h2>Aktivitas terbaru</h2></div>
        ${d.aktivitas.length ? `<ul class="list">${d.aktivitas.map((a) => `<li style="grid-template-columns:minmax(0,1fr) auto"><div style="min-width:0"><div class="t" style="font-weight:600">${esc(aktor(a.aktor, a.aktor_nama))} <span style="font-weight:500">${esc(AKSI[a.aksi] || a.aksi)}</span></div><div class="s">${a.id ? `<a href="#/perjanjian/${a.id}">${esc(a.mitra || a.kode)}</a>` : ''}</div></div><span class="small muted">${jam(a.waktu)}</span></li>`).join('')}</ul>` : '<div class="empty"><b>Belum ada aktivitas</b></div>'}
      </div>
      <div class="card"><div class="card-head"><h2>Masa berlaku</h2><span class="small muted">90 hari ke depan</span></div>
        ${d.berakhir.length ? `<ul class="list">${d.berakhir.map((b) => `<li style="grid-template-columns:minmax(0,1fr) auto"><a href="#/perjanjian/${b.id}" style="color:inherit;min-width:0"><div class="t">${esc(b.mitra)}</div><div class="s">${esc(b.nomor_surat)}</div></a>${chipSisa(b.tgl_berakhir + 'T23:59:00+07:00')}</li>`).join('')}</ul>` : '<div class="empty"><b>Tidak ada yang berakhir</b>Perjanjian yang habis dalam 90 hari tampil di sini.</div>'}
        ${d.pic.length ? `<h3 style="margin:16px 0 8px">Beban per PIC</h3>${d.pic.map((p) => `<div class="row" style="justify-content:space-between;padding:4px 0"><span>${esc(p.nama)}</span><b class="num">${p.n}</b></div>`).join('')}` : ''}
      </div>
    </section>`;
  bindSearch();
  $('[data-new]')?.addEventListener('click', () => openCreate());
}

// ---------- Daftar perjanjian ----------
async function pagePerjanjian(params) {
  const q = params.get('q') || '', tahap = params.get('tahap') ?? '', status = params.get('status') || '', jenis = params.get('jenis') || '';
  const qs = new URLSearchParams(); if (q) qs.set('q', q); if (tahap !== '') qs.set('tahap', tahap); if (status) qs.set('status', status); if (jenis) qs.set('jenis', jenis);
  const rows = await api('/api/perjanjian?' + qs);
  const filters = [['', '', 'Semua'], ...S.meta.langkah.map((l) => [String(l.tahap[0]), '', l.nama]), ['7', '', 'Selesai'], ['', 'terlambat', 'Terlambat'], ['', 'batal', 'Dibatalkan']];
  const lk = (t) => S.meta.tahap[Number(t)]?.langkah;
  const isOn = (t, s) => (s ? s === status && tahap === '' : t !== '' ? tahap !== '' && !status && lk(t) === lk(tahap) : tahap === '' && !status);
  const table = rows.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Mitra</th><th>Perjanjian</th><th>Tahap</th><th>Nomor</th><th>Tenggat</th><th>Status</th></tr></thead><tbody>
    ${rows.map((p) => `<tr data-href="#/perjanjian/${p.id}" tabindex="0"><td><div class="cell-main">${esc(p.mitra_nama)}</div><div class="cell-sub">${esc(p.kode)}</div></td><td>${esc(p.judul)}<div class="cell-sub">${esc(JENIS_NAMA[p.jenis] || p.jenis)}</div></td><td>${esc(tahapNama(p.tahap))}</td><td>${esc(p.nomor_surat || '–')}${p.nomor_spk ? `<div class="cell-sub">SPK ${esc(p.nomor_spk)}</div>` : ''}</td><td class="nw">${p.tahap < 7 && p.status !== 'batal' ? (p.tenggat ? `${tgl(p.tenggat)}<div class="cell-sub">${sisa(p.tenggat)?.label}</div>` : '–') : '–'}</td><td>${chipTampil(p.tampil)}</td></tr>`).join('')}
    </tbody></table></div>` : `<div class="empty"><b>${q || tahap !== '' || status ? 'Tidak ada perjanjian yang cocok' : 'Belum ada perjanjian'}</b>${can('vm') ? 'Buat perjanjian baru dari data info perseroan.' : ''}</div>`;
  app.innerHTML = `${topbar('Perjanjian', `${rows.length} perjanjian${q ? ` untuk "${esc(q)}"` : ''}`)}
    <div class="card">
      <div class="card-head" style="flex-wrap:wrap"><div class="tabs" role="group" aria-label="Saring tahap">${filters.map(([t, s, l]) => `<button aria-pressed="${isOn(t, s)}" data-t="${t}" data-s="${s}">${esc(l)}</button>`).join('')}</div>
        <div class="row"><label class="sr" for="fj">Jenis</label><select class="input" id="fj" style="width:auto"><option value="">Semua jenis</option>${Object.entries(JENIS_NAMA).map(([k, l]) => `<option value="${k}" ${k === jenis ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>${can('vm') ? `<button class="btn" data-new>${ic('plus')}Perjanjian baru</button>` : ''}</div></div>
      ${table}
    </div>`;
  bindSearch();
  if (q) $('#q').value = q;
  const pergi = (o) => { const n = new URLSearchParams(); const v = { q, tahap, status, jenis, ...o }; Object.entries(v).forEach(([k, x]) => { if (x !== '' && x != null) n.set(k, x); }); location.hash = '#/perjanjian' + (n.toString() ? '?' + n : ''); };
  $$('.tabs button').forEach((b) => b.addEventListener('click', () => pergi({ tahap: b.dataset.t, status: b.dataset.s })));
  $('#fj').addEventListener('change', (e) => pergi({ jenis: e.target.value }));
  $$('tr[data-href]').forEach((tr) => {
    tr.addEventListener('click', () => { location.hash = tr.dataset.href; });
    tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') location.hash = tr.dataset.href; });
  });
  $('[data-new]')?.addEventListener('click', () => openCreate(null, jenis || 'PKS'));
}

// ---------- Buat perjanjian ----------
const JENIS_NAMA = { PKS: 'Perjanjian Homepass', MS: 'PKS MS & SPK MS' };
const sheetChip = (p) => {
  const st = String(p.sheet_status || '');
  if (st === 'ok') return `<span class="chip c-ok">Tersimpan di spreadsheet</span><span class="small muted"> ${p.sheet_waktu ? jam(p.sheet_waktu) : ''}</span>`;
  if (st.startsWith('gagal')) return `<span class="chip c-late" title="${esc(st)}">Gagal menulis ke spreadsheet</span><div class="small muted" style="margin-top:4px">${esc(st.slice(7))}. Dicoba ulang otomatis.</div>`;
  return '<span class="chip c-warn">Menunggu ditulis ke spreadsheet</span>';
};
const tplJenis = async (jenis) => { S.tpls ||= {}; return (S.tpls[jenis] ||= await api(`/api/template?jenis=${jenis}`)); };
const hariIniWib = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
// Satu isian dokumen. Isian "lengkapi" boleh kosong saat draf (dilengkapi mitra lewat tautan).
const kolomIsian = (f, maks, nilai, pfx) => {
  const v = nilai === '-' ? '' : (nilai ?? '');
  const tgl = f.type === 'date';
  const batas = tgl ? (f.key === 'tanggal' || f.key === 'tanggal_spk') && maks.__jenis === 'PKS' ? 'min="2026-01-01" max="2026-12-31"' : 'min="2026-01-01" max="2029-12-31"' : '';
  return `<div class="field"><label for="${pfx}-${f.key}">${esc(f.label)}${f.lengkapi ? ' <span class="muted" style="font-weight:500">(boleh dilengkapi mitra)</span>' : ''}</label>
    <input class="input" id="${pfx}-${f.key}" data-isi="${f.key}" ${tgl ? `type="date" ${batas}` : `type="text" maxlength="${maks[f.key] || 160}" autocomplete="off"`} value="${esc(v)}" ${f.lengkapi ? '' : 'required'}>${f.hint ? `<span class="hint">${esc(f.hint)}</span>` : ''}</div>`;
};
const ambilIsian = (root) => Object.fromEntries($$('[data-isi]', root).map((el) => [el.dataset.isi, el.value.trim()]));

async function openCreate(preset, jenisAwal = 'PKS') {
  const dlg = document.createElement('dialog');
  dlg.innerHTML = `<form method="dialog" data-f novalidate>
    <div class="dh"><h2>Perjanjian baru</h2><button class="icon-btn" value="cancel" aria-label="Tutup" formnovalidate>✕</button></div>
    <div class="db">
      <div class="field"><span class="label" style="display:block;font-weight:600;margin-bottom:6px">Jenis perjanjian</span>
        <div class="seg-toggle" role="group" aria-label="Jenis perjanjian">${Object.entries(JENIS_NAMA).map(([k, l]) => `<button type="button" data-jenis="${k}" aria-pressed="${k === jenisAwal}">${esc(l)}</button>`).join('')}</div></div>
      <div class="field"><label for="m-q">Mitra</label><input class="input" id="m-q" placeholder="Ketik nama mitra" autocomplete="off"><div class="picker" role="listbox" aria-label="Pilihan mitra"></div><div class="hint" data-sel>Data diambil dari info perseroan.</div></div>
      <div class="field"><label for="m-judul">Judul</label><input class="input" id="m-judul" name="judul" required minlength="3"></div>
      <div data-isian-box><div class="pv-muat"><span class="muat-putar"></span>Memuat isian…</div></div>
    </div>
    <div class="df"><button class="btn ghost" value="cancel" formnovalidate>Batal</button><button class="btn ghost" type="button" data-pvisi>Pratinjau dokumen</button><button class="btn" value="ok" data-submit>Buat draf</button></div></form>`;
  document.body.append(dlg); dlg.showModal();
  dlg.addEventListener('close', () => dlg.remove());
  let chosen = null, timer, jenis = jenisAwal, judulOtomatis = true;
  const pick = $('.picker', dlg), qi = $('#m-q', dlg), judul = $('#m-judul', dlg), box = $('[data-isian-box]', dlg);
  judul.addEventListener('input', () => { judulOtomatis = false; });
  const pre = () => (chosen ? { nama: chosen.nama, direksi: chosen.direksi, alamat: chosen.alamat, telepon: chosen.telepon, email: chosen.emails?.join('; '), kontak_lain: chosen.kontak_lain } : {});
  const isiForm = async () => {
    const t = await tplJenis(jenis); const maks = { ...t.maks, __jenis: jenis };
    const lama = box.isConnected ? ambilIsian(box) : {};
    const nilai = (f) => lama[f.key] || (f.prefill ? String(pre()[f.prefill] || '') : '') || (f.type === 'date' ? hariIniWib() : '') || f.bawaan || '';
    const utama = t.fields.filter((f) => !f.lengkapi), lengkapi = t.fields.filter((f) => f.lengkapi);
    box.innerHTML = `<fieldset class="isian"><legend>Isian dokumen</legend>
      <p class="hint" style="margin:0 0 10px">Dokumen memakai template ${esc(JENIS_NAMA[jenis])}; hanya isian ini yang berubah, sisanya terkunci. Data diisi otomatis dari info perseroan. Nomor surat diterbitkan Legal.</p>
      ${utama.map((f) => kolomIsian(f, maks, nilai(f), 'i')).join('')}
      <details class="more" ${lengkapi.some((f) => !nilai(f)) ? '' : ''}><summary>Data lain (${lengkapi.length}) — boleh dikosongkan, dilengkapi mitra lewat tautan</summary><div style="margin-top:10px">${lengkapi.map((f) => kolomIsian(f, maks, nilai(f), 'i')).join('')}</div></details></fieldset>`;
    if (chosen && judulOtomatis) judul.value = `${JENIS_NAMA[jenis]} ${chosen.singkat || chosen.nama}`;
  };
  $$('[data-jenis]', dlg).forEach((b) => b.addEventListener('click', async () => {
    jenis = b.dataset.jenis; $$('[data-jenis]', dlg).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    try { await isiForm(); } catch (e) { toast(e.message, true); }
  }));
  const choose = async (m) => {
    chosen = m; qi.value = m.nama; pick.innerHTML = '';
    $('[data-sel]', dlg).innerHTML = m.emails.length ? `Dikirim ke ${m.emails.map(esc).join(', ')}${m.direksi ? `. Direktur: ${esc(m.direksi)}` : ''}` : `<span style="color:var(--late);font-weight:600">Email mitra kosong di info perseroan. Draf bisa dibuat, tetapi belum bisa dikirim.</span>`;
    $$('[data-isi]', box).forEach((el) => { el.value = ''; }); // isian mengikuti mitra yang baru dipilih
    await isiForm();
  };
  const load = async (q) => {
    const list = await api(q ? `/api/mitra?q=${encodeURIComponent(q)}` : '/api/mitra?batch=1');
    pick.innerHTML = list.slice(0, 40).map((m, i) => `<button type="button" role="option" data-i="${i}">${esc(m.nama)}<small>${esc(m.jenis || 'Mitra')}, ${esc(m.status)}${m.emails.length ? '' : ', email kosong'}</small></button>`).join('') || '<div class="empty">Mitra tidak ditemukan</div>';
    $$('button', pick).forEach((b) => b.addEventListener('click', () => choose(list[b.dataset.i])));
  };
  qi.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => load(qi.value.trim()), 220); });
  try { await isiForm(); } catch (e) { box.innerHTML = `<div class="notice">${esc(e.message)}</div>`; }
  if (preset) choose(preset); else load('');
  const valid = () => { const f = $('[data-f]', dlg); if (!chosen) { toast('Pilih mitra terlebih dahulu', true); return false; } return f.reportValidity(); };
  $('[data-pvisi]', dlg).addEventListener('click', () => { if (valid()) pratinjau(() => api('/api/pratinjau', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jenis, isi: ambilIsian(box) }) }), `${JENIS_NAMA[jenis]} (belum disimpan)`); });
  $('[data-submit]', dlg).addEventListener('click', async (e) => {
    e.preventDefault();
    if (!valid()) return;
    const fd = new FormData(); fd.set('mitra_row', chosen.row); fd.set('jenis', jenis); fd.set('judul', judul.value.trim());
    fd.set('isi', JSON.stringify(ambilIsian(box)));
    await busy(e.currentTarget, async () => { const r = await postForm('/api/perjanjian', fd); dlg.close(); toast('Draf dibuat'); location.hash = `#/perjanjian/${r.id}`; });
  });
}

// ---------- Pratinjau dokumen (PDF) di dalam aplikasi ----------
function pratinjau(ambil, judul) {
  const dlg = document.createElement('dialog'); dlg.className = 'pv';
  dlg.innerHTML = `<div class="dh"><h2>Pratinjau: ${esc(judul)}</h2><button class="icon-btn" type="button" data-tutup aria-label="Tutup">✕</button></div><div class="pv-isi"><div class="pv-muat"><span class="muat-putar"></span>Menyiapkan pratinjau…</div></div>`;
  document.body.append(dlg); dlg.showModal();
  let url = null;
  const tutup = () => dlg.close();
  $('[data-tutup]', dlg).addEventListener('click', tutup);
  dlg.addEventListener('close', () => { if (url) URL.revokeObjectURL(url); dlg.remove(); });
  (async () => {
    try {
      const b = await ambil(); url = URL.createObjectURL(b);
      $('.pv-isi', dlg).innerHTML = `<iframe class="pv-frame" title="Pratinjau dokumen" src="${url}#view=FitH"></iframe>`;
    } catch (e) { console.error('pratinjau', e); $('.pv-isi', dlg).innerHTML = `<div class="empty">${esc(e.message || 'Pratinjau gagal dimuat')}</div>`; }
  })();
}
const pratinjauIsi = (dlg, jenis = 'PKS') => pratinjau(() => api('/api/pratinjau', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jenis, isi: ambilIsian(dlg) }) }), 'dokumen (belum disimpan)');

// ---------- Ubah isian kuning pada dokumen ----------
async function bukaIsian(p, reload) {
  let nilai, t;
  try { t = await tplJenis(p.jenis); nilai = await api(`/api/perjanjian/${p.id}/isian`); } catch (e) { return toast(e.message, true); }
  const maks = { ...t.maks, __jenis: p.jenis };
  const dlg = document.createElement('dialog');
  dlg.innerHTML = `<form method="dialog" data-f novalidate><div class="dh"><h2>Ubah isian dokumen</h2><button class="icon-btn" value="cancel" aria-label="Tutup" formnovalidate>✕</button></div>
    <div class="db"><p class="hint" style="margin:0 0 12px">Hanya isian dokumen yang dapat diubah. Menyimpan membuat dokumen master versi baru.</p>
    ${t.fields.map((f) => kolomIsian(f, maks, nilai[f.key], 'u')).join('')}</div>
    <div class="df"><button class="btn ghost" value="cancel" formnovalidate>Batal</button><button class="btn ghost" type="button" data-pvisi>Pratinjau dokumen</button><button class="btn" data-simpan>Simpan isian</button></div></form>`;
  document.body.append(dlg); dlg.showModal();
  dlg.addEventListener('close', () => dlg.remove());
  $('[data-pvisi]', dlg).addEventListener('click', () => { if ($('[data-f]', dlg).reportValidity()) pratinjauIsi(dlg, p.jenis); });
  $('[data-simpan]', dlg).addEventListener('click', (e) => {
    e.preventDefault();
    if (!$('[data-f]', dlg).reportValidity()) return;
    busy(e.currentTarget, async () => {
      await post(`/api/perjanjian/${p.id}/isian`, { isi: ambilIsian(dlg) });
      dlg.close(); toast('Isian diperbarui, dokumen versi baru dibuat'); reload();
    });
  });
}

// ---------- Detail perjanjian ----------
async function pageDetail(id) {
  const p = await api(`/api/perjanjian/${id}`);
  const m = p.mitra;
  const cur = p.status === 'batal' ? -1 : p.tahap;
  const curL = cur < 0 ? -1 : S.meta.tahap[cur].langkah;
  const timeline = S.meta.langkah.map((l) => {
    const rs = p.riwayat.filter((r) => l.tahap.includes(r.tahap));
    const awal = rs[0], akhir = rs.at(-1);
    const cls = l.n < curL ? 'done' : l.n === curL ? 'now' : '';
    const info = cls === 'now' && p.tenggat ? `Tenggat ${tgl(p.tenggat)}` : cls === 'done' && akhir?.selesai ? `Selesai ${tgl(akhir.selesai)}` : awal ? `Mulai ${tgl(awal.mulai)}` : '';
    return `<li class="${cls}"><span class="node">${cls === 'done' ? '✓' : l.n + 1}</span><b>${esc(l.nama)}</b><span>${info}</span></li>`;
  }).join('');
  const docs = p.dokumen.length ? `<ul class="list docs">${p.dokumen.map((d) => `<li><span class="fi">${ic('file')}</span><div style="min-width:0"><div class="t">${esc(JENIS_DOK[d.jenis])}, versi ${d.versi}</div><div class="s">${tgl(d.dibuat_pada)} oleh ${esc(aktor(d.pengunggah, d.pengunggah_nama))}${d.halaman ? `, ${d.halaman} halaman` : ''} <span class="hash" title="SHA-256 ${esc(d.sha256)}">#${esc(d.sha256.slice(0, 10))}</span></div></div>
    <span>${d.penanda ? `<span class="chip ${d.penanda === 'scan_asli' ? 'c-ok' : 'c-info'}">${d.penanda === 'scan_asli' ? 'Scan asli' : 'Hasil tempel'}</span>` : ''} ${d.status !== 'aktif' ? `<span class="chip ${d.status === 'tidak_sesuai' ? 'c-late' : d.status === 'menunggu_review' ? 'c-warn' : 'c-idle'}">${{ tidak_sesuai: 'Tidak sesuai', menunggu_review: 'Menunggu review', ditolak: 'Ditolak' }[d.status]}</span>` : ''}</span>
    <span class="row" style="gap:6px;flex-wrap:nowrap"><a class="btn ghost sm" href="#" data-dok="${d.id}" data-lihat="1">${ic('file')}Pratinjau</a><a class="btn ghost sm" href="#" data-dok="${d.id}">${ic('download')}Buka</a></span></li>`).join('')}</ul>` : '<div class="empty">Belum ada dokumen</div>';
  const ubahIsian = can('vm') && p.status !== 'batal' && p.tahap <= 2 ? `<div style="margin-top:12px"><button class="btn ghost sm" data-isian type="button">${ic('file')}Ubah isian dokumen</button><div class="hint" style="margin-top:6px">Hanya bagian kuning pada dokumen yang dapat diubah.</div></div>` : '';
  const fb = p.feedback.length ? p.feedback.map((f) => `<div class="fb ${f.setuju ? 'agree' : ''}"><div class="small"><b>Putaran ${f.putaran}</b> <span class="muted">dari ${esc(f.pengirim || 'mitra')} via ${esc(f.sumber)}, ${jam(f.diterima_pada)}</span></div><p>${esc(f.isi)}</p></div>`).join('') : '<div class="empty">Belum ada tanggapan mitra</div>';
  app.innerHTML = `<div class="crumb"><a href="#/perjanjian">Perjanjian</a> / ${esc(p.kode)}</div>
    ${topbar(esc(m.nama), `${esc(p.judul)}`)}
    <div class="row" style="margin:-8px 0 18px;flex-wrap:wrap">${chipTampil(p.tampil)}<span class="chip c-info">${esc(JENIS_NAMA[p.jenis] || p.jenis)}</span><span class="chip c-idle">${esc(p.kode)}</span>${p.nomor_surat ? `<span class="chip c-info">No. ${esc(p.nomor_surat)}</span>` : ''}${p.nomor_spk ? `<span class="chip c-info">SPK MS No. ${esc(p.nomor_spk)}</span>` : ''}<span class="chip c-idle" title="Nilai kolom PROGRES di spreadsheet">PROGRES: ${esc(p.progres)}</span></div>
    <div class="detail">
      <div class="stack">
        <div class="card"><h2 style="margin-bottom:16px">Alur</h2><ol class="timeline">${timeline}</ol></div>
        <div class="card"><h2 style="margin-bottom:12px">Info perseroan</h2><dl class="kv">
          <dt>Perusahaan</dt><dd>${esc(m.nama)}</dd><dt>Direksi</dt><dd>${esc(m.direksi || '–')}</dd><dt>Alamat</dt><dd>${esc(m.alamat || '–')}</dd>
          <dt>Email tujuan</dt><dd>${m.emails.length ? m.emails.map(esc).join('<br>') : '<span style="color:var(--late)">Kosong</span>'}</dd>
          <dt>PIC</dt><dd>${esc(p.pic_nama)}</dd><dt>Berlaku</dt><dd>${p.tgl_efektif ? `${tgl(p.tgl_efektif)} – ${tgl(p.tgl_berakhir)}` : '–'}</dd></dl>
          <p class="small muted" style="margin:12px 0 0">Salinan data per ${tgl(m.diambil_pada)}. Sumber: tabel mitra (info perseroan).</p></div>
        <div class="card"><h2 style="margin-bottom:8px">Spreadsheet</h2>
          <p class="small muted" style="margin:0 0 10px">Data perjanjian ini tercatat di VM Starlite Sheet, lembar <b>${esc(p.sheet)}</b> (kolom NO ID = ${esc(p.kode)}). Dokumen tetap disimpan di aplikasi.</p>
          <div class="row" style="justify-content:space-between;gap:8px;flex-wrap:wrap"><span>${sheetChip(p)}</span>${can('vm') ? '<button class="btn ghost sm" data-sinkron type="button">Tulis ulang ke spreadsheet</button>' : ''}</div>
          ${can('vm') ? `<div class="field" style="margin:14px 0 6px"><label for="cvm">Catatan VM (${p.jenis === 'MS' ? 'REMARK SANS' : 'REMARK'})</label><textarea class="input" id="cvm" maxlength="500" placeholder="Tercatat di spreadsheet">${esc(p.remark_vm || '')}</textarea></div><button class="btn ghost sm" data-catat type="button">Simpan catatan</button>` : ''}
          ${p.remark_legal ? `<p class="small" style="margin:12px 0 0"><b>Catatan Legal:</b> ${esc(p.remark_legal)}</p>` : ''}</div>
      </div>
      <div class="stack">
        <div class="card action" id="action"></div>
        <div class="card"><div class="card-head"><h2>Dokumen</h2><span class="small muted">Terkunci, setiap versi tersimpan</span></div>${docs}${ubahIsian}</div>
        <div class="card"><div class="card-head"><h2>Tanggapan mitra</h2></div>${fb}</div>
        <div class="card"><details class="more"><summary>Riwayat email (${p.email.length}) dan jejak audit (${p.audit.length})</summary>
          <h3 style="margin:14px 0 6px">Email</h3><ul class="list audit">${p.email.map((e) => `<li><span class="muted">${jam(e.waktu)}</span><span>${esc(e.subjek)}<br><span class="small muted">ke ${esc(e.penerima)}, ${e.status === 'gagal' ? `<b style="color:var(--late)">gagal: ${esc(e.galat)}</b>` : e.mode === 'simulasi' ? 'simulasi' : 'terkirim'}</span></span></li>`).join('') || '<li><span></span><span class="muted">Belum ada</span></li>'}</ul>
          <h3 style="margin:14px 0 6px">Audit</h3><ul class="list audit">${p.audit.map((a) => `<li><span class="muted">${jam(a.waktu)}</span><span><b>${esc(aktor(a.aktor, a.aktor_nama))}</b> ${esc(AKSI[a.aksi] || a.aksi)}</span></li>`).join('')}</ul></details></div>
      </div>
    </div>`;
  bindSearch();
  renderAction(p);
}

function renderAction(p) {
  const box = $('#action');
  const m = p.mitra;
  const reload = () => pageDetail(p.id);
  $('[data-isian]')?.addEventListener('click', () => bukaIsian(p, reload));
  $('[data-sinkron]')?.addEventListener('click', (e) => busy(e.currentTarget, async () => { await post(`/api/perjanjian/${p.id}/sinkron`); toast('Tertulis di spreadsheet'); reload(); }));
  $('[data-catat]')?.addEventListener('click', (e) => busy(e.currentTarget, async () => { await post(`/api/perjanjian/${p.id}/catatan`, { catatan: $('#cvm').value }); toast('Catatan disimpan'); reload(); }));
  const doIt = (sel, fn, ok) => box.querySelector(sel)?.addEventListener('click', (e) => busy(e.currentTarget, async () => { const r = await fn(); if (r?.portal) console.info('Tautan portal (mode dev):', r.portal); toast(ok); reload(); }));
  let html = '';
  const head = (eyebrow, title, desc) => `<div class="eyebrow">${eyebrow}</div><h2 style="margin:4px 0 6px">${title}</h2>${desc ? `<p class="muted" style="margin:0 0 14px">${desc}</p>` : ''}`;
  if (p.status === 'batal') html = head('Dibatalkan', 'Perjanjian dibatalkan', esc(p.alasan_batal));
  else if (p.tahap === 0) {
    html = head('Langkah berikutnya', 'Kirim dokumen ke mitra', m.emails.length ? `Email beserta dokumen dan tautan tanggapan dikirim dari ${esc(S.me.mode.google ? 'akun Vendor Management' : 'mode simulasi')} ke ${m.emails.map(esc).join(', ')}.` : '')
      + (m.emails.length ? (can('vm') ? `<button class="btn" data-a="kirim">${ic('send')}Kirim ke mitra</button>` : '') : `<div class="notice">Email mitra kosong di info perseroan. Lengkapi kolom email pada tabel mitra di Cloudflare, lalu muat ulang halaman ini.</div>`);
  } else if (p.tahap === 1 || p.tahap === 2) {
    html = (p.tahap === 1
      ? head('Review mitra', 'Menunggu persetujuan mitra', `Batas ${tgl(p.tenggat)}. Mitra mengisi bagian kuning dan menyetujui lewat aplikasi. Begitu mitra setuju, dokumen otomatis diteruskan ke Legal.`)
      : head('Review mitra', 'Mitra memberi catatan', 'Tindak lanjuti catatan (ubah isian bila perlu). Bila sudah beres, teruskan ke Legal atau tunggu mitra menekan Setuju.')
        + (can('vm') ? `<div class="row" style="margin-bottom:16px"><button class="btn" data-a="legal">${ic('stamp')}Teruskan ke Legal</button></div>` : ''))
      + (can('vm') ? `<details class="more"><summary>Catat tanggapan dari telepon/WhatsApp</summary><div style="margin-top:12px"><div class="field"><label for="fb-isi">Isi tanggapan</label><textarea class="input" id="fb-isi" placeholder="Misal: setuju lewat telepon"></textarea></div>
      <label class="row small" style="margin-bottom:12px"><input type="checkbox" id="fb-setuju"> Mitra setuju (langsung ke Legal)</label><button class="btn ghost" data-a="fb">Catat tanggapan</button></div></details>` : '');
  } else if (p.tahap === 3) {
    html = can('legal')
      ? head('Tugas Legal', 'Terbitkan nomor surat', `Nomor dicetak otomatis di halaman pertama, lalu dokumen langsung dikirim ke mitra untuk TTD. Tenggat ${tgl(p.tenggat)}.`)
        + `<div class="field"><label for="no">${p.jenis === 'MS' ? 'Nomor PKS MS' : 'Nomor surat'}</label><input class="input" id="no" placeholder="Contoh: 001/PKS/LGL/IJE/XI/2026"></div>
          ${p.jenis === 'MS' ? '<div class="field"><label for="nospk">Nomor SPK MS</label><input class="input" id="nospk"></div>' : ''}
          <div class="field"><label for="ncat">Catatan Legal (opsional)</label><input class="input" id="ncat" maxlength="500"></div><button class="btn" data-a="nomor">Terbitkan nomor</button>`
      : head('Di Legal', 'Menunggu nomor surat dari Legal', `Tenggat ${tgl(p.tenggat)}.`);
  } else if (p.tahap === 4) {
    html = head('Perlu tindakan', 'Dokumen bernomor belum terkirim ke mitra', `Pengiriman otomatis gagal (biasanya email mitra kosong). Lengkapi email mitra di info perseroan, lalu kirim ulang.`)
      + (can('vm') ? `<button class="btn" data-a="bagikan">${ic('send')}Kirim ulang ke mitra</button>` : '');
  } else if (p.tahap === 5) {
    const rev = p.dokumen.find((d) => d.jenis === 'ttd_mitra' && d.status === 'menunggu_review');
    if (rev && can('vm')) {
      html = head('Perlu diperiksa', 'Periksa tanda tangan mitra', `Mitra mengunggah ${rev.penanda === 'scan_asli' ? 'scan dokumen lengkap' : 'tanda tangan yang ditempel ke dokumen'}. Pastikan tanda tangan, stempel, dan meterai terlihat jelas.`)
        + `<iframe class="pdf-frame" data-pdf="${rev.id}" title="Dokumen bertanda tangan mitra"></iframe>
        <div class="row" style="margin-top:14px"><button class="btn ok" data-a="setujui">${ic('check')}Setujui tanda tangan</button></div>
        <div class="field" style="margin-top:16px"><label for="alasan">Alasan bila diminta unggah ulang</label><textarea class="input" id="alasan" placeholder="Misal: meterai tidak terlihat jelas"></textarea></div><button class="btn danger" data-a="tolak">Minta unggah ulang</button>`;
    } else {
      html = head('Menunggu mitra', 'Menunggu tanda tangan basah mitra', `Mitra mencetak, menandatangani basah (stempel + meterai), lalu mengunggah scan lewat tautan. Batas ${tgl(p.tenggat)}. Pengingat dikirim otomatis H-3, H-0, dan saat lewat tenggat. Admin TTD ikut memantau.`)
        + (can('vm') ? `<div data-ttd="mitra"></div>` : '');
    }
  } else if (p.tahap === 6) {
    const diIje = p.sub_progres === 'PROSES SIGN IJE';
    html = (S.me.penandatangan || S.me.peran === 'admin')
      ? head('Langkah terakhir', diIje ? 'Sedang ditandatangani PT IJE' : 'TTD mitra lengkap — lanjut tanda tangan PT IJE', 'Setelah scan final (TTD basah kedua pihak) diunggah, dokumen dikunci, diarsipkan ke Drive, dan salinannya dikirim ke mitra.')
        + (diIje ? '' : `<button class="btn ghost" data-a="proses-ije" style="margin-bottom:14px">Tandai: dokumen sudah di penandatangan PT IJE</button>`)
        + `<div data-ttd="ije"></div>`
      : head('Menunggu', 'Menunggu tanda tangan PT IJE', 'Akun Utama atau Admin TTD akan menyelesaikan tahap ini.');
  } else if (p.tahap === 7) {
    const fin = p.dokumen.find((d) => d.jenis === 'final');
    html = head('Selesai', 'Perjanjian ditandatangani kedua pihak', `Berlaku ${tgl(p.tgl_efektif)} sampai ${tgl(p.tgl_berakhir)}. Pengingat perpanjangan dikirim H-90, H-60, dan H-30.`)
      + (fin ? `<a class="btn" href="#" data-dok="${fin.id}">${ic('download')}Unduh dokumen final</a>` : '')
      + (p.arsip_url ? ` <a class="btn ghost" href="${p.arsip_url}" target="_blank" rel="noopener">${ic('download')}Buka arsip di Drive</a>` : (can('vm') ? ` <button class="btn ghost" data-a="arsip">Arsipkan ke Drive</button>` : ''));
  }
  if (p.tahap < 7 && p.status !== 'batal') html += `<p class="muted" style="margin-top:16px;font-size:13px">Arsip Drive: dokumen disimpan ke folder ${esc(p.mitra?.nama || 'mitra')} hanya setelah ditandatangani kedua pihak.</p>`;
  if (can('vm') && p.status !== 'batal' && p.tahap < 7 && p.tahap > 0) {
    html += `<details class="more" style="margin-top:20px;padding-top:14px;border-top:1px solid var(--line)"><summary>Koreksi alur</summary><div style="margin-top:12px">
      <div class="row"><div class="field" style="flex:1;margin:0"><label for="ke">Kembalikan ke langkah</label><select class="input" id="ke">${S.meta.langkah.filter((l) => l.tahap[0] < p.tahap && l.n < S.meta.tahap[p.tahap].langkah).map((l) => `<option value="${l.tahap[0]}">${esc(l.nama)}</option>`).join('')}</select></div></div>
      <div class="field" style="margin-top:10px"><label for="kor">Alasan</label><textarea class="input" id="kor" placeholder="Wajib diisi, tercatat di jejak audit"></textarea></div>
      <div class="row"><button class="btn ghost" data-a="mundur">Kembalikan tahap</button><button class="btn danger" data-a="batal">Batalkan perjanjian</button></div></div></details>`;
  }
  box.innerHTML = html;
  $$('iframe[data-pdf]', box).forEach(async (fr) => { try { const b = await api(`/api/dokumen/${fr.dataset.pdf}`); fr.src = URL.createObjectURL(b) + '#page=999&view=FitH'; } catch (e) { toast(e.message, true); } });

  doIt('[data-a="kirim"]', () => post(`/api/perjanjian/${p.id}/kirim`), 'Dokumen dikirim ke mitra');
  doIt('[data-a="legal"]', () => post(`/api/perjanjian/${p.id}/legal`), 'Diteruskan ke Legal');
  doIt('[data-a="fb"]', () => post(`/api/perjanjian/${p.id}/feedback`, { isi: $('#fb-isi').value, setuju: $('#fb-setuju').checked }), 'Tanggapan dicatat');
  doIt('[data-a="nomor"]', () => { const fd = new FormData(); fd.set('nomor_surat', $('#no').value); fd.set('nomor_spk', $('#nospk')?.value || ''); fd.set('catatan', $('#ncat')?.value || ''); return postForm(`/api/perjanjian/${p.id}/nomor`, fd); }, 'Nomor terbit dan dokumen dikirim ke mitra untuk TTD');
  doIt('[data-a="bagikan"]', () => post(`/api/perjanjian/${p.id}/bagikan`), 'Perjanjian dibagikan ke mitra');
  doIt('[data-a="arsip"]', () => post(`/api/perjanjian/${p.id}/arsip`, {}), 'Diarsipkan ke Drive');
  doIt('[data-a="setujui"]', () => post(`/api/perjanjian/${p.id}/ttd-mitra/review`, { setuju: true }), 'Tanda tangan mitra disetujui');
  doIt('[data-a="tolak"]', () => post(`/api/perjanjian/${p.id}/ttd-mitra/review`, { setuju: false, alasan: $('#alasan').value }), 'Permintaan unggah ulang dikirim');
  doIt('[data-a="proses-ije"]', () => post(`/api/perjanjian/${p.id}/sub-progres`, { nilai: 'PROSES SIGN IJE' }), 'Status: sedang ditandatangani PT IJE');
  doIt('[data-a="mundur"]', () => post(`/api/perjanjian/${p.id}/mundur`, { ke: $('#ke').value, alasan: $('#kor').value }), 'Tahap dikembalikan');
  doIt('[data-a="batal"]', () => post(`/api/perjanjian/${p.id}/batal`, { alasan: $('#kor').value }), 'Perjanjian dibatalkan');

  const ttdBox = box.querySelector('[data-ttd]');
  if (ttdBox) panelTtd(ttdBox, p, ttdBox.dataset.ttd, reload);
}

// Dokumen bernomor (atau TTD mitra terakhir) diserahkan ke fitur Signing di dashboard.
async function keSigning(p, pihak) {
  if (typeof window.sgNew !== 'function' || typeof window.sgPickFiles !== 'function') throw new Error('Fitur Signing tidak tersedia di halaman ini. Buka dari dashboard VM.');
  const sumber = pihak === 'ije' ? p.dokumen.find((d) => d.jenis === 'ttd_mitra' && d.status === 'aktif') : null;
  const doc = sumber || p.dokumen.find((d) => d.jenis === 'bernomor' && d.status === 'aktif');
  if (!doc) throw new Error('Dokumen bernomor belum tersedia');
  const blob = await api(`/api/dokumen/${doc.id}`);
  const file = new File([blob], `${p.kode} ${p.nomor_surat || ''}.pdf`.replace(/[\\/:*?"<>|]+/g, '-'), { type: 'application/pdf' });
  window.sgNew();
  await new Promise((r) => setTimeout(r, 200));
  window.sgPickFiles([file]);
  toast('Dokumen dibuka di fitur Signing. Tambahkan penandatangan, lalu unggah hasil akhirnya di sini.');
}

function panelTtd(el, p, pihak, reload) {
  const hal = p.dokumen.find((d) => d.jenis === 'bernomor')?.halaman;
  const masaAwal = S.meta.jenis.find((j) => j.kode === p.jenis)?.masa_bulan || 12;
  const tglMasa = (pfx) => `<div class="row" style="gap:12px;flex-wrap:wrap;margin-bottom:10px"><div class="field" style="margin:0"><label for="${pfx}ef">Tanggal efektif</label><input class="input" id="${pfx}ef" type="date" value="${hariIniWib()}"></div>
    <div class="field" style="margin:0"><label for="${pfx}masa">Masa berlaku (bulan)</label><input class="input" id="${pfx}masa" type="number" min="1" max="120" value="${masaAwal}"></div></div>`;
  const berkas = (id, label) => `<div class="field"><label for="${id}">${label}</label><input class="input" id="${id}" type="file" accept="application/pdf"><span class="hint">PDF seluruh halaman${hal ? ` (${hal} halaman)` : ''}, maks. 20 MB.</span></div>`;
  el.innerHTML = `<div class="seg-toggle" role="group" aria-label="Cara tanda tangan" style="margin-bottom:14px"><button type="button" aria-pressed="true" data-o="basah">TTD basah (scan)</button><button type="button" aria-pressed="false" data-o="signing">Pakai fitur Signing</button></div><div data-o-body></div>`;
  const body = $('[data-o-body]', el);
  const kirim = async (url, fileId, extra) => {
    const f = $('#' + fileId, body).files[0]; if (!f) throw new Error('Pilih berkas PDF');
    const fd = new FormData(); fd.set('berkas', f); Object.entries(extra).forEach(([k, v]) => fd.set(k, v));
    return postForm(url, fd);
  };
  const tgls = (pfx) => ({ tgl_efektif: $(`#${pfx}ef`, body).value, masa_bulan: $(`#${pfx}masa`, body).value });
  const show = (o) => {
    $$('[data-o]', el).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.o === o)));
    if (o === 'basah') {
      body.innerHTML = pihak === 'mitra'
        ? `<p class="muted" style="margin:0 0 10px">Bila mitra menyerahkan dokumen bertanda tangan basah langsung (tidak lewat tautan), pindai lalu unggah atas nama mitra.</p>${berkas('sm', 'Scan dokumen bertanda tangan mitra')}<button class="btn" data-up>Unggah scan mitra</button>`
        : `<p class="muted" style="margin:0 0 10px">Setelah PT IJE menandatangani basah, pindai seluruh halaman (TTD kedua pihak).</p>${tglMasa('b')}${berkas('sf', 'Scan final bertanda tangan kedua pihak')}<button class="btn" data-up>Unggah dan selesaikan</button>`;
      $('[data-up]', body).addEventListener('click', (e) => busy(e.currentTarget, async () => {
        if (pihak === 'mitra') { await kirim(`/api/perjanjian/${p.id}/ttd-mitra`, 'sm', { opsi: '2' }); toast('Scan mitra disimpan'); }
        else { await kirim(`/api/perjanjian/${p.id}/ttd-ije`, 'sf', { opsi: '2', ...tgls('b') }); toast('Perjanjian selesai dan diarsipkan'); }
        reload();
      }));
    } else {
      body.innerHTML = `<p class="muted" style="margin:0 0 10px">Dokumen ${pihak === 'ije' ? 'bertanda tangan mitra' : 'bernomor'} dibuka di fitur Signing dashboard. Atur penandatangan di sana; setelah selesai, unduh hasilnya lalu unggah di bawah.</p>
        <button class="btn ghost" data-sg type="button">Buka di fitur Signing</button>
        <div style="margin-top:14px">${pihak === 'mitra' ? '<label class="row small" style="margin-bottom:10px"><input type="checkbox" id="sgl"> Hasil Signing sudah memuat TTD kedua pihak (mitra dan PT IJE)</label>' : ''}
        <div data-tm ${pihak === 'mitra' ? 'hidden' : ''}>${tglMasa('s')}</div>${berkas('sh', 'PDF hasil Signing')}<button class="btn" data-up>Unggah hasil Signing</button></div>`;
      $('[data-sg]', body).addEventListener('click', (e) => busy(e.currentTarget, () => keSigning(p, pihak)));
      $('#sgl', body)?.addEventListener('change', (e) => { $('[data-tm]', body).hidden = !e.target.checked; });
      $('[data-up]', body).addEventListener('click', (e) => busy(e.currentTarget, async () => {
        const lengkap = pihak === 'ije' || $('#sgl', body)?.checked;
        if (lengkap) { await kirim(`/api/perjanjian/${p.id}/ttd-ije`, 'sh', { opsi: 'signing', lengkap: pihak === 'mitra' ? '1' : '', ...tgls('s') }); toast('Perjanjian selesai dan diarsipkan'); }
        else { await kirim(`/api/perjanjian/${p.id}/ttd-mitra`, 'sh', { opsi: 'signing' }); toast('Hasil Signing (TTD mitra) disimpan'); }
        reload();
      }));
    }
  };
  $$('[data-o]', el).forEach((b) => b.addEventListener('click', () => show(b.dataset.o)));
  show('basah');
}

// ---------- Mitra ----------
async function pageMitra(params) {
  const mode = params.get('semua') ? 'semua' : 'batch';
  const q = params.get('q') || '';
  const list = await api(mode === 'batch' && !q ? '/api/mitra?batch=1' : `/api/mitra?q=${encodeURIComponent(q)}`);
  const kosong = list.filter((m) => !m.emails.length).length;
  app.innerHTML = `${topbar('Mitra', `${list.length} mitra${mode === 'batch' && !q ? ' pada batch awal' : ''}. Sumber: info perseroan.`)}
    ${kosong ? `<div class="notice" style="margin-bottom:16px">${kosong} mitra belum punya email di info perseroan dan belum bisa menerima dokumen.</div>` : ''}
    <div class="card"><div class="card-head" style="flex-wrap:wrap">
      <div class="seg-toggle" role="group" aria-label="Cakupan"><button aria-pressed="${mode === 'batch' && !q}" data-m="batch">Batch awal</button><button aria-pressed="${mode === 'semua' || !!q}" data-m="semua">Semua mitra</button></div>
      <form class="search" data-ms style="width:min(340px,100%)">${ic('search')}<label class="sr" for="mq">Cari mitra</label><input id="mq" value="${esc(q)}" placeholder="Cari nama mitra"></form></div>
      <div class="table-wrap"><table class="t"><thead><tr><th>Perusahaan</th><th>Jenis</th><th>Status</th><th>Email</th><th>Perjanjian</th><th></th></tr></thead><tbody>
      ${list.map((m, i) => `<tr data-i="${i}"><td><div class="cell-main">${esc(m.nama)}</div><div class="cell-sub">${esc(m.direksi || '')}</div></td><td>${esc(m.jenis || '–')}</td><td><span class="chip ${m.status === 'Aktif' ? 'c-ok' : 'c-idle'}">${esc(m.status)}</span></td>
        <td>${m.emails.length ? `<span class="cell-sub">${esc(m.emails[0])}${m.emails.length > 1 ? ` +${m.emails.length - 1}` : ''}</span>` : '<span class="chip c-late">Kosong</span>'}</td><td class="num">${m.perjanjian}</td>
        <td>${can('vm') ? `<button class="btn ghost sm" data-c="${i}">${ic('plus')}Perjanjian</button>` : ''}</td></tr>`).join('')}
      </tbody></table></div></div>`;
  bindSearch();
  $$('[data-m]').forEach((b) => b.addEventListener('click', () => { location.hash = b.dataset.m === 'semua' ? '#/mitra?semua=1' : '#/mitra'; }));
  $('[data-ms]').addEventListener('submit', (e) => { e.preventDefault(); const v = $('#mq').value.trim(); location.hash = v ? `#/mitra?semua=1&q=${encodeURIComponent(v)}` : '#/mitra'; });
  $$('[data-c]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); openCreate(list[b.dataset.c]); }));
  $$('tr[data-i]').forEach((tr) => tr.addEventListener('click', () => openMitra(list[tr.dataset.i].row)));
}

async function openMitra(row) {
  const m = await api(`/api/mitra/${row}`);
  const dlg = document.createElement('dialog');
  dlg.innerHTML = `<div class="dh"><h2>${esc(m.nama)}</h2><button class="icon-btn" aria-label="Tutup" data-x>✕</button></div><div class="db">
    <dl class="kv"><dt>Nama singkat</dt><dd>${esc(m.singkat)}</dd><dt>Jenis</dt><dd>${esc(m.jenis || '–')}</dd><dt>Status</dt><dd>${esc(m.status)}</dd><dt>Direksi</dt><dd>${esc(m.direksi || '–')}</dd><dt>Alamat</dt><dd>${esc(m.alamat || '–')}</dd><dt>Telepon</dt><dd>${esc(m.telepon || '–')}</dd><dt>Email</dt><dd>${m.emails.map(esc).join('<br>') || '<span style="color:var(--late)">Kosong</span>'}</dd></dl>
    <h3 style="margin:18px 0 8px">Perjanjian</h3>${m.perjanjian.length ? `<ul class="list">${m.perjanjian.map((p) => `<li style="grid-template-columns:minmax(0,1fr) auto"><a href="#/perjanjian/${p.id}" data-x style="min-width:0"><div class="t">${esc(p.judul)}</div><div class="s">${esc(p.nomor_surat || p.kode)}, ${esc(tahapNama(p.tahap))}</div></a>${chipTampil(p.tampil)}</li>`).join('')}</ul>` : '<div class="empty">Belum ada perjanjian</div>'}
    <p class="small muted">Data perusahaan diubah di tabel mitra (info perseroan), bukan di Starlite.</p></div>
    <div class="df">${can('vm') ? `<button class="btn" data-n>${ic('plus')}Perjanjian baru</button>` : ''}</div>`;
  document.body.append(dlg); dlg.showModal();
  dlg.addEventListener('close', () => dlg.remove());
  $$('[data-x]', dlg).forEach((x) => x.addEventListener('click', () => dlg.close()));
  $('[data-n]', dlg)?.addEventListener('click', () => { dlg.close(); openCreate(m); });
}

// ---------- Overview perjanjian (akun utama): dashboard semua perjanjian dan progresnya ----------
const OV_STATUS = { aktif: ['Aktif', 'c-ok'], akan_berakhir: ['Akan berakhir', 'c-warn'], berakhir: ['Berakhir', 'c-late'], proses: ['Dalam proses', 'c-info'], belum_ada: ['Belum ada perjanjian', 'c-idle'], tidak_ketemu: ['Tidak ketemu di info perseroan', 'c-late'] };
const OV_LANGKAH = [['Draf', [0]], ['Review mitra', [1, 2]], ['Nomor surat', [3, 4]], ['TTD mitra', [5]], ['TTD PT IJE', [6]], ['Selesai', [7]]];
const ovStep = (tahap) => { const i = OV_LANGKAH.findIndex(([, t]) => t.includes(tahap)); return `<div class="ov-step" title="${esc(OV_LANGKAH[i][0])}" style="display:flex;gap:3px;align-items:center;min-width:150px">${OV_LANGKAH.map((_, k) => `<i style="flex:1;height:6px;border-radius:3px;background:${k < i ? 'var(--ok,#17885A)' : k === i ? (i === 5 ? 'var(--ok,#17885A)' : 'var(--blue,#2F9BEF)') : 'var(--line,#dfe5ee)'}"></i>`).join('')}</div><small class="muted">${esc(OV_LANGKAH[i][0])}</small>`; };
async function pageOverview(params) {
  if (!can()) { location.hash = '#/'; return; }
  const jenis = params.get('jenis') || '', kel = params.get('kel') || '', st = params.get('st') || '';
  const d = await api('/api/overview' + (jenis ? `?jenis=${encodeURIComponent(jenis)}` : ''));
  const adaHomepass = d.jenis.some((j) => /homepass/i.test(j.nama));
  const opsi = [['', 'Semua jenis perjanjian'], ...d.jenis.map((j) => [j.kode, j.nama]), ...(adaHomepass ? [] : [['HOMEPASS', 'Perjanjian Homepass']])];
  const q = (o) => '#/overview?' + new URLSearchParams(Object.fromEntries(Object.entries({ jenis, kel, st, ...o }).filter(([, v]) => v)));
  const k = d.kpi, maks = Math.max(1, ...d.pipeline.map((x) => x.jumlah));
  const tiles = [['Semua perjanjian', k.total, 'c-info', ''], ['Berjalan', k.berjalan, 'c-info', 'proses'], ['Aktif', k.aktif, 'c-ok', 'aktif'], ['Akan berakhir (90 hari)', k.akan_berakhir, 'c-warn', 'akan_berakhir'], ['Berakhir', k.berakhir, 'c-late', 'berakhir'], ['Lewat tenggat', k.telat, 'c-late', '']];
  const semua = d.semua.filter((x) => (!kel || (kel === 'inner' ? x.inner_city : !x.inner_city)) && (!st || x.status === st));
  const perhatian = d.semua.filter((x) => x.status === 'akan_berakhir' || x.status === 'berakhir' || (x.tahap < 7 && x.tenggat && x.tenggat < new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10))).slice(0, 8);
  const belum = d.daftar.filter((r) => r.status === 'belum_ada' || r.status === 'tidak_ketemu');
  app.innerHTML = `${topbar('Overview perjanjian', 'Semua perjanjian, progresnya, dan masa berlakunya.')}
    <div class="card" style="margin-bottom:16px"><div class="row" style="gap:12px;align-items:end;flex-wrap:wrap">
      <div class="field" style="margin:0"><label for="ovj">Perjanjian</label><select class="input" id="ovj">${opsi.map(([v, l]) => `<option value="${esc(v)}" ${v === jenis ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
      <div class="field" style="margin:0"><label for="ovk">Kelompok mitra</label><select class="input" id="ovk"><option value="">Semua mitra</option><option value="inner" ${kel === 'inner' ? 'selected' : ''}>Inner City (${d.total})</option><option value="lain" ${kel === 'lain' ? 'selected' : ''}>Di luar Inner City</option></select></div>
      <button class="btn ghost" data-a="sinkron">Cocokkan ulang Inner City</button>
      <button class="btn ghost" data-a="arsipsemua">Arsipkan semua yang final</button></div>
      ${d.tersinkron ? '' : '<p class="muted" style="margin-top:12px">Inner City belum dicocokkan ke info perseroan. Tekan "Cocokkan ulang Inner City".</p>'}
      ${jenis === 'HOMEPASS' ? '<p class="muted" style="margin-top:12px">Template Perjanjian Homepass belum dipasang, jadi belum ada perjanjian jenis ini.</p>' : ''}</div>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin-bottom:16px">${tiles.map(([l, v, c, s]) => `<a class="card" ${s ? `href="${q({ st: st === s ? '' : s })}"` : ''} style="text-decoration:none;min-width:0;${s && st === s ? 'outline:2px solid var(--blue)' : ''}"><div class="num" style="font-size:26px;font-weight:700">${v}</div><span class="chip ${c}" style="white-space:normal">${l}</span></a>`).join('')}</div>
    <div class="card" style="margin-bottom:16px"><div class="card-head"><h2>Progres per langkah</h2><span class="muted">Jumlah perjanjian di tiap langkah</span></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px">${OV_LANGKAH.map(([n, ts]) => { const j = d.pipeline.filter((x) => ts.includes(x.tahap)).reduce((a, x) => a + x.jumlah, 0); return `<div><div class="num" style="font-size:22px;font-weight:700">${j}</div><div style="height:8px;border-radius:4px;background:var(--line,#dfe5ee);margin:6px 0"><div style="height:100%;width:${Math.round((j / maks) * 100)}%;max-width:100%;border-radius:4px;background:${n === 'Selesai' ? 'var(--ok,#17885A)' : 'var(--blue,#2F9BEF)'}"></div></div><small class="muted">${esc(n)}</small></div>`; }).join('')}</div></div>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px;margin-bottom:16px;align-items:start">
      <div class="card"><div class="card-head"><h2>Perlu perhatian</h2></div>${perhatian.length ? `<ul class="list" style="list-style:none;padding:0;margin:0;display:grid;gap:10px">${perhatian.map((x) => `<li style="display:flex;justify-content:space-between;gap:8px"><a href="#/perjanjian/${x.id}">${esc(x.mitra)}<br><small class="muted">${esc(x.nomor_surat || x.kode)}</small></a><span class="chip ${OV_STATUS[x.status]?.[1] || 'c-late'}">${x.tahap < 7 && x.status !== 'berakhir' ? 'Lewat tenggat' : OV_STATUS[x.status][0]}${x.tgl_berakhir ? ' ' + tgl(x.tgl_berakhir) : ''}</span></li>`).join('')}</ul>` : '<p class="muted">Tidak ada yang perlu perhatian.</p>'}</div>
    </div>
    <div class="card" id="kirimBox" style="margin-bottom:16px"><div class="card-head"><h2>Kirim perjanjian ke mitra</h2><span class="muted">Memuat daftar mitra…</span></div></div>
    <div class="card"><div class="card-head"><h2>Semua perjanjian dan progresnya</h2><span class="muted">${semua.length} perjanjian</span></div>
      <div style="overflow-x:auto"><table class="tbl" style="width:100%"><thead><tr style="text-align:left"><th>Mitra</th><th>Progres</th><th>Status</th><th>Nomor surat</th><th>Berakhir</th></tr></thead><tbody>${semua.map((x) => `<tr><td><a href="#/perjanjian/${x.id}">${esc(x.mitra)}</a>${x.inner_city ? '<br><small class="muted">Inner City</small>' : ''}</td><td>${ovStep(x.tahap)}</td><td><span class="chip ${OV_STATUS[x.status][1]}">${OV_STATUS[x.status][0]}</span></td><td>${esc(x.nomor_surat || '–')}</td><td>${x.tgl_berakhir ? tgl(x.tgl_berakhir) : '–'}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Belum ada perjanjian.</td></tr>'}</tbody></table></div></div>`;
  const go = () => { location.hash = q({ jenis: $('#ovj').value, kel: $('#ovk').value }); };
  $('#ovj').addEventListener('change', go); $('#ovk').addEventListener('change', go);
  $('[data-a="sinkron"]').addEventListener('click', (e) => busy(e.currentTarget, async () => {
    const r = await post('/api/overview/sinkron', {});
    toast(`${r.cocok} dari ${r.total} cocok${r.tidak_ketemu.length ? `, ${r.tidak_ketemu.length} tidak ketemu` : ''}${r.ganda.length ? `, ${r.ganda.length} ganda` : ''}`);
    route();
  }));
  const jalankan = async (rows, tombol) => {
    let ok = 0; const gagal = []; const lewati = [];
    for (let guard = 0; guard < 60; guard++) {
      const r = await post('/api/overview/kirim-sekaligus', { rows, batas: OVF.jenis === 'MS' ? 2 : 4, lewati, jenis: OVF.jenis });
      r.hasil.forEach((h) => { if (!h.ok) lewati.push(h.row); });
      r.hasil.forEach((h) => (h.ok ? ok++ : gagal.push(`${h.nama}: ${h.galat}`)));
      if (!r.sisa) break;
      tombol.textContent = `Mengirim… ${ok} terkirim, sisa ${r.sisa}`;
    }
    toast(`${ok} perjanjian terkirim${gagal.length ? `, ${gagal.length} gagal (${gagal[0]})` : ''}`, gagal.length > 0 && ok === 0);
    route();
  };
  const muatKirim = () => api(`/api/overview/mitra?jenis=${OVF.jenis}`).then((m) => kirimMitraUI($('#kirimBox'), m, d, jalankan, muatKirim)).catch((ex) => { const kb = $('#kirimBox'); if (kb) kb.innerHTML = `<div class="card-head"><h2>Kirim perjanjian ke mitra</h2></div><div class="empty">${esc(ex.message)}</div>`; });
  muatKirim();
  $('[data-a="arsipsemua"]').addEventListener('click', (e) => busy(e.currentTarget, async () => {
    let ok = 0; let gagal = 0;
    for (let g = 0; g < 30; g++) { const r = await post('/api/overview/arsip-semua', {}); r.hasil.forEach((h) => (h.ok ? ok++ : gagal++)); if (!r.sisa) break; }
    toast(`${ok} diarsipkan${gagal ? `, ${gagal} gagal` : ''}`, gagal > 0 && !ok); route();
  }));
}


// ---------- Kirim perjanjian ke mitra (semua mitra di info perseroan, filter Inner City) ----------
const OVF = { q: '', kel: '', st: '', pj: 'belum', jenis: 'PKS', sel: new Set() };
function kirimMitraUI(kb, mitra, d, jalankan, muatKirim) {
  if (!kb || !kb.isConnected) return;
  const F = OVF, MAKS = 300;
  const statusMitra = [...new Set(mitra.map((m) => m.status_mitra))].sort();
  const nIC = mitra.filter((m) => m.inner_city).length;
  const layak = (m) => m.status === 'belum_ada' && m.ada_email;
  const saring = () => mitra.filter((m) => (!F.q || m.nama.toUpperCase().includes(F.q.toUpperCase()))
    && (!F.kel || (F.kel === 'inner' ? m.inner_city : !m.inner_city))
    && (!F.st || m.status_mitra === F.st)
    && (F.pj === 'semua' || (F.pj === 'belum' ? m.status === 'belum_ada' : m.status !== 'belum_ada')));
  const tdkKetemu = d.daftar.filter((r) => r.status === 'tidak_ketemu').length;
  kb.innerHTML = `<div class="card-head"><h2>Kirim perjanjian ke mitra</h2><span class="muted" data-kcount></span></div>
    <div class="row" style="gap:12px;align-items:end;flex-wrap:wrap;margin-bottom:12px">
      <div class="field" style="margin:0;flex:1 1 220px"><label for="kq">Cari mitra</label><input class="input" id="kq" placeholder="Nama mitra" value="${esc(F.q)}" autocomplete="off"></div>
      <div class="field" style="margin:0"><label for="kkel">Kelompok</label><select class="input" id="kkel"><option value="">Semua mitra (${mitra.length})</option><option value="inner" ${F.kel === 'inner' ? 'selected' : ''}>Inner City (${nIC})</option><option value="lain" ${F.kel === 'lain' ? 'selected' : ''}>Bukan Inner City (${mitra.length - nIC})</option></select></div>
      <div class="field" style="margin:0"><label for="kst">Status mitra</label><select class="input" id="kst"><option value="">Semua status</option>${statusMitra.map((x) => `<option value="${esc(x)}" ${F.st === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div>
      <div class="field" style="margin:0"><label for="kjn">Jenis yang dikirim</label><select class="input" id="kjn">${Object.entries(JENIS_NAMA).map(([k, l]) => `<option value="${k}" ${OVF.jenis === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
      <div class="field" style="margin:0"><label for="kpj">Perjanjian</label><select class="input" id="kpj"><option value="belum" ${F.pj === 'belum' ? 'selected' : ''}>Belum berperjanjian</option><option value="sudah" ${F.pj === 'sudah' ? 'selected' : ''}>Sudah berperjanjian</option><option value="semua" ${F.pj === 'semua' ? 'selected' : ''}>Semua</option></select></div>
    </div>
    <div class="row" style="gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px">
      <button class="btn ghost sm" type="button" data-kpilih></button><button class="btn ghost sm" type="button" data-kbersih>Kosongkan pilihan</button>
      <button class="btn" type="button" data-kkirim disabled>Kirim</button>
      <span class="hint" style="margin:0">Dokumen dan email memakai format di Pengaturan. Mitra tanpa email di info perseroan tidak bisa dikirim.</span></div>
    ${tdkKetemu ? `<p class="muted" style="margin:0 0 10px">${tdkKetemu} nama Inner City belum ketemu di info perseroan. Tekan "Cocokkan ulang Inner City".</p>` : ''}
    <div data-ktabel style="overflow-x:auto"></div>`;
  const isi = () => {
    const list = saring(), L = list.filter(layak), tampilList = list.slice(0, MAKS);
    for (const r of [...F.sel]) if (!mitra.find((m) => m.row === r && layak(m))) F.sel.delete(r);
    $('[data-kcount]', kb).textContent = `${list.length} mitra tampil dari ${mitra.length} di info perseroan`;
    $('[data-kpilih]', kb).textContent = `Pilih semua yang bisa dikirim (${L.length})`;
    $('[data-kpilih]', kb).disabled = !L.length;
    const kk = $('[data-kkirim]', kb); kk.disabled = !F.sel.size; kk.textContent = F.sel.size ? `Kirim ke ${F.sel.size} mitra terpilih` : 'Kirim ke mitra terpilih';
    $('[data-ktabel]', kb).innerHTML = list.length ? `<table class="tbl" style="width:100%"><thead><tr style="text-align:left"><th style="width:34px"></th><th>Mitra</th><th>Kelompok</th><th>Perjanjian</th><th></th></tr></thead><tbody>${tampilList.map((m) => `<tr>
      <td><input type="checkbox" data-kpil="${m.row}" aria-label="Pilih ${esc(m.nama)}" ${layak(m) ? '' : 'disabled'} ${F.sel.has(m.row) ? 'checked' : ''}></td>
      <td><b>${esc(m.nama)}</b><div class="cell-sub">${esc([m.jenis, m.status_mitra].filter(Boolean).join(', '))}</div></td>
      <td>${m.inner_city ? '<span class="chip c-info">Inner City</span>' : '<span class="muted">–</span>'}</td>
      <td><span class="chip ${OV_STATUS[m.status][1]}">${OV_STATUS[m.status][0]}</span>${m.perjanjian_id ? ` <a href="#/perjanjian/${m.perjanjian_id}">Buka</a>` : ''}${!m.ada_email && m.status === 'belum_ada' ? ' <span class="chip c-warn" title="Lengkapi email di info perseroan">Email kosong</span>' : ''}</td>
      <td style="text-align:right">${layak(m) ? `<button class="btn ghost sm" type="button" data-ksatu="${m.row}">Kirim</button>` : ''}</td></tr>`).join('')}</tbody></table>${list.length > MAKS ? `<p class="muted" style="margin:10px 0 0">Menampilkan ${MAKS} pertama dari ${list.length}. Persempit dengan filter atau pencarian; "Pilih semua" tetap mencakup seluruh ${L.length} mitra yang cocok.</p>` : ''}` : '<div class="empty">Tidak ada mitra yang cocok dengan filter</div>';
    $$('[data-kpil]', kb).forEach((c) => c.addEventListener('change', () => { const r = Number(c.dataset.kpil); c.checked ? F.sel.add(r) : F.sel.delete(r); isi(); }));
    $$('[data-ksatu]', kb).forEach((b) => b.addEventListener('click', () => { if (confirm('Buat dan kirim perjanjian ke mitra ini?')) { F.sel.delete(Number(b.dataset.ksatu)); busy(b, () => jalankan([Number(b.dataset.ksatu)], b)); } }));
  };
  let t;
  $('#kq', kb).addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { F.q = e.target.value.trim(); isi(); }, 200); });
  $('#kkel', kb).addEventListener('change', (e) => { F.kel = e.target.value; isi(); });
  $('#kst', kb).addEventListener('change', (e) => { F.st = e.target.value; isi(); });
  $('#kpj', kb).addEventListener('change', (e) => { F.pj = e.target.value; isi(); });
  $('#kjn', kb).addEventListener('change', (e) => { F.jenis = e.target.value; F.sel.clear(); muatKirim(); });
  $('[data-kpilih]', kb).addEventListener('click', () => { saring().filter(layak).forEach((m) => F.sel.add(m.row)); isi(); });
  $('[data-kbersih]', kb).addEventListener('click', () => { F.sel.clear(); isi(); });
  $('[data-kkirim]', kb).addEventListener('click', (e) => {
    const rows = [...F.sel]; if (!rows.length) return;
    if (!confirm(`Buat dan kirim ${JENIS_NAMA[OVF.jenis]} ke ${rows.length} mitra sekarang? Email akan benar-benar terkirim ke mitra, memakai format di Pengaturan.`)) return;
    F.sel.clear();
    busy(e.currentTarget, () => jalankan(rows, e.currentTarget));
  });
  isi();
}

const EMAIL_BAWAAN = {
  subjek: 'Perjanjian Kerja Sama {nama_mitra} — {kode}',
  badan: `Yth. Direksi {nama_mitra},\n\nBersama ini kami sampaikan dokumen {judul} untuk ditinjau. Mohon tanggapan paling lambat {tenggat}.\n\nDokumen terlampir untuk Anda baca. Pada dokumen, hanya bagian berwarna kuning yang dapat diisi atau diubah, dan itu dilakukan melalui aplikasi dengan tautan di bawah, bukan dengan mengubah berkas. Tanggapan dan persetujuan juga disampaikan melalui tautan yang sama. Bila tidak ada catatan, pilih "Setuju tanpa catatan".\n\n{tautan}`,
};
// ---------- Pengaturan ----------
async function pagePengaturan() {
  if (!can()) { location.hash = '#/'; return; }
  const [d, ak, sh] = await Promise.all([api('/api/admin'), api('/api/admin/akses'), api('/api/sheet/status')]);
  const k = Object.fromEntries(d.konfig.map((x) => [x.k, x.v]));
  const sla = JSON.parse(k.sla_hari_kerja || '{}');
  const daftarAkses = (jenis, list) => list.length ? `<ul class="list" style="margin:0 0 10px">${list.map((a) => `<li style="grid-template-columns:minmax(0,1fr) auto"><div style="min-width:0"><div class="t">${esc(a.nama)}${a.aktif ? '' : ' <span class="chip c-idle">Nonaktif</span>'}</div><div class="s">${esc(a.email)} · ${a.pin ? 'PIN sudah dibuat' : 'belum pernah masuk'}</div></div>
      <span class="row" style="gap:6px;flex-wrap:nowrap">${a.pin ? `<button class="btn ghost sm" type="button" data-pin="${jenis}|${esc(a.email)}">Reset PIN</button>` : ''}<button class="btn ghost sm" type="button" data-akt="${jenis}|${esc(a.email)}|${esc(a.nama)}|${a.aktif ? 0 : 1}">${a.aktif ? 'Nonaktifkan' : 'Aktifkan'}</button></span></li>`).join('')}</ul>` : '<p class="muted small" style="margin:0 0 10px">Belum ada.</p>';
  const formAkses = (jenis) => `<div class="row" style="gap:8px;flex-wrap:wrap;align-items:end"><div class="field" style="margin:0;flex:1 1 180px"><label for="${jenis}-nm">Nama</label><input class="input" id="${jenis}-nm"></div><div class="field" style="margin:0;flex:1 1 220px"><label for="${jenis}-em">Email</label><input class="input" id="${jenis}-em" type="email"></div><button class="btn" type="button" data-tambah="${jenis}">Tambah</button></div>`;
  const r = sh.ringkas || {};
  app.innerHTML = `${topbar('Pengaturan', 'Akses, spreadsheet, format email, tenggat, dan masa berlaku.')}
    <div class="stack" style="max-width:760px">
      <div class="card"><h2 style="margin-bottom:6px">Akses Legal & Admin TTD</h2><p class="small muted" style="margin-top:0">Menu Perjanjian hanya untuk Akun Utama. Legal dan Admin TTD tidak memakai akun dashboard: mereka masuk dengan email terdaftar + PIN 4 angka (dibuat saat pertama masuk).</p>
        <h3 style="margin:14px 0 6px">Legal <span class="small muted" style="font-weight:500">— mengisi nomor surat lewat tautan di email</span></h3>${daftarAkses('legal', ak.legal)}${formAkses('legal')}
        <h3 style="margin:20px 0 6px">Admin TTD <span class="small muted" style="font-weight:500">— mengejar tanda tangan sampai scan final</span></h3>${daftarAkses('admin_ttd', ak.admin_ttd)}${formAkses('admin_ttd')}
        <div class="notice info small" style="margin-top:12px">Alamat halaman Admin TTD: <code>${esc(ak.portal_ttd)}</code> <button class="btn ghost sm" type="button" data-salin-ttd>Salin</button><br>Admin TTD juga menerima email setiap ada perjanjian yang siap ditandatangani.</div></div>
      <div class="card"><h2 style="margin-bottom:6px">Spreadsheet</h2><p class="small muted" style="margin-top:0">Data setiap perjanjian ditulis otomatis ke VM Starlite Sheet: lembar <b>${esc(sh.sheet.PKS)}</b> (Homepass) dan <b>${esc(sh.sheet.MS)}</b> (PKS MS & SPK MS), kunci baris di kolom NO ID. Dokumen tetap di aplikasi; tautan dokumen final (Drive) ikut ditulis.</p>
        ${sh.aktif ? '' : '<div class="notice small">Jembatan Google belum aktif, data belum bisa ditulis ke spreadsheet.</div>'}
        <div class="row" style="gap:8px;flex-wrap:wrap;margin-bottom:10px"><span class="chip c-ok">${r.ok || 0} tersimpan</span><span class="chip c-warn">${(r.antre || 0) + (r.kirim || 0) + (r.belum || 0)} menunggu</span><span class="chip ${r.gagal ? 'c-late' : 'c-idle'}">${r.gagal || 0} gagal</span></div>
        ${sh.gagal.length ? `<ul class="list" style="margin:0 0 10px">${sh.gagal.map((g) => `<li style="grid-template-columns:minmax(0,1fr)"><div><a href="#/perjanjian/${g.id}">${esc(g.kode)}</a><div class="s">${esc(g.sheet_status)}</div></div></li>`).join('')}</ul>` : ''}
        <div class="row"><button class="btn" type="button" data-sheet="antre" ${sh.aktif ? '' : 'disabled'}>Kirim yang menunggu</button><button class="btn ghost" type="button" data-sheet="semua" ${sh.aktif ? '' : 'disabled'}>Tulis ulang semua</button></div></div>
      <div class="card"><h2 style="margin-bottom:6px">Format email ke mitra</h2><p class="small muted" style="margin-top:0">Dipakai saat dokumen dikirim ke mitra. Yang tersedia: {nama_mitra} {kode} {judul} {tenggat} {tautan}.</p>
        <div class="field"><label for="eto">To tambahan</label><input class="input" id="eto" value="${esc(k.email_to_tambahan || '')}" placeholder="Selain email mitra dari info perseroan"></div>
        <div class="field"><label for="ecc">CC</label><input class="input" id="ecc" value="${esc(k.email_cc || '')}" placeholder="Pisahkan dengan koma"></div>
        <div class="field"><label for="esub">Subjek</label><input class="input" id="esub" value="${esc(k.email_subjek || EMAIL_BAWAAN.subjek)}"></div>
        <div class="field"><label for="ebad">Isi email</label><textarea class="input" id="ebad" rows="10">${esc(k.email_badan || EMAIL_BAWAAN.badan)}</textarea></div>
        <div class="row"><button class="btn" data-e>Simpan</button><button class="btn ghost" data-e0 type="button">Kembalikan bawaan</button></div></div>
      <div class="card"><h2 style="margin-bottom:6px">Tenggat dan masa berlaku</h2><p class="small muted" style="margin-top:0">Tenggat dalam hari kerja (Senin–Jumat).</p>
        ${[1, 2, 3, 5, 6].map((n) => `<div class="row" style="justify-content:space-between;margin-bottom:8px"><label for="sla${n}">${esc(tahapNama(n))}</label><input class="input num" id="sla${n}" type="number" min="1" max="60" value="${sla[n] ?? ''}" style="width:90px"></div>`).join('')}
        ${d.jenis.map((j, i) => `<div class="row" style="justify-content:space-between;margin-bottom:8px"><label for="j${i}masa">Masa berlaku ${esc(j.nama)} (bulan)</label><input class="input num" id="j${i}masa" type="number" min="1" value="${j.masa_bulan}" style="width:90px"></div>`).join('')}
        <button class="btn" style="margin-top:8px" data-k>Simpan</button></div>
    </div>`;
  bindSearch();
  $('[data-k]').addEventListener('click', (e) => busy(e.currentTarget, async () => {
    const s = {}; [1, 2, 3, 4, 5, 6].forEach((n) => { const el = $(`#sla${n}`); const v = el ? Number(el.value) : Number(sla[n]); if (v) s[n] = v; });
    await post('/api/admin/konfig', { sla_hari_kerja: JSON.stringify(s) });
    for (const [i, j] of d.jenis.entries()) { const v = Number($(`#j${i}masa`).value); if (v && v !== j.masa_bulan) await post('/api/admin/jenis', { kode: j.kode, nama: j.nama, masa_bulan: v, posisi_ttd: JSON.parse(j.posisi_ttd) }); }
    toast('Disimpan');
  }));
  $('[data-e]').addEventListener('click', (e) => busy(e.currentTarget, async () => {
    await post('/api/admin/konfig', { email_to_tambahan: $('#eto').value, email_cc: $('#ecc').value, email_subjek: $('#esub').value, email_badan: $('#ebad').value }); toast('Format email disimpan');
  }));
  $('[data-e0]').addEventListener('click', () => { $('#eto').value = ''; $('#ecc').value = ''; $('#esub').value = EMAIL_BAWAAN.subjek; $('#ebad').value = EMAIL_BAWAAN.badan; });
  $$('[data-tambah]').forEach((b) => b.addEventListener('click', () => busy(b, async () => {
    const j = b.dataset.tambah;
    await post('/api/admin/akses', { jenis: j, email: $(`#${j}-em`).value, nama: $(`#${j}-nm`).value });
    toast(j === 'legal' ? 'Legal ditambahkan' : 'Admin TTD ditambahkan'); route();
  })));
  $$('[data-akt]').forEach((b) => b.addEventListener('click', () => busy(b, async () => {
    const [jenis, email, nama, aktif] = b.dataset.akt.split('|');
    await post('/api/admin/akses', { jenis, email, nama, aktif: aktif === '1' }); toast('Akses diperbarui'); route();
  })));
  $$('[data-pin]').forEach((b) => b.addEventListener('click', () => {
    const [jenis, email] = b.dataset.pin.split('|');
    if (!confirm(`Reset PIN ${email}? Ia harus membuat PIN baru (dengan nomor HP) saat masuk berikutnya.`)) return;
    busy(b, async () => { await post('/api/admin/akses/reset-pin', { jenis, email }); toast('PIN direset'); route(); });
  }));
  $('[data-salin-ttd]').addEventListener('click', () => navigator.clipboard?.writeText(ak.portal_ttd).then(() => toast('Alamat disalin'), () => toast(ak.portal_ttd)));
  $$('[data-sheet]').forEach((b) => b.addEventListener('click', () => busy(b, async () => {
    let semua = b.dataset.sheet === 'semua', ok = 0, gagal = 0;
    if (semua && !confirm('Tulis ulang semua perjanjian ke spreadsheet? Kolom yang diisi aplikasi akan diperbarui; kolom lain tidak diubah.')) return;
    for (let g = 0; g < 40; g++) { const r = await post('/api/sheet/sinkron', { semua }); semua = false; r.hasil.forEach((h) => (h.ok ? ok++ : gagal++)); b.textContent = `Mengirim… ${ok}`; if (!r.sisa) break; }
    toast(`${ok} baris ditulis${gagal ? `, ${gagal} gagal` : ''}`, gagal > 0 && !ok); route();
  })));
}

// ---------- Router ----------
async function route() {
  const [path, qs] = (location.hash.slice(1) || '/').split('?');
  const params = new URLSearchParams(qs || '');
  const parts = path.split('/').filter(Boolean);
  const key = parts[0] || 'home';
  renderNav(key);
  // Konten lama tetap tampil (meredup) selama data dimuat; kerangka muncul hanya bila lambat. Lalu konten baru masuk halus.
  const nomorRute = (route.n = (route.n || 0) + 1);
  app.classList.remove('masuk'); app.classList.add('memuat');
  const lambat = setTimeout(() => { if (route.n === nomorRute) app.innerHTML = '<div class="skeleton"></div>'; }, 350);
  try {
    if (key === 'home') await pageDashboard();
    else if (key === 'perjanjian' && parts[1]) await pageDetail(parts[1]);
    else if (key === 'perjanjian') await pagePerjanjian(params);
    else if (key === 'mitra') await pageMitra(params);
    else if (key === 'overview') await pageOverview(params);
    else if (key === 'pengaturan') await pagePengaturan();
    else app.innerHTML = `<div class="empty"><b>Halaman tidak ditemukan</b><a href="#/">Kembali ke ringkasan</a></div>`;
  } catch (e) {
    app.innerHTML = `<div class="card"><div class="empty"><b>Halaman gagal dimuat</b>${esc(e.message)}<div style="margin-top:12px"><button class="btn ghost" onclick="location.reload()">Muat ulang</button></div></div></div>`;
  }
  clearTimeout(lambat);
  if (route.n !== nomorRute) return;
  app.classList.remove('memuat');
  void app.offsetWidth; app.classList.add('masuk');
  app.focus({ preventScroll: true });
  window.scrollTo({ top: 0 });
}

// Dokumen diambil lewat API (butuh token), lalu dibuka di tab baru.
document.addEventListener('click', async (e) => {
  const a = e.target.closest('[data-dok]');
  if (!a) return;
  e.preventDefault();
  if (a.dataset.lihat) { pratinjau(() => api(`/api/dokumen/${a.dataset.dok}`), a.closest('li')?.querySelector('.t')?.textContent || 'Dokumen'); return; }
  const w = window.open('', '_blank');
  try { const b = await api(`/api/dokumen/${a.dataset.dok}`); const u = URL.createObjectURL(b); if (w) w.location = u; else location.href = u; }
  catch (ex) { w?.close(); toast(ex.message, true); }
});

async function mulai() {
  try {
    S.me = await api('/api/me');
  } catch (e) {
    if (e.status === 401) { showLogin(); return; }
    app.innerHTML = `<div class="card" style="max-width:520px;margin:10vh auto"><div class="empty"><b>Tidak dapat memuat Starlite</b>${esc(e.message)}</div></div>`;
    return;
  }
  if (S.me.terkunci) {
    app.innerHTML = `<div class="card" style="max-width:520px;margin:10vh auto"><div class="empty"><b>Aplikasi PKS sedang dikunci</b>Saat ini hanya akun utama (Admin) yang dapat membuka aplikasi ini.<div style="margin-top:14px"><button class="btn" id="keluarKunci">Keluar</button></div></div></div>`;
    document.getElementById('keluarKunci').addEventListener('click', async () => { try { await post('/api/logout', {}); } catch {} location.reload(); });
    return;
  }
  if (S.me.wajib_ganti) { layarGanti(); return; }
  S.meta = await api('/api/meta');
  shell(true);
  if (!mulai.terikat) { window.addEventListener('hashchange', () => S.me && route()); mulai.terikat = true; }
  route();
}
mulai();
