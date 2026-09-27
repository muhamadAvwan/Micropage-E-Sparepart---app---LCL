const pool = require('../config/database');
const { hashPassword, verifyPassword } = require('../utils/password');
const { registerLoginFailure, clearLoginFailures } = require('../middleware/loginRateLimit');
const { ensureTables, logLogin } = require('./userManagementController');

async function verifyLogin(req, res) {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({
      status: 'error',
      message: 'Parameter username dan password wajib diisi',
    });
  }

  try {
    // Pastikan tabel log siap (idempoten) agar setiap login bisa tercatat.
    try { await ensureTables(); } catch (e) { console.error('[Auth ensureTables]', e.message); }

    const [rows] = await pool.execute(
      'SELECT * FROM users WHERE username = ? LIMIT 1',
      [username]
    );

    let found = rows[0];
    let fromRegistration = false;
    let regStatus = null;

    // Tidak ada di users? Periksa pendaftaran (register menunggu persetujuan).
    if (!found) {
      const [regRows] = await pool.execute(
        'SELECT * FROM user_registrations WHERE username = ? LIMIT 1',
        [username]
      );
      const reg = regRows[0];
      if (reg) {
        fromRegistration = true;
        regStatus = reg.status;
        found = { ...reg }; // username, password(hash), name
      }
    }

    const check = found
      ? verifyPassword(password, found.password)
      : { ok: false, needsUpgrade: false };

    // Pendaftaran yang DITOLAK tidak boleh masuk.
    if (fromRegistration && regStatus === 'rejected' && check.ok) {
      registerLoginFailure(req);
      return res.status(401).json({
        status: 'error',
        message: 'Pendaftaran akun ini ditolak Manager. Hubungi Manager Anda.',
      });
    }

    if (!found || !check.ok) {
      registerLoginFailure(req);
      return res.status(401).json({
        status: 'error',
        message: 'Kombinasi Username atau Password salah',
      });
    }

    clearLoginFailures(req);

    // Upgrade transparan: password plaintext lama disimpan ulang sebagai hash scrypt.
    if (check.needsUpgrade) {
      try {
        await pool.execute(
          'UPDATE users SET password = ? WHERE username = ?',
          [hashPassword(password), found.username]
        );
      } catch (upgradeErr) {
        console.error('[Auth Upgrade Warning]', upgradeErr.message);
      }
    }

    // ---- User pending (belum di-approve Manager) ----
    // Boleh masuk dengan layar tunggu; login tetap dicatat demi keamanan.
    if (fromRegistration && regStatus === 'pending') {
      await logLogin(found.username, found.name, 'pending', false, 'Menunggu persetujuan Manager');
      return res.status(200).json({
        status: 'ok',
        message: 'Login berhasil \u2014 akun menunggu persetujuan Manager',
        data: {
          username: found.username,
          role: 'pending',
          name: found.name,
          bqLink: '',
        },
      });
    }

    // ---- User aktif (sudah di-approve / seeded) ----
    await logLogin(found.username, found.name, found.role, true, null);

    const profile = {
      username: found.username,
      role: found.role,
      name: found.name,
      bqLink: found.bqLink || found.bqlink || '',
    };

    return res.status(200).json({
      status: 'ok',
      message: 'Login berhasil',
      data: profile,
    });
  } catch (error) {
    console.error('[Auth Error]', error.message);
    const isDev = process.env.NODE_ENV !== 'production';
    return res.status(500).json({
      status: 'error',
      message: 'Gagal membaca data pengguna dari database',
      ...(isDev && { detail: error.message }),
    });
  }
}

module.exports = { verifyLogin };
