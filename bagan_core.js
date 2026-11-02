/* STARLITE · Bagan Struktur Mitra — penggambar bagan + unduh PNG/PDF (dipakai form mitra dan Info Perseroan) */
(function (g) {
  "use strict";
  var W = 176, GX = 20, GY = 46, TXT = "#0f172a", MUT = "#64748b", ACC = "#0b5cad";
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function cut(s, n) { s = String(s || ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; }
  function lines(p) {
    var o = (p.orang || []).filter(function (x) { return x.nama; }), out = [];
    if (p.ket === "kosong" || !o.length) return [{ t: "(posisi kosong)", m: 1 }];
    o.slice(0, 3).forEach(function (x) { out.push({ t: x.nama }); });
    if (o.length > 3) out.push({ t: "+" + (o.length - 3) + " orang", m: 1 });
    var sites = {}; o.forEach(function (x) { (x.site || []).forEach(function (s) { sites[s] = 1; }); });
    var ns = Object.keys(sites).length;
    if (ns) out.push({ t: o.length + " orang · " + ns + " site", m: 1 });
    return out;
  }
  function layout(data) {
    var P = (data && data.posisi) || [], by = {}, kids = {}, root = null;
    P.forEach(function (p) { by[p.id] = p; kids[p.id] = []; });
    P.forEach(function (p) { if (p.atasan && by[p.atasan]) kids[p.atasan].push(p); else if (!root) root = p; });
    if (!root) return null;
    var maxL = 1; P.forEach(function (p) { maxL = Math.max(maxL, lines(p).length); });
    var H = 40 + 14 * maxL, sw = {}, seen = {};
    (function calc(n) { seen[n.id] = 1; var k = kids[n.id].filter(function (c) { return !seen[c.id]; }); kids[n.id] = k; var s = 0; k.forEach(function (c) { calc(c); s += sw[c.id]; }); s += GX * Math.max(0, k.length - 1); sw[n.id] = Math.max(W, s); })(root);
    var nodes = [], edges = [], maxD = 0;
    (function place(n, left, d) {
      var cx = left + sw[n.id] / 2, y = 20 + d * (H + GY); maxD = Math.max(maxD, d);
      nodes.push({ p: n, x: cx - W / 2, y: y, cx: cx, d: d });
      var k = kids[n.id], x = left + (sw[n.id] - (k.reduce(function (a, c) { return a + sw[c.id]; }, 0) + GX * Math.max(0, k.length - 1))) / 2;
      k.forEach(function (c) { edges.push([n.id, c.id]); place(c, x, d + 1); x += sw[c.id] + GX; });
    })(root, 20, 0);
    return { nodes: nodes, edges: edges, H: H, w: sw[root.id] + 40, h: 40 + (maxD + 1) * (H + GY) - GY };
  }
  function render(data, o) {
    o = o || {}; var L = layout(data);
    if (!L) return { svg: "", w: 0, h: 0, count: 0 };
    var pos = {}; L.nodes.forEach(function (n) { pos[n.p.id] = n; });
    var s = "";
    L.edges.forEach(function (e) { var a = pos[e[0]], b = pos[e[1]], my = (a.y + L.H + b.y) / 2; s += '<path d="M' + a.cx + " " + (a.y + L.H) + "V" + my + "H" + b.cx + "V" + b.y + '" fill="none" stroke="#94a3b8" stroke-width="1.4"/>'; });
    var BAND = ["#0b2447", "#0b5cad", "#2b7bd0", "#4f9be4"];
    L.nodes.forEach(function (n) {
      var p = n.p, em = p.ket === "kosong", ls = lines(p), bc = em ? "#cbd5e1" : BAND[Math.min(n.d, 3)], tc = em ? "#475569" : "#fff";
      s += '<g data-id="' + esc(p.id) + '"><rect x="' + n.x + '" y="' + n.y + '" width="' + W + '" height="' + L.H + '" rx="9" fill="' + (em ? "#f8fafc" : "#fff") + '" stroke="' + (em ? "#94a3b8" : bc) + '" stroke-width="1.3"' + (em ? ' stroke-dasharray="5 4"' : "") + "/>" +
        '<path d="M' + n.x + " " + (n.y + 28) + "V" + (n.y + 9) + "a9 9 0 0 1 9 -9H" + (n.x + W - 9) + "a9 9 0 0 1 9 9V" + (n.y + 28) + 'Z" fill="' + bc + '"/>' +
        '<text x="' + (n.x + 12) + '" y="' + (n.y + 18.5) + '" font-size="12" font-weight="700" fill="' + tc + '">' + esc(cut(p.jabatan, 24)) + "</text>";
      ls.forEach(function (l, i) { s += '<text x="' + (n.x + 12) + '" y="' + (n.y + 46 + i * 14) + '" font-size="11" fill="' + (l.m ? MUT : TXT) + '"' + (l.m ? ' font-style="italic"' : "") + ">" + esc(cut(l.t, 27)) + "</text>"; });
      s += "</g>";
    });
    var top = o.title ? 38 : 0, w = Math.max(L.w, 360), h = L.h + top;
    var head = o.title ? '<text x="20" y="22" font-size="15" font-weight="700" fill="' + TXT + '">' + esc(o.title) + '</text><text x="20" y="36" font-size="10.5" fill="' + MUT + '">' + esc(o.sub || "") + "</text>" : "";
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + " " + h + '" width="' + w + '" height="' + h + '" font-family="Segoe UI,Arial,sans-serif"><rect width="100%" height="100%" fill="#fff"/>' + head + '<g transform="translate(0 ' + top + ')">' + s + "</g></svg>";
    return { svg: svg, w: w, h: h, count: L.nodes.length };
  }
  function toPNG(r, scale) {
    return new Promise(function (ok, no) {
      var im = new Image(), sc = scale || 2;
      im.onload = function () { var c = document.createElement("canvas"); c.width = r.w * sc; c.height = r.h * sc; var x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.drawImage(im, 0, 0, c.width, c.height); c.toBlob(function (b) { b ? ok(b) : no(new Error("Gagal membuat PNG")); }, "image/png"); };
      im.onerror = function () { no(new Error("Gagal membuat gambar bagan")); };
      im.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(r.svg);
    });
  }
  function loadJsPdf() {
    if (g.jspdf) return Promise.resolve();
    return new Promise(function (ok, no) { var s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"; s.onload = ok; s.onerror = function () { no(new Error("Gagal memuat pustaka PDF")); }; document.head.appendChild(s); });
  }
  function pdf(data, meta) {
    meta = meta || {};
    return loadJsPdf().then(function () {
      var r = render(data, { title: meta.nama + " — Struktur Organisasi", sub: "STARLITE · " + (meta.ver ? "Versi " + meta.ver + " · " : "") + (meta.tgl || "") });
      return toPNG(r, 2).then(function (blob) { return new Promise(function (ok) { var fr = new FileReader(); fr.onload = function () { ok(fr.result); }; fr.readAsDataURL(blob); }); }).then(function (url) {
        var fmt = r.count > 25 ? "a3" : "a4", d = new g.jspdf.jsPDF({ orientation: "landscape", unit: "pt", format: fmt }), pw = d.internal.pageSize.getWidth(), ph = d.internal.pageSize.getHeight(), m = 24;
        var k = Math.min((pw - 2 * m) / r.w, (ph - 2 * m) / r.h); d.addImage(url, "PNG", m, m, r.w * k, r.h * k);
        d.addPage("a4", "portrait"); var y = 50, lh = 13; d.setFontSize(13); d.setFont(undefined, "bold"); d.text("Daftar personel — " + (meta.nama || ""), 40, y); y += 22;
        (data.posisi || []).forEach(function (p) {
          var rows = (p.orang || []).filter(function (o) { return o.nama; });
          if (y > 780) { d.addPage("a4", "portrait"); y = 50; }
          d.setFont(undefined, "bold"); d.setFontSize(10.5); d.text(p.jabatan + (p.level ? " (" + p.level + ")" : ""), 40, y); y += lh;
          d.setFont(undefined, "normal"); d.setFontSize(9.5);
          if (!rows.length) { d.text("Posisi kosong", 52, y); y += lh; }
          rows.forEach(function (o) { if (y > 800) { d.addPage("a4", "portrait"); y = 50; } d.text(cut(o.nama, 34) + "   " + (o.hp || "-") + (o.site && o.site.length ? "   Site: " + cut(o.site.join(", "), 60) : ""), 52, y); y += lh; });
          y += 6;
        });
        return d.output("blob");
      });
    });
  }
  function save(blob, name) { var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500); }
  function diff(a, b) {
    var A = {}, B = {}, out = []; ((a && a.posisi) || []).forEach(function (p) { A[p.id] = p; }); ((b && b.posisi) || []).forEach(function (p) { B[p.id] = p; });
    function who(p) { return (p.orang || []).map(function (o) { return o.nama + (o.site && o.site.length ? " [" + o.site.join(", ") + "]" : ""); }).join("; "); }
    Object.keys(B).forEach(function (id) { var n = B[id], o = A[id]; if (!o) { out.push(["+", "Posisi baru: " + n.jabatan + (who(n) ? " — " + who(n) : "")]); return; }
      if (o.jabatan !== n.jabatan) out.push(["~", "Jabatan: " + o.jabatan + " → " + n.jabatan]);
      if (o.atasan !== n.atasan) out.push(["~", n.jabatan + ": atasan berubah"]);
      if ((o.ket || "aktif") !== (n.ket || "aktif")) out.push(["~", n.jabatan + ": " + o.ket + " → " + n.ket]);
      if (who(o) !== who(n)) out.push(["~", n.jabatan + ": " + (who(o) || "kosong") + " → " + (who(n) || "kosong")]); });
    Object.keys(A).forEach(function (id) { if (!B[id]) out.push(["-", "Posisi dihapus: " + A[id].jabatan]); });
    return out;
  }
  g.BG = { render: render, png: toPNG, pdf: pdf, save: save, diff: diff, esc: esc };
})(window);
