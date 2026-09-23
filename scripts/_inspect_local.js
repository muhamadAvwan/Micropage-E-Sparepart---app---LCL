require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
  });
  const [dbs] = await conn.query('SHOW DATABASES');
  console.log('databases:', dbs.map((d) => d.Database).join(', '));

  const db = process.env.DB_NAME || 'e_sparepart_local';
  await conn.query(`USE \`${db}\``);
  const [tables] = await conn.query('SHOW TABLES');
  console.log('tables in ' + db + ':', tables.map((t) => Object.values(t)[0]).join(', '));

  for (const t of ['users', 'spareparts', 'pengajuan_bq', 'pengajuan_log']) {
    try {
      const [rows] = await conn.query(`SELECT COUNT(*) AS c FROM \`${t}\``);
      console.log(`${t}: ${rows[0].c}`);
    } catch (e) {
      console.log(`${t}: ERROR ${e.message}`);
    }
  }
  const [u] = await conn.query('SELECT id, username, role, name, supervisor_id FROM users LIMIT 25');
  console.log('users sample:', JSON.stringify(u));

  await conn.end();
  process.exit(0);
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});