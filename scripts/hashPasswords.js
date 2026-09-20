require('dotenv').config();
const pool = require('../src/config/database');
const { hashPassword, isHashed } = require('../src/utils/password');

(async () => {
  const dry = process.argv.includes('--dry');
  const [rows] = await pool.execute('SELECT id, username, password FROM users');

  let changed = 0;
  let skipped = 0;

  for (const u of rows) {
    if (isHashed(u.password)) {
      skipped += 1;
      continue;
    }
    if (!dry) {
      await pool.execute('UPDATE users SET password = ? WHERE id = ?', [
        hashPassword(u.password),
        u.id,
      ]);
    }
    changed += 1;
  }

  console.log(
    (dry ? '[DRY RUN] ' : '') +
      'Selesai. Dihash: ' + changed + ', dilewati (sudah hash): ' + skipped
  );
  await pool.end();
})().catch((err) => {
  console.error('Gagal:', err.message);
  process.exit(1);
});
