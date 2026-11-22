// Portal Legal: tautan email + PIN 4 angka. Tanpa akun.
const root = document.getElementById('p');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const token = new URLSearchParams(location.hash.slice(1)).get('t') || '';
if (token) history.replaceState(null, '', location.pathname);
let sesi = '';
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const tgl = (iso) => { if (!iso) return '–'; const d = new Date(new Date(iso).getTime() + 7 * 3600000); return `${d.getUTCDate()} ${BULAN[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const ls = { get: (k) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };

async function api(path, opts = {}) {
  const h = { ...(opts.headers || {}), 'x-portal-token': token };
  if (sesi) h['x-legal-sesi'] = sesi;
  if (opts.body) h['content-type'] = 'application/json';
  const r = await fetch(path, { ...opts, headers: h });
  if (r.ok && (r.headers.get('content-type') || '').includes('application/pdf')) return r.blob();
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.error || `Permintaan gagal (${r.status})`); e.status = r.status; throw e; }
  return j;
}
const pesan = (judul, isi) => { root.innerHTML = `<div class="card hero"><div class="chip c-info">Informasi</div><h1>${esc(judul)}</h1><p class="muted">${isi}</p></div>`; };

function formMasuk(emailAwal) {
  root.innerHTML = `<div class="card hero"><div class="chip c-info">Legal</div><h1>Masuk untuk mengisi nomor surat</h1>
    <p class="muted" style="margin:0 0 14px">Tanpa login akun. Masukkan email Anda, lalu PIN 4 angka. Pertama kali, isi juga nomor HP dan buat PIN.</p>
    <form id="f" novalidate><div class="field"><label for="em">Email</label><input class="input" id="em" type="email" autocomplete="email" value="${esc(emailAwal)}" required></div>
    <div class="field" id="hpw" hidden><label for="hp">Nomor HP (pendaftaran pertama)</label><input class="input" id="hp" inputmode="tel" autocomplete="tel"></div>
    <div class="field" id="pinw" hidden><label for="pin" id="pinl">PIN 4 angka</label><input class="input" id="pin" inputmode="numeric" maxlength="4" pattern="\\d{4}" autocomplete="one-time-code" type="password"></div>
    <p class="muted" id="msg" style="color:var(--late);min-height:18px;margin:0 0 10px"></p><button class="btn" id="go" type="submit">Lanjut</button></form></div>`;
  const f = root.querySelector('#f'), msg = root.querySelector('#msg'); let tahap = 0;
  f.addEventListener('submit', async (e) => {
    e.preventDefault(); msg.textContent = '';
    const btn = root.querySelector('#go'); btn.disabled = true;
    try {
      const email = f.em.value.trim();
      if (tahap === 0) {
        const r = await api('/api/legal/cek', { method: 'POST', body: JSON.stringify({ email }) });
        root.querySelector('#hpw').hidden = r.terdaftar; root.querySelector('#pinw').hidden = false;
        root.querySelector('#pinl').textContent = r.terdaftar ? 'PIN 4 angka' : 'Buat PIN 4 angka';
        f.em.readOnly = true; tahap = 1; btn.textContent = 'Masuk'; (r.terdaftar ? f.pin : f.hp).focus();
      } else {
        const r = await api('/api/legal/masuk', { method: 'POST', body: JSON.stringify({ email, hp: f.hp.value, pin: f.pin.value }) });
        sesi = r.sesi; ls.set('legal_email', email); await tampil();
      }
    } catch (ex) { msg.textContent = ex.message; if (tahap) f.pin.value = ''; } finally { btn.disabled = false; }
  });
}

async function tampil() {
  let d;
  try { d = await api('/api/legal/perjanjian'); } catch (e) { if (e.status === 401) { sesi = ''; return formMasuk(ls.get('legal_email')); } return pesan('Tidak dapat dibuka', esc(e.message)); }
  root.innerHTML = `<div class="card hero"><div class="chip c-info">${esc(d.tahap_nama)}</div><h1>${esc(d.judul)}</h1>
      <p class="muted" style="margin:0">${esc(d.mitra)}${d.nomor_surat ? `, No. ${esc(d.nomor_surat)}` : ''}${d.nomor_spk ? `, SPK MS No. ${esc(d.nomor_spk)}` : ''}</p>
      ${d.bisa_nomor && d.tenggat ? `<p style="margin:12px 0 0"><b>Batas waktu: ${tgl(d.tenggat)}</b></p>` : ''}</div>
    <div class="card" style="margin-top:16px"><h2 style="margin-top:0">Dokumen</h2><button class="btn ghost" id="dl" type="button">Buka dokumen PDF</button></div>
    ${d.bisa_nomor ? `<div class="card" style="margin-top:16px"><h2 style="margin-top:0">${d.jenis === 'MS' ? 'Nomor PKS MS & SPK MS' : 'Nomor surat'}</h2>
      <p class="muted" style="margin-top:0">${d.jenis === 'MS' ? 'Kedua nomor dicetak otomatis pada dokumen PKS MS dan SPK MS (termasuk rujukan nomor PKS di SPK), lalu dokumen diteruskan ke mitra.' : 'Nomor dicetak otomatis pada kolom "No." dokumen, lalu dokumen diteruskan ke mitra.'}</p>
      <div class="field"><label for="no">${d.jenis === 'MS' ? 'Nomor PKS MS' : 'Nomor surat'}</label><input class="input" id="no" autocomplete="off"></div>
      ${d.jenis === 'MS' ? '<div class="field"><label for="nospk">Nomor SPK MS</label><input class="input" id="nospk" autocomplete="off"></div>' : ''}
      <div class="field"><label for="cat">Catatan Legal (opsional)</label><textarea class="input" id="cat" maxlength="500" placeholder="Tercatat di kolom REMARK pada spreadsheet"></textarea></div>
      <p class="muted" id="msg" style="color:var(--late);min-height:18px;margin:0 0 10px"></p><button class="btn" id="kirim" type="button">Terbitkan nomor</button></div>`
      : `<div class="card" style="margin-top:16px"><p class="muted" style="margin:0">${d.nomor_surat ? 'Nomor surat sudah terbit. Kabar perkembangan berikutnya Anda terima lewat email.' : 'Belum waktunya mengisi nomor surat.'}</p></div>`}`;
  root.querySelector('#dl').addEventListener('click', async (e) => {
    const w = window.open('', '_blank');
    try { const b = await api('/api/legal/dokumen'); const u = URL.createObjectURL(b); if (w) w.location = u; else location.href = u; } catch (ex) { w?.close(); alert(ex.message); }
  });
  const k = root.querySelector('#kirim');
  if (k) k.addEventListener('click', async () => {
    const msg = root.querySelector('#msg'); msg.textContent = ''; k.disabled = true;
    try { await api('/api/legal/nomor', { method: 'POST', body: JSON.stringify({ nomor_surat: root.querySelector('#no').value, nomor_spk: root.querySelector('#nospk')?.value || '', catatan: root.querySelector('#cat')?.value || '' }) }); await tampil(); }
    catch (ex) { msg.textContent = ex.message; k.disabled = false; }
  });
}

if (!token) pesan('Tautan tidak lengkap', 'Buka kembali tautan dari email Vendor Management PT Integrasi Jaringan Ekosistem.');
else api('/api/legal/cek', { method: 'POST', body: JSON.stringify({ email: 'x@x.x' }) }).then(() => formMasuk(ls.get('legal_email')), (e) => (e.status === 401 ? pesan('Tautan tidak dapat dibuka', esc(e.message)) : formMasuk(ls.get('legal_email'))));
