 const express = require('express');
 const { getAllSpareparts, getStockSummary } = require('../controllers/sparepartController');
  const {
    createPengajuan,
    getAllPengajuan,
    updateStatusPengajuan,
    getPengajuanLog,
    getPengajuanSummary,
    getStockAlert,
    getBqSummary,
    getMonthlyReport,
  } = require('../controllers/bqController');
  const { exportXlsx } = require('../controllers/exportController');

  const router = express.Router();

  // ---- Modul Teknisi ----
  router.get('/spareparts', getAllSpareparts);
  router.get('/spareparts/summary', getStockSummary);
  router.get('/spareparts/alert', getStockAlert);
  router.post('/pengajuan', createPengajuan);

  // ---- Modul Manager ----
  router.get('/pengajuan/all', getAllPengajuan);              // monitoring & approval
  router.get('/pengajuan/:id/log', getPengajuanLog);          // audit trail
  router.put('/pengajuan/:id/status', updateStatusPengajuan); // update status
  router.get('/pengajuan/summary', getPengajuanSummary);      // PR Summary
  router.get('/pengajuan/bq-summary', getBqSummary);          // BQ Summary

  // ---- Laporan ----
  router.get('/reports/monthly', getMonthlyReport);           // Monthly Report

// ---- Export Excel (.xlsx) ----
router.post('/export/xlsx', exportXlsx);

module.exports = router;