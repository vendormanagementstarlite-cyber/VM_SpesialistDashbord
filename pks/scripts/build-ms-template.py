#!/usr/bin/env python3
"""Bangun template PKS MS & SPK MS bertanda {{kunci}} dari dokumen Word asli (bagian kuning).
Pemakaian: python3 scripts/build-ms-template.py "PKS MS.docx" "SPK MS.docx"
Menghasilkan templates/pks-ms.docx, templates/spk-ms.docx, dan src/templates/ms-docx.js.
Butuh: pip install python-docx
"""
import sys, os, shutil, subprocess, base64
here = os.path.dirname(os.path.abspath(__file__))
work = os.path.join(here, '_ms_tmp'); os.makedirs(work, exist_ok=True)
shutil.copy(sys.argv[1], os.path.join(work, 'pks.docx')); shutil.copy(sys.argv[2], os.path.join(work, 'spk.docx'))
for f in ('tag.py', 'mk_pks.py', 'mk_spk.py'): shutil.copy(os.path.join(here, 'ms', f), work)
subprocess.check_call([sys.executable, 'mk_pks.py'], cwd=work); subprocess.check_call([sys.executable, 'mk_spk.py'], cwd=work)
subprocess.check_call([sys.executable, os.path.join(here, 'ms', 'bersihkan.py'), 'pks-ms.docx', 'spk-ms.docx'], cwd=work)
root = os.path.dirname(here)
shutil.copy(os.path.join(work, 'pks-ms.docx'), os.path.join(root, 'templates/pks-ms.docx'))
shutil.copy(os.path.join(work, 'spk-ms.docx'), os.path.join(root, 'templates/spk-ms.docx'))
a = base64.b64encode(open(os.path.join(root, 'templates/pks-ms.docx'), 'rb').read()).decode()
b = base64.b64encode(open(os.path.join(root, 'templates/spk-ms.docx'), 'rb').read()).decode()
open(os.path.join(root, 'src/templates/ms-docx.js'), 'w').write("// Dibangun dari templates/pks-ms.docx & templates/spk-ms.docx (isian bertanda {{kunci}}). Jangan diedit manual.\n// Bangun ulang: python3 scripts/build-ms-template.py <PKS MS.docx> <SPK MS.docx>\n" + f"export const PKS_MS_DOCX = '{a}';\nexport const SPK_MS_DOCX = '{b}';\n")
shutil.rmtree(work); print('selesai')
