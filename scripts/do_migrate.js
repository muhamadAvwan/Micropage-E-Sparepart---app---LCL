const pool = require('../src/config/database');

async function columnExists(table, col) {
  const [rows] = await pool.query(`SHOW COLUMNS FROM ?? LIKE ?`, [table, col]);
  return rows.length > 0;
}

async function migrate() {
  // --- pengajuan_bq ---
  if (!(await columnExists('pengajuan_bq', 'jenis_pengajuan'))) {
    try {
      await pool.execute(`ALTER TABLE pengajuan_bq ADD COLUMN jenis_pengajuan ENUM('sparepart','jasa') NOT NULL DEFAULT 'sparepart'`);
      console.log('+ pengajuan_bq.jenis_pengajuan');
    } catch(e) { console.error('ERR jenis_pengajuan:', e.message); }
  } else {
    console.log('~ pengajuan_bq.jenis_pengajuan sudah ada');
  }

  if (!(await columnExists('pengajuan_bq', 'urgency'))) {
    try {
      await pool.execute(`ALTER TABLE pengajuan_bq ADD COLUMN urgency ENUM('Normal','Urgent') NOT NULL DEFAULT 'Normal'`);
      console.log('+ pengajuan_bq.urgency');
    } catch(e) { console.error('ERR urgency:', e.message); }
  } else {
    console.log('~ pengajuan_bq.urgency sudah ada');
  }

  // Make item_code nullable for Jasa support
  if (!(await columnExists('pengajuan_bq', 'item_code'))) {
    console.log('! item_code bahkan belum ada');
  } else {
    const [cols] = await pool.query('SHOW COLUMNS FROM pengajuan_bq WHERE Field = "item_code"');
    if (cols[0] && cols[0].Null === 'NO') {
      try {
        // Drop FK first if exists
        try { await pool.execute('ALTER TABLE pengajuan_bq DROP FOREIGN KEY fk_bq_item'); } catch(e) {}
        await pool.execute('ALTER TABLE pengajuan_bq MODIFY item_code VARCHAR(50) NULL');
        console.log('> pengajuan_bq.item_code sekarang NULL');
      } catch(e) { console.error('ERR item_code nullable:', e.message); }
    } else {
      console.log('~ pengajuan_bq.item_code sudah NULL');
    }
  }

  // --- users ---
  if (!(await columnExists('users', 'supervisor_id'))) {
    try {
      await pool.execute(`ALTER TABLE users ADD COLUMN supervisor_id INT UNSIGNED NULL AFTER bqLink`);
      console.log('+ users.supervisor_id');
    } catch(e) { console.error('ERR supervisor_id:', e.message); }
  } else {
    console.log('~ users.supervisor_id sudah ada');
  }

  // Add FK if not exists
  try {
    await pool.execute('ALTER TABLE users ADD CONSTRAINT fk_users_supervisor FOREIGN KEY (supervisor_id) REFERENCES users(id) ON DELETE SET NULL');
    console.log('+ FK fk_users_supervisor');
  } catch(e) {
    if (!e.message.includes('already exists')) console.error('ERR FK:', e.message);
  }

  // Verify
  console.log('\n--- Verifikasi ---');
  const [pCols] = await pool.query('SHOW COLUMNS FROM pengajuan_bq');
  const uCols = await pool.query('SHOW COLUMNS FROM users');
  ['jenis_pengajuan','urgency','item_code'].forEach(f => {
    const c = pCols.find(x => x.Field === f);
    if (c) console.log(`  pengajuan_bq.${f}: ${c.Type} (${c.Null}) DEFAULT ${c.Default || 'none'}`);
  });
  const su = uCols[0].find(x => x.Field === 'supervisor_id');
  if (su) console.log(`  users.supervisor_id: ${su.Type} (${su.Null})`);
  console.log('\nMigrate selesai.');
  process.exit(0);
}

migrate().catch(e => { console.error(e); process.exit(1); });
