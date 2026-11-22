-- Login Starlite memakai database ini (menggantikan Cloudflare Access).
ALTER TABLE pks_pengguna ADD COLUMN password_hash TEXT;               -- pbkdf2$iterasi$garam$hash
ALTER TABLE pks_pengguna ADD COLUMN wajib_ganti INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pks_pengguna ADD COLUMN gagal_login INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pks_pengguna ADD COLUMN terkunci_sampai TEXT;

CREATE TABLE pks_sesi (
  id TEXT PRIMARY KEY,                 -- SHA-256 dari token cookie (token asli tidak disimpan)
  email TEXT NOT NULL REFERENCES pks_pengguna(email),
  dibuat_pada TEXT NOT NULL,
  kedaluwarsa TEXT NOT NULL
);
CREATE INDEX idx_pks_sesi_email ON pks_sesi(email);
