const XLSX = require('xlsx');

const MAX_ROWS = 20000;

/**
 * POST /api/export/xlsx
 * Body: { filename, sheet, columns, rows }
 *  - columns: array berisi string (nama kolom) atau { key, label }
 *  - rows   : array objek data
 * Membuat file .xlsx dari data yang dikirim frontend lalu mengirimkannya sebagai unduhan.
 */
function exportXlsx(req, res) {
  const { filename, sheet, columns, rows } = req.body || {};

  if (!Array.isArray(columns) || !columns.length || !Array.isArray(rows)) {
    return res.status(400).json({
      status: 'error',
      message: 'Parameter columns dan rows wajib diisi',
    });
  }
  if (rows.length > MAX_ROWS) {
    return res.status(413).json({
      status: 'error',
      message: 'Data terlalu besar untuk diexport (maksimal ' + MAX_ROWS + ' baris)',
    });
  }

  const keyOf = (c) => (typeof c === 'string' ? c : c.key);
  const labelOf = (c) => (typeof c === 'string' ? c : c.label || c.key);
  const header = columns.map(labelOf);
  const aoa = [header].concat(
    rows.map((r) => columns.map((c) => {
      const v = r[keyOf(c)];
      return v === undefined || v === null ? '' : v;
    }))
  );

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = header.map((h, i) => {
    let w = String(h).length;
    for (const row of aoa) w = Math.max(w, String(row[i]).length);
    return { wch: Math.min(50, w + 2) };
  });
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: aoa.length - 1, c: header.length - 1 } }) };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, String(sheet || 'Data').slice(0, 31));

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const safeName = (String(filename || 'export').replace(/[^a-zA-Z0-9-_]/g, '_') || 'export') + '.xlsx';

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="' + safeName + '"');
  return res.status(200).send(buffer);
}

module.exports = { exportXlsx };
