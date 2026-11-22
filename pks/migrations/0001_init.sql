-- Starlite: database starlite-pks. Data info perseroan TIDAK disimpan di sini (dibaca dari starlite-vm.mitra).

CREATE TABLE pks_pengguna (
  email TEXT PRIMARY KEY,
  nama TEXT NOT NULL,
  peran TEXT NOT NULL CHECK (peran IN ('admin','vm','legal','manajemen')),
  penandatangan INTEGER NOT NULL DEFAULT 0,
  aktif INTEGER NOT NULL DEFAULT 1,
  dibuat_pada TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE pks_konfig (k TEXT PRIMARY KEY, v TEXT NOT NULL);

CREATE TABLE pks_jenis (
  kode TEXT PRIMARY KEY,
  nama TEXT NOT NULL,
  posisi_ttd TEXT NOT NULL,            -- JSON {"mitra":{page,x,y,w},"ije":{page,x,y,w}} satuan point PDF
  masa_bulan INTEGER NOT NULL DEFAULT 12
);

CREATE TABLE pks_perjanjian (
  id TEXT PRIMARY KEY,
  kode TEXT NOT NULL UNIQUE,
  mitra_row INTEGER NOT NULL,          -- = starlite-vm.mitra.source_row
  snapshot_mitra TEXT NOT NULL,        -- JSON salinan info perseroan saat dibuat/dikirim
  jenis TEXT NOT NULL REFERENCES pks_jenis(kode),
  judul TEXT NOT NULL,
  nomor_surat TEXT UNIQUE,
  tahap INTEGER NOT NULL DEFAULT 0 CHECK (tahap BETWEEN 0 AND 7),
  status TEXT NOT NULL DEFAULT 'draf',
  pic_vm TEXT NOT NULL,
  tenggat TEXT,
  tgl_efektif TEXT,
  tgl_berakhir TEXT,
  drive_folder_id TEXT,
  gmail_thread_id TEXT,
  gmail_last_check TEXT,
  alasan_batal TEXT,
  dibuat_pada TEXT NOT NULL,
  diperbarui_pada TEXT NOT NULL
);
CREATE INDEX idx_pks_perjanjian_status ON pks_perjanjian(status, tahap);
CREATE INDEX idx_pks_perjanjian_mitra ON pks_perjanjian(mitra_row);

CREATE TABLE pks_tahap (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  perjanjian_id TEXT NOT NULL REFERENCES pks_perjanjian(id),
  tahap INTEGER NOT NULL,
  mulai TEXT NOT NULL,
  selesai TEXT,
  tenggat TEXT,
  pic TEXT,
  catatan TEXT
);
CREATE INDEX idx_pks_tahap_p ON pks_tahap(perjanjian_id, tahap);

CREATE TABLE pks_dokumen (
  id TEXT PRIMARY KEY,
  perjanjian_id TEXT NOT NULL REFERENCES pks_perjanjian(id),
  jenis TEXT NOT NULL CHECK (jenis IN ('master','bernomor','ttd_mitra','final','lampiran')),
  versi INTEGER NOT NULL,
  penanda TEXT CHECK (penanda IN ('hasil_tempel','scan_asli') OR penanda IS NULL),
  nama TEXT NOT NULL,
  mime TEXT NOT NULL,
  ukuran INTEGER NOT NULL,
  halaman INTEGER,
  sha256 TEXT NOT NULL,
  storage TEXT NOT NULL,               -- 'drive' | 'dev'
  storage_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'aktif' CHECK (status IN ('aktif','menunggu_review','ditolak','tidak_sesuai')),
  pengunggah TEXT NOT NULL,
  dibuat_pada TEXT NOT NULL
);
CREATE INDEX idx_pks_dokumen_p ON pks_dokumen(perjanjian_id, jenis, versi);
-- Dokumen tidak boleh diubah isinya; hanya status yang boleh berubah.
CREATE TRIGGER trg_pks_dokumen_lock BEFORE UPDATE OF sha256, storage_id, nama, ukuran, jenis, versi ON pks_dokumen
BEGIN SELECT RAISE(ABORT, 'Dokumen terkunci: buat versi baru'); END;
CREATE TRIGGER trg_pks_dokumen_nodelete BEFORE DELETE ON pks_dokumen
BEGIN SELECT RAISE(ABORT, 'Dokumen tidak boleh dihapus'); END;

-- Penyimpanan cadangan khusus mode pengembangan (tanpa kredensial Google). Produksi memakai Google Drive.
CREATE TABLE pks_blob (id TEXT PRIMARY KEY, data BLOB NOT NULL);

CREATE TABLE pks_feedback (
  id TEXT PRIMARY KEY,
  perjanjian_id TEXT NOT NULL REFERENCES pks_perjanjian(id),
  putaran INTEGER NOT NULL,
  sumber TEXT NOT NULL CHECK (sumber IN ('portal','email','vm')),
  pengirim TEXT,
  isi TEXT NOT NULL,
  setuju INTEGER NOT NULL DEFAULT 0,
  ext_id TEXT UNIQUE,                  -- id pesan Gmail agar tidak tercatat ganda
  diterima_pada TEXT NOT NULL
);

CREATE TABLE pks_email_log (
  id TEXT PRIMARY KEY,
  perjanjian_id TEXT,
  tipe TEXT NOT NULL,
  penerima TEXT NOT NULL,
  subjek TEXT NOT NULL,
  mode TEXT NOT NULL,                  -- 'gmail' | 'simulasi'
  status TEXT NOT NULL,                -- 'terkirim' | 'gagal'
  thread_id TEXT,
  message_id TEXT,
  galat TEXT,
  waktu TEXT NOT NULL
);

CREATE TABLE pks_token (
  token_hash TEXT PRIMARY KEY,
  perjanjian_id TEXT NOT NULL REFERENCES pks_perjanjian(id),
  tujuan TEXT NOT NULL CHECK (tujuan IN ('feedback','ttd','salinan')),
  kedaluwarsa TEXT NOT NULL,
  dicabut INTEGER NOT NULL DEFAULT 0,
  dibuat_pada TEXT NOT NULL
);

CREATE TABLE pks_pengingat (
  perjanjian_id TEXT NOT NULL,
  tahap INTEGER NOT NULL,
  jenis TEXT NOT NULL,                 -- 'h3' | 'h0' | 'telat' | 'berakhir90' | 'berakhir60' | 'berakhir30'
  dikirim_pada TEXT NOT NULL,
  PRIMARY KEY (perjanjian_id, tahap, jenis)
);

CREATE TABLE pks_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  waktu TEXT NOT NULL,
  aktor TEXT NOT NULL,
  perjanjian_id TEXT,
  aksi TEXT NOT NULL,
  data TEXT
);
CREATE INDEX idx_pks_audit_p ON pks_audit(perjanjian_id, id);
CREATE TRIGGER trg_pks_audit_noupdate BEFORE UPDATE ON pks_audit BEGIN SELECT RAISE(ABORT, 'Audit log tidak dapat diubah'); END;
CREATE TRIGGER trg_pks_audit_nodelete BEFORE DELETE ON pks_audit BEGIN SELECT RAISE(ABORT, 'Audit log tidak dapat dihapus'); END;

-- Data awal
INSERT INTO pks_pengguna (email, nama, peran, penandatangan) VALUES
  ('vendormanagement@pmosurge.co.id', 'Vendor Management', 'admin', 1);

INSERT INTO pks_konfig (k, v) VALUES
  ('sla_hari_kerja', '{"1":5,"2":2,"3":3,"4":1,"5":5,"6":3}'),
  ('format_nomor', '^.{3,80}$'),
  ('token_hari', '30'),
  ('batch_awal', '[94,102,167,358,187,400,378,395,337,336,275,271,241,230,195,86,70,50,32,316,365,205,207,93,112,43,110,175,104,374,381,143,397,169,388,126]');

INSERT INTO pks_jenis (kode, nama, posisi_ttd, masa_bulan) VALUES
  ('PKS', 'Perjanjian Kerja Sama Jasa',
   '{"mitra":{"page":-1,"x":60,"y":110,"w":170},"ije":{"page":-1,"x":360,"y":110,"w":170}}', 12);
