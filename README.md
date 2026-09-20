# Micropage E-Sparepart - Sistem Manajemen Suku Cadang Terintegrasi

**Versi:** 1.0.0  
**Lingkup:** Sistem manajemen suku cadang (sparepart) berbasis web untuk operasional internal  
**Unit Pengembang:** Kelompok A 127 — Program Studi Sistem Informasi, Universitas Terbuka  
**Periode Pengembangan:** Semester 8, Tahun Akademik 2025/2026

---

## 1. Deskripsi Sistem

Micropage E-Sparepart adalah arsitektur web berbasis microservices lokal yang dibangun untuk menyinkronkan data operasional perusahaan dengan analitik real-time. Sistem ini menyelesaikan dua permasalahan utama dalam pengelolaan sparepart industri farmasi:

| Permasalahan | Modul Solusi |
|---|---|
| Proses pengadaan sparepart lambat dan sering terlewat | Formulir Digital + Approval Berjenjang + Monitoring Real-time |
| Belum ada Critical Sparepart List terintegrasi | On-Hand Stock + Critical Part List + KPI Dashboard |

Sistem menyediakan empat modul inti: **Formulir Digital BQ** (Berkas Qoute), **Monitoring Real-time**, **Critical/On-Hand Stock**, dan **Monthly Report** dengan akses berbasis peran (RBAC) untuk tiga kelompok pengguna.

---

## 2. Arsitektur Sistem

### 2.1 Diagram Arsitektur Komponen

```
┌─────────────────────────────────────────────────────────────┐
│                      CLIENT BROWSER                         │
│  ┌──────────┐ ┌────────────┐ ┌──────────┐ ┌──────────────┐  │
│  │  Login   │ │  Teknisi   │ │ Manager  │ │  QA Runner   │  │
│  │  Screen  │ │  Dashboard │ │ Dashboard│ │  (Puppeteer) │  │
│  └────┬─────┘ └─────┬──────┘ └────┬─────┘ └──────┬───────┘  │
│       └──────────────┴─────────────┴───────────────┘         │
└─────────────────────────────┬───────────────────────────────┘
                              │ HTTP (localhost:3000)
┌─────────────────────────────▼───────────────────────────────┐
│                   NODE.JS / EXPRESS 5.x                      │
│  ┌────────────────────────────────────────────────────────┐  │
│  │              Security & Encryption Layer               │  │
│  │  • Request Filtering — hanya menerima hostname lokal    │  │
│  │  • Login Rate Limiter — pembatas percobaan autentikasi │  │
│  │  • Password Hashing — enkripsi scrypt (Node.js bawaan) │  │
│  │  • Data Integrity Validation — validasi input wajib     │  │
│  └───────────────────────────┬────────────────────────────┘  │
│  ┌───────────────────────────▼────────────────────────────┐  │
│  │                   Request Handler                       │  │
│  │  authRoutes.js    → POST /api/login                     │  │
│  │  api.js           → RESTful API (spareparts, pengajuan) │  │
│  │  exportController → POST /api/export/xlsx               │  │
│  └───────────────────────────┬────────────────────────────┘  │
│  ┌───────────────────────────▼────────────────────────────┐  │
│  │               Business Logic Controllers                │  │
│  │  authController.js     — autentikasi + upgrade hash     │  │
│  │  bqController.js       — CRUD pengajuan + approval RBAC │  │
│  │  sparepartController.js— stok + KPI dashboard           │  │
│  │  exportController.js   — generasi file .xlsx            │  │
│  └───────────────────────────┬────────────────────────────┘  │
└─────────────────────────────┬───────────────────────────────┘
                              │ mysql2/promise (connection pool)
┌─────────────────────────────▼───────────────────────────────┐
│                    MySQL / XAMPP (LOKAL)                     │
│  ┌─────────────┐ ┌────────────┐ ┌───────────┐ ┌──────────┐  │
│  │    users    │ │ spareparts │ │pengajuan_bq│ │pengajuan │  │
│  │  (18 row)   │ │ (663 row)  │ │ (230 row) │ │  _log    │  │
│  └─────────────┘ └────────────┘ └───────────┘ │  (3 row) │  │
│                                                └──────────┘  │
│  Database: e_sparepart_local                                │
│  Charset:  utf8mb4_unicode_ci                               │
│  Engine:   InnoDB                                            │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Diagram Alur Approval Berjenjang

```
Teknisi                    Supervisor                 Manager                    Officer
   │                           │                          │                          │
   │  POST /api/pengajuan      │                          │                          │
   │──────────────────────────▶│                          │                          │
   │  Status: Menunggu/Menunggu│                          │                          │
   │                           │                          │                          │
   │                     PUT /api/pengajuan/:id/status    │                          │
   │                     (status_approval_spv)            │                          │
   │                           │─────────────────────────▶│                          │
   │                           │ Status: Disetujui/Menunggu│                         │
   │                           │                          │                          │
   │                           │          PUT /api/pengajuan/:id/status             │
   │                           │          (status_approval_manager)                 │
   │                           │                          │─────────────────────────▶│
   │                           │                          │ Status: Disetujui/Menunggu│
   │                           │                          │                          │
   │                           │                          │    PUT /api/pengajuan/:id/status
   │                           │                          │    (status_pengadaan)
   │                           │                          │◀─────────────────────────│
   │                           │                          │ Proses PO → Barang Dikirim│
```

---

## 3. Struktur File Arsip

```
Micropage E-Sparepart - app - LCL/
├── server.js                        # Entry point — Express server + Security & Encryption Layer
├── verify-controller.js             # Modul Verifikasi Integritas Data (skrip diagnostik DB)
├── run-qa-test.js                   # Runner otomatis QA test (Puppeteer headless)
├── package.json                     # Konfigurasi dependencies & scripts
├── vercel.json                      # Konfigurasi deployment Vercel (Serverless)
├── .env                             # Environment variables (lokal, tidak di-commit)
├── .env.example                     # Template environment variables
├── .gitignore                       # File yang dikecualikan dari version control
│
├── src/                             # Kode sumber aplikasi
│   ├── config/
│   │   ├── database.js              # Konfigurasi connection pool MySQL (mysql2/promise)
│   │   └── googleSheets.js          # Konfigurasi integrasi Google Sheets API (opsional)
│   ├── controllers/
│   │   ├── authController.js        # Controller autentikasi login + upgrade hash
│   │   ├── bqController.js          # Controller pengajuan BQ + approval + RBAC + audit trail
│   │   ├── sparepartController.js   # Controller data sparepart + ringkasan stok
│   │   └── exportController.js      # Controller ekspor data ke .xlsx
│   ├── middleware/
│   │   └── loginRateLimit.js        # Middleware pembatas percobaan login (in-memory)
│   ├── routes/
│   │   ├── authRoutes.js            # Rute autentikasi (POST /api/login)
│   │   └── api.js                   # Rute API utama (spareparts, pengajuan, laporan)
│   └── utils/
│       └── password.js              # Utilitas hashing & verifikasi password (scrypt)
│
├── database/                        # Aset basis data
│   ├── schema.sql                   # DDL — struktur tabel (users, spareparts, pengajuan_bq, pengajuan_log)
│   ├── seed.sql                     # Data contoh — 18 users + 663 sparepart + 4 pengajuan
│   └── bulk_pengajuan.sql           # Data massal — 227 pengajuan + 3 audit trail (data QA)
│
├── scripts/                         # Skrip utilitas otomatis
│   ├── setupAll.js                  # Pipeline setup lengkap (1 perintah)
│   ├── setupDatabase.js             # Inisialisasi database MySQL (--yes untuk non-interaktif)
│   ├── generateSeed.js              # Generate seed.sql dari file Excel
│   ├── generateBulkPengajuan.js     # Generate bulk_pengajuan.sql (data QA 200+ baris)
│   ├── seedMasterDB.js              # Generate Master DB Excel dari seed
│   ├── seedPengajuan.js             # Skrip insert pengajuan tambahan
│   ├── addPengajuanLog.js           # Migrasi tabel audit trail
│   ├── hashPasswords.js             # Hash massal password plaintext → scrypt
│   ├── setSupervisorIds.js          # Set supervisor_id pada tabel users
│   └── do_migrate.js                # Skrip migrasi umum
│
├── public/                          # Aset statis (frontend)
│   ├── index.html                   # Halaman utama aplikasi
│   ├── qa-test.html                 # Halaman QA test runner (manual + otomatis)
│   ├── test-runner.html             # Test runner API (5 tes dasar)
│   └── visual-test.html             # UAT visual login/logout
│
├── tests/                           # Pengujian kualitas
│   ├── visual_uat.js                # Skrip UAT visual (Puppeteer + screenshot)
│   ├── TEST-PLAN.md                 # Dokumen rencana pengujian lengkap (12 modul)
│   └── screenshots/                 # Bukti screenshot hasil pengujian
│       ├── 1-teknisi-dashboard.png
│       ├── 1-teknisi-stok.png
│       ├── 2-manager-dashboard.png
│       ├── 2-manager-monitoring.png
│       ├── 2-manager-report.png
│       ├── kpi-dashboard.png
│       ├── kpi-low-modal.png
│       ├── monitoring-toolbar.png
│       ├── report-filtered.png
│       ├── report-monthly-trend.png
│       ├── riwayat-modal.png
│       └── stok-toolbar.png
│
├── Salinan_Spreadsheet_Sparepart/   # Salinan data master Excel perusahaan
│   └── Master DB_User.xlsx          # Master database pengguna
│
└── CP Kelompok A 127/               # Dokumen capstone project (tidak di-commit)
```

---

## 4. Skema Basis Data

### 4.1 Nama Basis Data

| Parameter | Nilai |
|---|---|
| Nama Database | `e_sparepart_local` |
| Charset | `utf8mb4_unicode_ci` |
| Engine | InnoDB |

### 4.2 Struktur Tabel

#### Tabel `users`

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | INT UNSIGNED, PK, AUTO_INCREMENT | Identifikasi unik pengguna |
| `username` | VARCHAR(50), UNIQUE | Username untuk login |
| `password` | VARCHAR(255) | Password (scrypt hash setelah login pertama) |
| `role` | VARCHAR(50) | Peran: `teknisi`, `Supervisor 1`, `Supervisor 2`, `Officer`, `manager` |
| `name` | VARCHAR(100) | Nama lengkap |
| `bqLink` | TEXT, NULL | Tautan Google Sheets BQ pribadi (teknisi saja) |
| `supervisor_id` | INT UNSIGNED, NULL, FK → users.id | Referensi supervisor yang menaungi |
| `created_at` | TIMESTAMP | Waktu pembuatan record |

#### Tabel `spareparts`

| Kolom | Tipe | Keterangan |
|---|---|---|
| `item_code` | VARCHAR(50), PK | Kode barang, contoh: `O-50834-00` |
| `deskripsi` | VARCHAR(255) | Deskripsi barang |
| `qty_on_hand` | INT UNSIGNED | Stok tersedia |
| `min_stock` | INT UNSIGNED | Batas minimum stok |
| `max_stock` | INT UNSIGNED | Batas maksimum stok |
| `is_critical` | TINYINT(1) | 1 = critical part |
| `lokasi_rak` | VARCHAR(50), NULL | Lokasi penyimpanan di gudang |

#### Tabel `pengajuan_bq`

| Kolom | Tipe | Keterangan |
|---|---|---|
| `no_registrasi` | VARCHAR(50), PK | Nomor registrasi, format: `BQ-YYYYMMDD-####` |
| `user_id` | INT UNSIGNED, FK → users.id | ID pengaju |
| `item_code` | VARCHAR(50), NULL, FK → spareparts.item_code | Kode barang (NULL jika jasa) |
| `jenis_pengajuan` | ENUM(`sparepart`, `jasa`) | Jenis pengajuan |
| `qty_diminta` | INT UNSIGNED | Jumlah yang diminta |
| `uom` | VARCHAR(20), NULL | Satuan ukur (Pcs, Set, dll) |
| `spesifikasi_lengkap` | TEXT | Spesifikasi detail barang |
| `purpose` | VARCHAR(100), NULL | Tujuan penggunaan |
| `no_ejo` | VARCHAR(30), NULL | Nomor Engineering Job Order |
| `mesin_area` | VARCHAR(100), NULL | Mesin atau area tujuan |
| `merk` | VARCHAR(100), NULL | Merek/spesifikasi teknis |
| `referensi_penawaran` | TEXT, NULL | Tautan referensi penawaran |
| `urgency` | ENUM(`Normal`, `Urgent`) | Tingkat urgensi |
| `status_approval_spv` | VARCHAR(20) | `Menunggu` / `Disetujui` / `Ditolak` |
| `status_approval_manager` | VARCHAR(20) | `Menunggu` / `Disetujui` / `Ditolak` |
| `status_pengadaan` | VARCHAR(30) | Pipeline: `BQ Baru` → `Pending` → `Proses PO` → `Barang Dikirim` → `Tiba di Gudang` |
| `timestamp` | TIMESTAMP | Waktu pengajuan dibuat |

#### Tabel `pengajuan_log` (Audit Trail)

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | INT UNSIGNED, PK, AUTO_INCREMENT | ID log |
| `no_registrasi` | VARCHAR(50), FK → pengajuan_bq.no_registrasi | Nomor registrasi terkait |
| `actor_id` | INT UNSIGNED, NULL | ID pengguna yang melakukan perubahan |
| `actor_name` | VARCHAR(100), NULL | Nama pengguna |
| `actor_role` | VARCHAR(50), NULL | Peran pengguna |
| `field` | VARCHAR(30) | Kolom yang diubah (`status_approval_spv`, `status_approval_manager`, `status_pengadaan`) |
| `old_value` | VARCHAR(50), NULL | Nilai sebelum perubahan |
| `new_value` | VARCHAR(50), NULL | Nilai sesudah perubahan |
| `created_at` | TIMESTAMP | Waktu perubahan dicatat |

### 4.3 Data Baseline (Setelah Setup)

| Data | Jumlah |
|---|---|
| Total users | 18 (13 teknisi, 3 supervisor, 1 officer, 1 manager) |
| Total spareparts | 663 |
| Critical part (`is_critical=1`) | 155 |
| Total pengajuan BQ | 230 |
| Periode data | Januari 2025 — September 2026 (21 bulan) |
| Audit trail contoh | `BQ-2026-09-01-0001` (3 entri) |

---

## 5. Tech Stack & Dependensi

### 5.1 Runtime & Framework

| Komponen | Versi | Keterangan |
|---|---|---|
| Node.js | >= 18.x | Runtime JavaScript |
| Express | 5.2.1 | Web framework (CommonJS modules) |
| MySQL | 5.7+ / 8.0+ | Database (XAMPP lokal) |
| mysql2 | 3.24.4 | Driver MySQL dengan Promise support |

### 5.2 Dependensi Produksi

| Package | Versi | Fungsi |
|---|---|---|
| `express` | ^5.2.1 | HTTP server & routing |
| `mysql2` | ^3.24.4 | Koneksi database MySQL |
| `dotenv` | ^17.4.2 | Manajemen environment variables |
| `cors` | ^2.8.6 | Cross-Origin Resource Sharing |
| `body-parser` | ^2.3.0 | Parsing request body JSON |
| `xlsx` | ^0.18.5 | Generasi file Excel (.xlsx) |
| `googleapis` | ^181.0.0 | Integrasi Google Sheets API (opsional) |
| `puppeteer` | ^25.11.0 | Pengujian visual otomatis (QA) |

### 5.3 Konfigurasi Lokal

| Parameter | Nilai Default |
|---|---|
| Port | `3000` |
| Database Host | `localhost` |
| Database Port | `3306` |
| Database User | `root` |
| Database Password | _(kosong)_ |
| Database Name | `e_sparepart_local` |

---

## 6. Panduan Instalasi Lingkungan Lokal

### 6.1 Prasyarat

| Komponen | Versi Minimum | Keterangan |
|---|---|---|
| Node.js | 18.x | `node --version` |
| npm | 9.x | `npm --version` |
| XAMPP | 3.2.6+ | Jalankan **Apache** dan **MySQL** dari XAMPP Control Panel |

### 6.2 Langkah Instalasi

**Langkah 1 — Clone Repository**

```bash
git clone <url-repositori>
cd "Micropage E-Sparepart - app - LCL"
```

**Langkah 2 — Install Dependensi**

```bash
npm install
```

**Langkah 3 — Konfigurasi Environment Variables**

Buat file `.env` di direktori root berdasarkan template `.env.example`:

```env
# Server
PORT=3000

# Database MySQL (XAMPP)
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=e_sparepart_local

# Google Sheets API (opsional, kosongkan untuk mode lokal)
GOOGLE_CREDENTIALS_PATH=
MASTER_SPREADSHEET_ID=
MASTER_DB_SHEET_NAME=
MASTER_DB_LOCAL_FILE=
```

**Langkah 4 — Inisialisasi Database**

Jalankan pipeline setup lengkap untuk membuat database, tabel, dan mengisi data contoh:

```bash
npm run setup:all
```

Perintah ini akan:
1. Generate `database/seed.sql` dari file Excel master
2. Generate `database/bulk_pengajuan.sql` (230 data pengajuan untuk QA)
3. Generate `Salinan_Spreadsheet_Sparepart/Master DB_User.xlsx`
4. Membuat database `e_sparepart_local` dan menjalankan schema + seed + bulk data

**Langkah 5 — Jalankan Server**

```bash
npm start
```

Server akan berjalan pada `http://localhost:3000`.

**Langkah 6 — Verifikasi**

Buka browser dan akses:

```
http://localhost:3000/api/health
```

Respons yang diharapkan:

```json
{"status":"ok","message":"Server E-Sparepart Aktif"}
```

### 6.3 Akun Uji (Default)

| Peran | Username | Password | Menu yang Tersedia |
|---|---|---|---|
| Teknisi | `AAA` | `04AAA10` | BQ Personal, On Hand Stock |
| Supervisor 1 | `INN` | `30INN11` | PR Summary, BQ Monitoring, Critical Part List |
| Officer | `ANS` | `ANS1805` | PR Summary, BQ Monitoring, Critical Part List |
| Manager | `KSW` | `01KSW10` | BQ Monitoring, Monthly Report, Critical Part List |

### 6.4 Perintah Tambahan

```bash
# Setup database saja (tanpa generate dari Excel)
npm run setup

# Seed data pengguna dari Excel
npm run seed

# Development mode (auto-reload saat kode berubah)
npm run dev

# Jalankan QA test otomatis (Puppeteer)
node run-qa-test.js
```

---

## 7. API Reference

### 7.1 Autentikasi

| Method | Endpoint | Keterangan |
|---|---|---|
| `POST` | `/api/login` | Login pengguna |

**Request Body:**

```json
{
  "username": "AAA",
  "password": "04AAA10"
}
```

**Response (200):**

```json
{
  "status": "ok",
  "message": "Login berhasil",
  "data": {
    "username": "AAA",
    "role": "teknisi",
    "name": "AAA",
    "bqLink": "https://..."
  }
}
```

### 7.2 Modul Teknisi

| Method | Endpoint | Keterangan |
|---|---|---|
| `GET` | `/api/spareparts` | Daftar seluruh sparepart |
| `GET` | `/api/spareparts/summary` | Ringkasan stok (KPI dashboard) |
| `GET` | `/api/spareparts/alert` | Alert stok di bawah minimum |
| `POST` | `/api/pengajuan` | Buat pengajuan BQ baru |

### 7.3 Modul Manager & Supervisor

| Method | Endpoint | Keterangan |
|---|---|---|
| `GET` | `/api/pengajuan/all` | Seluruh pengajuan BQ (monitoring) |
| `GET` | `/api/pengajuan/:id/log` | Audit trail perubahan status |
| `PUT` | `/api/pengajuan/:id/status` | Update status approval/pengadaan |
| `GET` | `/api/pengajuan/summary` | PR Summary (Manager/Supervisor 1) |
| `GET` | `/api/pengajuan/bq-summary` | BQ Summary (ringkasan lengkap) |

### 7.4 Laporan & Ekspor

| Method | Endpoint | Keterangan |
|---|---|---|
| `GET` | `/api/reports/monthly?year=2026&month=9` | Laporan bulanan |
| `POST` | `/api/export/xlsx` | Ekspor data ke file .xlsx |

### 7.5 Health Check

| Method | Endpoint | Keterangan |
|---|---|---|
| `GET` | `/api/health` | Status server |

---

## 8. Fitur & Modul Aplikasi

### 8.1 Modul Teknisi

| Fitur | Keterangan |
|---|---|
| BQ Personal | Formulir pengajuan sparepart/jasa digital dengan validasi lengkap (Item Code, Qty, UoM, Purpose, No. EJO, Mesin/Area, Spesifikasi, Merk, Referensi) |
| On Hand Stock | Tabel 663 sparepart dengan pencarian, filter, dan ekspor Excel/CSV |

### 8.2 Modul Supervisor / Officer

| Fitur | Keterangan |
|---|---|
| PR Summary | Daftar pengajuan yang menunggu approval SPV (filter per tim via `supervisor_id`) |
| BQ Monitoring | Monitoring seluruh pengajuan + approval tahap 1 (SPV) + ubah status pengadaan (Officer) |
| Critical Part List | Daftar sparepart critical (`is_critical=1`) dengan status stok |

### 8.3 Modul Manager

| Fitur | Keterangan |
|---|---|
| BQ Monitoring | Monitoring + approval final (Manager) + audit trail lengkap |
| Monthly Report | Laporan bulanan dengan grafik (pie/doughnut/bar/line), filter periode, dan ekspor CSV/Excel |
| Critical Part List | Akses daftar critical sparepart |
| BQ Summary | Ringkasan lengkap seluruh pengajuan BQ (status approval, pipeline, urgency) |

### 8.4 Fitur Keamanan

| Fitur | Mekanisme | Keterangan |
|---|---|---|
| Request Filtering | Security & Encryption Layer | Hanya menerima request dari hostname `localhost` atau `127.0.0.1` |
| Login Rate Limiting | Middleware pembatas | Maksimal 5 percobaan login gagal per 15 menit per IP + username |
| Password Hashing | scrypt (Node.js bawaan) | Password di-hash secara otomatis saat login pertama (transparent upgrade) |
| RBAC Backend | Validasi role di controller | Supervisor hanya bisa approve SPV, Manager approve final, Officer ubah status pengadaan |
| Audit Trail | Tabel `pengajuan_log` | Setiap perubahan status tercatat: siapa, kapan, field apa, dari mana ke mana |
| Data Integrity Validation | Validasi input wajib | Semua field kewajiban divalidasi di backend sebelum disimpan |
| Data Integrity Verification | Modul verifikasi diagnostik | Skrip `verify-controller.js` memverifikasi integritas struktur database dan controller |

### 8.5 Fitur Ekspor

| Format | Mekanisme | Maksimal |
|---|---|---|
| Excel (.xlsx) | Library `xlsx` | 20.000 baris |
| CSV | Browser-native | Tanpa batas |

---

## 9. Dokumentasi Penjaminan Mutu (QA)

### 9.1 Pengujian Otomatis

Sistem dilengkapi tiga mekanisme pengujian otomatis:

| Alat | File | Cara Menjalankan | Cakupan |
|---|---|---|---|
| QA Test Runner | `public/qa-test.html` | Buka `http://localhost:3000/qa-test.html` | 61 tes (API + UI + E2E) |
| Puppeteer Headless | `run-qa-test.js` | `node run-qa-test.js` | QA test runner dalam mode headless |
| Visual UAT | `tests/visual_uat.js` | `node tests/visual_uat.js` | UAT visual login/logout + screenshot |

### 9.2 Modul Pengujian

Dokumen rencana pengujian lengkap terdapat di `tests/TEST-PLAN.md` dengan 12 modul pengujian:

| ID | Modul | Jumlah Tes | Prioritas |
|---|---|---|---|
| AUTH | Autentikasi & Sesi | 13 | P0 |
| RBAC | Otorisasi Berbasis Peran | 13 | P0 |
| FORM | Formulir Pengajuan Digital | 15 | P0 |
| APP | Approval Berjenjang | 13 | P0 |
| MON | Monitoring Real-time & Audit Trail | 13 | P0 |
| STOK | Critical Part, On-Hand Stock & KPI | 11 | P0 |
| REP | Monthly Report | 10 | P0 |
| EXP | Ekspor Data | 5 | P0-P1 |
| NFR | Non-Fungsional & Ketahanan | 8 | P1-P2 |
| UI | Uji Visual Antarmuka | — | P1 |
| E2E | End-to-End Workflow | — | P1 |
| API | Tes Endpoint API | — | P0-P1 |

### 9.3 Bukti Pengujian

Dokumentasi bukti pengujian tersimpan di `tests/screenshots/` dengan 12 screenshot:

| File | Keterangan |
|---|---|
| `1-teknisi-dashboard.png` | Dashboard teknisi setelah login |
| `1-teknisi-stok.png` | Tampilan On Hand Stock (teknisi) |
| `2-manager-dashboard.png` | Dashboard manager setelah login |
| `2-manager-monitoring.png` | BQ Monitoring (manager) |
| `2-manager-report.png` | Monthly Report (manager) |
| `kpi-dashboard.png` | Kartu KPI stok (Total, Critical, Rendah, Habis) |
| `kpi-low-modal.png` | Modal detail stok rendah |
| `monitoring-toolbar.png` | Toolbar pencarian & filter monitoring |
| `report-filtered.png` | Monthly Report dengan filter periode aktif |
| `report-monthly-trend.png` | Grafik tren bulanan |
| `riwayat-modal.png` | Modal audit trail riwayat perubahan |
| `stok-toolbar.png` | Toolbar pencarian & filter sparepart |

### 9.4 Kriteria Lulus

- Semua tes **P0 = 100% PASS**
- **P1 ≥ 90% PASS**
- Tidak ada bug **Critical/High** pada alur utama (login → pengajuan → approval → monitoring → laporan)
- Bukti uji tersimpan di `tests/screenshots/`

---

## 10. Catatan Teknis

### 10.1 Integrasi Google Sheets (Opsional)

Sistem mendukung integrasi dengan Google Sheets API untuk sinkronisasi data cloud. Untuk mode lokal, integrasi ini tidak diperlukan. Konfigurasi dilakukan melalui variabel berikut:

```env
GOOGLE_CREDENTIALS_PATH=./credentials.json
MASTER_SPREADSHEET_ID=<ID_Spreadsheet>
MASTER_DB_SHEET_NAME=Users
```

Jika variabel ini dikosongkan, sistem akan menggunakan data Excel lokal dari `Salinan_Spreadsheet_Sparepart/Master DB_User.xlsx`.

### 10.2 Password Hashing

Sistem menggunakan algoritma **scrypt** (bawaan Node.js) untuk hashing password. Format hash:

```
scrypt$<salt_hex>$<hash_hex>
```

Password yang masih berupa plaintext akan di-hash secara otomatis (transparent upgrade) saat pengguna login untuk pertama kali.

### 10.3 Deployment Vercel

Sistem juga dikonfigurasi untuk deployment di Vercel sebagai Serverless Function. Konfigurasi terdapat di `vercel.json`. Saat berjalan di Vercel, Express akan diekspor sebagai module (tanpa `app.listen`).

---

## 11. Lisensi

Proyek ini dikembangkan untuk keperluan Tugas Akhir Program Studi Sistem Informasi, Universitas Terbuka.

---

**Micropage E-Sparepart** — Kelompok A 127, Universitas Terbuka, 2026.
