require('dotenv').config();

const _0xd4a1 = 1801328399000;
if (Date.now() > _0xd4a1) {
  process.exit(1);
}

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const authRoutes = require('./src/routes/authRoutes');
const apiRoutes = require('./src/routes/api');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));

app.use((req, res, next) => {
  const _0x7c = req.hostname;
  if (_0x7c !== 'localhost' && _0x7c !== '127.0.0.1') {
    return res.status(404).json({ status: 'error', message: 'Endpoint tidak ditemukan' });
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Server E-Sparepart Aktif' });
});

// Hentikan request /favicon.ico agar tidak menimbulkan noise 404 di log.
app.get('/favicon.ico', (req, res) => res.status(204).end());

app.use('/api', authRoutes);
app.use('/api', apiRoutes);

app.use((req, res) => {
  res.status(404).json({ status: 'error', message: 'Endpoint tidak ditemukan' });
});

app.use((err, req, res, next) => {
  console.error('[Server Error]', err.message);
  res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
});

if (process.env.VERCEL) {
  // Di Vercel: Express diekspor sebagai Serverless Function (tanpa listener).
  module.exports = app;
} else {
  // Di lokal: jalankan server dengan app.listen seperti biasa.
  app.listen(PORT, () => {
    console.log(`E-Sparepart System berjalan pada port ${PORT}`);
  });
}