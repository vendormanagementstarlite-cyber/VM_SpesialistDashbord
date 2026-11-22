import zipfile, re, shutil, sys
# Hapus jangkar komentar Word agar catatan internal template tidak ikut ke dokumen.
for f in sys.argv[1:]:
    zin = zipfile.ZipFile(f); out = f + '.tmp'; zout = zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED)
    for it in zin.infolist():
        data = zin.read(it.filename)
        if it.filename == 'word/document.xml':
            s = data.decode('utf8')
            s = re.sub(r'<w:commentRangeStart[^>]*/>|<w:commentRangeEnd[^>]*/>', '', s)
            s = re.sub(r'<w:r(?: [^>]*)?>(?:(?!</w:r>).)*?<w:commentReference[^>]*/>(?:(?!</w:r>).)*?</w:r>', '', s, flags=re.S)
            assert not re.search(r'\{\{\w*<', s), 'token terpecah'
            data = s.encode('utf8')
        zout.writestr(it, data)
    zout.close(); zin.close(); shutil.move(out, f)
