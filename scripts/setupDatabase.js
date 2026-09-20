const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const AUTO_YES = process.argv.includes('--yes');
const DB_NAME = process.env.DB_NAME || 'e_sparepart_local';
const SCHEMA_FILE = path.join(__dirname, '..', 'database', 'schema.sql');
const SEED_FILE = path.join(__dirname, '..', 'database', 'seed.sql');
const BULK_FILE = path.join(__dirname, '..', 'database', 'bulk_pengajuan.sql');

const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

function askQuestion(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

function stripDbStatements(sql) {
  const lines = sql.split('\n');
  const result = [];
  let skip = false;
  for (const line of lines) {
    const upper = line.trim().toUpperCase();
    if (upper.startsWith('CREATE DATABASE')) { skip = true; continue; }
    if (upper.startsWith('USE ') && upper.includes('E_SPAREPART')) { continue; }
    if (skip) {
      if (/;\s*$/.test(line.trim())) { skip = false; }
      continue;
    }
    result.push(line);
  }
  return result.join('\n');
}

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log('\n' + BOLD + YELLOW + '======================================================');
  console.log('        AUTO-SETUP DATABASE LOKAL E-SPAREPART');
  console.log('======================================================' + RESET);
  console.log(`Target database : ${DB_NAME}`);
  console.log(`Host           : ${process.env.DB_HOST || 'localhost'}`);
  console.log(`User           : ${process.env.DB_USER || 'root'}`);
  if (AUTO_YES) console.log(`Mode           : ${GREEN}otomatis (--yes)${RESET}`);
  console.log('');

  let conn;
  try {
    conn = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      multipleStatements: true,
    });

    const [rows] = await conn.query(`SHOW DATABASES LIKE '${DB_NAME}'`);
    const dbExists = rows.length > 0;

    if (dbExists) {
      if (AUTO_YES) {
        console.log(YELLOW + `Database '${DB_NAME}' sudah ada, menghapus...` + RESET);
      } else {
        const answer = await askQuestion(
          rl,
          `Database '${DB_NAME}' sudah ada. Ingin hapus dan buat ulang? (y/n): `
        );
        if (answer.trim().toLowerCase() !== 'y') {
          console.log(YELLOW + '\nDatabase lama dipertahankan. Lewati setup.' + RESET);
          rl.close();
          conn.end();
          return;
        }
      }
      console.log('\n' + YELLOW + '[1/4] Menghapus database lama...' + RESET);
      await conn.query(`DROP DATABASE \`${DB_NAME}\``);
    } else {
      console.log(GREEN + `\nDatabase '${DB_NAME}' belum ada, membuat baru...` + RESET);
    }

    console.log(YELLOW + '[2/4] Membuat database + menjalankan schema...' + RESET);
    await conn.query(
      `CREATE DATABASE \`${DB_NAME}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    await conn.query(`USE \`${DB_NAME}\``);

    const rawSchema = fs.readFileSync(SCHEMA_FILE, 'utf8');
    const schemaSql = stripDbStatements(rawSchema);
    await conn.query(schemaSql);
    console.log(GREEN + '  Schema OK.' + RESET);

    console.log(YELLOW + '[3/4] Menjalankan seed.sql (users + spareparts)...' + RESET);
    if (!fs.existsSync(SEED_FILE)) {
      throw new Error(`File tidak ditemukan: ${SEED_FILE}. Jalankan: node scripts/generateSeed.js`);
    }
    await conn.query(`USE \`${DB_NAME}\``);
    const seedSql = fs.readFileSync(SEED_FILE, 'utf8');
    await conn.query(seedSql);
    const [[sp]] = await conn.query('SELECT COUNT(*) AS cnt FROM spareparts');
    const [[us]] = await conn.query('SELECT COUNT(*) AS cnt FROM users');
    const [[pq]] = await conn.query('SELECT COUNT(*) AS cnt FROM pengajuan_bq');
    console.log(GREEN + `  Seed OK. ${us.cnt} users, ${sp.cnt} spareparts, ${pq.cnt} pengajuan.` + RESET);

    console.log(YELLOW + '[4/4] Menjalankan bulk_pengajuan.sql (data QA)...' + RESET);
    if (fs.existsSync(BULK_FILE)) {
      await conn.query(`USE \`${DB_NAME}\``);
      const bulkSql = fs.readFileSync(BULK_FILE, 'utf8');
      const bulkStmts = bulkSql
        .split('\n')
        .filter(l => l.trim().startsWith('INSERT'))
        .map(l => l.replace(/;$/, '').trim());
      let inserted = 0;
      for (const stmt of bulkStmts) {
        try {
          await conn.query(stmt);
          inserted++;
        } catch (e) {
          console.log(RED + `  Gagal: ${stmt.slice(0, 80)}... → ${e.message.slice(0, 80)}` + RESET);
        }
      }
      const [[bq]] = await conn.query('SELECT COUNT(*) AS cnt FROM pengajuan_bq');
      const [[lg]] = await conn.query('SELECT COUNT(*) AS cnt FROM pengajuan_log');
      console.log(GREEN + `  Bulk OK. ${inserted}/${bulkStmts.length} statements, ${bq.cnt} pengajuan, ${lg.cnt} log.` + RESET);
    } else {
      console.log(YELLOW + '  bulk_pengajuan.sql tidak ditemukan, dilewati.' + RESET);
    }

    console.log('\n' + GREEN + BOLD + 'Setup selesai!' + RESET);
    console.log(GREEN + `Database '${DB_NAME}' siap.` + RESET);
    console.log('');
    console.log(GREEN + '  Contoh akun login:' + RESET);
    console.log(GREEN + '    - Teknisi      : AAA / 04AAA10' + RESET);
    console.log(GREEN + '    - Supervisor 1 : INN / 30INN11' + RESET);
    console.log(GREEN + '    - Officer      : ANS / ANS1805' + RESET);
    console.log(GREEN + '    - Manager      : KSW / 01KSW10' + RESET);
  } catch (err) {
    console.error('\n' + RED + BOLD + '[Setup Gagal] ' + RESET + RED + err.message + RESET);
    process.exitCode = 1;
  } finally {
    if (conn) await conn.end();
    rl.close();
  }
}

main();
