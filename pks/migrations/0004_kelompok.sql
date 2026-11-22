-- Kelompok mitra (mis. Inner City). Data mitra tetap dari info perseroan (starlite-vm, hanya baca);
-- tabel ini hanya menyimpan nomor baris mitra yang masuk kelompok.
CREATE TABLE pks_mitra_kelompok (
  source_row INTEGER NOT NULL,
  kelompok TEXT NOT NULL,
  nama_acuan TEXT NOT NULL,
  dicocokkan_pada TEXT NOT NULL,
  PRIMARY KEY (source_row, kelompok)
);
CREATE TABLE pks_kelompok_acuan (
  kelompok TEXT NOT NULL,
  nama_acuan TEXT NOT NULL,
  source_row INTEGER,                 -- NULL = belum ketemu di info perseroan
  catatan TEXT,
  PRIMARY KEY (kelompok, nama_acuan)
);
