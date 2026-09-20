const pool = require('../config/database');
const { hashPassword, verifyPassword } = require('../utils/password');
const { registerLoginFailure, clearLoginFailures } = require('../middleware/loginRateLimit');

async function verifyLogin(req, res) {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({
      status: 'error',
      message: 'Parameter username dan password wajib diisi',
    });
  }

  try {
    const [rows] = await pool.execute(
      'SELECT * FROM users WHERE username = ? LIMIT 1',
      [username]
    );

    const found = rows[0];
    const check = found
      ? verifyPassword(password, found.password)
      : { ok: false, needsUpgrade: false };

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

    const profile = {
      username: found.username,
      role: found.role,
      name: found.name,
      bqLink: found.bqLink || '',
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