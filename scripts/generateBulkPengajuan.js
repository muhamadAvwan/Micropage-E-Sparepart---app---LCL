const fs = require('fs');
const path = require('path');

const USERS = ['AAA','ANO','BDU','MOB','MRN','NDS','RIA','ROS','SFH','KFF','ERA','WAP','MCL'];
const SPAREPARTS_PATH = path.join(__dirname, '..', 'database', 'seed.sql');
const OUT_PATH = path.join(__dirname, '..', 'database', 'bulk_pengajuan.sql');

function extractItemCodes() {
  const sql = fs.readFileSync(SPAREPARTS_PATH, 'utf8');
  const matches = sql.match(/\('([A-Z]-[0-9]+-00)'/g) || [];
  return matches.map(m => m.slice(2, -1));
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }

function generateTimestamp(year, month, day) {
  const h = randInt(7, 17);
  const m = randInt(0, 59);
  const s = randInt(0, 59);
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd} ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function main() {
  const itemCodes = extractItemCodes();
  if (!itemCodes.length) { console.error('Tidak ada item code ditemukan'); process.exit(1); }

  const rows = [];
  const logRows = [];
  let seq = 1;
  const fixedNo = 'BQ-2026-09-01-0001';

  // Distribusi per bulan (target total ~220)
  const months = [
    // 2025
    { y: 2025, m: 1, count: 16 },
    { y: 2025, m: 2, count: 20 },
    { y: 2025, m: 3, count: 12 },
    { y: 2025, m: 4, count: 10 },
    { y: 2025, m: 5, count: 10 },
    { y: 2025, m: 6, count: 10 },
    { y: 2025, m: 7, count: 10 },
    { y: 2025, m: 8, count: 10 },
    { y: 2025, m: 9, count: 10 },
    { y: 2025, m: 10, count: 10 },
    { y: 2025, m: 11, count: 10 },
    { y: 2025, m: 12, count: 10 },
    // 2026
    { y: 2026, m: 1, count: 10 },
    { y: 2026, m: 2, count: 10 },
    { y: 2026, m: 3, count: 10 },
    { y: 2026, m: 4, count: 10 },
    { y: 2026, m: 5, count: 10 },
    { y: 2026, m: 6, count: 10 },
    { y: 2026, m: 7, count: 10 },
    { y: 2026, m: 8, count: 10 },
    { y: 2026, m: 9, count: 8 },
  ];

  const statusSPV = ['Disetujui','Disetujui','Disetujui','Ditolak','Menunggu'];
  const statusMGR = ['Disetujui','Disetujui','Menunggu','Menunggu','Ditolak'];
  const statusPeng = ['BQ Baru','Mencari Penawaran','Proses PO','PR Open','Barang Dikirim','Selesai'];
  const urgencyList = ['Normal','Normal','Normal','Normal','Urgent'];
  const purposeList = ['Consumable','EJO','Sparepart'];
  const mesinList = ['Capping','Autoclave FVA2/A1','Washing RAR4','Filling VFM100','Freeze Dryer MBE1207','Tunnel ST1L','EDM EDM1','cRABS Z064CR'];
  const merkList = ['SKF','INA','Fedegari','SMC','Festo','Siemens','Keyence','Autonics','-'];

  for (const period of months) {
    for (let i = 0; i < period.count; i++) {
      const no = `BQ-${period.y}-${String(period.m).padStart(2,'0')}-${String(randInt(1,28)).padStart(2,'0')}-${String(seq).padStart(4,'0')}`;
      const user = pick(USERS);
      const isJasa = Math.random() < 0.08;
      const itemCode = isJasa ? 'NULL' : `'${pick(itemCodes)}'`;
      const qty = randInt(1, 50);
      const uoM = isJasa ? 'Pcs' : pick(['Pcs','Set','Meter','Liter']);
      const purpose = pick(purposeList);
      const ejo = `EJO/${period.y}/${String(period.m).padStart(2,'0')}/${String(randInt(1,99)).padStart(2,'0')}`;
      const mesin = pick(mesinList);
      const merk = pick(merkList);
      const urgency = pick(urgencyList);
      const jenis = isJasa ? 'jasa' : 'sparepart';
      const spv = pick(statusSPV);
      const mgr = spv === 'Disetujui' ? pick(statusMGR) : 'Menunggu';
      const peng = pick(statusPeng);
      const ts = generateTimestamp(period.y, period.m, randInt(1, 28));
      const spec = `Spesifikasi pengajuan ${no} untuk ${mesin}`;

      // Escape single quotes in strings
      const escSpec = spec.replace(/'/g, "''");

      rows.push(
        `INSERT INTO pengajuan_bq (no_registrasi, user_id, item_code, jenis_pengajuan, qty_diminta, uom, spesifikasi_lengkap, purpose, no_ejo, mesin_area, merk, urgency, status_approval_spv, status_approval_manager, status_pengadaan, timestamp) ` +
        `SELECT '${no}', u.id, ${itemCode}, '${jenis}', ${qty}, '${uoM}', '${escSpec}', '${purpose}', '${ejo}', '${mesin}', '${merk}', '${urgency}', '${spv}', '${mgr}', '${peng}', '${ts}' ` +
        `FROM users u WHERE u.username = '${user}';`
      );
      seq++;
    }
  }

  // === FIXED: BQ-2026-09-01-0001 ===
  // Overwrite first entry of Sep 2026 with fixed no + known status
  const fixedTs = '2026-09-01 08:30:00';
  const fixedItem = itemCodes[0];
  rows.unshift(
    `INSERT INTO pengajuan_bq (no_registrasi, user_id, item_code, jenis_pengajuan, qty_diminta, uom, spesifikasi_lengkap, purpose, no_ejo, mesin_area, merk, urgency, status_approval_spv, status_approval_manager, status_pengadaan, timestamp) ` +
    `SELECT '${fixedNo}', u.id, '${fixedItem}', 'sparepart', 2, 'Pcs', 'Bearing 626-2Z untuk mesin Capping', 'Consumable', 'EJO/2026/09/001', 'Capping', 'SKF', 'Normal', 'Disetujui', 'Disetujui', 'Proses PO', '${fixedTs}' ` +
    `FROM users u WHERE u.username = 'AAA';`
  );

  // === AUDIT TRAIL for BQ-2026-09-01-0001 ===
  logRows.push(
    `INSERT INTO pengajuan_log (no_registrasi, actor_id, actor_name, actor_role, field, old_value, new_value, created_at) ` +
    `SELECT '${fixedNo}', u.id, u.name, u.role, 'status_approval_spv', 'Menunggu', 'Disetujui', '2026-09-01 09:00:00' ` +
    `FROM users u WHERE u.username = 'INN';`
  );
  logRows.push(
    `INSERT INTO pengajuan_log (no_registrasi, actor_id, actor_name, actor_role, field, old_value, new_value, created_at) ` +
    `SELECT '${fixedNo}', u.id, u.name, u.role, 'status_pengadaan', 'BQ Baru', 'Mencari Penawaran', '2026-09-01 10:00:00' ` +
    `FROM users u WHERE u.username = 'ANS';`
  );
  logRows.push(
    `INSERT INTO pengajuan_log (no_registrasi, actor_id, actor_name, actor_role, field, old_value, new_value, created_at) ` +
    `SELECT '${fixedNo}', u.id, u.name, u.role, 'status_approval_manager', 'Menunggu', 'Disetujui', '2026-09-01 11:00:00' ` +
    `FROM users u WHERE u.username = 'KSW';`
  );

  const out = [];
  out.push('-- =====================================================================');
  out.push('-- bulk_pengajuan.sql - Data pengajuan massal untuk QA testing');
  out.push('-- Generated by scripts/generateBulkPengajuan.js');
  out.push(`-- Total pengajuan: ${seq} (+ fixed BQ-2026-09-01-0001)`);
  out.push('-- =====================================================================');
  out.push('');
  out.push('SET NAMES utf8mb4;');
  out.push('');

  // De-duplicate: keep only one BQ-2026-09-01-0001 (the first insert)
  const seen = new Set();
  const deduped = [];
  for (const r of rows) {
    const m = r.match(/INSERT INTO pengajuan_bq.*?'(BQ-[^']+)'/);
    const no = m ? m[1] : null;
    if (no === fixedNo && seen.has(no)) continue;
    seen.add(no);
    deduped.push(r);
  }

  out.push('-- ==================== PENGAJUAN BQ ====================');
  out.push(deduped.join('\n\n'));
  out.push('');
  out.push('-- ==================== AUDIT TRAIL (BQ-2026-09-01-0001) ====================');
  out.push(logRows.join('\n\n'));

  fs.writeFileSync(OUT_PATH, out.join('\n'), 'utf8');
  console.log(`bulk_pengajuan.sql berhasil dibuat di ${OUT_PATH}`);
  console.log(`  Total pengajuan: ${deduped.length}`);
  console.log(`  Audit trail entries: ${logRows.length}`);

  // Verify distribution
  const dist = {};
  for (const r of deduped) {
    const m = r.match(/'(\d{4})-(\d{2})-\d{2} \d{2}:\d{2}:\d{2}'/);
    if (m) {
      const key = m[1] + '-' + m[2];
      dist[key] = (dist[key] || 0) + 1;
    }
  }
  console.log('\nDistribusi per bulan:');
  Object.keys(dist).sort().forEach(k => console.log(`  ${k}: ${dist[k]}`));
}

main();
