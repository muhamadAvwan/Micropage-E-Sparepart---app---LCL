/**
 * scripts/addPengajuanLog.js
 * =====================================================================
 * Migrasi ringan & aman (idempotent): menambahkan tabel `pengajuan_log`
 * untuk audit trail approval pada database yang SUDAH ada, tanpa
 * menghapus/menyetel ulang data (tidak seperti `npm run setup`).
 *
 * Jalankan: node scripts/addPengajuanLog.js
 * =====================================================================
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');

const SQL = `
CREATE TABLE IF NOT EXISTS pengajuan_log (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  no_registrasi VARCHAR(50)  NOT NULL,
  actor_id      INT UNSIGNED NULL,
  actor_name    VARCHAR(100) NULL,
  actor_role    VARCHAR(50)  NULL,
  field         VARCHAR(30)  NOT NULL,
  old_value     VARCHAR(50)  NULL,
  new_value     VARCHAR(50)  NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_log_no (no_registrasi),
  KEY idx_log_created (created_at),
  CONSTRAINT fk_log_bq FOREIGN KEY (no_registrasi)
    REFERENCES pengajuan_bq(no_registrasi) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'e_sparepart_local',
  });

  await conn.query(SQL);
  const [[{ n }]] = await conn.query(
    "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'pengajuan_log'"
  );
  console.log(`Tabel pengajuan_log ${n ? 'siap digunakan' : 'GAGAL dibuat'}.`);
  await conn.end();
}

main().catch((err) => {
  console.error('[Migrasi Gagal] ' + err.message);
  process.exit(1);
});
