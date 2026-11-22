/* ===== Perjanjian — penghubung menu dashboard (khusus Akun Utama) ===== */
(function () {
  'use strict';
  try { if (typeof MENU_TABS !== 'undefined' && MENU_TABS.indexOf('pks') < 0) { var ix = MENU_TABS.indexOf('perseroan'); MENU_TABS.splice(ix >= 0 ? ix + 1 : MENU_TABS.length, 0, 'pks'); } } catch (e) { }  // menu Perjanjian tepat setelah Info Perseroan
  var g = function (i) { return document.getElementById(i); };
  var utama = function () { try { return !!currentUser && currentUser.role === 'owner' && !!(currentUser.perms || {}).mainOwner; } catch (e) { return false; } };
  var SUB = { overview: 'ov', perjanjian: 'list', pengaturan: 'set' };
  var M = { open: false, aktif: false, sub: 'ov', mounted: false };
  function menuSet() {
    var sm = g('nav-pks-sub'); if (sm) sm.classList.toggle('hidden', !M.open);
    var ch = g('nav-pks-chev'); if (ch) ch.style.transform = M.open ? 'rotate(90deg)' : '';
    ['ov', 'list', 'set'].forEach(function (k) {
      var b = g('nav-pks-' + k); if (!b) return;
      var on = M.aktif && M.sub === k;
      b.style.background = on ? 'rgba(6,182,212,.14)' : ''; b.style.color = on ? '#0e7490' : ''; b.style.fontWeight = on ? '800' : '';
      b.setAttribute('aria-current', on ? 'page' : 'false');
    });
  }
  window.pksNav = function (key) { M.sub = SUB[key] || M.sub; menuSet(); };
  function tolak() { var h = g('pks-host'); if (h) h.innerHTML = '<div style="padding:28px;text-align:center;opacity:.75">Menu Perjanjian hanya untuk Akun Utama.</div>'; }
  function buka(hash) {
    if (!utama()) { switchTab('pks'); tolak(); return; }
    M.open = true; M.aktif = true; M.sub = SUB[hash.split('/')[2]] || 'ov';
    switchTab('pks'); menuSet();
    var sama = location.hash === hash;
    if (!sama) location.hash = hash;
    if (!M.mounted || sama) { M.mounted = true; window.pksMount(g('pks-host')); }
  }
  // klik menu: bila sudah di dalam menu Perjanjian, submenu dibuka/ditutup; bila belum, masuk ke Overview dan submenu terbuka
  window.pksToggle = function () { if (M.aktif && utama()) { M.open = !M.open; menuSet(); } else buka('#/pks/overview'); };
  window.pksSub = function (k) { buka({ ov: '#/pks/overview', list: '#/pks/perjanjian', set: '#/pks/pengaturan' }[k] || '#/pks/overview'); };
  // tautan langsung (mis. dari email): #/pks/perjanjian/ID
  window.addEventListener('hashchange', function () {
    if (!/^#\/pks/.test(location.hash) || !utama()) return;
    var v = g('view-pks');
    if (v && v.classList.contains('hidden')) { M.open = true; M.aktif = true; switchTab('pks'); menuSet(); }
    if (!M.mounted) { M.mounted = true; window.pksMount(g('pks-host')); }
  });
  (function tunggu(n) {
    if (/^#\/pks/.test(location.hash) && utama() && document.getElementById('app-container') && !document.getElementById('app-container').classList.contains('hidden')) { buka(location.hash); return; }
    if (n < 120 && /^#\/pks/.test(location.hash)) setTimeout(function () { tunggu(n + 1); }, 500);
  })(0);
  // keluar dari menu ini → submenu ditutup, alamat dibersihkan
  try { var sw0 = switchTab; switchTab = window.switchTab = function (t) { var r = sw0.apply(this, arguments); if (t !== 'pks' && M.aktif) { M.aktif = false; M.open = false; menuSet(); if (/^#\/pks/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search); } return r; }; } catch (e) { }
  // menu hanya tampil untuk Akun Utama (bukan semua owner)
  try { var ap = applyPermissions; applyPermissions = window.applyPermissions = function () { var r = ap.apply(this, arguments); try { var n = g('nav-pks'); if (n) n.classList.toggle('hidden', !utama()); if (!utama()) { var s = g('nav-pks-sub'); if (s) s.classList.add('hidden'); } } catch (e) { } return r; }; } catch (e) { }
  try { setTimeout(function () { var n = g('nav-pks'); if (n) n.classList.toggle('hidden', !utama()); }, 1500); } catch (e) { }
})();
