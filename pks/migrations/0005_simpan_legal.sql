-- Berkas tahap tengah disimpan di D1 (potongan <1 MB). Hanya final disalin ke Drive.
CREATE TABLE pks_blob_part (
  id TEXT NOT NULL,
  n INTEGER NOT NULL,
  data BLOB NOT NULL,
  PRIMARY KEY (id, n)
);

-- Tautan khusus Legal (tanpa login): tujuan 'legal'.
CREATE TABLE pks_token_baru (
  token_hash TEXT PRIMARY KEY,
  perjanjian_id TEXT NOT NULL REFERENCES pks_perjanjian(id),
  tujuan TEXT NOT NULL CHECK (tujuan IN ('feedback','ttd','salinan','legal')),
  kedaluwarsa TEXT NOT NULL,
  dicabut INTEGER NOT NULL DEFAULT 0,
  dibuat_pada TEXT NOT NULL
);
INSERT INTO pks_token_baru SELECT token_hash, perjanjian_id, tujuan, kedaluwarsa, dicabut, dibuat_pada FROM pks_token;
DROP TABLE pks_token;
ALTER TABLE pks_token_baru RENAME TO pks_token;

-- Akses Legal: pertama kali email + no HP + PIN 4 angka; selanjutnya cukup PIN.
CREATE TABLE pks_legal_akses (
  email TEXT PRIMARY KEY,
  hp TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  gagal INTEGER NOT NULL DEFAULT 0,
  terkunci_sampai TEXT,
  dibuat_pada TEXT NOT NULL
);
CREATE TABLE pks_legal_sesi (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  perjanjian_id TEXT NOT NULL,
  kedaluwarsa TEXT NOT NULL
);
