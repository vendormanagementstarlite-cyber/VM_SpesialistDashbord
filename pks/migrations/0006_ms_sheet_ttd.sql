-- Tahap perjanjian berikutnya:
-- 1) Jenis baru PKS MS & SPK MS (satu paket, dua dokumen digabung jadi satu PDF).
-- 2) Data perjanjian disalin ke spreadsheet (VM Starlite Sheet: "PKS PJ" / "PKS MS & SPK MS"). Dokumen tetap di Cloudflare.
-- 3) Admin TTD: pengejar tanda tangan, masuk tanpa akun dashboard (email + PIN).
INSERT OR IGNORE INTO pks_jenis (kode, nama, posisi_ttd, masa_bulan) VALUES
  ('MS', 'PKS MS & SPK MS', '{"mitra":{"page":-1,"x":345,"y":540,"w":130},"ije":{"page":-1,"x":70,"y":540,"w":130}}', 60);
UPDATE pks_jenis SET nama = 'Perjanjian Homepass (PKS PJ)' WHERE kode = 'PKS';

ALTER TABLE pks_perjanjian ADD COLUMN nomor_spk TEXT;       -- khusus MS: nomor SPK MS (nomor_surat = nomor PKS MS)
ALTER TABLE pks_perjanjian ADD COLUMN sub_progres TEXT;     -- status rinci di dalam tahap, mis. 'PROSES SIGN IJE'
ALTER TABLE pks_perjanjian ADD COLUMN remark_vm TEXT;       -- catatan VM (REMARK / REMARK SANS)
ALTER TABLE pks_perjanjian ADD COLUMN remark_legal TEXT;    -- catatan Legal (REMARK LEGAL IJE)
ALTER TABLE pks_perjanjian ADD COLUMN sheet_status TEXT;    -- antre | ok | gagal: ...
ALTER TABLE pks_perjanjian ADD COLUMN sheet_waktu TEXT;
CREATE INDEX idx_pks_perjanjian_sheet ON pks_perjanjian(sheet_status);

CREATE TABLE pks_ttd_admin (
  email TEXT PRIMARY KEY,
  nama TEXT NOT NULL,
  aktif INTEGER NOT NULL DEFAULT 1,
  hp TEXT,
  pin_hash TEXT,
  gagal INTEGER NOT NULL DEFAULT 0,
  terkunci_sampai TEXT,
  dibuat_pada TEXT NOT NULL
);
CREATE TABLE pks_ttd_sesi (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  kedaluwarsa TEXT NOT NULL
);
