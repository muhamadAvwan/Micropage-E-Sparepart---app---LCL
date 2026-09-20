const { execSync } = require('child_process');
const path = require('path');

const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

function run(label, script, args) {
  console.log(`\n${YELLOW}${BOLD}▶ ${label}${RESET}`);
  try {
    execSync(`node scripts/${script} ${args || ''}`, { stdio: 'inherit', cwd: path.join(__dirname, '..') });
    console.log(`${GREEN}  ✓ ${label} selesai${RESET}`);
  } catch (err) {
    console.error(`${RED}  ✗ ${label} gagal${RESET}`);
    process.exit(1);
  }
}

console.log(`${GREEN}${BOLD}`);
console.log('╔══════════════════════════════════════════╗');
console.log('║   FULL SETUP E-SPAREPART (1 PERINTAH)   ║');
console.log('╚══════════════════════════════════════════╝');
console.log(`${RESET}`);

run('Generate seed.sql dari Excel', 'generateSeed.js');
run('Generate pengajuan massal (200+ data)', 'generateBulkPengajuan.js');
run('Generate Master DB Excel', 'seedMasterDB.js');
run('Setup database + seed ke MySQL', 'setupDatabase.js', '--yes');

console.log(`\n${GREEN}${BOLD}═══════════════════════════════════════════`);
console.log('  SEMUA SELESAI! Jalankan: npm start');
console.log(`═══════════════════════════════════════════${RESET}\n`);
