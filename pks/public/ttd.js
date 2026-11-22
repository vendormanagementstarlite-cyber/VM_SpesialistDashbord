// Pengolah gambar TTD (opsi 1): hapus latar kertas, potong otomatis, ekspor PNG transparan.
// Dipakai aplikasi internal dan portal mitra.

export function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Gambar tidak dapat dibaca. Gunakan PNG atau JPG.')); };
    img.src = url;
  });
}

/**
 * Proses gambar: piksel kertas (kroma rendah & terang) dibuat transparan.
 * Tinta hitam/biru, stempel, dan meterai berwarna tetap dipertahankan.
 * @param {number} sens 0–100, makin tinggi makin banyak latar dihapus.
 */
export function cleanSignature(img, canvas, sens = 50) {
  const maxSide = 1400;
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
  const work = document.createElement('canvas');
  work.width = w; work.height = h;
  const ctx = work.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h);
  const px = data.data;
  const lumMin = 235 - sens * 0.9;      // ambang terang kertas
  const chromaMax = 18 + sens * 0.35;   // ambang "tidak berwarna"
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = px[i], g = px[i + 1], b = px[i + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const chroma = Math.max(r, g, b) - Math.min(r, g, b);
      if (lum >= lumMin && chroma <= chromaMax) { px[i + 3] = 0; continue; }
      // tepi lembut untuk piksel peralihan
      if (lum >= lumMin - 25 && chroma <= chromaMax) px[i + 3] = Math.round(255 * (lumMin - lum + 25) / 25 * 0.9);
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  ctx.putImageData(data, 0, 0);
  if (maxX < 0) throw new Error('Tanda tangan tidak terdeteksi. Turunkan kepekaan latar atau gunakan scan yang lebih jelas.');
  const pad = 8;
  minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
  maxX = Math.min(w - 1, maxX + pad); maxY = Math.min(h - 1, maxY + pad);
  canvas.width = maxX - minX + 1; canvas.height = maxY - minY + 1;
  canvas.getContext('2d').drawImage(work, minX, minY, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export const canvasToPng = (canvas) => new Promise((res) => canvas.toBlob((b) => res(b), 'image/png'));

/**
 * Pasang widget opsi 1 ke elemen `root`.
 * onPreview(pngBlob) -> Promise<Blob PDF>, onConfirm(pngBlob) -> Promise
 */
export function mountTtdWidget(root, { onPreview, onConfirm, confirmLabel = 'Simpan tanda tangan' }) {
  root.innerHTML = `
    <div class="field"><label for="ttd-file">Scan tanda tangan beserta stempel dan meterai</label>
      <input class="input" id="ttd-file" type="file" accept="image/png,image/jpeg">
      <span class="hint">Foto atau scan di atas kertas putih. Latar kertas dihapus otomatis.</span></div>
    <div class="ttd-stage" hidden>
      <div><div class="checker"><canvas aria-label="Hasil pembersihan tanda tangan"></canvas></div>
        <div class="field" style="margin-top:10px"><label for="ttd-sens">Kepekaan latar</label><input id="ttd-sens" type="range" min="0" max="100" value="50"></div></div>
      <div class="notice info small">Pastikan tanda tangan, stempel, dan meterai terlihat utuh. Bila ada noda latar, naikkan kepekaan; bila goresan ikut hilang, turunkan.</div>
    </div>
    <div class="row" style="margin-top:6px"><button class="btn ghost" data-act="preview" disabled>Lihat pratinjau di dokumen</button><button class="btn" data-act="confirm" disabled>${confirmLabel}</button></div>
    <iframe class="pdf-frame" title="Pratinjau dokumen bertanda tangan" hidden></iframe>`;
  const file = root.querySelector('#ttd-file');
  const sens = root.querySelector('#ttd-sens');
  const stage = root.querySelector('.ttd-stage');
  const canvas = root.querySelector('canvas');
  const bPrev = root.querySelector('[data-act="preview"]');
  const bOk = root.querySelector('[data-act="confirm"]');
  const frame = root.querySelector('iframe');
  let img = null, previewed = false;
  const redraw = () => { cleanSignature(img, canvas, Number(sens.value)); previewed = false; bOk.disabled = true; frame.hidden = true; };
  file.addEventListener('change', async () => {
    if (!file.files[0]) return;
    try { img = await loadImage(file.files[0]); stage.hidden = false; redraw(); bPrev.disabled = false; }
    catch (e) { alertMsg(root, e.message); }
  });
  sens.addEventListener('input', () => { try { redraw(); } catch (e) { alertMsg(root, e.message); } });
  bPrev.addEventListener('click', async () => {
    bPrev.disabled = true;
    try {
      const pdf = await onPreview(await canvasToPng(canvas));
      frame.src = URL.createObjectURL(pdf) + '#page=999&view=FitH';
      frame.hidden = false; previewed = true; bOk.disabled = false;
    } catch (e) { alertMsg(root, e.message); } finally { bPrev.disabled = false; }
  });
  bOk.addEventListener('click', async () => {
    if (!previewed) return;
    bOk.disabled = true;
    try { await onConfirm(await canvasToPng(canvas)); } catch (e) { alertMsg(root, e.message); bOk.disabled = false; }
  });
}

function alertMsg(root, msg) {
  let n = root.querySelector('.ttd-err');
  if (!n) { n = document.createElement('div'); n.className = 'notice ttd-err'; n.style.marginTop = '10px'; root.prepend(n); }
  n.textContent = msg;
}
