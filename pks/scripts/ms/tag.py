import docx, re, sys, copy
from docx.enum.text import WD_COLOR_INDEX
from docx.oxml.ns import qn

def is_hl(r):
    h = r.font.highlight_color
    return h is not None and h != WD_COLOR_INDEX.AUTO

def unhl(r):
    rpr = r._r.rPr
    if rpr is not None:
        for e in rpr.findall(qn('w:highlight')): rpr.remove(e)

def strip_fields(par):
    """Hapus struktur field kompleks (MERGEFIELD), sisakan run hasil."""
    p = par._p
    state = None; drop = []
    for r in p.findall(qn('w:r')):
        fc = r.find(qn('w:fldChar'))
        if fc is not None:
            t = fc.get(qn('w:fldCharType'))
            drop.append(r)
            state = {'begin': 'code', 'separate': 'result', 'end': None}[t]
            continue
        if state == 'code': drop.append(r)
    for r in drop: p.remove(r)

def tag_par(par, tokens, used):
    runs = par.runs; k = 0
    for i, r in enumerate(runs):
        if not is_hl(r) and not re.fullmatch(r'«[^»]+»|\[\*\*\*\]', r.text.strip() or 'x'):
            continue
        if k >= len(tokens): break
        tok = tokens[k]; k += 1
        if tok is None: continue          # biarkan apa adanya
        if i > 0 and runs[i-1].text.endswith('['): runs[i-1].text = runs[i-1].text[:-1]
        if i+1 < len(runs) and runs[i+1].text.startswith(']'): runs[i+1].text = runs[i+1].text[1:]
        if tok == '':
            r.text = ''
            if i+1 < len(runs) and runs[i+1].text.startswith(' '): runs[i+1].text = runs[i+1].text[1:]
        else:
            r.text = r.text.replace(r.text.strip(), '{{%s}}' % tok) if r.text.strip().startswith('[') or r.text.strip().startswith('«') else '{{%s}}' % tok
            used.append(tok)
        unhl(r)
    return k

def all_pars(d):
    for p in d.paragraphs: yield p
    for t in d.tables:
        for row in t.rows:
            for c in row.cells:
                for p in c.paragraphs: yield p
