/* Bagan struktur organisasi mitra — tombol di bar atas (sejajar ikon mode gelap).
   Data per mitra (Supabase lewat Apps Script). Lihat: semua akun · ubah: Akun Utama. */
(function () {
  "use strict";
  var $ = function (i) { return document.getElementById(i); };
  var E = function (t) { return String(t == null ? "" : t).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var toast = function (m, t, ms) { try { showToast(m, t || "info", ms); } catch (e) { } };
  var calm = function () { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } };
  var lsGet = function (k) { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } };
  var lsSet = function (k, v) { try { localStorage.setItem(k, v); } catch (e) { } };
  var ICONS = ["user-tie", "users", "helmet-safety", "clipboard-check", "screwdriver-wrench", "headset", "shield-halved", "file-signature", "truck", "network-wired", "chart-line", "user-gear", "id-badge", "user", "map-location-dot", "toolbox", "briefcase", "wallet", "bolt", "tower-cell"];

  var BG = { wajib: [], mitras: [], nodes: [], mitra: "", canEdit: false, cfgLoaded: false, sel: "", busy: false };
  window.BG = BG;

  var CSS = '' +
    '.bgm{--bg:#fff;--bg2:#f1f5f9;--tx:#0f172a;--mu:#64748b;--ln:#cbd5e1;--bd:rgba(148,163,184,.35);--ok:#059669;--okbg:rgba(5,150,105,.12);--ac:#0284c7;--bad:#e11d48}' +
    'html.dark .bgm{--bg:#0d1428;--bg2:#141d36;--tx:#e2e8f0;--mu:#94a3b8;--ln:#334155;--bd:rgba(255,255,255,.14);--ok:#34d399;--okbg:rgba(52,211,153,.14);--ac:#38bdf8;--bad:#fb7185}' +
    '.bgm-ov{position:fixed;inset:0;z-index:9500;background:rgba(2,6,23,.55);display:flex;align-items:stretch;justify-content:center;padding:18px;animation:bgIn .18s ease-out}' +
    '@keyframes bgIn{from{opacity:0}to{opacity:1}}' +
    '.bgm{position:relative;display:flex;flex-direction:column;width:min(1280px,100%);background:var(--bg);color:var(--tx);border:1px solid var(--bd);border-radius:18px;box-shadow:0 30px 80px -30px rgba(0,0,0,.6);overflow:hidden;font-size:13px}' +
    '.bgm *{box-sizing:border-box}' +
    '.bgm-h{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--bd);flex-wrap:wrap}' +
    '.bgm-h h2{font-size:15px;font-weight:800;margin:0;display:flex;align-items:center;gap:8px;white-space:nowrap}' +
    '.bgm-in{height:38px;border:1px solid var(--bd);background:var(--bg2);color:var(--tx);border-radius:10px;padding:0 12px;font:inherit;min-width:0;width:100%}' +
    '.bgm-in:focus,.bgm-btn:focus-visible,.bgn-a:focus-visible,.bgr-i:focus-visible{outline:2px solid var(--ac);outline-offset:1px}' +
    '.bgm-pick{flex:1;min-width:200px;max-width:460px}' +
    '.bgm-btn{height:38px;min-width:38px;padding:0 14px;border-radius:10px;border:1px solid var(--bd);background:var(--bg2);color:var(--tx);font:inherit;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:7px;transition:background .15s,transform .1s}' +
    '.bgm-btn:hover{background:var(--bd)}.bgm-btn:active{transform:scale(.97)}.bgm-btn.pri{background:var(--ac);border-color:var(--ac);color:#fff}.bgm-btn.pri:hover{filter:brightness(1.08)}.bgm-btn.bad{color:var(--bad)}.bgm-btn[disabled]{opacity:.55;pointer-events:none}' +
    '.bgm-rail{display:flex;align-items:center;justify-content:safe center;gap:8px;padding:10px 16px;border-bottom:1px solid var(--bd);overflow-x:auto;min-height:62px}' +
    '.bgr-i{flex:0 0 auto;width:42px;height:42px;border-radius:12px;border:1.5px solid var(--bd);background:var(--bg2);color:var(--mu);display:inline-flex;align-items:center;justify-content:center;font-size:16px;cursor:default;position:relative;transition:background .35s,color .35s,border-color .35s,transform .15s}' +
    '.bgr-i.on{background:var(--okbg);color:var(--ok);border-color:var(--ok)}' +
    '.bgr-i.can{cursor:pointer}.bgr-i.can:hover{transform:translateY(-2px)}' +
    '.bgr-i.on::after{content:"";position:absolute;right:-3px;top:-3px;width:11px;height:11px;border-radius:50%;background:var(--ok);border:2px solid var(--bg)}' +
    '.bgr-c{flex:0 0 auto;font-weight:800;color:var(--mu);padding-left:10px;white-space:nowrap}' +
    '.bgm-body{position:relative;flex:1;min-height:0;display:flex}' +
    '.bgm-cv{flex:1;min-width:0;overflow:auto;padding:26px 20px 60px}' +
    '.bg-forest{display:flex;gap:36px;justify-content:center;min-width:max-content;margin:0 auto}' +
    '.bg-tree ul{display:flex;justify-content:center;padding:22px 0 0;position:relative;margin:0;list-style:none}' +
    '.bg-tree li{position:relative;padding:22px 8px 0;text-align:center;list-style:none}' +
    '.bg-tree li::before,.bg-tree li::after{content:"";position:absolute;top:0;right:50%;border-top:2px solid var(--ln);width:50%;height:22px}' +
    '.bg-tree li::after{right:auto;left:50%;border-left:2px solid var(--ln)}' +
    '.bg-tree li:only-child::before,.bg-tree li:only-child::after{display:none}.bg-tree li:only-child{padding-top:22px}' +
    '.bg-tree li:first-child::before,.bg-tree li:last-child::after{border:0 none}' +
    '.bg-tree li:last-child::before{border-right:2px solid var(--ln);border-radius:0 9px 0 0}.bg-tree li:first-child::after{border-radius:9px 0 0 0}' +
    '.bg-tree ul ul::before{content:"";position:absolute;top:0;left:50%;border-left:2px solid var(--ln);height:22px}' +
    '.bg-tree>ul{padding-top:0}.bg-tree>ul>li{padding-top:0}.bg-tree>ul>li::before,.bg-tree>ul>li::after{display:none}' +
    '.bgn{display:inline-block;width:196px;text-align:center;border:1px solid var(--bd);background:var(--bg2);border-radius:14px;padding:10px 12px;position:relative;transition:box-shadow .2s,border-color .2s}' +
    '.bgn.w{border-color:var(--ok);background:linear-gradient(0deg,var(--okbg),var(--okbg)),var(--bg2)}' +
    '.bgn:hover{box-shadow:0 10px 24px -14px rgba(0,0,0,.5)}' +
    '.bgn-t{display:flex;align-items:center;justify-content:center;gap:8px;font-weight:800;line-height:1.2}' +
    '.bgn-t i{width:26px;height:26px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;background:var(--bd);font-size:12px;flex:0 0 auto}' +
    '.bgn.w .bgn-t i{background:var(--ok);color:#fff}' +
    '.bgn-n{margin-top:6px;font-weight:700;word-break:break-word}.bgn-s{color:var(--mu);font-size:11.5px;word-break:break-all;display:block;margin-top:1px}' +
    '.bgn-s a{color:inherit;text-decoration:none}.bgn-s a:hover{color:var(--ac);text-decoration:underline}' +
    '.bgn-ac{display:flex;gap:4px;margin-top:8px;padding-top:7px;border-top:1px dashed var(--bd)}' +
    '.bgn-a{flex:1;height:28px;border-radius:8px;border:0;background:transparent;color:var(--mu);cursor:pointer;font-size:12px;transition:background .15s,color .15s}' +
    '.bgn-a:hover{background:var(--bd);color:var(--tx)}.bgn-a.d:hover{color:var(--bad)}' +
    '.bgn.hl{animation:bgFlash 1s ease-out}@keyframes bgFlash{0%{box-shadow:0 0 0 0 var(--ac)}30%{box-shadow:0 0 0 6px color-mix(in srgb,var(--ac) 35%,transparent)}100%{box-shadow:0 0 0 0 transparent}}' +
    '.bgm-empty{margin:60px auto;max-width:380px;text-align:center;color:var(--mu);line-height:1.6}.bgm-empty i{font-size:34px;color:var(--ln);margin-bottom:12px;display:block}' +
    '.bgm-side{position:absolute;top:0;right:0;bottom:0;width:min(380px,100%);background:var(--bg);border-left:1px solid var(--bd);display:flex;flex-direction:column;transform:translateX(102%);visibility:hidden;box-shadow:none;transition:transform .24s cubic-bezier(.2,.8,.2,1),visibility 0s .24s;z-index:3}' +
    '.bgm-side.open{transform:none;visibility:visible;box-shadow:-20px 0 40px -30px rgba(0,0,0,.5);transition-delay:0s}' +
    '.bgm-side h3{margin:0;font-size:14px;font-weight:800;padding:14px 16px;border-bottom:1px solid var(--bd);display:flex;align-items:center;justify-content:space-between;gap:8px}' +
    '.bgm-sb{flex:1;overflow:auto;padding:14px 16px;display:flex;flex-direction:column;gap:12px}' +
    '.bgm-f{padding:12px 16px;border-top:1px solid var(--bd);display:flex;gap:8px;justify-content:flex-end}' +
    '.bgm-l{display:block;font-weight:700;margin-bottom:5px;font-size:12px}.bgm-l small{color:var(--mu);font-weight:600}' +
    '.bgm-er{color:var(--bad);font-size:11.5px;margin-top:4px;min-height:0}' +
    '.bgm-in.bad{border-color:var(--bad)}' +
    '.bgm-cr{display:grid;grid-template-columns:44px 1fr 32px 32px 32px;gap:6px;align-items:center}' +
    '.bgm-un{position:absolute;left:50%;bottom:16px;transform:translate(-50%,24px);opacity:0;pointer-events:none;background:#0f172a;color:#fff;border-radius:12px;padding:0 6px 0 16px;height:44px;display:flex;align-items:center;gap:12px;box-shadow:0 14px 34px -12px rgba(0,0,0,.6);transition:transform .22s,opacity .22s;z-index:5;overflow:hidden;max-width:calc(100% - 24px)}' +
    '.bgm-un.on{transform:translate(-50%,0);opacity:1;pointer-events:auto}' +
    '.bgm-un button{background:rgba(255,255,255,.14);color:#fff;border:0;border-radius:8px;height:32px;padding:0 12px;font-weight:800;cursor:pointer}' +
    '.bgm-un::after{content:"";position:absolute;left:0;bottom:0;height:3px;width:100%;background:#38bdf8;transform-origin:left;transform:scaleX(0)}' +
    '.bgm-un.on::after{animation:bgCount 7s linear forwards}@keyframes bgCount{from{transform:scaleX(1)}to{transform:scaleX(0)}}' +
    '.bgm-dlg{position:absolute;inset:0;z-index:6;background:rgba(2,6,23,.45);display:flex;align-items:center;justify-content:center;padding:16px;animation:bgIn .15s}' +
    '.bgm-dlg>div{background:var(--bg);border:1px solid var(--bd);border-radius:14px;padding:18px;max-width:380px;width:100%;display:flex;flex-direction:column;gap:10px}' +
    '@media (max-width:700px){.bgm-ov{padding:0}.bgm{border-radius:0}.bgm-side{top:auto;height:auto;max-height:88%;width:100%;border-left:0;border-top:1px solid var(--bd);border-radius:18px 18px 0 0;transform:translateY(102%)}.bgm-side.open{transform:none}.bgm-cr{grid-template-columns:40px 1fr 30px 30px 30px}}' +
    '@media (prefers-reduced-motion:reduce){.bgm *,.bgm-ov{animation:none!important;transition:none!important}}';

  function css() { if ($("bgm-css")) return; var s = document.createElement("style"); s.id = "bgm-css"; s.textContent = CSS; document.head.appendChild(s); }
  function key(s) { return String(s || "").replace(/\s+/g, " ").trim().toUpperCase(); }
  function uid() { return "n" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function phone(s) { var d = String(s || "").replace(/[^\d+]/g, ""); if (d.indexOf("+") > 0) d = d.replace(/\+/g, ""); if (/^\+?62/.test(d)) d = "0" + d.replace(/^\+?62/, ""); return d; }
  var phoneOk = function (s) { return /^0\d{8,13}$/.test(s); };
  var mailOk = function (s) { return /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]{2,}$/.test(s); };
  function wj(k) { for (var i = 0; i < BG.wajib.length; i++) if (BG.wajib[i].key === k) return BG.wajib[i]; return null; }
  function kids(id) { return BG.nodes.filter(function (n) { return (n.parent || "") === (id || ""); }).sort(function (a, b) { return (a.ord || 0) - (b.ord || 0); }); }
  function byId(id) { for (var i = 0; i < BG.nodes.length; i++) if (BG.nodes[i].id === id) return BG.nodes[i]; return null; }
  function subtree(id) { var out = [id]; kids(id).forEach(function (k) { out = out.concat(subtree(k.id)); }); return out; }
  function call(a, b) { return callApi(a, b || {}, 40000); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  // ---------- kerangka modal ----------
  var ov, closeKey;
  BG.open = function () {
    css();
    if (ov) return;
    ov = document.createElement("div"); ov.className = "bgm-ov";
    ov.innerHTML = '<div class="bgm" role="dialog" aria-modal="true" aria-label="Bagan mitra">' +
      '<div class="bgm-h"><h2><i class="fa-solid fa-sitemap" style="color:var(--ac)"></i>Bagan Mitra</h2>' +
      '<input id="bg-pick" class="bgm-in bgm-pick" list="bg-dl" placeholder="Pilih / ketik nama mitra" autocomplete="off" aria-label="Mitra"><datalist id="bg-dl"></datalist>' +
      '<span style="flex:1"></span><button id="bg-cfg" class="bgm-btn hidden" title="Atur daftar posisi wajib" aria-label="Atur posisi wajib"><i class="fa-solid fa-gear"></i></button>' +
      '<button id="bg-x" class="bgm-btn" title="Tutup" aria-label="Tutup"><i class="fa-solid fa-xmark"></i></button></div>' +
      '<div id="bg-rail" class="bgm-rail"></div>' +
      '<div class="bgm-body"><div id="bg-cv" class="bgm-cv"></div>' +
      '<aside id="bg-side" class="bgm-side" aria-live="polite"></aside>' +
      '<div id="bg-un" class="bgm-un"><span id="bg-un-t"></span><button id="bg-un-b">Urungkan</button></div></div></div>';
    document.body.appendChild(ov);
    ov.addEventListener("mousedown", function (e) { if (e.target === ov) close(); });
    $("bg-x").onclick = close;
    closeKey = function (e) { if (e.key === "Escape") { if ($("bg-side").classList.contains("open")) side(false); else close(); } };
    document.addEventListener("keydown", closeKey);
    var p = $("bg-pick");
    var go = function () { var v = key(p.value); if (v && v !== BG.mitra) loadMitra(v); };
    p.addEventListener("change", go); p.addEventListener("keydown", function (e) { if (e.key === "Enter") { go(); p.blur(); } });
    $("bg-cfg").onclick = cfgPanel;
    $("bg-cv").innerHTML = '<div class="bgm-empty"><i class="fa-solid fa-circle-notch fa-spin"></i>Memuat…</div>';
    loadCfg().then(function () {
      var last = lsGet("bg_last"); if (last) { p.value = last; loadMitra(last); } else { renderAll(); p.focus(); }
    });
  };
  function close() { if (!ov) return; document.removeEventListener("keydown", closeKey); ov.remove(); ov = null; }
  function names() {
    var s = {};
    try { Object.keys(STATE || {}).forEach(function (k) { var a = STATE[k]; if (Array.isArray(a)) a.forEach(function (x) { if (x && typeof x.mitra === "string" && x.mitra.trim()) s[key(x.mitra)] = 1; }); }); } catch (e) { }
    BG.mitras.forEach(function (m) { s[m.mitra] = 1; });
    return Object.keys(s).sort();
  }
  async function loadCfg() {
    try {
      var r = await call("bagan.cfg");
      BG.wajib = r.wajib || []; BG.mitras = r.mitras || []; BG.canEdit = !!r.canEdit; BG.cfgLoaded = true;
      $("bg-dl").innerHTML = names().map(function (n) { return '<option value="' + E(n) + '">'; }).join("");
      $("bg-cfg").classList.toggle("hidden", !BG.canEdit);
    } catch (e) { BG.err = e.message; toast("Bagan: " + e.message, "error", 5000); }
  }
  async function loadMitra(m) {
    BG.mitra = m; BG.nodes = []; BG.sel = ""; side(false); $("bg-pick").value = m;
    $("bg-cv").innerHTML = '<div class="bgm-empty"><i class="fa-solid fa-circle-notch fa-spin"></i>Memuat bagan…</div>';
    try {
      var r = await call("bagan.get", { mitra: m });
      if (BG.mitra !== m) return;
      BG.nodes = r.nodes || []; BG.canEdit = !!r.canEdit; lsSet("bg_last", m);
    } catch (e) { $("bg-cv").innerHTML = '<div class="bgm-empty"><i class="fa-solid fa-triangle-exclamation"></i>' + E(e.message) + '<br><button class="bgm-btn" id="bg-retry" style="margin-top:12px">Coba lagi</button></div>'; $("bg-retry").onclick = function () { loadMitra(m); }; return; }
    renderAll(false);
  }

  // ---------- gambar ----------
  function railHtml() {
    if (!BG.wajib.length) return '<span style="color:var(--mu)">' + (BG.canEdit ? 'Daftar posisi wajib belum diatur — klik ikon gerigi.' : 'Daftar posisi wajib belum diatur.') + '</span>';
    var have = {}; BG.nodes.forEach(function (n) { if (n.wajib) have[n.wajib] = n; });
    var done = 0;
    var h = BG.wajib.map(function (w) {
      var on = !!have[w.key]; if (on) done++;
      var can = BG.mitra && (BG.canEdit || on);
      return '<button class="bgr-i ' + (on ? "on " : "") + (can ? "can" : "") + '" data-k="' + E(w.key) + '" title="' + E(w.label) + (on ? " — sudah terisi" : " — belum diisi") + '" aria-label="' + E(w.label) + (on ? ", sudah terisi" : ", belum diisi") + '"><i class="fa-solid fa-' + E(w.icon || "user") + '"></i></button>';
    }).join("");
    return h + '<span class="bgr-c">' + done + ' / ' + BG.wajib.length + ' wajib</span>';
  }
  function nodeHtml(n) {
    var w = n.wajib ? wj(n.wajib) : null;
    var ic = w ? w.icon : "user";
    var act = BG.canEdit ? '<div class="bgn-ac"><button class="bgn-a" data-a="add" title="Tambah bawahan" aria-label="Tambah bawahan"><i class="fa-solid fa-plus"></i></button><button class="bgn-a" data-a="edit" title="Ubah" aria-label="Ubah"><i class="fa-solid fa-pen"></i></button><button class="bgn-a d" data-a="del" title="Hapus" aria-label="Hapus"><i class="fa-solid fa-trash-can"></i></button></div>' : "";
    return '<div class="bgn ' + (n.wajib ? "w" : "") + '" data-id="' + E(n.id) + '"><div class="bgn-t"><i class="fa-solid fa-' + E(ic) + '"></i><span>' + E(n.posisi) + '</span></div><div class="bgn-n">' + E(n.nama) + '</div>' +
      '<span class="bgn-s"><a href="tel:' + E(n.hp) + '">' + E(n.hp) + '</a></span>' + (n.email ? '<span class="bgn-s"><a href="mailto:' + E(n.email) + '">' + E(n.email) + '</a></span>' : "") + act + '</div>';
  }
  function treeHtml(id) { var ks = kids(id); if (!ks.length) return ""; return "<ul>" + ks.map(function (k) { return "<li>" + nodeHtml(k) + treeHtml(k.id) + "</li>"; }).join("") + "</ul>"; }
  function rects() { var m = {}; document.querySelectorAll("#bg-cv .bgn").forEach(function (e) { var r = e.getBoundingClientRect(); m[e.getAttribute("data-id")] = r; }); return m; }
  function renderAll(animate, flash) {
    if (!ov) return;
    $("bg-rail").innerHTML = railHtml();
    $("bg-rail").querySelectorAll(".bgr-i.can").forEach(function (b) { b.onclick = function () { railClick(b.getAttribute("data-k")); }; });
    renderTree(animate !== false, flash);
  }
  function renderTree(animate, flash) {
    var cv = $("bg-cv"), before = animate && !calm() ? rects() : null;
    if (!BG.mitra) { cv.innerHTML = '<div class="bgm-empty"><i class="fa-solid fa-sitemap"></i>Pilih mitra di atas untuk melihat bagan struktur organisasinya.' + (BG.mitras.length ? "<br>" + BG.mitras.length + " mitra sudah punya bagan." : "") + "</div>"; return; }
    if (!BG.nodes.length) { cv.innerHTML = '<div class="bgm-empty"><i class="fa-solid fa-sitemap"></i>Belum ada bagan untuk <b>' + E(BG.mitra) + "</b>." + (BG.canEdit ? '<br><button class="bgm-btn pri" id="bg-start" style="margin-top:14px"><i class="fa-solid fa-plus"></i>Mulai bagan</button>' : "<br>Bagan dibuat oleh Akun Utama.") + "</div>"; var s = $("bg-start"); if (s) s.onclick = function () { form({}); }; return; }
    var roots = kids("");
    cv.innerHTML = '<div class="bg-forest">' + roots.map(function (r) { return '<div class="bg-tree"><ul><li>' + nodeHtml(r) + treeHtml(r.id) + "</li></ul></div>"; }).join("") + "</div>" +
      (BG.canEdit ? '<div style="text-align:center;margin-top:26px"><button class="bgm-btn" id="bg-addtop"><i class="fa-solid fa-plus"></i>Tambah posisi</button></div>' : "");
    var at = $("bg-addtop"); if (at) at.onclick = function () { form({}); };
    cv.querySelectorAll(".bgn").forEach(function (el) {
      var id = el.getAttribute("data-id");
      el.querySelectorAll("[data-a]").forEach(function (b) { b.onclick = function () { var a = b.getAttribute("data-a"); if (a === "add") form({ parent: id }); else if (a === "edit") form({ id: id }); else askDel(id); }; });
      if (before) {
        var o = before[id], r = el.getBoundingClientRect();
        if (o && (Math.abs(o.left - r.left) > 1 || Math.abs(o.top - r.top) > 1)) el.animate([{ transform: "translate(" + (o.left - r.left) + "px," + (o.top - r.top) + "px)" }, { transform: "none" }], { duration: 320, easing: "cubic-bezier(.2,.8,.2,1)" });
        else if (!o) el.animate([{ opacity: 0, transform: "scale(.92)" }, { opacity: 1, transform: "none" }], { duration: 240, easing: "ease-out" });
      }
      if (flash && flash === id) { el.classList.add("hl"); try { el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: calm() ? "auto" : "smooth" }); } catch (e) { } }
    });
  }
  function railClick(k) {
    var n = BG.nodes.filter(function (x) { return x.wajib === k; })[0];
    if (n) { var el = document.querySelector('#bg-cv .bgn[data-id="' + n.id + '"]'); if (el) { el.scrollIntoView({ block: "center", inline: "center", behavior: calm() ? "auto" : "smooth" }); el.classList.remove("hl"); void el.offsetWidth; el.classList.add("hl"); } }
    else if (BG.canEdit) form({ wajib: k });
  }

  // ---------- panel samping ----------
  function side(open, html) { var s = $("bg-side"); if (!s) return; if (html != null) s.innerHTML = html; s.classList.toggle("open", !!open); }
  function form(o) {
    if (!BG.mitra) { toast("Pilih mitra dulu", "info"); return; }
    var ed = o.id ? byId(o.id) : null;
    var usedW = {}; BG.nodes.forEach(function (n) { if (n.wajib && (!ed || n.id !== ed.id)) usedW[n.wajib] = 1; });
    var cur = ed ? (ed.wajib || "x") : (o.wajib || (BG.wajib.filter(function (w) { return !usedW[w.key]; })[0] || { key: "x" }).key);
    var opts = BG.wajib.filter(function (w) { return !usedW[w.key]; }).map(function (w) { return '<option value="' + E(w.key) + '"' + (cur === w.key ? " selected" : "") + ">" + E(w.label) + " (wajib)</option>"; }).join("") + '<option value="x"' + (cur === "x" ? " selected" : "") + ">Posisi lain…</option>";
    var ban = ed ? subtree(ed.id) : [];
    var par = ed ? (ed.parent || "") : (o.parent || "");
    var popts = '<option value="">— Paling atas —</option>' + BG.nodes.filter(function (n) { return ban.indexOf(n.id) < 0; }).map(function (n) { return '<option value="' + E(n.id) + '"' + (par === n.id ? " selected" : "") + ">" + E(n.posisi + " · " + n.nama) + "</option>"; }).join("");
    side(true, '<h3><span>' + (ed ? "Ubah posisi" : "Tambah posisi") + '</span><button class="bgm-btn" id="bf-x" aria-label="Tutup panel"><i class="fa-solid fa-xmark"></i></button></h3>' +
      '<div class="bgm-sb"><div><label class="bgm-l" for="bf-pos">Posisi</label><select id="bf-pos" class="bgm-in">' + opts + '</select>' +
      '<input id="bf-lain" class="bgm-in" placeholder="Nama posisi (mis. Teknisi Lapangan)" style="margin-top:8px" value="' + E(ed && !ed.wajib ? ed.posisi : "") + '"><div class="bgm-er" id="e-pos"></div></div>' +
      '<div><label class="bgm-l" for="bf-nama">Nama</label><input id="bf-nama" class="bgm-in" value="' + E(ed ? ed.nama : "") + '" autocomplete="off"><div class="bgm-er" id="e-nama"></div></div>' +
      '<div><label class="bgm-l" for="bf-hp">No HP</label><input id="bf-hp" class="bgm-in" inputmode="tel" placeholder="08xxxxxxxxxx" value="' + E(ed ? ed.hp : "") + '" autocomplete="off"><div class="bgm-er" id="e-hp"></div></div>' +
      '<div><label class="bgm-l" for="bf-mail">Email <small id="bf-mt"></small></label><input id="bf-mail" class="bgm-in" inputmode="email" placeholder="nama@perusahaan.com" value="' + E(ed ? ed.email : "") + '" autocomplete="off"><div class="bgm-er" id="e-mail"></div></div>' +
      '<div><label class="bgm-l" for="bf-par">Atasan</label><select id="bf-par" class="bgm-in">' + popts + '</select></div></div>' +
      '<div class="bgm-f"><button class="bgm-btn" id="bf-c">Batal</button><button class="bgm-btn pri" id="bf-s"><i class="fa-solid fa-check"></i>Simpan</button></div>');
    var sel = $("bf-pos"), lain = $("bf-lain");
    function sync() { var w = sel.value !== "x"; lain.style.display = w ? "none" : ""; $("bf-mt").textContent = w ? "(wajib)" : "(opsional)"; }
    sel.onchange = sync; sync();
    $("bf-x").onclick = $("bf-c").onclick = function () { side(false); };
    var err = function (id, m) { $("e-" + id).textContent = m || ""; var i = { pos: "bf-lain", nama: "bf-nama", hp: "bf-hp", mail: "bf-mail" }[id]; if (i) $(i).classList.toggle("bad", !!m); };
    ["bf-lain", "bf-nama", "bf-hp", "bf-mail"].forEach(function (i) { $(i).addEventListener("keydown", function (e) { if (e.key === "Enter") $("bf-s").click(); }); });
    $("bf-s").onclick = function () {
      var w = sel.value !== "x" ? sel.value : "", wl = w ? wj(w) : null;
      var posisi = w ? wl.label : lain.value.replace(/\s+/g, " ").trim(), nama = $("bf-nama").value.replace(/\s+/g, " ").trim(), hp = phone($("bf-hp").value), mail = $("bf-mail").value.trim().toLowerCase();
      var bad = false;
      err("pos", !posisi ? "Isi nama posisi" : ""); if (!posisi) bad = true;
      err("nama", !nama ? "Nama wajib diisi" : ""); if (!nama) bad = true;
      err("hp", !phoneOk(hp) ? "No HP tidak valid (contoh 08123456789)" : ""); if (!phoneOk(hp)) bad = true;
      var em = w && !mail ? "Email wajib untuk posisi ini" : mail && !mailOk(mail) ? "Format email tidak valid" : ""; err("mail", em); if (em) bad = true;
      if (bad) return;
      var parent = $("bf-par").value;
      var node = { id: ed ? ed.id : uid(), parent: parent, posisi: posisi, wajib: w, nama: nama, hp: hp, email: mail, ord: ed && (ed.parent || "") === parent ? ed.ord : (kids(parent).reduce(function (m, k) { return Math.max(m, k.ord || 0); }, 0) + 1) };
      saveNode(node, ed);
    };
    setTimeout(function () { (ed || o.wajib ? $("bf-nama") : sel).focus(); }, 260);
  }
  async function saveNode(node, ed) {
    var snap = clone(BG.nodes), m = BG.mitra;
    if (ed) Object.assign(ed, node); else BG.nodes.push(node);
    side(false); renderAll(true, node.id);
    try { await call("bagan.save", { mitra: m, nodes: [node] }); }
    catch (e) {
      if (BG.mitra === m) { BG.nodes = snap; renderAll(true); form(ed ? { id: ed.id } : { parent: node.parent, wajib: node.wajib }); toast(e.message, "error", 6000); }
    }
  }

  // ---------- hapus + urungkan ----------
  function askDel(id) {
    var n = byId(id), ks = kids(id);
    if (!ks.length) { doDel(id, "cascade"); return; }
    var d = document.createElement("div"); d.className = "bgm-dlg";
    d.innerHTML = '<div role="alertdialog"><b>Hapus ' + E(n.posisi) + "?</b><span style=\"color:var(--mu)\">Posisi ini punya " + ks.length + " bawahan langsung. Pilih apa yang terjadi pada mereka.</span>" +
      '<button class="bgm-btn bad" data-m="cascade">Hapus beserta semua bawahan</button><button class="bgm-btn" data-m="reparent">Hapus, pindahkan bawahan ke atasan</button><button class="bgm-btn" data-m="">Batal</button></div>';
    ov.querySelector(".bgm-body").appendChild(d);
    d.onclick = function (e) { if (e.target === d) d.remove(); };
    d.querySelectorAll("[data-m]").forEach(function (b) { b.onclick = function () { var m = b.getAttribute("data-m"); d.remove(); if (m) doDel(id, m); }; });
  }
  var undoT;
  async function doDel(id, mode) {
    var n = byId(id), snap = clone(BG.nodes), m = BG.mitra;
    var gone = mode === "reparent" ? [id] : subtree(id);
    var moved = mode === "reparent" ? kids(id).map(function (k) { return k.id; }) : [];
    // animasi keluar, baru dirender ulang (node lain bergeser mulus)
    if (!calm()) {
      var outs = gone.map(function (g) { return document.querySelector('#bg-cv .bgn[data-id="' + g + '"]'); }).filter(Boolean);
      await Promise.all(outs.map(function (el) { return el.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(.9)" }], { duration: 180, easing: "ease-in", fill: "forwards" }).finished.catch(function () { }); }));
    }
    if (mode === "reparent") kids(id).forEach(function (k) { k.parent = n.parent || ""; });
    BG.nodes = BG.nodes.filter(function (x) { return gone.indexOf(x.id) < 0; });
    renderAll(true);
    try {
      var r = await call("bagan.delete", { id: id, mode: mode });
      var rows = (r.deleted || []).map(function (x) { return { id: x.id, parent: x.parent || "", posisi: x.posisi, wajib: x.wajib || "", nama: x.nama, hp: x.hp, email: x.email || "", ord: x.ord || 0 }; });
      moved.forEach(function (mid) { var o = snap.filter(function (x) { return x.id === mid; })[0]; if (o) rows.push({ id: o.id, parent: id, posisi: o.posisi, wajib: o.wajib || "", nama: o.nama, hp: o.hp, email: o.email || "", ord: o.ord || 0 }); });
      undo(n.posisi + " dihapus" + (gone.length > 1 ? " (+" + (gone.length - 1) + ")" : ""), async function () {
        BG.nodes = snap; renderAll(true);
        try { await call("bagan.save", { mitra: m, nodes: rows }); } catch (e) { BG.nodes = BG.nodes.filter(function (x) { return gone.indexOf(x.id) < 0; }); renderAll(true); toast("Gagal mengurungkan: " + e.message, "error", 6000); }
      });
    } catch (e) { BG.nodes = snap; renderAll(true); toast(e.message, "error", 6000); }
  }
  function undo(txt, fn) {
    var u = $("bg-un"); if (!u) return;
    $("bg-un-t").textContent = txt; clearTimeout(undoT);
    u.classList.remove("on"); void u.offsetWidth; u.classList.add("on");
    var hide = function () { u.classList.remove("on"); };
    $("bg-un-b").onclick = function () { clearTimeout(undoT); hide(); fn(); };
    undoT = setTimeout(hide, 7000);
  }

  // ---------- atur posisi wajib (Akun Utama) ----------
  function cfgPanel() {
    var list = clone(BG.wajib);
    var dl = '<datalist id="bg-ic">' + ICONS.map(function (i) { return '<option value="' + i + '">'; }).join("") + "</datalist>";
    function draw() {
      side(true, '<h3><span>Posisi wajib</span><button class="bgm-btn" id="bc-x" aria-label="Tutup panel"><i class="fa-solid fa-xmark"></i></button></h3>' +
        '<div class="bgm-sb"><div style="color:var(--mu)">Berlaku untuk <b>semua mitra</b>. Ikon dipilih dari nama ikon Font Awesome (mis. user-tie).</div>' + dl +
        list.map(function (w, i) { return '<div class="bgm-cr" data-i="' + i + '"><span style="text-align:center;font-size:18px;color:var(--ok)"><i class="fa-solid fa-' + E(w.icon || "user") + '"></i></span><div><input class="bgm-in" data-f="label" placeholder="Nama posisi" value="' + E(w.label) + '"><input class="bgm-in" data-f="icon" list="bg-ic" placeholder="ikon" style="margin-top:5px;height:30px;font-size:12px" value="' + E(w.icon || "") + '"></div>' +
          '<button class="bgm-btn" data-m="up" aria-label="Naik"' + (i ? "" : " disabled") + '><i class="fa-solid fa-chevron-up"></i></button><button class="bgm-btn" data-m="dn" aria-label="Turun"' + (i < list.length - 1 ? "" : " disabled") + '><i class="fa-solid fa-chevron-down"></i></button><button class="bgm-btn bad" data-m="rm" aria-label="Hapus"><i class="fa-solid fa-trash-can"></i></button></div>'; }).join("") +
        '<button class="bgm-btn" id="bc-add"><i class="fa-solid fa-plus"></i>Tambah posisi wajib</button><div class="bgm-er" id="bc-er"></div></div>' +
        '<div class="bgm-f"><button class="bgm-btn" id="bc-c">Batal</button><button class="bgm-btn pri" id="bc-s"><i class="fa-solid fa-check"></i>Simpan</button></div>');
      $("bc-x").onclick = $("bc-c").onclick = function () { side(false); };
      $("bc-add").onclick = function () { sync(); list.push({ key: "", label: "", icon: "user" }); draw(); };
      $("bg-side").querySelectorAll(".bgm-cr").forEach(function (r) {
        var i = +r.getAttribute("data-i");
        r.querySelectorAll("[data-f]").forEach(function (inp) { inp.oninput = function () { list[i][inp.getAttribute("data-f")] = inp.value; if (inp.getAttribute("data-f") === "icon") r.firstChild.firstChild.className = "fa-solid fa-" + (inp.value.trim() || "user"); }; });
        r.querySelectorAll("[data-m]").forEach(function (b) { b.onclick = function () { sync(); var m = b.getAttribute("data-m"); if (m === "rm") list.splice(i, 1); else { var j = m === "up" ? i - 1 : i + 1, t = list[i]; list[i] = list[j]; list[j] = t; } draw(); }; });
      });
      $("bc-s").onclick = async function () {
        sync(); var clean = list.filter(function (w) { return String(w.label || "").trim(); });
        var b = $("bc-s"); b.disabled = true; $("bc-er").textContent = "";
        try { var r = await call("bagan.cfg.save", { wajib: clean }); BG.wajib = r.wajib || clean; side(false); renderAll(true); toast("Posisi wajib disimpan", "success"); }
        catch (e) { b.disabled = false; $("bc-er").textContent = e.message; }
      };
    }
    function sync() { $("bg-side").querySelectorAll(".bgm-cr").forEach(function (r) { var i = +r.getAttribute("data-i"); r.querySelectorAll("[data-f]").forEach(function (inp) { list[i][inp.getAttribute("data-f")] = inp.value; }); }); }
    draw();
  }
})();
