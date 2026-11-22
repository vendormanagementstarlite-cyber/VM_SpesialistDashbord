const root = document.getElementById('p');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const token = new URLSearchParams(location.hash.slice(1)).get('t') || '';
// Hapus token dari bilah alamat agar tidak terbawa saat layar dibagikan
if (token) history.replaceState(null, '', location.pathname);

const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const tgl = (iso) => { if (!iso) return '–'; const d = new Date(new Date(iso).getTime() + 7 * 3600000); return `${d.getUTCDate()} ${BULAN[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };

async function api(path, opts = {}) {
  const r = await fetch(path, { ...opts, headers: { ...(opts.headers || {}), 'x-portal-token': token } });
  const ct = r.headers.get('content-type') || '';
  if (r.ok && ct.includes('application/pdf')) return r.blob();
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Permintaan gagal (${r.status})`);
  return j;
}

function message(title, body, ok = false) {
  root.innerHTML = `<div class="card hero"><div class="chip ${ok ? 'c-ok' : 'c-info'}">${ok ? 'Terima kasih' : 'Informasi'}</div><h1>${esc(title)}</h1><p class="muted">${body}</p></div>`;
}

async function load() {
  if (!token) return message('Tautan tidak lengkap', 'Buka kembali tautan dari email Vendor Management PT Integrasi Jaringan Ekosistem.');
  let d;
  try { d = await api('/api/portal'); } catch (e) { return message('Tautan tidak dapat dibuka', esc(e.message)); }
  const isTtd = d.tujuan === 'ttd';
  root.innerHTML = `<div class="card hero">
      <div class="chip c-info">${esc(d.tahap_nama)}</div>
      <h1>${esc(d.judul)}</h1>
      <p class="muted" style="margin:0">${esc(d.mitra.nama)}${d.nomor_surat ? `, No. ${esc(d.nomor_surat)}` : ''}${d.nomor_spk ? `, SPK MS No. ${esc(d.nomor_spk)}` : ''}</p>
      ${d.tenggat && (d.bisa_feedback || d.bisa_ttd) ? `<p style="margin:12px 0 0"><b>Batas waktu: ${tgl(d.tenggat)}</b></p>` : ''}
    </div>
    <div class="card" style="margin-top:16px">
      <div class="step done"><span class="n">1</span><div><h2>Unduh dokumen</h2><p class="muted" style="margin:4px 0 12px">${isTtd ? 'Dokumen bernomor yang perlu ditandatangani.' : 'Dokumen perjanjian untuk ditinjau.'}${d.dokumen?.halaman ? ` ${d.dokumen.halaman} halaman.` : ''}</p>
        <button class="btn ghost" id="dl">Unduh PDF</button></div></div>
      <div class="step"><span class="n">2</span><div id="s2"></div></div>
    </div>`;
  document.getElementById('dl').addEventListener('click', async (e) => {
    const b = e.currentTarget; b.disabled = true;
    try { const blob = await api('/api/portal/dokumen'); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (d.dokumen?.nama || 'perjanjian') .replace(/[\\/]/g, '-'); a.click(); }
    catch (err) { alert(err.message); } finally { b.disabled = false; }
  });
  const s2 = document.getElementById('s2');
  if (d.bisa_feedback) {
    const I = d.isian;
    const pt = I?.penandatangan;
    const kolom = (f) => `<div class="field"><label for="i-${f.key}">${esc(f.label)}</label><input class="input" id="i-${f.key}" data-isi="${f.key}" ${f.type === 'number' ? 'type="text" inputmode="numeric"' : 'type="text"'} maxlength="${I.maks[f.key] || 160}" value="${esc(I.nilai[f.key] === '-' ? '' : I.nilai[f.key])}" autocomplete="off">${f.hint ? `<span class="hint">${esc(f.hint)}</span>` : ''}</div>`;
    const grupLabel = { rekening: 'Rekening pembayaran', gudang: 'Gudang & layanan IKR' };
    const umum = I ? I.fields.filter((f) => !f.grup) : [];
    const grup = I ? [...new Set(I.fields.filter((f) => f.grup).map((f) => f.grup))] : [];
    const isiHtml = I ? `<div class="card" style="margin:0 0 18px;padding:16px">
      <h2 style="margin-top:0">Lengkapi data dokumen</h2>
      <p class="muted small" style="margin:0 0 10px">Data ini mengisi bagian dokumen yang dapat diubah. Setelah disimpan, dokumen diperbarui otomatis dan dapat diunduh ulang.</p>
      ${I.kurang.length ? `<div class="notice small" style="margin-bottom:12px">Belum lengkap: ${I.kurang.map(esc).join(', ')}. Wajib dilengkapi sebelum menyetujui.</div>` : ''}
      <fieldset class="isian" style="margin:0 0 12px"><legend>Penandatangan dari pihak mitra</legend>
        <label class="row small" style="margin:4px 0"><input type="radio" name="pt" value="direktur" ${pt.mode === 'direktur' ? 'checked' : ''} ${pt.direksi ? '' : 'disabled'}> Direktur${pt.direksi ? `: <b>${esc(pt.direksi)}</b>` : ' (nama direktur belum tercatat)'}</label>
        <label class="row small" style="margin:4px 0"><input type="radio" name="pt" value="wakil" ${pt.mode === 'wakil' || !pt.direksi ? 'checked' : ''}> Diwakili orang lain (bukan direktur)</label>
        <div class="field" id="wk" style="margin-top:8px"><label for="i-wakil">Nama penandatangan</label><input class="input" id="i-wakil" value="${esc(pt.mode === 'wakil' && pt.wakil !== '-' ? pt.wakil : '')}" maxlength="${I.maks.wakil || 80}" autocomplete="off"><span class="hint">Lampirkan surat kuasa dari direktur saat penandatanganan.</span></div>
        <div class="field"><label for="i-jabatan">Jabatan penandatangan</label><input class="input" id="i-jabatan" value="${esc(pt.jabatan && pt.jabatan !== '-' ? pt.jabatan : 'Direktur')}" maxlength="${I.maks.jabatan || 60}" autocomplete="off"></div>
      </fieldset>
      ${umum.map(kolom).join('')}
      ${grup.map((g) => `<fieldset class="isian" style="margin:0 0 12px"><legend>${esc(grupLabel[g] || g)}</legend>${I.fields.filter((f) => f.grup === g).map(kolom).join('')}</fieldset>`).join('')}
      <button class="btn ghost" id="simpan-isi" type="button">Simpan data</button></div>` : '';
    s2.innerHTML = isiHtml + `<h2>Sampaikan tanggapan</h2><p class="muted" style="margin:4px 0 12px">Tanggapan dicatat dan ditindaklanjuti tim kami. Bila tidak ada catatan, pilih "Setuju tanpa catatan".</p>
      ${d.feedback.length ? `<div class="notice info small" style="margin-bottom:12px">${d.feedback.length} tanggapan sudah kami terima. Anda masih dapat menambahkan catatan.</div>` : ''}
      <div class="field"><label for="nm">Nama dan jabatan</label><input class="input" id="nm" placeholder="Misal: Budi Santoso, Direktur"></div>
      <div class="field"><label for="isi">Catatan atas dokumen</label><textarea class="input" id="isi" placeholder="Sebutkan pasal dan catatannya"></textarea></div>
      <div class="row"><button class="btn" id="kirim">Kirim tanggapan</button><button class="btn ghost" id="setuju">Setuju tanpa catatan</button></div>`;
    const send = async (setuju, btn) => {
      btn.disabled = true;
      try {
        await api('/api/portal/feedback', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nama: document.getElementById('nm').value, isi: document.getElementById('isi').value, setuju }) });
        message(setuju ? 'Persetujuan diterima' : 'Tanggapan diterima', 'Tim Vendor Management akan menindaklanjuti dan mengirimkan dokumen bernomor melalui email.', true);
      } catch (e) { alert(e.message); btn.disabled = false; }
    };
    const ptSet = () => { const w = document.querySelector('input[name="pt"]:checked')?.value === 'wakil'; const el = document.getElementById('wk'); if (el) el.hidden = !w; };
    document.querySelectorAll('input[name="pt"]').forEach((r) => r.addEventListener('change', ptSet)); ptSet();
    document.getElementById('simpan-isi')?.addEventListener('click', async (e) => {
      const b = e.currentTarget; b.disabled = true;
      try {
        const isi = Object.fromEntries([...document.querySelectorAll('[data-isi]')].map((el) => [el.dataset.isi, el.value.trim() || '-']));
        const mode = document.querySelector('input[name="pt"]:checked')?.value || 'direktur';
        isi.jabatan = document.getElementById('i-jabatan').value.trim();
        if (mode === 'wakil') isi.wakil = document.getElementById('i-wakil').value.trim();
        await api('/api/portal/isian', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ isi, penandatangan: mode }) });
        await load(); alert('Data tersimpan. Dokumen sudah diperbarui; silakan unduh ulang bila perlu.');
      } catch (err) { alert(err.message); b.disabled = false; }
    });
    document.getElementById('kirim').addEventListener('click', (e) => send(false, e.currentTarget));
    document.getElementById('setuju').addEventListener('click', (e) => send(true, e.currentTarget));
  } else if (d.bisa_ttd && d.menunggu_review) {
    s2.innerHTML = `<h2>Tanda tangan sedang diperiksa</h2><p class="muted" style="margin:4px 0 0">Kami sudah menerima unggahan Anda. Bila perlu perbaikan, kami kirimkan tautan baru melalui email.</p>`;
  } else if (d.bisa_ttd) {
    const hal = d.dokumen?.halaman;
    s2.innerHTML = `<h2>Tanda tangani perjanjian</h2>
      <ol class="muted" style="margin:4px 0 14px;padding-left:18px"><li>Cetak dokumen bernomor${hal ? ` (${hal} halaman)` : ''}.</li><li>Tanda tangan basah oleh penandatangan yang tercantum, bubuhkan stempel perusahaan dan meterai.</li><li>Pindai <b>seluruh halaman</b> menjadi satu PDF, lalu unggah di bawah.</li></ol>
      <div class="field"><label for="full">Scan dokumen bertanda tangan (PDF)</label><input class="input" id="full" type="file" accept="application/pdf"><span class="hint">Jumlah halaman harus sama dengan dokumen bernomor${hal ? ` (${hal} halaman)` : ''}. Maks. 20 MB.</span></div>
      <button class="btn" id="up" type="button">Unggah scan</button>`;
    document.getElementById('up').addEventListener('click', async (e) => {
      const f = document.getElementById('full').files[0]; if (!f) return alert('Pilih berkas PDF');
      const b = e.currentTarget; b.disabled = true;
      try { const fd = new FormData(); fd.set('opsi', '2'); fd.set('berkas', f); await api('/api/portal/ttd', { method: 'POST', body: fd }); message('Dokumen diterima', 'Terima kasih. Kami akan memeriksa dan mengirimkan salinan final setelah ditandatangani PT Integrasi Jaringan Ekosistem.', true); }
      catch (err) { alert(err.message); b.disabled = false; }
    });
  } else {
    s2.innerHTML = `<h2>Tidak ada tindakan</h2><p class="muted" style="margin:4px 0 0">Perjanjian sedang diproses tim kami. Informasi berikutnya dikirim melalui email.</p>`;
  }
}
load();
