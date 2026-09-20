const pool = require('../config/database');

async function getAllSpareparts(req, res) {
  try {
    const [rows] = await pool.query(
      'SELECT item_code, deskripsi, qty_on_hand, min_stock, max_stock, is_critical, lokasi_rak ' +
      'FROM spareparts ORDER BY is_critical DESC, deskripsi ASC'
    );
    return res.status(200).json({ status: 'ok', data: rows });
  } catch (error) {
    console.error('[Sparepart Error]', error.message);
    return res.status(500).json({
      status: 'error',
      message: 'Gagal mengambil data sparepart',
      ...(process.env.NODE_ENV !== 'production' && { detail: error.message }),
    });
  }
}

/**
 * GET /api/spareparts/summary
 * Ringkasan real-time untuk KPI dashboard:
 *  - total item, jumlah critical part
 *  - jumlah item stok rendah (qty_on_hand <= min_stock, min_stock > 0)
 *  - jumlah item stok habis (qty_on_hand = 0)
 *  - daftar item yang perlu segera dipesan (stok rendah, urut paling defisit)
 */
async function getStockSummary(req, res) {
  try {
    const [[counts]] = await pool.query(
      `SELECT
         COUNT(*)                                     AS total_item,
         COALESCE(SUM(is_critical = 1), 0)            AS total_critical,
         COALESCE(SUM(min_stock > 0 AND qty_on_hand <= min_stock), 0) AS stok_rendah,
         COALESCE(SUM(qty_on_hand = 0), 0)            AS stok_habis
       FROM spareparts`
    );

    const [lowStock] = await pool.query(
      `SELECT item_code, deskripsi, qty_on_hand, min_stock, max_stock, is_critical, lokasi_rak
         FROM spareparts
        WHERE min_stock > 0 AND qty_on_hand <= min_stock
        ORDER BY (min_stock - qty_on_hand) DESC, is_critical DESC, deskripsi ASC
        LIMIT 12`
    );

    return res.status(200).json({
      status: 'ok',
      data: {
        total_item: Number(counts.total_item),
        total_critical: Number(counts.total_critical),
        stok_rendah: Number(counts.stok_rendah),
        stok_habis: Number(counts.stok_habis),
        low_stock: lowStock,
      },
    });
  } catch (error) {
    console.error('[Sparepart Summary Error]', error.message);
    return res.status(500).json({
      status: 'error',
      message: 'Gagal mengambil ringkasan stok',
      ...(process.env.NODE_ENV !== 'production' && { detail: error.message }),
    });
  }
}

module.exports = { getAllSpareparts, getStockSummary };