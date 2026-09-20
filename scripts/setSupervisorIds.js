const pool = require('../src/config/database');

async function setSupervisorIds() {
  const mapping = [
    { teknisi: 'AAA', supervisorId: 14 },
    { teknisi: 'ANO', supervisorId: 14 },
    { teknisi: 'BDU', supervisorId: 14 },
    { teknisi: 'MOB', supervisorId: 14 },
    { teknisi: 'MRN', supervisorId: 14 },
    { teknisi: 'NDS', supervisorId: 14 },
    { teknisi: 'RIA', supervisorId: 15 },
    { teknisi: 'ROS', supervisorId: 15 },
    { teknisi: 'SFH', supervisorId: 15 },
    { teknisi: 'KFF', supervisorId: 15 },
    { teknisi: 'ERA', supervisorId: 15 },
    { teknisi: 'WAP', supervisorId: 16 },
    { teknisi: 'MCL', supervisorId: 16 },
  ];

  console.log('--- Set supervisor_id mapping ---');
  for (const m of mapping) {
    const [[user]] = await pool.execute('SELECT id FROM users WHERE username = ?', [m.teknisi]);
    if (user) {
      await pool.execute('UPDATE users SET supervisor_id = ? WHERE id = ?', [m.supervisorId, user.id]);
      console.log(`  ${m.teknisi} -> Supervisor ${m.supervisorId}`);
    } else {
      console.log(`  ${m.teknisi} -> NOT FOUND`);
    }
  }
  console.log('--- Selesai ---');
  pool.end();
}

setSupervisorIds().catch(e => { console.error(e); process.exit(1); });
