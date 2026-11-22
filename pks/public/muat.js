// Indikator proses untuk semua halaman (aplikasi, portal mitra, portal Legal):
// 1) garis progres di atas layar selama ada permintaan ke server,
// 2) putaran di tombol yang sedang memproses,
// 3) panel "Mengunggah… n%" dengan persentase nyata saat mengirim berkas.
// Dipasang sebelum skrip lain; tidak mengubah cara skrip lain memanggil fetch.
(function () {
  'use strict';
  if (window.__muat) return; window.__muat = true;
  var jalan = 0, tunda = null, bar = null, panel = null;
  function pasangBar() {
    if (bar) return bar;
    bar = document.createElement('div'); bar.className = 'muat-bar'; bar.setAttribute('role', 'progressbar'); bar.setAttribute('aria-label', 'Memuat');
    bar.innerHTML = '<i></i>'; document.body.appendChild(bar); return bar;
  }
  function mulai() {
    jalan++;
    if (jalan === 1) { clearTimeout(tunda); tunda = setTimeout(function () { if (jalan > 0 && document.body) pasangBar().classList.add('on'); }, 120); }
  }
  function selesai() {
    jalan = Math.max(0, jalan - 1);
    if (!jalan) { clearTimeout(tunda); if (bar) { bar.classList.add('habis'); setTimeout(function () { if (!jalan && bar) bar.classList.remove('on', 'habis'); }, 260); } }
  }
  function adaBerkas(body) {
    if (!(typeof FormData !== 'undefined' && body instanceof FormData)) return 0;
    var n = 0; body.forEach(function (v) { if (v && typeof v === 'object' && 'size' in v) n += v.size; }); return n;
  }
  function tampilPanel(pct, nama) {
    if (!panel) {
      panel = document.createElement('div'); panel.className = 'muat-unggah'; panel.setAttribute('role', 'status'); panel.setAttribute('aria-live', 'polite');
      panel.innerHTML = '<div class="muat-kartu"><span class="muat-putar"></span><div style="min-width:0;flex:1"><b>Mengunggah berkas…</b><small></small><div class="muat-jalur"><i></i></div></div><span class="muat-pct">0%</span></div>';
      document.body.appendChild(panel);
    }
    panel.classList.add('on');
    panel.querySelector('small').textContent = nama || '';
    panel.querySelector('.muat-jalur i').style.width = pct + '%';
    panel.querySelector('.muat-pct').textContent = pct >= 100 ? '' : pct + '%';
    panel.querySelector('b').textContent = pct >= 100 ? 'Memproses di server…' : 'Mengunggah berkas…';
  }
  function tutupPanel() { if (panel) panel.classList.remove('on'); }
  function namaBerkas(body) { var s = []; body.forEach(function (v) { if (v && typeof v === 'object' && v.name && v.size > 0) s.push(v.name); }); return s.join(', '); }

  // Unggah lewat XHR agar persentase nyata terlihat; hasilnya tetap berupa Response seperti fetch.
  function unggah(url, init, body) {
    return new Promise(function (ok, gagal) {
      var x = new XMLHttpRequest();
      x.open(init.method || 'POST', url, true);
      x.responseType = 'blob';
      var h = init.headers || {};
      if (typeof Headers !== 'undefined' && h instanceof Headers) h.forEach(function (v, k) { x.setRequestHeader(k, v); });
      else Object.keys(h).forEach(function (k) { if (h[k] != null) x.setRequestHeader(k, h[k]); });
      x.withCredentials = init.credentials === 'include';
      var nama = namaBerkas(body);
      tampilPanel(0, nama);
      x.upload.onprogress = function (e) { if (e.lengthComputable) tampilPanel(Math.min(99, Math.round(e.loaded / e.total * 100)), nama); };
      x.upload.onload = function () { tampilPanel(100, nama); };
      x.onload = function () {
        tutupPanel();
        var hd = new Headers();
        x.getAllResponseHeaders().trim().split(/[\r\n]+/).forEach(function (l) { var i = l.indexOf(':'); if (i > 0) { try { hd.append(l.slice(0, i).trim(), l.slice(i + 1).trim()); } catch (e) { } } });
        ok(new Response(x.response, { status: x.status, statusText: x.statusText, headers: hd }));
      };
      x.onerror = function () { tutupPanel(); gagal(new TypeError('Koneksi terputus saat mengunggah. Periksa jaringan lalu coba lagi.')); };
      x.onabort = function () { tutupPanel(); gagal(new DOMException('Dibatalkan', 'AbortError')); };
      if (init.signal) init.signal.addEventListener('abort', function () { x.abort(); });
      x.send(body);
    });
  }

  var asli = window.fetch.bind(window);
  window.fetch = function (input, init) {
    init = init || {};
    var url = typeof input === 'string' ? input : (input && input.url) || String(input);
    mulai();
    var p = adaBerkas(init.body) > 20000 && typeof input === 'string' ? unggah(url, init, init.body) : asli(input, init);
    return p.then(function (r) { selesai(); return r; }, function (e) { selesai(); throw e; });
  };

  // Tombol yang dinonaktifkan selama proses menampilkan putaran.
  function tandai(b) {
    if (b.disabled && (jalan > 0 || b.dataset.muatTunggu)) b.classList.add('sibuk');
    else if (!b.disabled) b.classList.remove('sibuk');
  }
  function amati() {
    new MutationObserver(function (ms) {
      ms.forEach(function (m) {
        if (m.type === 'attributes' && m.target.tagName === 'BUTTON') {
          var b = m.target;
          if (b.disabled) { tandai(b); if (!b.classList.contains('sibuk')) setTimeout(function () { tandai(b); }, 60); } else b.classList.remove('sibuk');
        }
      });
    }).observe(document.body, { attributes: true, attributeFilter: ['disabled'], subtree: true });
  }
  if (document.body) amati(); else document.addEventListener('DOMContentLoaded', amati);
  window.muat = { mulai: mulai, selesai: selesai };
})();
