-- =====================================================================
-- E-Sparepart Schema (MySQL / XAMPP) - Tahap Testing
-- Diterjemahkan dari struktur riil:
--   users        <- Master DB_User.xlsx
--   spareparts   <- On_Hand_Stock.xlsx + Critical_Part_List.xlsx
--   pengajuan_bq <- Form_BQ_*.xlsx + BQ_Monitoring.xlsx
-- =====================================================================

CREATE DATABASE IF NOT EXISTS e_sparepart
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE e_sparepart;

-- ----------------------------------------------------------------
-- 1) Tabel USERS
--    Kolom bqLink pakai camelCase sesuai struktur spreadsheet lama,
--    selalu kutip dengan backtick di query.
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  username   VARCHAR(50)  NOT NULL,
  password   VARCHAR(255) NOT NULL,            -- sementara plain-text, hashing nanti
  role       VARCHAR(50)  NOT NULL,            -- teknisi / Supervisor 1 / Supervisor 2 / Officer / manager
  name       VARCHAR(100) NOT NULL,
  bqLink     TEXT NULL,                        -- NULL untuk Supervisor/Officer/Manager
  supervisor_id INT UNSIGNED NULL,             -- tim/supervisor yang menaungi teknisi ini
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_users_username (username),
  CONSTRAINT fk_users_supervisor FOREIGN KEY (supervisor_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------
-- 2) Tabel SPAREPARTS
--    qty_on_hand & lokasi_rak <- On_Hand_Stock (Qty, Lokator)
--    min_stock  & max_stock   <- Critical_Part_List (Min Qty, Max Qty)
--    is_critical = 1          <- item ada di Critical_Part_List
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS spareparts (
  item_code   VARCHAR(50)  NOT NULL,           -- PK, contoh: WAPRT0001
  deskripsi   VARCHAR(255) NOT NULL,
  qty_on_hand INT UNSIGNED NOT NULL DEFAULT 0,
  min_stock   INT UNSIGNED NOT NULL DEFAULT 0,
  max_stock   INT UNSIGNED NOT NULL DEFAULT 0,
  is_critical TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '1 = critical part',
  lokasi_rak  VARCHAR(50)  NULL,
  PRIMARY KEY (item_code),
  KEY idx_spareparts_critical (is_critical),
  KEY idx_spareparts_deskripsi (deskripsi)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------
-- 3) Tabel PENGAJUAN_BQ
--    Kolom tambahan (purpose, no_ejo, mesin_area, uom, merk,
--    referensi_penawaran) adalah pemetaan langsung dari Form_BQ_*
--    dan BQ_Monitoring, berguna untuk otomasi form & laporan bulanan.
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pengajuan_bq (
  no_registrasi     VARCHAR(50) NOT NULL,      -- PK, contoh: BQ-0001 / WAPRO0001
  user_id           INT UNSIGNED NOT NULL,     -- FK -> users.id
  item_code         VARCHAR(50) NULL,           -- FK -> spareparts.item_code (NULL jika jasa)
  jenis_pengajuan   ENUM('sparepart','jasa') NOT NULL DEFAULT 'sparepart',
  qty_diminta       INT UNSIGNED NOT NULL DEFAULT 1,
  uom               VARCHAR(20)  NULL,         -- Pcs, Set, dll (kolom Qty/UoM di form)
  spesifikasi_lengkap TEXT NOT NULL,           -- kolom "Spesifikasi (Termasuk tipe)"
  purpose           VARCHAR(100) NULL,
  no_ejo            VARCHAR(30)  NULL,
  mesin_area        VARCHAR(100) NULL,
  merk              VARCHAR(100) NULL,
  referensi_penawaran TEXT NULL,
  urgency           ENUM('Normal','Urgent') NOT NULL DEFAULT 'Normal',
  status_approval_spv VARCHAR(20) NOT NULL DEFAULT 'Menunggu',
      -- nilai: Menunggu | Disetujui | Ditolak  (arahkan dari kolom "Status Approval SPV")
  status_approval_manager VARCHAR(20) NOT NULL DEFAULT 'Menunggu',
      -- nilai: Menunggu | Disetujui | Ditolak  (tahap akhir persetujuan oleh Manager)
  status_pengadaan  VARCHAR(30) NOT NULL DEFAULT 'BQ Baru',
      -- pipeline riil: BQ Baru | Mencari Penawaran | Approval PR | PR Open | PO Open | Deliver | Selesai
  timestamp         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (no_registrasi),
  KEY idx_bq_user (user_id),
  KEY idx_bq_item (item_code),
  KEY idx_bq_jenis (jenis_pengajuan),
  KEY idx_bq_urgency (urgency),
  KEY idx_bq_status_spv (status_approval_spv),
  KEY idx_bq_status_mgr (status_approval_manager),
  KEY idx_bq_status_pengadaan (status_pengadaan),
  CONSTRAINT fk_bq_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_bq_item FOREIGN KEY (item_code)
    REFERENCES spareparts(item_code) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------
-- 4) Tabel PENGAJUAN_LOG (Audit Trail Approval)
--    Mencatat setiap perubahan status: siapa, kapan, field apa,
--    dari nilai apa -> menjadi apa. Wajib untuk keterlacakan (audit).
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pengajuan_log (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  no_registrasi VARCHAR(50)  NOT NULL,
  actor_id      INT UNSIGNED NULL,
  actor_name    VARCHAR(100) NULL,
  actor_role    VARCHAR(50)  NULL,
  field         VARCHAR(30)  NOT NULL,   -- status_approval_spv | status_approval_manager | status_pengadaan
  old_value     VARCHAR(50)  NULL,
  new_value     VARCHAR(50)  NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_log_no (no_registrasi),
  KEY idx_log_created (created_at),
  CONSTRAINT fk_log_bq FOREIGN KEY (no_registrasi)
    REFERENCES pengajuan_bq(no_registrasi) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;