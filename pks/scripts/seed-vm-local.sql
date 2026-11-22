-- HANYA untuk pengujian lokal: tiruan struktur tabel mitra starlite-vm.
CREATE TABLE IF NOT EXISTS mitra ("source_row" INTEGER PRIMARY KEY, "nama_singkat" TEXT, "nama_perusahaan" TEXT, "jenis_mitra" TEXT, "alamat" TEXT, "direksi" TEXT, "telepon" TEXT, "email" TEXT, "kontak_lain" TEXT, "status_mitra" TEXT);
DELETE FROM mitra;
INSERT INTO mitra VALUES
 (94,'DESNARUM JAYA AKASHA','PT DESNARUM JAYA AKASHA','Local Mitra','Jakarta','Direktur Uji','0812','desnarum.jayaakasha@gmail.com ; support@ranet.id','','Aktif'),
 (126,'GENZ PERSADA INDONESIA','PT GENZ PERSADA INDONESIA','Local Mitra','Jakarta','Pasha Rionovan','0812','dhanutriadjie@gmail.com; saniagina17@gmail.com; genzpersadaindonesia@gmail.com','','Tidak Aktif'),
 (241,'PERSONEL ALIH DAYA','PT PERSONEL ALIH DAYA','Local Mitra','Jakarta','Direktur Uji','0812','cahyanul.uswah@persada.id <cahyanul.uswah@persada.id>','','Aktif'),
 (336,'TRIZA PRATAMA','CV TRIZA PRATAMA','Local Mitra','Bandung','Direktur Uji','0812','aderahmat1266@gmail.com ; ugungunawan511@gmail.com','','Aktif'),
 (400,'LENTERA DIGITAL NUSANTARA','PT LENTERA DIGITAL NUSANTARA','ISP Akuisisi',NULL,NULL,NULL,NULL,NULL,NULL);
INSERT INTO mitra VALUES
 (167,'KASIH RAJAWALI SEJAHTERA','PT KASIH RAJAWALI SEJAHTERA','Local Mitra','Depok','Direktur Uji','0812','maza@ptkrs.test','','Aktif'),
 (378,'PANCA BASWARA SAKTI','PT PANCA BASWARA SAKTI','Local Mitra','Bekasi','Direktur Uji','0812','admin@pbsgroup.test, anggi@pbsgroup.test','','Aktif'),
 (358,'KRESA UTAMA MANDIRI','PT. KRESA UTAMA MANDIRI','Local Mitra','Tangerang','Direktur Uji','0812','kum@kresa.test','','Aktif'),
 (271,'SALWA CITRA MANDIRI','PT SALWA CITRA MANDIRI','Local Mitra','Bogor','Direktur Uji','0812','project@salwa.test','','Aktif'),
 (316,'TELKOM AKSES','PT TELKOM AKSES','Local Mitra','Jakarta','Direktur Uji','0812','loly@telkomakses.test','','Tidak Aktif');
INSERT INTO mitra VALUES
 (900,'MITRA UJI NON INNER','PT MITRA UJI NON INNER','Local Mitra','Surabaya','Direktur Uji','0812','uji@nonic.test','','Aktif'),
 (901,'MITRA UJI TANPA EMAIL','PT MITRA UJI TANPA EMAIL','Local Mitra','Medan',NULL,NULL,NULL,NULL,'Aktif');
