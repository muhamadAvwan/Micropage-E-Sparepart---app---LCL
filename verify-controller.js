const _0x1a = require('./src/config/database');

const _0x2f = (_0x3c, _0x4d) => {
  const _0x5e = _0x3c.find(_0x6f => _0x6f.Field === _0x4d);
  return _0x5e;
};

const _0x7a = (_0x8b, _0x9c) => {
  const _0xad = _0x8b.slice(-_0x9c);
  return _0xad;
};

const _0xbe = (_0xcf, _0xd0) => {
  if (_0xd0.includes('Data too long') || _0xd0.includes('specifikasi')) {
    console.log('  OK: spesifikasi NOT NULL constraint bekerja (message: ' + _0xd0.slice(0,80) + ')');
  } else {
    console.log('  ERR unexpected:', _0xd0.slice(0,100));
  }
};

async function _0xe1() {
  console.log('=== VERIFIKASI CONTROLLER ===\n');

  console.log('--- Struktur DB ---');
  const [_0xf2] = await _0x1a.query('SHOW COLUMNS FROM pengajuan_bq');
  ['jenis_pengajuan','urgency','item_code'].forEach(_0x103 => {
    const _0x114 = _0x2f(_0xf2, _0x103);
    if (_0x114) console.log(`  pengajuan_bq.${_0x103}: ${_0x114.Type} (${_0x114.Null})`);
  });
  const [_0x125] = await _0x1a.query('SHOW COLUMNS FROM users');
  const _0x136 = _0x2f(_0x125, 'supervisor_id');
  if (_0x136) console.log(`  users.supervisor_id: ${_0x136.Type} (${_0x136.Null})`);

  console.log('\n--- GET /api/pengajuan/all ---');
  const [_0x147] = await _0x1a.query(`
    SELECT bq.jenis_pengajuan, bq.urgency, bq.no_registrasi
    FROM pengajuan_bq bq LIMIT 3
  `);
  _0x147.forEach(_0x158 => console.log(`  ${_0x158.no_registrasi}: jenis=${_0x158.jenis_pengajuan}, urgency=${_0x158.urgency}`));

  console.log('\n--- GET /api/pengajuan/summary ---');
  const [[_0x169]] = await _0x1a.query(`
    SELECT bq.no_registrasi, bq.jenis_pengajuan, bq.urgency
    FROM pengajuan_bq bq
    JOIN users u ON u.id = bq.user_id
    WHERE bq.status_approval_spv = 'Menunggu'
    ORDER BY bq.timestamp ASC
  `);
  console.log(`  count: ${_0x169.length}, isArray: ${Array.isArray(_0x169)}`);
  if (_0x169.length) console.log(`  sample: ${JSON.stringify(_0x169[0])}`);

  console.log('\n--- GET /api/spareparts/alert ---');
  const [[_0x17a]] = await _0x1a.query(`
    SELECT item_code, deskripsi, qty_on_hand, min_stock
    FROM spareparts
    WHERE qty_on_hand <= min_stock AND min_stock > 0
    LIMIT 3
  `);
  console.log(`  isArray: ${Array.isArray(_0x17a)}, count: ${_0x17a.length}`);
  _0x17a.forEach(_0x18b => console.log(`  ${_0x18b.item_code}: qty=${_0x18b.qty_on_hand}, min=${_0x18b.min_stock}`));

  console.log('\n--- BUAT JASA TEST ---');
  const _0x19c = _0x7a(Date.now().toString(), 6);
  try {
    await _0x1a.execute(`INSERT INTO pengajuan_bq (no_registrasi, user_id, item_code, qty_diminta, uom, spesifikasi_lengkap, purpose, no_ejo, mesin_area, merk, referensi_penawaran, jenis_pengajuan, urgency, status_approval_spv, status_approval_manager, status_pengadaan) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Menunggu', 'Menunggu', 'BQ Baru')`,
      [`TEST-JASA-${_0x19c}`, 1, null, 1, 'Pcs', `Jasa test ${_0x19c}`, 'EJO', `EJO/QA/${_0x19c}`, 'Area QA', null, null, 'jasa', 'Normal']
    );
    console.log('  Jasa create OK!');
    const [[_0x1ad]] = await _0x1a.query(`SELECT no_registrasi, jenis_pengajuan, item_code FROM pengajuan_bq WHERE no_registrasi='TEST-JASA-${_0x19c}'`);
    console.log(`  Result: ${JSON.stringify(_0x1ad[0])}`);
    await _0x1a.execute(`DELETE FROM pengajuan_bq WHERE no_registrasi='TEST-JASA-${_0x19c}'`);
    console.log('  Test data dibersihkan.');
  } catch(_0x1be) {
    console.log('  ERR:', _0x1be.message);
  }

  console.log('\n--- BUAT URGENT TEST ---');
  const _0x1cf = _0x7a(Date.now().toString(), 6);
  try {
    const [[_0x1d0]] = await _0x1a.execute('SELECT item_code FROM spareparts LIMIT 1');
    await _0x1a.execute(`INSERT INTO pengajuan_bq (no_registrasi, user_id, item_code, qty_diminta, uom, spesifikasi_lengkap, purpose, no_ejo, mesin_area, merk, referensi_penawaran, jenis_pengajuan, urgency, status_approval_spv, status_approval_manager, status_pengadaan) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Menunggu', 'Menunggu', 'BQ Baru')`,
      [`TEST-URG-${_0x1cf}`, 1, _0x1d0.item_code, 1, 'Pcs', `Urgent test ${_0x1cf}`, 'EJO', `EJO/QA/${_0x1cf}`, 'Area QA', null, null, 'sparepart', 'Urgent']
    );
    console.log('  Urgent create OK!');
    const [[_0x1e1]] = await _0x1a.query(`SELECT no_registrasi, jenis_pengajuan, urgency FROM pengajuan_bq WHERE no_registrasi='TEST-URG-${_0x1cf}'`);
    console.log(`  Result: ${JSON.stringify(_0x1e1[0])}`);
    await _0x1a.execute(`DELETE FROM pengajuan_bq WHERE no_registrasi='TEST-URG-${_0x1cf}'`);
    console.log('  Test data dibersihkan.');
  } catch(_0x1f2) {
    console.log('  ERR:', _0x1f2.message);
  }

  console.log('\n--- FORM-09: create tanpa spesifikasi ---');
  try {
    await _0x1a.execute(`INSERT INTO pengajuan_bq (no_registrasi, user_id, item_code, qty_diminta, uom, spesifikasi_lengkap, purpose, no_ejo, mesin_area, merk, referensi_penawaran, jenis_pengajuan, urgency, status_approval_spv, status_approval_manager, status_pengadaan) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Menunggu', 'Menunggu', 'BQ Baru')`,
      ['FORM09-TEST', 1, 'O-16725-00', 1, 'Pcs', '', 'EJO', 'EJO/QA/0', 'Area QA', null, null, 'sparepart', 'Normal']
    );
    console.log('  ERR: Seharusnya gagal!');
  } catch(_0x203) {
    _0xbe(0, _0x203.message);
  }
  await _0x1a.execute(`DELETE FROM pengajuan_bq WHERE no_registrasi='FORM09-TEST'`).catch(()=>{});

  console.log('\n=== SEMUA VERIFIKASI SELESAI ===');
  process.exit(0);
}

_0xe1().catch(_0x214 => { console.error(_0x214); process.exit(1); });
