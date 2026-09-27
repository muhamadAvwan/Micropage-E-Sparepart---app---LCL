const pool = require('../config/database');
const { hashPassword, verifyPassword } = require('../utils/password');

/**
 * Modul Manajemen User (register + approval + log)
 *
 * Alur (sesuai arahan tim, 26 Sep 2026):
 *   1. User baru mendaftar lewat halaman login (tanpa notifikasi email).
 *   2. User pending BOLEH login, tapi hanya melihat layar "menunggu
 *      persetujuan" — tanpa menu apa pun. Login ini tetap tercatat.
 *   3. Manager menyetujui pendaftaran sekaligus menugaskan tim
 *      (Supervisor 1 / Supervisor 2 / Officer) -> akun aktif penuh.
 *   4. Setiap login sukses tercatat di login_log (termasuk yang belum
 *      di-approve, untuk keamanan) dan setiap aksi yang mengubah data
 *      tercatat di activity_log.
 *
 * Dukungan dua dialek database:
 *   - PostgreSQL (Supabase)  : placeholder $1, SERIAL, RETURNING id
 *   - MySQL (XAMPP / lokal)  : placeholder ?,  AUTO_INCREMENT
 */

const IS_MYSQL = typeof pool.execute === 'function';

/** Placeholder posisi parameter: $1 (PG) atau ? (MySQL). */
function ph(i) { return IS_MYSQL ? '?' : '$' + i; }

/** Ubah template bertanda {1} {2} ... menjadi placeholder sesuai dialek.
 *  Dipakai sebagai tagged template: sql`... {1} ... {2} ...` */
function sql(strings, ...vals) {
  let q = strings[0];
  // Tidak ada interpolasi $-{} dalam template (parameter lewat array terpisah);
  // gabungkan bagian jika ada.
  for (let i = 0; i < vals.length; i++) q += String(vals[i]) + strings[i + 1];
  return q.replace(/\{(\d+)\}/g, (m, d) => ph(parseInt(d, 10)));
}

/* ------------------------------------------------------------------ */
/* DDL otomatis (idempoten) — dibuat sekali per proses                 */
/* ------------------------------------------------------------------ */

const DDL_PG = `
CREATE TABLE IF NOT EXISTS user_registrations (
  id              SERIAL PRIMARY KEY,
  username        VARCHAR(50)  NOT NULL,
  password        VARCHAR(255) NOT NULL,
  name            VARCHAR(100) NOT NULL,
  role            VARCHAR(50)  NOT NULL DEFAULT 'teknisi',
  tim             VARCHAR(50),
  status          VARCHAR(20)  NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'approved', 'rejected')),
  decided_by      VARCHAR(50),
  decided_at      TIMESTAMP WITH TIME ZONE,
  rejected_reason TEXT,
  created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS uk_user_reg_username ON user_registrations (username);
CREATE INDEX IF NOT EXISTS idx_user_reg_status ON user_registrations (status);

CREATE TABLE IF NOT EXISTS login_log (
  id          SERIAL PRIMARY KEY,
  username    VARCHAR(50)  NOT NULL,
  name        VARCHAR(100),
  role        VARCHAR(50),
  accept      SMALLINT     NOT NULL DEFAULT 1,
  note        VARCHAR(50),
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_login_log_created ON login_log (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_login_log_username ON login_log (username);

CREATE TABLE IF NOT EXISTS activity_log (
  id          SERIAL PRIMARY KEY,
  username    VARCHAR(50)  NOT NULL,
  name        VARCHAR(100),
  role        VARCHAR(50),
  action      VARCHAR(50)  NOT NULL,
  detail      VARCHAR(255),
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_activity_log_created ON activity_log (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_username ON activity_log (username);
`;

const DDL_MYSQL = `
CREATE TABLE IF NOT EXISTS user_registrations (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  username        VARCHAR(50)  NOT NULL,
  password        VARCHAR(255) NOT NULL,
  name            VARCHAR(100) NOT NULL,
  role            VARCHAR(50)  NOT NULL DEFAULT 'teknisi',
  tim             VARCHAR(50),
  status          VARCHAR(20)  NOT NULL DEFAULT 'pending',
  decided_by      VARCHAR(50),
  decided_at      TIMESTAMP NULL,
  rejected_reason TEXT,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_reg_username (username),
  KEY idx_user_reg_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS login_log (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  username    VARCHAR(50)  NOT NULL,
  name        VARCHAR(100),
  role        VARCHAR(50),
  accept      TINYINT      NOT NULL DEFAULT 1,
  note        VARCHAR(50),
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_login_log_created (created_at, id),
  KEY idx_login_log_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS activity_log (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  username    VARCHAR(50)  NOT NULL,
  name        VARCHAR(100),
  role        VARCHAR(50),
  action      VARCHAR(50)  NOT NULL,
  detail      VARCHAR(255),
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_activity_log_created (created_at, id),
  KEY idx_activity_log_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

let tablesReady = null;
function ensureTables() {
  if (!tablesReady) {
    const ddl = IS_MYSQL ? DDL_MYSQL : DDL_PG;
    const stmts = ddl.split(';').map((s) => s.trim()).filter(Boolean);
    tablesReady = (async () => {
      for (const s of stmts) await pool.query(s);
    })().catch((err) => {
      tablesReady = null; // biarkan request berikutnya mencoba lagi
      throw err;
    });
  }
  return tablesReady;
}

/* ------------------------------------------------------------------ */
/* Helper pencatatan — kegagalan log TIDAK boleh menggagalkan aksi utama */
/* ------------------------------------------------------------------ */

/** Catat login sukses. accept=1 (akun aktif) / 0 (masih pending). */
async function logLogin(username, name, role, accept, note) {
  try {
    await pool.query(
      sql`INSERT INTO login_log (username, name, role, accept, note)
          VALUES ({1}, {2}, {3}, {4}, {5})`,
      [username, name || null, role || null, accept === false ? 0 : 1, note || null]
    );
  } catch (e) {
    console.error('[LoginLog Warning]', e.message);
  }
}

/** Catat aksi yang mengubah data (buat pengajuan, approval, dst). */
async function logActivity(username, name, role, action, detail) {
  try {
    await pool.query(
      sql`INSERT INTO activity_log (username, name, role, action, detail)
          VALUES ({1}, {2}, {3}, {4}, {5})`,
      [username, name || null, role || null, action, detail ? String(detail).slice(0, 255) : null]
    );
  } catch (e) {
    console.error('[ActivityLog Warning]', e.message);
  }
}

/** Pastikan pemanggil endpoint adalah Manager. */
async function requireManager(req) {
  const username = (req.body || {}).username || (req.query || {}).username;
  if (!username) return { ok: false, code: 400, message: 'Parameter username wajib diisi' };
  const { rows } = await pool.query(
    sql`SELECT username, name, role FROM users WHERE username = {1} LIMIT 1`,
    [username]
  );
  const u = rows[0];
  if (!u) return { ok: false, code: 401, message: 'User tidak ditemukan. Silakan login ulang.' };
  if (String(u.role).toLowerCase() !== 'manager') {
    return { ok: false, code: 403, message: 'Hanya Manager yang boleh mengakses fitur ini' };
  }
  return { ok: true, manager: u };
}

/* ------------------------------------------------------------------ */
/* 1) REGISTER                                                         */
/* ------------------------------------------------------------------ */

/**
 * POST /api/register
 * Body: { username, password, name }
 * Tanpa notifikasi email — pendaftaran menunggu persetujuan Manager.
 */
async function registerUser(req, res) {
  const { username, password, name } = req.body || {};

  const u = String(username || '').trim();
  const n = String(name || '').trim();

  if (!u || !password || !n) {
    return res.status(400).json({
      status: 'error',
      message: 'Username, nama lengkap, dan password wajib diisi',
    });
  }
  if (!/^[A-Za-z0-9._-]{3,50}$/.test(u)) {
    return res.status(400).json({
      status: 'error',
      message: 'Username 3-50 karakter, hanya huruf/angka/titik/garis bawah',
    });
  }
  if (n.length < 3 || n.length > 100) {
    return res.status(400).json({ status: 'error', message: 'Nama lengkap 3-100 karakter' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ status: 'error', message: 'Password minimal 6 karakter' });
  }

  try {
    await ensureTables();

    // Username harus unik terhadap akun aktif maupun pendaftaran yang menunggu.
    const { rows: dupeUsers } = await pool.query(
      sql`SELECT username FROM users WHERE username = {1} LIMIT 1`, [u]
    );
    if (dupeUsers.length) {
      return res.status(409).json({ status: 'error', message: 'Username sudah dipakai' });
    }
    const { rows: dupeReg } = await pool.query(
      sql`SELECT status FROM user_registrations WHERE username = {1} LIMIT 1`, [u]
    );
    if (dupeReg.length) {
      const s = dupeReg[0].status;
      if (s === 'pending') {
        return res.status(409).json({
          status: 'error',
          message: 'Pendaftaran dengan username ini masih menunggu persetujuan Manager',
        });
      }
      return res.status(409).json({
        status: 'error',
        message: 'Pendaftaran dengan username ini sudah pernah diproses (' + s + ')',
      });
    }

    await pool.query(
      sql`INSERT INTO user_registrations (username, password, name)
          VALUES ({1}, {2}, {3})`,
      [u, hashPassword(String(password)), n]
    );

    await logActivity(u, n, 'pending', 'register', 'Daftar akun baru — menunggu persetujuan Manager');

    return res.status(201).json({
      status: 'ok',
      message: 'Pendaftaran berhasil. Akun bisa dipakai setelah Manager menyetujui dan menugaskan tim',
      data: { username: u, name: n, status: 'pending' },
    });
  } catch (error) {
    console.error('[Register Error]', error.message);
    return res.status(500).json({
      status: 'error',
      message: 'Gagal memproses pendaftaran',
      ...(process.env.NODE_ENV !== 'production' && { detail: error.message }),
    });
  }
}

/* ------------------------------------------------------------------ */
/* 2) DAFTAR PENDAFTARAN (Manager)                                     */
/* ------------------------------------------------------------------ */

/**
 * GET /api/users/registrations?username=KSW&status=pending
 * Default: hanya yang pending.
 */
async function listRegistrations(req, res) {
  try {
    await ensureTables();
    const gate = await requireManager(req);
    if (!gate.ok) return res.status(gate.code).json({ status: 'error', message: gate.message });

    const status = String(req.query.status || 'pending').toLowerCase();
    const { rows } = await pool.query(
      sql`SELECT id, username, name, role, tim, status, created_at
          FROM user_registrations
          WHERE status = {1}
          ORDER BY created_at ASC, id ASC`,
      [status]
    );

    return res.status(200).json({
      status: 'ok',
      count: rows.length,
      data: rows.map((r) => ({
        id: r.id,
        username: r.username,
        name: r.name,
        role: r.role,
        tim: r.tim,
        status: r.status,
        created_at: r.created_at,
      })),
    });
  } catch (error) {
    console.error('[Registrations Error]', error.message);
    return res.status(500).json({
      status: 'error',
      message: 'Gagal memuat daftar pendaftaran',
      ...(process.env.NODE_ENV !== 'production' && { detail: error.message }),
    });
  }
}

/* ------------------------------------------------------------------ */
/* 3) APPROVE + ASSIGN TIM (Manager)                                   */
/* ------------------------------------------------------------------ */

/** Cari supervisor_id berdasarkan tim yang dipilih (SPV1 / SPV2 / Officer). */
async function resolveSupervisorId(tim) {
  const target = String(tim || '').toLowerCase();
  const { rows } = await pool.query(
    sql`SELECT id FROM users WHERE LOWER(role) = {1} ORDER BY id ASC LIMIT 1`,
    [target]
  );
  return rows.length ? rows[0].id : null;
}

/**
 * POST /api/users/approve
 * Body: { username (manager), id (pendaftaran), role, tim }
 * tim: 'Supervisor 1' | 'Supervisor 2' | 'Officer'
 */
async function approveUser(req, res) {
  const { id, role, tim, bqLink } = req.body || {};
  const regId = parseInt(id, 10);

  if (!regId) {
    return res.status(400).json({ status: 'error', message: 'Parameter id wajib diisi' });
  }

  const roleV = String(role || 'teknisi').trim().toLowerCase() === 'teknisi'
    ? 'teknisi'
    : String(role).trim();
  const timV = String(tim || '').trim();
  const timL = timV.toLowerCase();
  const bqLinkV = String(bqLink || '').trim().slice(0, 255);

  if (roleV === 'teknisi' && !['supervisor 1', 'supervisor 2', 'officer'].includes(timL)) {
    return res.status(400).json({
      status: 'error',
      message: 'Pilih tim: Supervisor 1, Supervisor 2, atau Officer',
    });
  }

  try {
    await ensureTables();
    const gate = await requireManager(req);
    if (!gate.ok) return res.status(gate.code).json({ status: 'error', message: gate.message });
    const mgr = gate.manager;

    const { rows: regs } = await pool.query(
      sql`SELECT * FROM user_registrations WHERE id = {1} LIMIT 1`, [regId]
    );
    const reg = regs[0];
    if (!reg) return res.status(404).json({ status: 'error', message: 'Pendaftaran tidak ditemukan' });
    if (reg.status !== 'pending') {
      return res.status(409).json({
        status: 'error',
        message: 'Pendaftaran ini sudah diproses (' + reg.status + ')',
      });
    }

    // Pastikan username belum ada di users (mis. sengaja terbentuk lewat jalur lain).
    const { rows: dupe } = await pool.query(
      sql`SELECT username FROM users WHERE username = {1} LIMIT 1`, [reg.username]
    );
    if (dupe.length) {
      return res.status(409).json({
        status: 'error',
        message: 'Username sudah aktif di users — pendaftaran batal diproses',
      });
    }

    const supervisorId = roleV.toLowerCase() === 'teknisi' ? await resolveSupervisorId(timL) : null;

    // Kolom link BQ personal: 'bqlink' di PostgreSQL (Supabase), 'bqLink' di MySQL.
    const bqCol = IS_MYSQL ? 'bqLink' : 'bqlink';

    // Buat akun aktif: password sudah berupa hash scrypt sejak register.
    if (supervisorId == null) {
      await pool.query(
        sql`INSERT INTO users (username, password, name, role, ${bqCol}) VALUES ({1}, {2}, {3}, {4}, {5})`,
        [reg.username, reg.password, reg.name, roleV, bqLinkV || null]
      );
    } else {
      await pool.query(
        sql`INSERT INTO users (username, password, name, role, supervisor_id, ${bqCol})
            VALUES ({1}, {2}, {3}, {4}, {5}, {6})`,
        [reg.username, reg.password, reg.name, roleV, supervisorId, bqLinkV || null]
      );
    }

    await pool.query(
      sql`UPDATE user_registrations
          SET status = 'approved', role = {1}, tim = {2}, decided_by = {3},
              decided_at = CURRENT_TIMESTAMP
          WHERE id = {4}`,
      [roleV, timL || null, mgr.username, regId]
    );

    await logActivity(
      mgr.username, mgr.name, mgr.role, 'approve_user',
      'Setujui pendaftaran ' + reg.username + ' (' + reg.name + ') sebagai ' +
        roleV + (timL ? ' — tim ' + timL : '')
    );

    return res.status(200).json({
      status: 'ok',
      message: 'Pendaftaran disetujui',
      data: { username: reg.username, role: roleV, tim: timL || null },
    });
  } catch (error) {
    console.error('[Approve User Error]', error.message);
    return res.status(500).json({
      status: 'error',
      message: 'Gagal menyetujui pendaftaran',
      ...(process.env.NODE_ENV !== 'production' && { detail: error.message }),
    });
  }
}

/* ------------------------------------------------------------------ */
/* 4) REJECT (Manager)                                                 */
/* ------------------------------------------------------------------ */

/**
 * POST /api/users/reject
 * Body: { username (manager), id, reason }
 */
async function rejectUser(req, res) {
  const { id, reason } = req.body || {};
  const regId = parseInt(id, 10);

  if (!regId) {
    return res.status(400).json({ status: 'error', message: 'Parameter id wajib diisi' });
  }

  try {
    await ensureTables();
    const gate = await requireManager(req);
    if (!gate.ok) return res.status(gate.code).json({ status: 'error', message: gate.message });
    const mgr = gate.manager;

    const { rows: regs } = await pool.query(
      sql`SELECT * FROM user_registrations WHERE id = {1} LIMIT 1`, [regId]
    );
    const reg = regs[0];
    if (!reg) return res.status(404).json({ status: 'error', message: 'Pendaftaran tidak ditemukan' });
    if (reg.status !== 'pending') {
      return res.status(409).json({
        status: 'error',
        message: 'Pendaftaran ini sudah diproses (' + reg.status + ')',
      });
    }

    await pool.query(
      sql`UPDATE user_registrations
          SET status = 'rejected', decided_by = {1}, decided_at = CURRENT_TIMESTAMP,
              rejected_reason = {2}
          WHERE id = {3}`,
      [mgr.username, reason ? String(reason).slice(0, 255) : null, regId]
    );

    await logActivity(
      mgr.username, mgr.name, mgr.role, 'reject_user',
      'Tolak pendaftaran ' + reg.username + ' (' + reg.name + ')' +
        (reason ? ' — alasan: ' + String(reason).slice(0, 80) : '')
    );

    return res.status(200).json({
      status: 'ok',
      message: 'Pendaftaran ditolak',
      data: { username: reg.username, status: 'rejected' },
    });
  } catch (error) {
    console.error('[Reject User Error]', error.message);
    return res.status(500).json({
      status: 'error',
      message: 'Gagal menolak pendaftaran',
      ...(process.env.NODE_ENV !== 'production' && { detail: error.message }),
    });
  }
}

/* ------------------------------------------------------------------ */
/* 5) LOG VIEWER (Manager)                                             */
/* ------------------------------------------------------------------ */

/**
 * GET /api/log/login?username=KSW&limit=200[&filter=user]
 * Riwayat login semua user (termasuk yang masih pending).
 */
async function getLoginLog(req, res) {
  const limit = Math.min(parseInt(req.query.limit, 10) || 200, 1000);
  const filter = (req.query.filter || '').trim();

  try {
    await ensureTables();
    const gate = await requireManager(req);
    if (!gate.ok) return res.status(gate.code).json({ status: 'error', message: gate.message });

    const { rows } = filter
      ? await pool.query(
          sql`SELECT username, name, role, accept, note, created_at
              FROM login_log
              WHERE username = {1}
              ORDER BY created_at DESC, id DESC
              LIMIT {2}`,
          [filter, limit]
        )
      : await pool.query(
          sql`SELECT username, name, role, accept, note, created_at
              FROM login_log
              ORDER BY created_at DESC, id DESC
              LIMIT {1}`,
          [limit]
        );

    return res.status(200).json({ status: 'ok', count: rows.length, data: rows });
  } catch (error) {
    console.error('[LoginLog Error]', error.message);
    return res.status(500).json({
      status: 'error',
      message: 'Gagal memuat riwayat login',
      ...(process.env.NODE_ENV !== 'production' && { detail: error.message }),
    });
  }
}

/**
 * GET /api/log/activity?username=KSW&limit=200[&filter=user]
 * Riwayat aksi yang mengubah data, semua role.
 */
async function getActivityLog(req, res) {
  const limit = Math.min(parseInt(req.query.limit, 10) || 200, 1000);
  const filter = (req.query.filter || '').trim();

  try {
    await ensureTables();
    const gate = await requireManager(req);
    if (!gate.ok) return res.status(gate.code).json({ status: 'error', message: gate.message });

    const { rows } = filter
      ? await pool.query(
          sql`SELECT username, name, role, action, detail, created_at
              FROM activity_log
              WHERE username = {1}
              ORDER BY created_at DESC, id DESC
              LIMIT {2}`,
          [filter, limit]
        )
      : await pool.query(
          sql`SELECT username, name, role, action, detail, created_at
              FROM activity_log
              ORDER BY created_at DESC, id DESC
              LIMIT {1}`,
          [limit]
        );

    return res.status(200).json({ status: 'ok', count: rows.length, data: rows });
  } catch (error) {
    console.error('[ActivityLog Error]', error.message);
    return res.status(500).json({
      status: 'error',
      message: 'Gagal memuat riwayat aktivitas',
      ...(process.env.NODE_ENV !== 'production' && { detail: error.message }),
    });
  }
}

module.exports = {
  ensureTables,
  logLogin,
  logActivity,
  registerUser,
  listRegistrations,
  approveUser,
  rejectUser,
  getLoginLog,
  getActivityLog,
};
