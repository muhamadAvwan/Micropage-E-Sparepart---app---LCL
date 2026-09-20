const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');

const DIR = path.join(__dirname, '..', 'Salinan_Spreadsheet_Sparepart');
const OUT = path.join(__dirname, '..', 'database', 'seed.sql');

function readSheet(rel, sheetName) {
  const wb = XLSX.readFile(path.join(DIR, rel));
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: true, defval: '' });
  return rows;
}

function norm(v) {
  return String(v == null ? '' : v).trim();
}

function sq(s) {
  return norm(s).replace(/\\/g, '\\\\').replace(/'/g, "''").replace(/[\r\n]+/g, ' ');
}

function trunc(s, n) {
  const t = norm(s);
  return t.length > n ? t.slice(0, n - 3) + '...' : t;
}

function num(v) {
  const n = Number(norm(v).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

function lit(s) {
  return "'" + sq(s) + "'";
}

function litOrNull(v) {
  const t = norm(v);
  return t === '' ? 'NULL' : "'" + sq(t) + "'";
}

// ==================== 1) USERS ====================
const userRows = readSheet('Master DB_User.xlsx', 'Users');
const users = userRows
  .slice(1)
  .filter((r) => norm(r[0]))
  .map((r) => ({
    username: norm(r[0]),
    password: norm(r[1]),
    role: norm(r[2]),
    name: norm(r[3]),
    bqLink: norm(r[4]),
  }));

// ==================== 2) SPAREPARTS ====================
// Sumber: Critical_Part_List (All Critical Part)
//   [0] Item Number  [1] Item Description  [2] Mesin
//   [3] Min Qty      [4] Max Qty           [5] Stok
//   [7] Aktif/Tidak  [12] Kategori Barang
const crit = readSheet('Manager/Critical_Part_List.xlsx', 'All Critical Part');

// Lokasi rak dari On_Hand_Stock (Search): [0] Item Code, [3] Lokator
const stokRows = readSheet('Manager/On_Hand_Stock.xlsx', 'Search');
const lokasiMap = {};
for (const r of stokRows.slice(1)) {
  if (norm(r[0])) lokasiMap[norm(r[0])] = norm(r[3]);
}

const sparepartMap = new Map();
for (const r of crit.slice(1)) {
  const code = norm(r[0]);
  if (!code || code === '-') continue;
  if (!norm(r[7]).toLowerCase().startsWith('aktif')) continue;
  if (sparepartMap.has(code)) continue;
  sparepartMap.set(code, {
    item_code: code,
    deskripsi: trunc(r[1], 255),
    qty_on_hand: num(r[5]),
    min_stock: num(r[3]),
    max_stock: num(r[4]),
    is_critical: norm(r[12]).toLowerCase().includes('critical') ? 1 : 0,
    lokasi_rak: lokasiMap[code] || '',
  });
}
const spareparts = Array.from(sparepartMap.values());

// ==================== 3) PENGAJUAN BQ (contoh) ====================
const bqSamples = [
  {
    no: 'BQ-2026-09-01-0001',
    user: 'AAA',
    code: 'O-11181-00',
    qty: 25,
    spes: 'Bearing 626-2Z, merek SKF atau setara; 1 pc; untuk mesin Capping VCM200.',
    purpose: 'Consumable',
    ejo: 'EJO/2026/09/001',
    mesin: 'Capping',
    merk: 'SKF',
    ref: 'https://www.tokopedia.com',
    spv: 'Menunggu',
    peng: 'BQ Baru',
  },
  {
    no: 'BQ-2026-09-02-0002',
    user: 'AAA',
    code: 'O-15918-00',
    qty: 10,
    spes: 'O-RING 15.47x3.53 mm, Code CC150170, material EPDM; untuk Autoclave FVA2/A1.',
    purpose: 'EJO',
    ejo: 'EJO/2026/09/002',
    mesin: 'Autoclave FVA2/A1',
    merk: '-',
    ref: 'https://shopee.co.id',
    spv: 'Disetujui',
    peng: 'Mencari Penawaran',
  },
  {
    no: 'BQ-2026-09-03-0003',
    user: 'WAP',
    code: 'O-20041-00',
    qty: 40,
    spes: 'Bearing NKIA5902, merek INA; 1 pc; untuk Capping VCM200.',
    purpose: 'Consumable',
    ejo: 'EJO/2026/09/003',
    mesin: 'Capping',
    merk: 'INA',
    ref: 'https://www.lazada.co.id',
    spv: 'Disetujui',
    peng: 'PO Open',
  },
  {
    no: 'BQ-2026-09-04-0004',
    user: 'MOB',
    code: 'O-18693-00',
    qty: 2,
    spes: 'Blind size F2, Fedegari; untuk Autoclave Service NA2247AU.',
    purpose: 'EJO',
    ejo: 'EJO/2026/09/004',
    mesin: 'Autoclave NA2247AU',
    merk: 'Fedegari',
    ref: '',
    spv: 'Ditolak',
    peng: 'BQ Baru',
  },
];

// ==================== GUARD: sampel BQ harus valid ====================
const validCodes = new Set(spareparts.map((s) => s.item_code));
const validUsers = new Set(users.map((u) => u.username));
for (const b of bqSamples) {
  if (!validCodes.has(b.code)) {
    throw new Error(`Sample BQ mengacu item yang tidak ada di seed: ${b.code}`);
  }
  if (!validUsers.has(b.user)) {
    throw new Error(`Sample BQ mengacu user yang tidak ada di seed: ${b.user}`);
  }
}

// ==================== GENERATE SQL ====================
const out = [];
out.push('-- =====================================================================');
out.push('-- seed.sql - Data seed E-Sparepart (generated oleh scripts/generateSeed.js)');
out.push('-- Sumber: Salinan_Spreadsheet_Sparepart (data riil perusahaan)');
out.push(`--   users      : ${users.length} akun`);
out.push(`--   spareparts : ${spareparts.length} item (dari Critical Part List, status Aktif)`);
out.push(`--   pengajuan_bq: ${bqSamples.length} contoh pengajuan`);
out.push('-- =====================================================================');
out.push('');

out.push('SET NAMES utf8mb4;');
out.push('');

out.push('-- ==================== USERS ====================');
const insertUsers = 'INSERT INTO users (username, password, role, name, bqLink) VALUES\n' +
  users
    .map((u) => `(${lit(u.username)}, ${lit(u.password)}, ${lit(u.role)}, ${lit(u.name)}, ${litOrNull(u.bqLink)})`)
    .join(',\n') +
  ';';
out.push(insertUsers);
out.push('');

out.push('-- ==================== SPAREPARTS ====================');
out.push(`-- is_critical = 1 untuk Kategori "Critical Sparepart"; lokasi_rak dari On_Hand_Stock.`);
const insertParts = 'INSERT INTO spareparts (item_code, deskripsi, qty_on_hand, min_stock, max_stock, is_critical, lokasi_rak) VALUES\n' +
  spareparts
    .map((s) =>
      `(${lit(s.item_code)}, ${lit(s.deskripsi)}, ${s.qty_on_hand}, ${s.min_stock}, ${s.max_stock}, ${s.is_critical}, ${litOrNull(s.lokasi_rak)})`
    )
    .join(',\n') +
  ';';
out.push(insertParts);
out.push('');

out.push('-- ==================== PENGAJUAN BQ (contoh) ====================');
for (const b of bqSamples) {
  out.push(
    `INSERT INTO pengajuan_bq (no_registrasi, user_id, item_code, qty_diminta, spesifikasi_lengkap, purpose, no_ejo, mesin_area, merk, referensi_penawaran, status_approval_spv, status_pengadaan)\n` +
    `SELECT ${lit(b.no)}, u.id, ${lit(b.code)}, ${b.qty}, ${lit(b.spes)}, ${lit(b.purpose)}, ${lit(b.ejo)}, ${lit(b.mesin)}, ${lit(b.merk)}, ${litOrNull(b.ref)}, ${lit(b.spv)}, ${lit(b.peng)}\n` +
    `FROM users u WHERE u.username = ${lit(b.user)};`
  );
}

fs.writeFileSync(OUT, out.join('\n'), 'utf8');
console.log(`seed.sql berhasil dibuat di ${OUT}`);
console.log(`  Users      : ${users.length}`);
console.log(`  Spareparts : ${spareparts.length}`);
console.log(`  Pengajuan  : ${bqSamples.length}`);