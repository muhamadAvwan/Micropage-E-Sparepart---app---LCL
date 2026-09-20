/**
 * scripts/seedPengajuan.js
 * =====================================================================
 * Mengisi tabel `pengajuan_bq` dengan data pengajuan BQ RIIL dari
 * Salinan_Spreadsheet_Sparepart/Manager/BQ_Monitoring.xlsx.
 *
 * Sumber : sheet "All RO BQ" (Re Order) — 752 baris asli.
 * Catatan: hanya baris yang item_code-nya ADA di tabel `spareparts`
 *          yang diimpor, karena pengajuan_bq punya FOREIGN KEY ke
 *          spareparts(item_code). Baris BR/JA tidak punya item_code
 *          sehingga belum bisa ditampung skema saat ini.
 *
 * Sifat  : idempotent (INSERT IGNORE berdasarkan no_registrasi) —
 *          aman dijalankan berulang, tidak menimpa data yang sudah ada.
 *
 * Jalankan: node scripts/seedPengajuan.js          (impor)
 *           node scripts/seedPengajuan.js --dry    (preview saja)
 * =====================================================================
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const XLSX = require('xlsx');
const mysql = require('mysql2/promise');

const SRC = path.join(
  __dirname, '..', 'Salinan_Spreadsheet_Sparepart', 'Manager', 'BQ_Monitoring.xlsx'
);

const DRY = process.argv.includes('--dry');

// Map nilai mentah spreadsheet -> nilai baku yang dipakai aplikasi.
const SPV_MAP = { approve: 'Disetujui', reject: 'Ditolak', waiting: 'Menunggu' };

function mapSpv(raw) {
  const key = String(raw == null ? '' : raw).trim().toLowerCase();
  return SPV_MAP[key] || 'Menunggu';
}

function norm(v) {
  return String(v == null ? '' : v).trim();
}

// Bersihkan nilai yang dianggap "kosong" di spreadsheet perusahaan.
function clean(v) {
  const t = norm(v);
  if (!t || t === '-' || t === 'N/A' || t.toLowerCase() === 'na') return null;
  return t;
}

function trunc(s, n) {
  const t = norm(s);
  return t.length > n ? t.slice(0, n - 3) + '...' : t;
}

// Konversi serial tanggal Excel (mis. 45678.67) -> Date.
function xlDate(serial) {
  const n = Number(serial);
  if (!Number.isFinite(n) || n <= 0) return null;
  const d = XLSX.SSF.parse_date_code(n);
  if (!d) return null;
  return new Date(d.y, d.m - 1, d.d, d.H, d.M, Math.floor(d.S));
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function sqlDateTime(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ` +
    `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

// Umur pengajuan (hari) dihitung dari selisih tanggal data ke hari ini.
function ageDays(date) {
  return (Date.now() - date.getTime()) / 86400000;
}

// Status approval Manager diturunkan: SPV yang sudah lama disetujui
// diasumsikan sudah lewat approval Manager.
function deriveManager(spv, age) {
  if (spv !== 'Disetujui') return 'Menunggu';
  return age > 14 ? 'Disetujui' : 'Menunggu';
}

// Status pipeline pengadaan diturunkan dari umur pengajuan.
// Nilai HARUS sama dengan STATUS_PENGADAAN di public/index.html & bqController.js.
function derivePengadaan(spv, age) {
  if (spv !== 'Disetujui') return 'BQ Baru';
  if (age <= 7) return 'BQ Baru';
  if (age <= 21) return 'Pending';
  if (age <= 45) return 'Proses PO';
  if (age <= 75) return 'Barang Dikirim';
  return 'Tiba di Gudang';
}

async function main() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'e_sparepart_local',
    waitForConnections: true,
    connectionLimit: 5,
  });

  const [users] = await pool.query('SELECT id, username FROM users');
  const userMap = new Map(users.map((u) => [u.username.toUpperCase(), u.id]));

  const [parts] = await pool.query('SELECT item_code FROM spareparts');
  const partSet = new Set(parts.map((p) => p.item_code.toUpperCase()));

  const wb = XLSX.readFile(SRC);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['All RO BQ'], { defval: '' });

  const prepared = [];
  const skipped = { noReg: 0, badDate: 0, badUser: 0, badItem: 0 };

  for (const r of rows) {
    const noReg = norm(r['Nomor Registrasi']);
    if (!noReg) { skipped.noReg++; continue; }

    const date = xlDate(r['Timestamp']);
    if (!date) { skipped.badDate++; continue; }

    const prefix = noReg.replace(/\d+$/, '').slice(0, 3).toUpperCase();
    const userId = userMap.get(prefix);
    if (!userId) { skipped.badUser++; continue; }

    const itemCode = norm(r['Item Code']);
    if (!itemCode || !partSet.has(itemCode.toUpperCase())) { skipped.badItem++; continue; }

    // Kembalikan casing asli item_code dari master.
    const realCode = parts.find((p) => p.item_code.toUpperCase() === itemCode.toUpperCase()).item_code;

    const spv = mapSpv(r['Status Approval SPV']);
    const age = ageDays(date);

    const qtyRaw = Number(norm(r['Qty']).replace(/[^\d.-]/g, ''));
    const qty = Number.isFinite(qtyRaw) && qtyRaw > 0 ? Math.floor(qtyRaw) : 1;

    prepared.push([
      noReg,
      userId,
      realCode,
      qty,
      clean(r['UoM']),
      clean(r['Deskripsi Item']) || '-',
      clean(r['Purpose']),
      clean(r['No Ejo']),
      clean(r['Mesin/Area']),
      null, // merk tidak ada di sheet RO
      null, // referensi_penawaran tidak ada di sheet RO
      spv,
      deriveManager(spv, age),
      derivePengadaan(spv, age),
      sqlDateTime(date),
    ]);
  }

  console.log(`Sumber        : ${path.relative(path.join(__dirname, '..'), SRC)}`);
  console.log(`Baris RO      : ${rows.length}`);
  console.log(`Siap diimpor  : ${prepared.length}`);
  console.log(`Dilewati      : no-reg=${skipped.noReg}, tanggal=${skipped.badDate}, ` +
    `user=${skipped.badUser}, item-tidak-ada=${skipped.badItem}`);

  if (DRY) {
    console.log('\n[DRY RUN] Contoh 3 baris yang akan diinsert:');
    prepared.slice(0, 3).forEach((p) => console.log('  ', JSON.stringify(p)));
    await pool.end();
    return;
  }

  const SQL = `INSERT IGNORE INTO pengajuan_bq
    (no_registrasi, user_id, item_code, qty_diminta, uom, spesifikasi_lengkap,
     purpose, no_ejo, mesin_area, merk, referensi_penawaran,
     status_approval_spv, status_approval_manager, status_pengadaan, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  let inserted = 0;
  for (const p of prepared) {
    const [res] = await pool.execute(SQL, p);
    inserted += res.affectedRows;
  }

  // Normalisasi status lama yang tidak ada di pipeline resmi (mis. data contoh).
  const legacyMap = {
    'Mencari Penawaran': 'Pending',
    'Approval PR': 'Pending',
    'PR Open': 'Pending',
    'PO Open': 'Proses PO',
    'Deliver': 'Barang Dikirim',
    'Selesai': 'Tiba di Gudang',
  };
  let normalized = 0;
  for (const [from, to] of Object.entries(legacyMap)) {
    const [res] = await pool.execute(
      'UPDATE pengajuan_bq SET status_pengadaan = ? WHERE status_pengadaan = ?',
      [to, from]
    );
    normalized += res.affectedRows;
  }

  const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM pengajuan_bq');
  console.log(`\nBerhasil diimpor : ${inserted} pengajuan baru`);
  console.log(`Dinormalisasi    : ${normalized} status lama`);
  console.log(`Total pengajuan  : ${total} baris di database`);

  await pool.end();
}

main().catch((err) => {
  console.error('\n[Gagal] ' + err.message);
  process.exit(1);
});
