import docx, re
from tag import *
d = docx.Document('pks.docx')
used = []; seen = set(); keep = []; t0 = []
for p in all_pars(d):
    if id(p._p) in seen: continue
    seen.add(id(p._p)); keep.append(p._p)
    t = p.text
    if re.fullmatch(r'\s*\[_{10,}\]\s*', t) and not t0 and 'nama' not in used:
        tag_par(p, ['nama'], used); continue
    if '/PKS/LGL/IJE-' in t and t.strip().startswith('No'):
        runs = p.runs; start = None
        for i, r in enumerate(runs):
            if r.text.startswith('[') or (is_hl(r) and start is None):
                start = i; break
        for i, r in enumerate(runs[start:]):
            r.text = '{{nomor}}' if i == 0 else ''
            unhl(r)
        used.append('nomor'); continue
    if 'dibuat dan disepakati pada hari ini' in t:
        tag_par(p, ['hari', 'tgl', 'bulan', '', 'tahun_kata', 'dd', 'mm', 'y1'], used); continue
    if 'suatu badan hukum' in t and t.lstrip().startswith('['):
        tag_par(p, ['nama', 'domisili', 'penandatangan', 'jabatan'], used); continue
    if t.strip() == '[_________________]':
        t0.append(p)
    if t.strip() in ('[_____________________]',): tag_par(p, ['nama'], used); continue
    if t.strip() == '[_______________]': tag_par(p, ['penandatangan'], used); continue
    if t.strip() == '[____________]': tag_par(p, ['jabatan'], used); continue
for p, tok in zip(t0, ['alamat', 'telp', 'email', 'up']):
    tag_par(p, [tok], used)
d.save('pks-ms.docx')
print(used)
