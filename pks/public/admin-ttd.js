// Portal Admin Follow-up: mendorong Legal (nomor surat) dan Direktur PT IJE (tanda tangan). Email terdaftar + PIN 4 angka, tanpa akun dashboard.
const root = document.getElementById('p');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const tgl = (iso) => { if (!iso) return '–'; const d = new Date(new Date(iso).getTime() + 7 * 3600000); return `${d.getUTCDate()} ${BULAN[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const ss = { get: (k) => { try { return sessionStorage.getItem(k) || ''; } catch { return ''; } }, set: (k, v) => { try { v ? sessionStorage.setItem(k, v) : sessionStorage.removeItem(k); } catch {} } };
const ls = { get: (k) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
let sesi = ss.get('ttd_sesi');

async function api(path, opts = {}) {
  const h = { ...(opts.headers || {}) };
  if (sesi) h['x-ttd-sesi'] = sesi;
  if (opts.body && !(opts.body instanceof FormData)) h['content-type'] = 'application/json';
  const r = await fetch(path, { ...opts, headers: h });
  if (r.ok && (r.headers.get('content-type') || '').includes('application/pdf')) return r.blob();
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(j.error || `Permintaan gagal (${r.status})`); e.status = r.status;
    if (r.status === 401 && !path.endsWith('/masuk') && !path.endsWith('/cek')) { sesi = ''; ss.set('ttd_sesi', ''); formMasuk(ls.get('ttd_email'), e.message); }
    throw e;
  }
  return j;
}
const kotakPesan = (id) => `<p class="muted" id="${id}" role="alert" style="color:var(--late);margin:0 0 10px;font-size:13px"></p>`;

function formMasuk(emailAwal, info = '') {
  root.innerHTML = `<div class="card hero"><div class="chip c-info">Admin Follow-up</div><h1>Masuk untuk memantau nomor surat dan tanda tangan</h1>
    <p class="muted" style="margin:0 0 14px">Tanpa akun dashboard. Masukkan email yang didaftarkan Vendor Management, lalu PIN 4 angka. Pertama kali, isi juga nomor HP dan buat PIN.</p>
    <form id="f" novalidate><div class="field"><label for="em">Email</label><input class="input" id="em" type="email" autocomplete="email" value="${esc(emailAwal)}" required></div>
    <div class="field" id="hpw" hidden><label for="hp">Nomor HP (pendaftaran pertama)</label><input class="input" id="hp" inputmode="tel" autocomplete="tel"></div>
    <div class="field" id="pinw" hidden><label for="pin" id="pinl">PIN 4 angka</label><input class="input" id="pin" inputmode="numeric" maxlength="4" autocomplete="one-time-code" type="password"></div>
    ${kotakPesan('msg')}<button class="btn" id="go" type="submit">Lanjut</button></form></div>`;
  const f = root.querySelector('#f'), msg = root.querySelector('#msg'); let tahap = 0;
  msg.textContent = info && info !== 'Silakan masuk' ? info : '';
  f.addEventListener('submit', async (e) => {
    e.preventDefault(); msg.textContent = '';
    const btn = root.querySelector('#go'); btn.disabled = true;
    try {
      const email = f.em.value.trim();
      if (tahap === 0) {
        const r = await api('/api/ttd-admin/cek', { method: 'POST', body: JSON.stringify({ email }) });
        root.querySelector('#hpw').hidden = r.terdaftar; root.querySelector('#pinw').hidden = false;
        root.querySelector('#pinl').textContent = r.terdaftar ? 'PIN 4 angka' : 'Buat PIN 4 angka';
        f.em.readOnly = true; tahap = 1; btn.textContent = 'Masuk'; (r.terdaftar ? f.pin : f.hp).focus();
      } else {
        const r = await api('/api/ttd-admin/masuk', { method: 'POST', body: JSON.stringify({ email, hp: f.hp.value, pin: f.pin.value }) });
        sesi = r.sesi; ss.set('ttd_sesi', sesi); ls.set('ttd_email', email); await daftar();
      }
    } catch (ex) { msg.textContent = ex.message; if (tahap) f.pin.value = ''; } finally { btn.disabled = false; }
  });
}

const STATUS = (p) => p.menunggu_review ? ['Scan mitra perlu diperiksa', 'c-warn']
  : p.tahap === 3 ? ['Menunggu nomor dari Legal', 'c-warn']
  : p.tahap === 4 ? ['Belum terkirim ke mitra', 'c-late']
  : p.tahap === 5 ? ['Proses TTD mitra', 'c-info']
  : p.sub_progres === 'PROSES SIGN IJE' ? ['Proses TTD PT IJE', 'c-info'] : ['TTD mitra selesai', 'c-ok'];

async function daftar() {
  let d;
  try { d = await api('/api/ttd-admin/daftar'); } catch (e) { if (e.status !== 401) root.innerHTML = `<div class="card hero"><h1>Tidak dapat dimuat</h1><p class="muted">${esc(e.message)}</p></div>`; return; }
  root.innerHTML = `<div class="card hero"><div class="row" style="justify-content:space-between;gap:12px;flex-wrap:wrap"><div><div class="chip c-info">Admin Follow-up</div><h1>Perjanjian yang perlu didorong</h1>
      <p class="muted" style="margin:0">Halo, ${esc(d.nama)}. Dorong Legal memberi nomor surat dan Direktur PT IJE menandatangani, sampai scan final diunggah.</p></div>
      <button class="btn ghost sm" id="out" type="button">Keluar</button></div></div>
    <div class="card" style="margin-top:16px">${d.daftar.length ? d.daftar.map((p) => { const [l, c] = STATUS(p); return `<div class="baris"><div style="min-width:0"><b>${esc(p.mitra)}</b>
      <small>${esc(p.jenis === 'MS' ? 'PKS MS & SPK MS' : 'Perjanjian Homepass')}, No. ${esc(p.nomor_surat || '-')}${p.nomor_spk ? ` / SPK ${esc(p.nomor_spk)}` : ''}${p.tenggat ? `, batas ${tgl(p.tenggat)}` : ''}</small><br><span class="chip ${c}">${l}</span></div>
      <button class="btn sm" data-id="${esc(p.id)}" type="button">Buka</button></div>`; }).join('') : '<div class="empty"><b>Tidak ada perjanjian</b>Belum ada perjanjian yang menunggu nomor surat atau tanda tangan.</div>'}</div>`;
  root.querySelector('#out').addEventListener('click', async () => { try { await api('/api/ttd-admin/keluar', { method: 'POST', body: '{}' }); } catch {} sesi = ''; ss.set('ttd_sesi', ''); formMasuk(ls.get('ttd_email')); });
  root.querySelectorAll('[data-id]').forEach((b) => b.addEventListener('click', () => buka(b.dataset.id)));
}

async function lihat(id, docId) {
  const w = window.open('', '_blank');
  try { const b = await api(`/api/ttd-admin/perjanjian/${id}/dokumen/${docId}`); const u = URL.createObjectURL(b); if (w) w.location = u; else location.href = u; }
  catch (ex) { w?.close(); alert(ex.message); }
}

async function buka(id) {
  let p;
  try { p = await api(`/api/ttd-admin/perjanjian/${id}`); } catch (e) { if (e.status !== 401) alert(e.message); return daftar(); }
  const bernomor = p.dokumen.find((d) => d.jenis === 'bernomor');
  const review = p.dokumen.find((d) => d.jenis === 'ttd_mitra' && d.status === 'menunggu_review');
  const hal = bernomor?.halaman;
  const unggah = (idx, label, tombol) => `<div class="field"><label for="f${idx}">${label}</label><input class="input" id="f${idx}" type="file" accept="application/pdf"><span class="hint">PDF berisi seluruh halaman${hal ? ` (${hal} halaman)` : ''}.</span></div><button class="btn" data-up="${idx}" type="button">${tombol}</button>`;
  const efektif = `<div class="row" style="gap:12px;flex-wrap:wrap"><div class="field" style="margin:0"><label for="ef">Tanggal efektif</label><input class="input" id="ef" type="date" value="${new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10)}"></div>
    <div class="field" style="margin:0"><label for="masa">Masa berlaku (bulan)</label><input class="input" id="masa" type="number" min="1" max="120" value="${p.masa_bulan}"></div></div>`;
  let aksi = '';
  const tombolIngat = (siapa) => `<button class="btn ghost" id="ingat" type="button">Kirim pengingat ke ${siapa}</button>${p.pengingat_terakhir ? `<span class="small muted" style="margin-left:8px">Terakhir: ${tgl(p.pengingat_terakhir)}</span>` : ''}${kotakPesan('mi')}`;
  if (p.tahap === 3) aksi = `<section><h3>Menunggu nomor surat dari Legal</h3><p class="muted" style="margin:0 0 10px">Dorong Legal menerbitkan nomor${p.jenis === 'MS' ? ' PKS MS dan SPK MS' : ' surat'}. Begitu nomor terbit, dokumen bernomor otomatis dikirim ke mitra.${p.legal?.length ? `<br>Legal: ${p.legal.map((l) => esc(l.nama) + ' (' + esc(l.email) + ')').join(', ')}` : '<br><b>Daftar Legal masih kosong</b>, hubungi Vendor Management.'}</p>${p.legal?.length ? tombolIngat('Legal') : ''}</section>`;
  if (p.tahap === 4) aksi = `<section><h3>Belum terkirim ke mitra</h3><p class="muted" style="margin:0">Pengiriman otomatis gagal (biasanya email mitra kosong). Minta Vendor Management melengkapi email mitra lalu mengirim ulang.</p></section>`;
  if (p.tahap === 5 && review) aksi = `<section><h3>Periksa scan dari mitra</h3><p class="muted" style="margin:0 0 10px">Pastikan semua halaman ada, tanda tangan basah, stempel, dan meterai terlihat jelas.</p>
      <button class="btn ghost" data-lihat="${esc(review.id)}" type="button">Buka scan mitra</button> <button class="btn ok" id="setuju" type="button">Setujui</button>
      <div class="field" style="margin-top:12px"><label for="alasan">Alasan bila diminta unggah ulang</label><textarea class="input" id="alasan"></textarea></div><button class="btn danger" id="tolak" type="button">Minta unggah ulang</button>${kotakPesan('m0')}</section>`;
  else if (p.tahap === 5) aksi = `<section><h3>Dorong mitra</h3><p class="muted" style="margin:0 0 10px">Mitra menerima pengingat otomatis; kirim pengingat tambahan bila perlu.</p>${tombolIngat('mitra')}</section><section><h3>1. Scan TTD basah mitra</h3><p class="muted" style="margin:0 0 10px">Bila mitra menyerahkan dokumen bertanda tangan langsung (bukan lewat tautan), pindai dan unggah di sini.</p>${unggah(1, 'Scan dokumen bertanda tangan mitra (PDF)', 'Unggah scan mitra')}${kotakPesan('m1')}</section>
      <section><h3>Atau: hasil fitur Signing</h3><p class="muted" style="margin:0 0 10px">Bila penandatanganan memakai fitur Signing di dashboard dan hasilnya sudah memuat TTD kedua pihak, unggah hasilnya untuk langsung menyelesaikan.</p>${efektif}${unggah(2, 'PDF hasil Signing (TTD kedua pihak)', 'Unggah hasil Signing dan selesaikan')}${kotakPesan('m2')}</section>`;
  else if (p.tahap === 6) aksi = `<section><h3>Status penandatanganan PT IJE</h3><p class="muted" style="margin:0 0 10px">${p.sub_progres === 'PROSES SIGN IJE' ? 'Dokumen sedang di penandatangan PT IJE.' : 'TTD mitra sudah lengkap. Tandai bila dokumen sudah diserahkan ke penandatangan PT IJE.'}</p>
      ${p.sub_progres === 'PROSES SIGN IJE' ? '' : '<button class="btn ghost" id="proses" type="button">Tandai: sedang ditandatangani PT IJE</button>'}${kotakPesan('m3')}</section>
      <section><h3>2. Scan final (TTD basah kedua pihak)</h3><p class="muted" style="margin:0 0 10px">Setelah PT IJE menandatangani, pindai seluruh halaman. Dokumen final dikunci, diarsipkan ke Drive, dan salinannya dikirim ke mitra.</p>${efektif}
      <label class="row small" style="margin:10px 0"><input type="checkbox" id="sg"> Ini hasil fitur Signing</label>${unggah(3, 'Scan final bertanda tangan kedua pihak (PDF)', 'Unggah dan selesaikan')}${kotakPesan('m4')}</section>`;
  root.innerHTML = `<p><a href="#" id="kembali">← Kembali ke daftar</a></p>
    <div class="card hero"><div class="chip c-info">${esc(p.tahap_nama)}</div><h1>${esc(p.mitra)}</h1>
      <p class="muted" style="margin:0">${esc(p.judul)}<br>No. ${esc(p.nomor_surat || '-')}${p.nomor_spk ? `, SPK MS No. ${esc(p.nomor_spk)}` : ''}${p.tenggat ? `<br><b>Batas waktu: ${tgl(p.tenggat)}</b>` : ''}</p>
      <p class="small muted" style="margin:10px 0 0">Email mitra: ${p.emails.length ? p.emails.map(esc).join(', ') : '-'}</p></div>
    <div class="card" style="margin-top:16px"><h2 style="margin-top:0">Dokumen</h2>
      ${bernomor ? `<button class="btn ghost" data-lihat="${esc(bernomor.id)}" type="button">Buka dokumen bernomor (untuk dicetak)</button>` : '<p class="muted">Dokumen bernomor belum ada.</p>'}
      <div class="opsi">${aksi}</div></div>`;
  root.querySelector('#kembali').addEventListener('click', (e) => { e.preventDefault(); daftar(); });
  root.querySelectorAll('[data-lihat]').forEach((b) => b.addEventListener('click', () => lihat(p.id, b.dataset.lihat)));
  const jalan = async (btn, msgId, fn, selesai, keDaftar = false) => {
    const m = root.querySelector('#' + msgId); if (m) m.textContent = '';
    btn.disabled = true;
    try { await fn(); alert(selesai); await (keDaftar ? daftar() : buka(p.id)); } catch (ex) { if (m) m.textContent = ex.message; else alert(ex.message); btn.disabled = false; }
  };
  const kirimFile = (idx, url, extra) => { const f = root.querySelector('#f' + idx).files[0]; if (!f) throw new Error('Pilih berkas PDF'); const fd = new FormData(); fd.set('berkas', f); Object.entries(extra).forEach(([k, v]) => fd.set(k, v)); return api(url, { method: 'POST', body: fd }); };
  const tgls = () => ({ tgl_efektif: root.querySelector('#ef').value, masa_bulan: root.querySelector('#masa').value });
  root.querySelector('#ingat')?.addEventListener('click', (e) => jalan(e.currentTarget, 'mi', () => api(`/api/ttd-admin/perjanjian/${p.id}/ingatkan`, { method: 'POST', body: '{}' }), 'Pengingat dikirim'));
  root.querySelector('#setuju')?.addEventListener('click', (e) => jalan(e.currentTarget, 'm0', () => api(`/api/ttd-admin/perjanjian/${p.id}/review`, { method: 'POST', body: JSON.stringify({ setuju: true }) }), 'Scan mitra disetujui'));
  root.querySelector('#tolak')?.addEventListener('click', (e) => jalan(e.currentTarget, 'm0', () => api(`/api/ttd-admin/perjanjian/${p.id}/review`, { method: 'POST', body: JSON.stringify({ setuju: false, alasan: root.querySelector('#alasan').value }) }), 'Permintaan unggah ulang dikirim ke mitra'));
  root.querySelector('#proses')?.addEventListener('click', (e) => jalan(e.currentTarget, 'm3', () => api(`/api/ttd-admin/perjanjian/${p.id}/sub-progres`, { method: 'POST', body: JSON.stringify({ nilai: 'PROSES SIGN IJE' }) }), 'Status diperbarui'));
  root.querySelector('[data-up="1"]')?.addEventListener('click', (e) => jalan(e.currentTarget, 'm1', () => kirimFile(1, `/api/ttd-admin/perjanjian/${p.id}/mitra`, { opsi: '2' }), 'Scan mitra tersimpan'));
  root.querySelector('[data-up="2"]')?.addEventListener('click', (e) => jalan(e.currentTarget, 'm2', () => kirimFile(2, `/api/ttd-admin/perjanjian/${p.id}/final`, { opsi: 'signing', lengkap: '1', ...tgls() }), 'Perjanjian selesai dan diarsipkan', true));
  root.querySelector('[data-up="3"]')?.addEventListener('click', (e) => jalan(e.currentTarget, 'm4', () => kirimFile(3, `/api/ttd-admin/perjanjian/${p.id}/final`, { opsi: root.querySelector('#sg').checked ? 'signing' : '2', ...tgls() }), 'Perjanjian selesai dan diarsipkan', true));
}

if (sesi) daftar(); else formMasuk(ls.get('ttd_email'));
