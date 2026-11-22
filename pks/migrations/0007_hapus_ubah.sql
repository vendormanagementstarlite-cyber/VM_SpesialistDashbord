-- Hapus perjanjian dari aplikasi (Akun Utama). Pengaman lama tetap berlaku: dokumen dan jejak audit tidak bisa dihapus,
-- KECUALI perjanjian yang sedang ditandai di pks_hapus (diisi dan dikosongkan dalam satu batch oleh fungsi hapus).
CREATE TABLE IF NOT EXISTS pks_hapus (perjanjian_id TEXT PRIMARY KEY);
DROP TRIGGER IF EXISTS trg_pks_dokumen_nodelete;
CREATE TRIGGER trg_pks_dokumen_nodelete BEFORE DELETE ON pks_dokumen
WHEN NOT EXISTS (SELECT 1 FROM pks_hapus WHERE perjanjian_id = OLD.perjanjian_id)
BEGIN SELECT RAISE(ABORT, 'Dokumen tidak boleh dihapus'); END;
DROP TRIGGER IF EXISTS trg_pks_audit_nodelete;
CREATE TRIGGER trg_pks_audit_nodelete BEFORE DELETE ON pks_audit
WHEN OLD.perjanjian_id IS NULL OR NOT EXISTS (SELECT 1 FROM pks_hapus WHERE perjanjian_id = OLD.perjanjian_id)
BEGIN SELECT RAISE(ABORT, 'Audit log tidak dapat dihapus'); END;
