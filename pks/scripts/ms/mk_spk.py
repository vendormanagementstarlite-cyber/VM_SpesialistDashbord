import docx, re
from tag import *
d = docx.Document('spk.docx')
used = []; seen = set(); keep = []; alamat = 0
def merge_brackets(p):
    # gabungkan «...» / [***] yang terpecah ke beberapa run menjadi satu run
    runs = p.runs
    i = 0
    while i < len(runs):
        t = runs[i].text
        if ('«' in t and '»' not in t) or (t.endswith('[') ):
            j = i + 1; acc = t
            while j < len(runs) and not ('»' in acc or acc.endswith(']')):
                acc += runs[j].text; runs[j].text = ''; j += 1
            runs[i].text = acc
        i += 1
for p in all_pars(d):
    if id(p._p) in seen: continue
    seen.add(id(p._p)); keep.append(p._p)
    strip_fields(p)
    t = p.text.strip()
    if not t: continue
    def put(toks):
        merge_brackets(p)
        for r in p.runs:
            s = r.text
            for m in re.findall(r'«[^»]+»|\[\*\*\*\]|\[___\]|___', s):
                if not toks: break
                tok = toks.pop(0)
                s = s.replace(m, '{{%s}}' % tok, 1); used.append(tok)
            if s != r.text: r.text = s; unhl(r)
    if t == 'No: [***]': put(['nomor_spk']); continue
    if t.startswith('Jakarta,') and '«Start_MS»' in t: put(['tgl_spk_teks']); continue
    if t == '«Status»' : put(['jabatan']); continue
    if t.startswith('«Nama_Mitra» (“MITRA”)') or t.startswith('«Nama_Mitra» ("MITRA")'): put(['nama']); continue
    if t == '[***]' and alamat < 2: alamat += 1; put(['alamat%d' % alamat]); continue
    if t.startswith('Merujuk pada'): put(['nomor', 'tgl_pks_teks', 'nama']); continue
    if t.startswith('Nomor Rekening'): put(['no_rek']); continue
    if t.startswith('Nama Bank'): put(['bank']); continue
    if t.startswith('Cabang'): put(['cabang']); continue
    if t.startswith('Atas Nama'): put(['atas_nama']); continue
    if t.startswith('Alamat Lengkap'): put(['gudang_alamat']); continue
    if re.match(r'Kota\s*:', t): put(['gudang_kota']); continue
    if t == '«Nama_Mitra»': put(['nama']); continue
    if t == '«Direktur_Utama»': put(['penandatangan']); continue
# lead time IKR (tabel 2, baris 1, kolom 4)
c = d.tables[2].rows[1].cells[3]
for p in c.paragraphs:
    for r in p.runs:
        if r.text.strip() == 'jam': r.text = r.text.replace('jam', '{{lead_ikr}} jam'); used.append('lead_ikr'); unhl(r)
d.save('spk-ms.docx')
print(used)
