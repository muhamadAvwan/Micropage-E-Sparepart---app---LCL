const pool = require('../config/database');

function buildNoRegistrasi() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const suffix = Date.now().toString().slice(-4);
  return `BQ-${date}-${suffix}`;
}

 async function createPengajuan(req, res) {
  const {
    username, itemCode, qty, uom, spesifikasi, purpose, no_ejo, mesin_area, merk, referensi_penawaran,
    jenis_pengajuan, urgency,
  } = req.body || {};

  if (!username) {
    return res.status(401).json({ status: 'error', message: 'Anda harus login terlebih dahulu' });
  }
  const jenisV = String(jenis_pengajuan || 'sparepart').trim();
  const urgencyV = String(urgency || 'Normal').trim();

  if (!spesifikasi || (jenisV === 'sparepart' && !itemCode)) {
    return res.status(400).json({
      status: 'error',
      message: 'Parameter itemCode dan spesifikasi wajib diisi',
    });
  }

  const uomV     = String(uom == null ? '' : uom).trim();
  const purposeV = String(purpose == null ? '' : purpose).trim();
  const noEjoV   = String(no_ejo == null ? '' : no_ejo).trim();
  const areaV    = String(mesin_area == null ? '' : mesin_area).trim();

  if (!uomV || !purposeV || !noEjoV || !areaV) {
    return res.status(400).json({
      status: 'error',
      message: 'UoM, Purpose, No. EJO, dan Mesin/Area wajib diisi agar pengajuan komplit',
    });
  }

  const merkV = String(merk == null ? '' : merk).trim() || null;
  const refV  = String(referensi_penawaran == null ? '' : referensi_penawaran).trim() || null;

  const qtyN = Number(qty);
  if (!Number.isInteger(qtyN) || qtyN <= 0) {
    return res.status(400).json({
      status: 'error',
      message: 'Qty harus berupa angka bulat lebih dari 0',
    });
  }

  try {
    const [[user]] = await pool.execute('SELECT id FROM users WHERE username = ?', [username]);
    if (!user) {
      return res.status(401).json({ status: 'error', message: 'User tidak ditemukan. Silakan login ulang.' });
    }

    let sparepartItem = null;
    if (jenisV === 'sparepart') {
      if (!itemCode) {
        return res.status(400).json({
          status: 'error',
          message: 'ItemCode wajib diisi untuk pengajuan sparepart',
        });
      }
      const [[sp]] = await pool.execute('SELECT item_code FROM spareparts WHERE item_code = ?', [itemCode]);
      if (!sp) {
        return res.status(400).json({
          status: 'error',
          message: `Item Code '${itemCode}' tidak ditemukan di database.`,
        });
      }
      sparepartItem = sp.item_code;
    }

    const noRegistrasi = buildNoRegistrasi();

    await pool.execute(
      `INSERT INTO pengajuan_bq
        (no_registrasi, user_id, item_code, qty_diminta, uom, spesifikasi_lengkap,
         purpose, no_ejo, mesin_area, merk, referensi_penawaran,
         jenis_pengajuan, urgency, status_approval_spv, status_approval_manager, status_pengadaan)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Menunggu', 'Menunggu', 'BQ Baru')`,
      [noRegistrasi, user.id, sparepartItem, qtyN, uomV, spesifikasi,
       purposeV, noEjoV, areaV, merkV, refV,
       jenisV, urgencyV]
    );

    return res.status(201).json({
      status: 'ok',
      message: 'Pengajuan BQ berhasil dibuat',
      data: { no_registrasi: noRegistrasi, jenis_pengajuan: jenisV, urgency: urgencyV },
    });
  } catch (error) {
    console.error('[BQ Error]', error.message);
    return res.status(500).json({
      status: 'error',
      message: 'Gagal menyimpan pengajuan BQ',
      ...(process.env.NODE_ENV !== 'production' && { detail: error.message }),
    });
  }
}

// =====================================================================
// MODUL MANAGER - Monitoring & Approval
// =====================================================================

// Whitelist nilai status di database (baku, sesuai seed & BQ Monitoring).
const STATUS_APPROVAL = ['Menunggu', 'Disetujui', 'Ditolak'];

// Alias API yang ramah frontend -> nilai baku di database.
// Frontend cukup kirim 'approved' / 'rejected' sesuai kontrak spec PM.
const ALIAS_APPROVAL = {
  approved: 'Disetujui',
  rejected: 'Ditolak',
  waiting:  'Menunggu',
};

// Pipeline status pengadaan. 'BQ Baru' = status awal dari createPengajuan,
// sisanya urutan alur pengadaan sesuai spec manager.
const STATUS_PENGADAAN = [
  'BQ Baru',
  'Pending',
  'Proses PO',
  'Barang Dikirim',
  'Tiba di Gudang',
];

// Normalisasi nilai status approval:
// terima nilai baku ('Disetujui') ATAU alias ('approved') -> balikan nilai baku.
function normalizeApproval(value) {
  const s = String(value == null ? '' : value).trim();
  if (!s) return null;
  const exact = STATUS_APPROVAL.find((x) => x.toLowerCase() === s.toLowerCase());
  if (exact) return exact;
  return ALIAS_APPROVAL[s.toLowerCase()] || null;
}

// =====================================================================
// RBAC: pembagian hak akses aksi monitoring & approval.
//  - Supervisor : hanya SPV approval (tahap 1)
//  - Manager    : final approval + boleh ikut update status pengadaan
//  - Officer    : hanya status pengadaan (pipeline procurement)
// =====================================================================
function classifyRole(role) {
  const r = String(role || '').toLowerCase();
  if (r.startsWith('supervisor')) return 'supervisor';
  if (r === 'officer')          return 'officer';
  if (r === 'manager')          return 'manager';
  return 'other';
}

// Status approval mana yang boleh diubah oleh sebuah role.
function allowedApprovalFields(roleKey) {
  if (roleKey === 'manager') {
    return { status_approval_spv: true, status_approval_manager: true };
  }
  if (roleKey === 'supervisor') {
    return { status_approval_spv: true, status_approval_manager: false };
  }
  return { status_approval_spv: false, status_approval_manager: false };
}

/**
 * GET /api/pengajuan/all
 * Mengambil SELURUH pengajuan BQ dengan JOIN ke users (data teknisi)
 * dan spareparts (deskripsi barang), diurutkan dari yang paling baru.
 */
async function getAllPengajuan(req, res) {
  try {
    const [rows] = await pool.query(
       `SELECT
bq.jenis_pengajuan,
           bq.urgency,
           bq.no_registrasi,
           bq.user_id,
           bq.item_code,
           COALESCE(sp.deskripsi, '-')           AS deskripsi_barang,
           bq.qty_diminta,
          bq.uom,
          bq.spesifikasi_lengkap,
          bq.purpose,
          bq.no_ejo,
          bq.mesin_area,
          bq.merk,
          bq.referensi_penawaran,
          bq.status_approval_spv,
          bq.status_approval_manager,
          bq.status_pengadaan,
          bq.timestamp,
          u.username              AS username_teknisi,
          u.name                  AS nama_teknisi,
          u.role                  AS role_pengaju
         FROM pengajuan_bq bq
         JOIN users      u  ON u.id = bq.user_id
         LEFT JOIN spareparts sp ON sp.item_code = bq.item_code
         ORDER BY bq.timestamp DESC, bq.no_registrasi DESC`
    );

    return res.status(200).json({
      status: 'ok',
      count: rows.length,
      data: rows,
    });
  } catch (error) {
    console.error('[BQ List Error]', error.message);
    return res.status(500).json({
      status: 'error',
      message: 'Gagal mengambil data pengajuan BQ',
      ...(process.env.NODE_ENV !== 'production' && { detail: error.message }),
    });
  }
}

/**
 * PUT /api/pengajuan/:id/status
 * Update status approval (SPV/Manager) DAN/ATAU status_pengadaan berdasarkan no_registrasi.
 * Body: { username, status_approval_spv?, status_approval_manager?, status_pengadaan? }
 *
 * RBAC (Backend):
 *  - Supervisor hanya dapat mengubah status_approval_spv (tahap 1).
 *  - Manager    hanya dapat mengubah status_approval_manager (tahap 2/final) dan status_pengadaan.
 *  - Officer    hanya dapat mengubah status_pengadaan (pipeline procurement).
 *  - Teknisi    tidak memiliki hak ubah status apa pun.
 *
 * Aturan alur: Manager TIDAK bisa memberi keputusan final sebelum SPV menyetujui.
 */
async function updateStatusPengajuan(req, res) {
  const { id } = req.params; // no_registrasi
  const {
    username, status_approval_spv, status_approval_manager, status_pengadaan,
  } = req.body || {};

  // 0) Identitas aktor wajib ada (konsisten dengan createPengajuan).
  if (!username) {
    return res.status(401).json({ status: 'error', message: 'Anda harus login terlebih dahulu' });
  }

  // 1) Validasi nilai status yang dikirim.
  const spvVal   = normalizeApproval(status_approval_spv);
  const mgrVal   = normalizeApproval(status_approval_manager);
  const pengadaan = String(status_pengadaan == null ? '' : status_pengadaan).trim();

  const hasSpv = status_approval_spv !== undefined && status_approval_spv !== null && String(status_approval_spv).trim() !== '';
  const hasMgr = status_approval_manager !== undefined && status_approval_manager !== null && String(status_approval_manager).trim() !== '';
  const hasPengadaan = pengadaan !== '';

  if (!hasSpv && !hasMgr && !hasPengadaan) {
    return res.status(400).json({
      status: 'error',
      message: 'Tidak ada status yang dikirim untuk diubah',
    });
  }
  if (hasSpv && !spvVal) {
    return res.status(400).json({
      status: 'error',
      message: `status_approval_spv tidak valid. Nilai yang diizinkan: ${STATUS_APPROVAL.join(', ')} (atau approved/rejected)`,
    });
  }
  if (hasMgr && !mgrVal) {
    return res.status(400).json({
      status: 'error',
      message: `status_approval_manager tidak valid. Nilai yang diizinkan: ${STATUS_APPROVAL.join(', ')} (atau approved/rejected)`,
    });
  }
  if (hasPengadaan && !STATUS_PENGADAAN.includes(pengadaan)) {
    return res.status(400).json({
      status: 'error',
      message: `status_pengadaan tidak valid. Nilai yang diizinkan: ${STATUS_PENGADAAN.join(', ')}`,
    });
  }

  // 2) Cek identitas & role aktor dari database.
  let actor;
  try {
    const [[row]] = await pool.execute(
      'SELECT id, role, name FROM users WHERE username = ?',
      [username]
    );
    if (!row) {
      return res.status(401).json({
        status: 'error',
        message: 'User tidak ditemukan. Silakan login ulang.',
      });
    }
    actor = row;
  } catch (error) {
    console.error('[BQ RBAC Error]', error.message);
    return res.status(500).json({
      status: 'error',
      message: 'Gagal memeriksa hak akses pengguna',
    });
  }
  const actorRole = classifyRole(actor.role);

  // Hak akses per field status.
  const allowedApproval = allowedApprovalFields(actorRole);
  if ((hasSpv && !allowedApproval.status_approval_spv) ||
      (hasMgr && !allowedApproval.status_approval_manager)) {
    return res.status(403).json({
      status: 'error',
      message: 'Role Anda tidak memiliki hak untuk melakukan approval ini.',
    });
  }
  if (hasPengadaan && actorRole !== 'manager' && actorRole !== 'officer') {
    return res.status(403).json({
      status: 'error',
      message: 'Status pengadaan hanya bisa diubah oleh Officer / Manager.',
    });
  }

  // 3) Ambil status terkini (untuk aturan alur + audit trail).
  let current;
  try {
    const [[row]] = await pool.execute(
      'SELECT status_approval_spv, status_approval_manager, status_pengadaan FROM pengajuan_bq WHERE no_registrasi = ?',
      [id]
    );
    if (!row) {
      return res.status(404).json({
        status: 'error',
        message: `Pengajuan ${id} tidak ditemukan`,
      });
    }
    current = row;
  } catch (error) {
    console.error('[BQ Lookup Error]', error.message);
    return res.status(500).json({
      status: 'error',
      message: 'Gagal memeriksa data pengajuan',
    });
  }

  // Aturan alur: keputusan final manager menunggu persetujuan SPV dulu.
  if (hasMgr && normalizeApproval(current.status_approval_spv) !== 'Disetujui') {
    return res.status(400).json({
      status: 'error',
      message: 'Manager hanya bisa menyetujui setelah Supervisor menyetujui pengajuan ini (SPV = Disetujui).',
    });
  }

  // 4) Bangun klausa SET secara dinamis (hanya kolom yang dikirim).
  const sets = [];
  const params = [];

  if (hasMgr) {
    sets.push('status_approval_manager = ?');
    params.push(mgrVal);
  }
  if (hasSpv) {
    sets.push('status_approval_spv = ?');
    params.push(spvVal);
  }
  if (hasPengadaan) {
    sets.push('status_pengadaan = ?');
    params.push(pengadaan);
  }

  try {
    const [result] = await pool.execute(
      `UPDATE pengajuan_bq SET ${sets.join(', ')} WHERE no_registrasi = ?`,
      [...params, id]
    );

    // Nilai yang dikirim sama dengan yang tersimpan -> tidak ada perubahan.
    if (result.affectedRows === 0) {
      return res.status(200).json({
        status: 'ok',
        message: 'Status tidak berubah (nilai sudah sama)',
        data: { no_registrasi: id },
      });
    }

    // Audit trail: catat setiap field yang benar-benar berubah.
    // Kegagalan pencatatan log TIDAK boleh menggagalkan update status.
    const changes = [];
    if (hasSpv && String(current.status_approval_spv) !== spvVal) {
      changes.push(['status_approval_spv', current.status_approval_spv, spvVal]);
    }
    if (hasMgr && String(current.status_approval_manager) !== mgrVal) {
      changes.push(['status_approval_manager', current.status_approval_manager, mgrVal]);
    }
    if (hasPengadaan && String(current.status_pengadaan) !== pengadaan) {
      changes.push(['status_pengadaan', current.status_pengadaan, pengadaan]);
    }
    try {
      for (const [field, oldV, newV] of changes) {
        await pool.execute(
          `INSERT INTO pengajuan_log
             (no_registrasi, actor_id, actor_name, actor_role, field, old_value, new_value)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [id, actor.id, actor.name, actor.role, field, oldV, newV]
        );
      }
    } catch (logErr) {
      console.error('[BQ Log Warning]', logErr.message);
    }

    return res.status(200).json({
      status: 'ok',
      message: 'Status pengajuan berhasil diperbarui',
      data: {
        no_registrasi: id,
        ...(hasSpv && { status_approval_spv: spvVal }),
        ...(hasMgr && { status_approval_manager: mgrVal }),
        ...(hasPengadaan && { status_pengadaan: pengadaan }),
      },
    });
  } catch (error) {
    console.error('[BQ Update Error]', error.message);
    return res.status(500).json({
      status: 'error',
      message: 'Gagal memperbarui status pengajuan',
      ...(process.env.NODE_ENV !== 'production' && { detail: error.message }),
    });
  }
}

/**
 * GET /api/pengajuan/:id/log
 * Riwayat perubahan status (audit trail) sebuah pengajuan.
 */
async function getPengajuanLog(req, res) {
  const { id } = req.params;
  try {
    const [rows] = await pool.query(
      `SELECT actor_name, actor_role, field, old_value, new_value, created_at
         FROM pengajuan_log
        WHERE no_registrasi = ?
        ORDER BY created_at ASC, id ASC`,
      [id]
    );
    return res.status(200).json({ status: 'ok', count: rows.length, data: rows });
  } catch (error) {
    console.error('[BQ Log Error]', error.message);
    return res.status(500).json({
      status: 'error',
      message: 'Gagal mengambil riwayat pengajuan',
      ...(process.env.NODE_ENV !== 'production' && { detail: error.message }),
    });
  }
}

// =====================================================================
// MODUL MANAGER - PR Summary & Stock Alert
// =====================================================================

/**
 * GET /api/pengajuan/summary
 * PR Summary: daftar pengajuan yang masih Menunggu approval SPV.
 * Dapat diakses Manager dan Supervisor 1 saja.
 * (Catatan: filter per tim membutuhkan kolom supervisor_id di tabel users — perlu migrate DB.)
 */
async function getPengajuanSummary(req, res) {
  try {
    const { username } = req.query;
    if (!username) {
      return res.status(401).json({ status: 'error', message: 'Anda harus login terlebih dahulu' });
    }
    const [[actor]] = await pool.execute('SELECT id, role, supervisor_id FROM users WHERE username = ?', [username]);
    if (!actor) {
      return res.status(401).json({ status: 'error', message: 'User tidak ditemukan' });
    }
    const roleKey = classifyRole(actor.role);
    if (roleKey !== 'manager' && actor.role !== 'Supervisor 1') {
      return res.status(403).json({ status: 'error', message: 'Hanya Manager/Supervisor 1 yang dapat melihat PR Summary' });
    }
    let query, queryParams;
    if (actor.role === 'Supervisor 1' && actor.supervisor_id) {
      query = `SELECT bq.no_registrasi, bq.qty_diminta, bq.spesifikasi_lengkap,
                      bq.mesin_area, bq.purpose, bq.status_pengadaan, bq.timestamp,
                      bq.jenis_pengajuan, bq.urgency,
                      u.name AS nama_teknisi, u.role AS role_pengaju
                 FROM pengajuan_bq bq
                 JOIN users u ON u.id = bq.user_id
                WHERE bq.status_approval_spv = 'Menunggu' AND u.supervisor_id = ?
                ORDER BY bq.timestamp ASC`;
      queryParams = [actor.supervisor_id];
    } else {
      query = `SELECT bq.no_registrasi, bq.qty_diminta, bq.spesifikasi_lengkap,
                      bq.mesin_area, bq.purpose, bq.status_pengadaan, bq.timestamp,
                      bq.jenis_pengajuan, bq.urgency,
                      u.name AS nama_teknisi, u.role AS role_pengaju
                 FROM pengajuan_bq bq
                 JOIN users u ON u.id = bq.user_id
                WHERE bq.status_approval_spv = 'Menunggu'
                ORDER BY bq.timestamp ASC`;
      queryParams = [];
    }
    const [rows] = await pool.query(query, queryParams);

    const total = rows.length;
    const urgent = rows.filter(r => r.urgency === 'Urgent').length;
    const normal = rows.filter(r => r.urgency === 'Normal').length;
    const sparepart = rows.filter(r => r.jenis_pengajuan === 'sparepart').length;
    const jasa = rows.filter(r => r.jenis_pengajuan === 'jasa').length;

    return res.status(200).json({
      status: 'ok',
      count: total,
      data: rows,
      summary: { total, urgent, normal, sparepart, jasa }
    });
  } catch (error) {
    console.error('[PR Summary Error]', error.message);
    return res.status(500).json({ status: 'error', message: 'Gagal mengambil PR Summary' });
  }
}

/**
 * GET /api/spareparts/alert
 * Daftar sparepart dengan stok di bawah min_stock (peringatan perlu dipesan).
 * Digunakan sebagai badge di KPI / Critical Part List.
 */
async function getStockAlert(req, res) {
  try {
const [rows] = await pool.query(
      `SELECT item_code, deskripsi, qty_on_hand, min_stock, max_stock, is_critical, lokasi_rak,
               (min_stock - qty_on_hand) AS defisit
          FROM spareparts
         WHERE qty_on_hand <= min_stock AND min_stock > 0
         ORDER BY defisit DESC, is_critical DESC, item_code ASC`
    );
    return res.status(200).json({ status: 'ok', count: rows.length, data: rows });
  } catch (error) {
    console.error('[Stock Alert Error]', error.message);
    return res.status(500).json({ status: 'error', message: 'Gagal mengambil data alert stok' });
  }
}

// =====================================================================
// BQ SUMMARY — Ringkasan seluruh pengajuan BQ
// =====================================================================

/**
 * GET /api/pengajuan/bq-summary
 * BQ Summary: ringkasan lengkap seluruh pengajuan BQ.
 * - Total, per urgency, per jenis
 * - Status approval breakdown
 * - Pipeline status breakdown
 * - Bisa diakses semua role yang punya menu BQ Summary
 */
async function getBqSummary(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT bq.no_registrasi, bq.jenis_pengajuan, bq.urgency,
              bq.status_approval_spv, bq.status_approval_manager, bq.status_pengadaan,
              bq.qty_diminta, bq.timestamp,
              u.name AS nama_teknisi
         FROM pengajuan_bq bq
         JOIN users u ON u.id = bq.user_id
        ORDER BY bq.timestamp DESC`
    );

    const total = rows.length;
    const urgent = rows.filter(r => r.urgency === 'Urgent').length;
    const normal = total - urgent;
    const sparepart = rows.filter(r => r.jenis_pengajuan === 'sparepart').length;
    const jasa = total - sparepart;

    const menungguSPV  = rows.filter(r => r.status_approval_spv === 'Menunggu').length;
    const disetujuiSPV = rows.filter(r => r.status_approval_spv === 'Disetujui').length;
    const ditolakSPV   = rows.filter(r => r.status_approval_spv === 'Ditolak').length;
    const menungguMGR  = rows.filter(r => r.status_approval_manager === 'Menunggu' && r.status_approval_spv === 'Disetujui').length;
    const disetujuiMGR = rows.filter(r => r.status_approval_manager === 'Disetujui').length;
    const ditolakMGR   = rows.filter(r => r.status_approval_manager === 'Ditolak').length;

    const pipelineBreakdown = {};
    rows.forEach(r => {
      const st = r.status_pengadaan || 'BQ Baru';
      pipelineBreakdown[st] = (pipelineBreakdown[st] || 0) + 1;
    });

    return res.status(200).json({
      status: 'ok',
      count: total,
      data: rows,
      summary: {
        total, urgent, normal, sparepart, jasa,
        approval: { menungguSPV, disetujuiSPV, ditolakSPV, menungguMGR, disetujuiMGR, ditolakMGR },
        pipeline: pipelineBreakdown,
      },
    });
  } catch (error) {
    console.error('[BQ Summary Error]', error.message);
    return res.status(500).json({
      status: 'error',
      message: 'Gagal mengambil BQ Summary',
      ...(process.env.NODE_ENV !== 'production' && { detail: error.message }),
    });
  }
}

// =====================================================================
// MONTHLY REPORT — Laporan bulanan (Supervisor 1 & Manager)
// =====================================================================

/**
 * GET /api/reports/monthly?year=2026&month=9
 * Laporan bulanan pengajuan BQ:
 * - Rekap per jenis pengajuan
 * - Rekap per urgency
 * - Rekap per status approval
 * - Daftar pengajuan bulan tersebut
 * - Hanya Supervisor 1 & Manager yang boleh akses
 */
async function getMonthlyReport(req, res) {
  try {
    const now = new Date();
    const year  = parseInt(req.query.year, 10)  || now.getFullYear();
    const month = parseInt(req.query.month, 10) || (now.getMonth() + 1);

    if (month < 1 || month > 12) {
      return res.status(400).json({ status: 'error', message: 'Bulan tidak valid (1-12)' });
    }

    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endMonth  = month === 12 ? 1 : month + 1;
    const endYear   = month === 12 ? year + 1 : year;
    const endDate   = `${endYear}-${String(endMonth).padStart(2, '0')}-01`;

    const [rows] = await pool.query(
      `SELECT bq.no_registrasi, bq.jenis_pengajuan, bq.urgency,
              bq.status_approval_spv, bq.status_approval_manager, bq.status_pengadaan,
              bq.qty_diminta, bq.timestamp,
              u.name AS nama_teknisi, u.role AS role_pengaju
         FROM pengajuan_bq bq
         JOIN users u ON u.id = bq.user_id
        WHERE bq.timestamp >= ? AND bq.timestamp < ?
        ORDER BY bq.timestamp ASC`,
      [startDate, endDate]
    );

    const total = rows.length;
    const urgent = rows.filter(r => r.urgency === 'Urgent').length;
    const normal = total - urgent;
    const sparepart = rows.filter(r => r.jenis_pengajuan === 'sparepart').length;
    const jasa = total - sparepart;

    const approved = rows.filter(r => r.status_approval_manager === 'Disetujui').length;
    const rejected = rows.filter(r => r.status_approval_manager === 'Ditolak' || r.status_approval_spv === 'Ditolak').length;
    const waiting  = rows.filter(r => r.status_approval_manager === 'Menunggu' && r.status_approval_spv === 'Menunggu').length;

    const pipelineBreakdown = {};
    rows.forEach(r => {
      const st = r.status_pengadaan || 'BQ Baru';
      pipelineBreakdown[st] = (pipelineBreakdown[st] || 0) + 1;
    });

    return res.status(200).json({
      status: 'ok',
      period: { year, month },
      count: total,
      data: rows,
      summary: {
        total, urgent, normal, sparepart, jasa,
        approved, rejected, waiting,
        pipeline: pipelineBreakdown,
      },
    });
  } catch (error) {
    console.error('[Monthly Report Error]', error.message);
    return res.status(500).json({
      status: 'error',
      message: 'Gagal mengambil laporan bulanan',
      ...(process.env.NODE_ENV !== 'production' && { detail: error.message }),
    });
  }
}

module.exports = { createPengajuan, getAllPengajuan, updateStatusPengajuan, getPengajuanLog, getPengajuanSummary, getStockAlert, getBqSummary, getMonthlyReport };