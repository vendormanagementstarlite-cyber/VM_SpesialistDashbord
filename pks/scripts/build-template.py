#!/usr/bin/env python3
"""Bangun templates PKS: docx -> PDF (LibreOffice) -> posisi isian kuning -> src/templates/pks-jasa.js.
Pakai: python3 scripts/build-template.py   (butuh soffice dan pdfplumber; hanya saat template Word berubah)"""
import base64, json, os, subprocess, sys, tempfile, pdfplumber

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCX = os.path.join(ROOT, 'templates', 'pks-jasa.docx')
# Urutan isian kuning pada dokumen (halaman, atas ke bawah, kiri ke kanan). Satu kunci boleh dipakai berkali-kali.
URUTAN = ['nama', 'nomor', 'hari', 'tgl', 'bulan', 'dd', 'mm', 'nama', 'domisili', 'wakil', 'jabatan',
          'alamat', 'telp', 'email', 'up', 'nama', 'wakil', 'jabatan']
TENGAH = {'hari', 'tgl', 'bulan', 'dd', 'mm', 'domisili', 'wakil', 'jabatan'}  # isian di tengah kalimat (halaman 1) rata tengah
tmp = tempfile.mkdtemp()
subprocess.run(['soffice', '--headless', '--convert-to', 'pdf', '--outdir', tmp, DOCX], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
pdfp = os.path.join(tmp, 'pks-jasa.pdf')
KUNING = [(1, 1, 0), (1.0, 1.0, 0.0), [1, 1, 0]]
bidang = []
with pdfplumber.open(pdfp) as pdf:
    jml = len(pdf.pages)
    for i, pg in enumerate(pdf.pages):
        rs = sorted([r for r in pg.rects if r.get('non_stroking_color') in KUNING], key=lambda r: (round(r['top']), r['x0']))
        for r in rs:
            cs = [c for c in pg.chars if c['x0'] >= r['x0'] - 1 and c['x1'] <= r['x1'] + 1 and c['top'] >= r['top'] - 2 and c['bottom'] <= r['bottom'] + 2]
            c0 = cs[0] if cs else None
            # Kurung siku di sekitar isian ikut diganti (tidak ikut ter-highlight pada sebagian isian)
            x0, x1 = r['x0'], r['x1']
            for c in pg.chars:
                if abs(c['top'] - r['top']) < 4:
                    if c['text'] == '[' and abs(c['x1'] - r['x0']) < 2: x0 = min(x0, c['x0'])
                    if c['text'] == ']' and abs(c['x0'] - r['x1']) < 2: x1 = max(x1, c['x1'])
            bidang.append(dict(hal=i, x0=round(x0, 2), x1=round(x1, 2), atas=round(pg.height - r['top'], 2), bawah=round(pg.height - r['bottom'], 2),
                               dasar=round(c0['matrix'][5], 2) if c0 else round(pg.height - r['bottom'] + 3, 2),
                               ukuran=round(c0['size'], 2) if c0 else 10, tebal=bool(c0 and 'Bold' in c0['fontname'])))
if len(bidang) != len(URUTAN):
    sys.exit(f'Jumlah isian kuning {len(bidang)} tidak sama dengan peta {len(URUTAN)}; perbarui URUTAN')
for i, (b, k) in enumerate(zip(bidang, URUTAN)):
    b['kunci'] = k
    b['rata'] = 'tengah' if (i == 0 or (b['hal'] == 0 and k in TENGAH)) else 'kiri'
    if k in ('wakil', 'jabatan') and b['hal'] == 18: b['garis'] = (k == 'wakil')
    # Isian di blok tanda tangan dan Pasal 24 boleh melebar ke kanan sampai margin
    if b['hal'] in (16, 18): b['x1maks'] = 500
pdfb = open(pdfp, 'rb').read()
out = os.path.join(ROOT, 'src', 'templates', 'pks-jasa.js')
with open(out, 'w') as f:
    f.write('// DIHASILKAN oleh scripts/build-template.py dari templates/pks-jasa.docx. Jangan diubah manual.\n')
    f.write(f'export const HALAMAN = {jml};\nexport const BIDANG = {json.dumps(bidang, indent=1)};\n')
    f.write("const B64 = '" + base64.b64encode(pdfb).decode() + "';\n")
    f.write("export const pdfBytes = () => Uint8Array.from(atob(B64), (c) => c.charCodeAt(0));\n")
print('OK', jml, 'halaman,', len(bidang), 'isian,', len(pdfb), 'byte PDF')
