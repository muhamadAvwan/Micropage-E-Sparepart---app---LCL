# TEST PLAN — Micropage E-Sparepart (Sistem Informasi Dashboard Terintegrasi)

Dokumen ini adalah daftar & skenario pengujian lengkap agar tujuan proyek (sesuai ringkasan Ketua)
tercapai dan aplikasi dapat diuji oleh tim tanpa kendala.

- Versi: 1.0
- Basis kode: `Micropage E-Sparepart - app`
- Penguji: seluruh anggota tim (silakan isi kolom Status)
- Status akhir diisi: `PASS` / `FAIL` / `BLOCKED`

---

## 0. Cara Pakai Dokumen Ini

1. Pastikan **Persiapan** (bagian 3) selesai, terutama `npm start`.
2. Kerjakan sesuai urutan prioritas: **P0 dulu**, lalu P1, lalu P2.
3. Untuk setiap baris: lakukan Langkah, bandingkan dengan Hasil Diharapkan, isi Status.
4. Jika gagal, catat pakai **Template Laporan Bug** (bagian 11).
5. Tandai kasus yang memang belum tersedia sebagai `BLOCKED` (lihat bagian 9).

Prioritas:
- **P0** = wajib, kritis untuk demo & alur utama (harus 100% lulus).
- **P1** = penting, memengaruhi kelengkapan/kualitas.
- **P2** = tambahan / ketahanan / kenyamanan.

---

## 1. Tujuan Pengujian & Keterkaitan dengan Tujuan Proyek

Masalah utama: sparepart untuk closing EJO/Engineering Job Order sering kosong, sehingga mesin
turun (downtime) & lembur tinggi. Dua akar masalah dan modul yang dibangun:

Akar Masalah #1 — Proses pengadaan lambat & sering terlewat:
- Formulir pengajuan wajib lengkap (spesifikasi, merek/qty, EJO, mesin/area) + review Supervisor.
- Dasbor monitoring real-time dari pengajuan sampai barang tiba di gudang.

Akar Masalah #2 — Belum ada Critical Sparepart List terintegrasi:
- Sentralisasi daftar critical + status On-Hand Stock (single source of truth), dapat diakses
  Manager, Supervisor, dan Teknisi kapan saja.

Modul inti: (1) Formulir Digital + Approval, (2) Monitoring Real-time, (3) Critical/On-Hand Stock,
(4) Monthly Report.

---

## 2. Lingkup Pengujian

- Autentikasi & otorisasi (RBAC per role).
- Form pengajuan BQ, approval berjenjang, monitoring, audit trail.
- Critical Part List, On-Hand Stock, KPI ringkasan stok.
- Monthly Report (grafik + filter) dan ekspor (CSV & Excel).
- Ketahanan/keamanan dasar (rate limit, validasi input) dan tampilan.

Di luar lingkup (belum ada / menunggu keputusan): PR Summary, field Urgency, input Jasa (JA)/BR,
sinkronisasi Google Sheets/Looker Studio.

---

## 3. Persiapan Lingkungan (WAJIB, sekali saja)

1. XAMPP: jalankan **Apache** & **MySQL**.
2. Database: pastikan `e_sparepart_local` sudah ada.
   - Buat/isi ulang data contoh (opsional): `npm run setup` lalu `npm run seed`.
   - Migrasi audit trail: `node scripts/addPengajuanLog.js`.
   - (Sudah dijalankan admin) hash password: `node scripts/hashPasswords.js`.
3. Dependensi: `npm install`.
4. **Jalankan server: `npm start`** → tunggu log `... berjalan pada port 3000`.
   - PENTING: perubahan backend terbaru hanya aktif setelah server di-restart.
   - Jika login gagal padahal server hidup, restart `npm start` (password lama sudah di-hash).
5. Buka aplikasi: `http://localhost:3000` (bukan file://).
6. Cek server: buka `http://localhost:3000/api/health` → `{"status":"ok",...}`.
7. Siapkan browser: 1 jendela normal + 1 mode Incognito (untuk uji 2 sesi role berbeda).

Catatan pengujian data: menambah pengajuan baru akan mengubah jumlah di Monitoring/Monthly Report.
Catat jumlah awal (bagian 5) agar mudah membandingkan.

---

## 4. Akun Uji

| Role | Username | Password | Catatan |
|---|---|---|---|
| Teknisi | `AAA` | `04AAA10` | Punya link BQ pribadi |
| Teknisi | `ANO` `BDU` `MOB` `MRN` `NDS` `RIA` `ROS` `SFH` `KFF` `ERA` `WAP` `MCL` | lihat `database/seed.sql` | Data uji tambahan |
| Supervisor 1 | `INN` | `30INN11` | Approval tahap 1 (SPV) |
| Supervisor 2 | `MUN` `KAA` | lihat `database/seed.sql` | Approval tahap 1 (SPV) |
| Officer | `ANS` | `ANS1805` | Ubah Status Pengadaan |
| Manager | `KSW` | `01KSW10` | Approval final + laporan |

> Password di atas tetap sama walau di database sudah disimpan sebagai hash.

---

## 5. Baseline Data (acuan awal, 17 Sep 2026)

| Data | Nilai |
|---|---|
| Total users | 18 (13 teknisi, 3 supervisor, 1 officer, 1 manager) |
| Total spareparts | 663 |
| Critical part (`is_critical=1`) | 155 |
| Stok rendah (qty ≤ min, min>0) | 284 |
| Stok habis (qty = 0) | 140 |
| Total pengajuan BQ | 200 |
| Approval SPV | Disetujui 188, Ditolak 10, Menunggu 2 |
| Approval Manager | Disetujui 184, Menunggu 16 |
| Status pengadaan | Tiba di Gudang 168, BQ Baru 14, Proses PO 11, Barang Dikirim 4, Pending 3 |
| Periode tersedia | Jan 2025 – Sep 2026 (21 bulan) |
| Contoh audit trail | `BQ-2026-09-01-0001` (3 entri) |

> Angka ini adalah snapshot; akan bertambah saat tim membuat pengajuan baru.

---

## 6. Alat Uji Otomatis yang Sudah Tersedia

| Alat | Cara pakai | Cakupan |
|---|---|---|
| `public/test-runner.html` | Buka `http://localhost:3000/test-runner.html` | 5 tes API (health + login) |
| `public/visual-test.html` | Buka di browser | UAT visual alur login/logout |
| `tests/visual_uat.js` | `node tests/visual_uat.js` | UAT Puppeteer + screenshot |
| `scripts/addPengajuanLog.js` | `node scripts/addPengajuanLog.js` | Migrasi tabel audit trail |
| `scripts/hashPasswords.js` | `node scripts/hashPasswords.js [--dry]` | Hash password massal |

Screenshot bukti hasil uji ada di `tests/screenshots/`.

---

## 7. Skenario Pengujian

### A. Autentikasi & Sesi (AUTH)

| ID | P | Prasyarat | Langkah | Hasil Diharapkan |
|---|---|---|---|---|
| AUTH-01 | P0 | Server jalan | Buka app, login `AAA`/`04AAA10` | Masuk dashboard teknisi, 2 menu tampil |
| AUTH-02 | P0 | - | Login `INN`/`30INN11` | Masuk dashboard supervisor, 3 menu tampil |
| AUTH-03 | P0 | - | Login `ANS`/`ANS1805` | Masuk dashboard officer, 3 menu tampil |
| AUTH-04 | P0 | - | Login `KSW`/`01KSW10` | Masuk dashboard manager, 3 menu tampil |
| AUTH-05 | P0 | - | Login `AAA`/`salah` | Ditolak, toast "Kombinasi Username atau Password salah", tetap di halaman login |
| AUTH-06 | P0 | - | Login username tidak terdaftar | Ditolak dengan pesan yang sama (tidak membocorkan username ada/tidak) |
| AUTH-07 | P1 | Buka `test-runner.html` | Kirim body kosong ke `/api/login` | HTTP 400 "Parameter username dan password wajib diisi" |
| AUTH-08 | P1 | Sudah login | Refresh browser (F5) | Tetap login (sesi dari sessionStorage), dashboard tampil |
| AUTH-09 | P1 | Sudah login | Klik Logout | Kembali ke login; cek DevTools → sessionStorage `user` terhapus; back tidak bisa masuk dashboard |
| AUTH-10 | P0 | DevTools Network | Perhatikan respons `/api/login` sukses | Respons **tidak** memuat field `password` (hanya username/role/name/bqLink) |
| AUTH-11 | P1 | Akun `AAA` | Salahkan login 5x berturut-turut | Percobaan ke-6 → HTTP 429, pesan "Terlalu banyak percobaan login...", `retryAfter` terisi |
| AUTH-12 | P1 | MySQL | Lihat kolom `password` di tabel `users` | Berformat `scrypt$...` (bukan plaintext) untuk akun yang sudah pernah login |
| AUTH-13 | P1 | - | Klik Login lalu perhatikan tombol | Tombol non-aktif + teks proses selama request (mencegah klik ganda) |

### B. Otorisasi / RBAC (RBAC)

| ID | P | Prasyarat | Langkah | Hasil Diharapkan |
|---|---|---|---|---|
| RBAC-01 | P0 | Login teknisi | Lihat jumlah & nama menu | 2 menu: **BQ Personal**, **On Hand Stock** |
| RBAC-02 | P0 | Login supervisor/officer | Lihat menu | 3 menu: **PR Summary**, **BQ Monitoring**, **Critical Part List** |
| RBAC-03 | P0 | Login manager | Lihat menu | 3 menu: **BQ Monitoring**, **Monthly Report**, **Critical Part List** |
| RBAC-04 | P0 | Login `INN` | Buka BQ Monitoring | Baris approval menampilkan tombol **Approve/Reject** (tahap SPV) |
| RBAC-05 | P0 | Login `KSW` | Buka BQ Monitoring | Tombol **Approve/Reject** (tahap MGR); non-aktif bila SPV belum Disetujui |
| RBAC-06 | P0 | Login `ANS` | Buka BQ Monitoring | Tidak ada tombol approval; yang bisa diubah hanya **dropdown Status Pengadaan** |
| RBAC-07 | P0 | Login teknisi | Cari menu monitoring | Tidak ada akses ke BQ Monitoring / Critical (sesuai role) |
| RBAC-08 | P1 | API | PUT status pakai `username=AAA` (teknisi) | HTTP 403 (tidak berhak) |
| RBAC-09 | P1 | API | PUT `status_approval_manager` pakai `username=INN` | HTTP 403 "Role Anda tidak memiliki hak..." |
| RBAC-10 | P1 | API | PUT `status_approval_spv` pakai `username=ANS` | HTTP 403 |
| RBAC-11 | P1 | API | Manager (`KSW`) approve MGR pada pengajuan yang SPV-nya masih Menunggu | HTTP 400 "Manager hanya bisa menyetujui setelah Supervisor..." |
| RBAC-12 | P1 | API | PUT status pakai username tidak ada | HTTP 401 "User tidak ditemukan..." |
| RBAC-13 | P2 | API | POST `/api/pengajuan` tanpa username | HTTP 401 "Anda harus login terlebih dahulu" |

### C. Formulir Pengajuan Digital (FORM) — Akar Masalah #1

| ID | P | Prasyarat | Langkah | Hasil Diharapkan |
|---|---|---|---|---|
| FORM-01 | P0 | Login teknisi | Klik **BQ Personal** | Form terbuka; dropdown Item Code berisi ±663 sparepart |
| FORM-02 | P0 | Form terbuka | Isi semua field lengkap & valid → KIRIM | Toast sukses + tampil nomor registrasi (format `BQ-YYYYMMDD-####`) |
| FORM-03 | P0 | FORM-02 sukses | Buka BQ Monitoring (supervisor/manager) | Pengajuan baru muncul (terbaru di atas) dengan SPV=Menunggu, MGR=Menunggu, Pengadaan=BQ Baru |
| FORM-04 | P0 | Form terbuka | Klik KIRIM tanpa pilih Item Code | Ditolak browser (field required), tidak terkirim |
| FORM-05 | P1 | Form terbuka | Isi Qty = 0 | Tidak lolos validasi (min=1) |
| FORM-06 | P1 | Form terbuka | Isi Qty = 1.5 | Ditolak (harus bilangan bulat) |
| FORM-07 | P1 | Form terbuka | Kosongkan Purpose → KIRIM | Ditolak (required) |
| FORM-08 | P1 | API | POST tanpa `uom`/`no_ejo`/`mesin_area` | HTTP 400 "UoM, Purpose, No. EJO, dan Mesin/Area wajib diisi agar pengajuan komplit" |
| FORM-09 | P1 | API | POST tanpa `spesifikasi` | HTTP 400 "Parameter itemCode dan spesifikasi wajib diisi" |
| FORM-10 | P1 | Form terbuka | Isi semua, biarkan Merk & Referensi kosong → KIRIM | Sukses (field opsional) |
| FORM-11 | P2 | Form terbuka | Isi Referensi dengan bukan URL | Ditolak (type=url) |
| FORM-12 | P1 | API | POST `itemCode` yang tidak ada di DB | HTTP 400 "Item Code '...' tidak ditemukan di database." |
| FORM-13 | P1 | Form terbuka | Kirim pengajuan valid | Modal tertutup, form ter-reset, toast sukses tampil |
| FORM-14 | P2 | - | Buat 2 pengajuan beruntun | Nomor registrasi unik (tidak tabrakan) |
| FORM-15 | P1 | Setelah FORM-02 | Buka Riwayat/Monitoring | Data lengkap tersimpan & tampil: No EJO, Mesin/Area, Spesifikasi, Purpose, UoM, Merk, Referensi |

### D. Approval Berjenjang (APP)

| ID | P | Prasyarat | Langkah | Hasil Diharapkan |
|---|---|---|---|---|
| APP-01 | P0 | Pengajuan baruku, login supervisor | Klik **Approve** (SPV) | Status Approval SPV → **Disetujui**; toast sukses; baris ter-update |
| APP-02 | P0 | Pengajuan baru | Login supervisor, klik **Reject** (SPV) | Status SPV → **Ditolak** |
| APP-03 | P0 | Pengajuan dgn SPV Disetujui, login manager | Klik **Approve** (MGR) | Status Manager → **Disetujui** |
| APP-04 | P0 | Pengajuan SPV masih Menunggu, login manager | Arahkan ke tombol MGR | Tombol non-aktif + tooltip "Menunggu persetujuan Supervisor (SPV)" |
| APP-05 | P1 | SPV sudah Disetujui/Ditolak | Lihat tombol SPV (supervisor) | Tombol terkunci (disabled) |
| APP-06 | P1 | MGR sudah final | Lihat tombol MGR (manager) | Tombol terkunci (disabled) |
| APP-07 | P1 | Login officer | Ubah dropdown Status Pengadaan: Pending → Proses PO → Barang Dikirim → Tiba di Gudang | Setiap perubahan tersimpan & tampil |
| APP-08 | P1 | Login manager | Ubah dropdown Status Pengadaan | Tersimpan (manager boleh update pengadaan) |
| APP-09 | P1 | API | PUT `status_pengadaan="Selesai"` (di luar daftar) | HTTP 400 dengan daftar nilai yang diizinkan |
| APP-10 | P1 | API | PUT `status_approval_spv="setuju"` (invalid) | HTTP 400 nilai tidak valid |
| APP-11 | P2 | API | PUT body hanya `{username}` | HTTP 400 "Tidak ada status yang dikirim untuk diubah" |
| APP-12 | P1 | Modal Monitoring terbuka | Ubah 1 data (mis. approve lewat tab lain) & tunggu 20 dtk | Tabel refresh otomatis menampilkan data terbaru |
| APP-13 | P2 | Modal Monitoring terbuka | Klik **Refresh** | Data dimuat ulang + toast "Data pengajuan diperbarui." |

### E. Monitoring Real-time & Audit Trail (MON) — Akar Masalah #1

| ID | P | Prasyarat | Langkah | Hasil Diharapkan |
|---|---|---|---|---|
| MON-01 | P0 | Login supervisor/manager | Buka **BQ Monitoring** | Tabel memuat 200 baris, terbaru di atas |
| MON-02 | P0 | Modal terbuka | Periksa kolom | No. Registrasi, Waktu, Teknisi, Barang, Qty, Status Approval (SPV+MGR), Status Pengadaan, Aksi |
| MON-03 | P0 | Modal terbuka | Ketik no registrasi di kotak cari | Baris terfilter sesuai kata kunci |
| MON-04 | P0 | Modal terbuka | Cari nama teknisi (mis. `AAA`) | Hanya pengajuan teknisi tsb |
| MON-05 | P1 | Modal terbuka | Cari item code / deskripsi / No EJO / mesin | Baris sesuai |
| MON-06 | P1 | Modal terbuka | Pilih filter Menunggu / Disetujui / Ditolak | Jumlah baris & angka `X pengajuan ditemukan` sesuai |
| MON-07 | P1 | Modal terbuka | Klik Prev/Next | Navigasi 25/halaman; teks "Menampilkan a–b dari N" benar |
| MON-08 | P0 | Modal terbuka | Klik ikon **Riwayat** pada baris | Modal Riwayat terbuka menampilkan timeline |
| MON-09 | P0 | Buka riwayat `BQ-2026-09-01-0001` | Periksa isi | 3 entri: field, nilai lama → baru, nama+role aktor, waktu |
| MON-10 | P1 | Modal terbuka | Klik Riwayat pada baris yang belum pernah diubah | Tampil "Belum ada riwayat perubahan." |
| MON-11 | P1 | API/DB | Lakukan approve SPV + ubah pengadaan + approve MGR pada 1 pengajuan | `pengajuan_log` bertambah 3 baris dengan aktor berbeda |
| MON-12 | P2 | Modal terbuka | Klik **Excel** | File `bq-monitoring-YYYY-MM-DD.xlsx` terunduh (16 kolom), dapat dibuka Excel |
| MON-13 | P1 | Sedang di halaman 2 | Ketik pencarian baru | Kembali ke halaman 1 & hasil ter-filter |

### F. Critical Sparepart List, On-Hand Stock & KPI (STOK) — Akar Masalah #2

| ID | P | Prasyarat | Langkah | Hasil Diharapkan |
|---|---|---|---|---|
| STOK-01 | P0 | Login (semua role) | Lihat kartu KPI di dashboard | Total item **663**, Critical **155**, Stok Rendah **284**, Stok Habis **140** |
| STOK-02 | P0 | KPI tampil | Klik tiap kartu KPI | Modal stok terbuka dgn judul & isi sesuai mode (all/critical/low/out) |
| STOK-03 | P0 | KPI tampil | Lihat panel "Perlu Segera Dipesan" | Menampilkan item defisit (qty < min) beserta nilai kekurangan |
| STOK-04 | P0 | Login teknisi | Buka **On Hand Stock** | 663 item, pagination 25/halaman |
| STOK-05 | P0 | Login supervisor/manager | Buka **Critical Part List** | Hanya item `is_critical` (≈155) |
| STOK-06 | P0 | Modal stok | Ketik `bearing` | ±9 hasil; jumlah dihitung ulang |
| STOK-07 | P1 | Modal stok | Coba filter Kritis / Stok Rendah / Stok Habis | Jumlah baris berubah sesuai |
| STOK-08 | P1 | Modal stok | Perhatikan Qty ≤ Min | Angka qty merah (penanda stok rendah) |
| STOK-09 | P1 | Modal stok | Klik **Excel** lalu **CSV** | Excel 8 kolom × jumlah terfilter; CSV header + baris sesuai |
| STOK-10 | P1 | Modal stok | Periksa kolom Status | Badge KRITIS / NORMAL akurat sesuai data |
| STOK-11 | P2 | Modal stok | Periksa Lokasi Rak | Tampil bila ada, "-" bila kosong (tidak error) |

### G. Monthly Report (REP)

| ID | P | Prasyarat | Langkah | Hasil Diharapkan |
|---|---|---|---|---|
| REP-01 | P0 | Login manager | Buka **Monthly Report** | Ringkasan: Total 200, Menunggu/Disetujui/Ditolak sesuai baseline |
| REP-02 | P0 | Modal terbuka | Lihat grafik awal | Pie chart menampilkan Status Pengadaan |
| REP-03 | P1 | Modal terbuka | Ganti Jenis Grafik (doughnut/bar/line) | Grafik berubah tanpa error |
| REP-04 | P0 | Modal terbuka | Ganti Kelompokkan (Pengadaan/Approval/Per Bulan) | Label & jumlah sesuai |
| REP-05 | P0 | Modal terbuka | Buka dropdown Periode | 22 opsi: "Semua Bulan" + 21 bulan (Jan 2025–Sep 2026) |
| REP-06 | P0 | Modal terbuka | Pilih **Sep 2026** | Total = **8** |
| REP-07 | P1 | Modal terbuka | Pilih **Feb 2025** / **Jan 2025** | Total = **20** / **16** |
| REP-08 | P1 | Modal terbuka | Klik **Export CSV** | File `monthly-report-<periode>.csv` terunduh sesuai filter |
| REP-09 | P1 | Modal terbuka | Klik **Export Excel** | File `.xlsx` terunduh & dapat dibuka |
| REP-10 | P2 | Modal terbuka | Klik **Muat Ulang** | Data dimuat ulang + toast |

### H. Ekspor (EXP) — lintas modul

| ID | P | Prasyarat | Langkah | Hasil Diharapkan |
|---|---|---|---|---|
| EXP-01 | P0 | API | POST `/api/export/xlsx` data uji | HTTP 200, content-type spreadsheet, file valid (magic bytes `PK`, ada autofilter) |
| EXP-02 | P1 | - | Unduh dari 3 modal | Nama file: `stock_<mode>_<tgl>.xlsx`, `monthly-report-<periode>.xlsx`, `bq-monitoring-<tgl>.xlsx` |
| EXP-03 | P1 | Filter aktif | Export saat filter/pencarian aktif | Isi file mengikuti hasil filter, bukan seluruh data |
| EXP-04 | P1 | API | POST body kosong | HTTP 400 "Parameter columns dan rows wajib diisi" |
| EXP-05 | P2 | API | Kirim > 20.000 baris | HTTP 413 "Data terlalu besar..." |

### I. Non-Fungsional & Ketahanan (NFR)

| ID | P | Prasyarat | Langkah | Hasil Diharapkan |
|---|---|---|---|---|
| NFR-01 | P0 | - | Kecilkan jendela ke ±360px (mode responsive) | Menu & tabel tetap bisa dipakai, tidak tumpang tindih |
| NFR-02 | P1 | - | Lakukan aksi sukses & aksi gagal | Toast hijau (sukses) / merah (gagal) muncul & hilang sendiri |
| NFR-03 | P1 | - | Matikan MySQL lalu lakukan aksi | Muncul pesan error rapi (toast), aplikasi tidak blank/crash |
| NFR-04 | P1 | - | Buka `/api/endpoint-tidak-ada` | HTTP 404 JSON `{"status":"error","message":"Endpoint tidak ditemukan"}` |
| NFR-05 | P2 | - | Ukur muat dashboard lokal | < 3 detik di komputer lokal |
| NFR-06 | P1 | - | Jalankan tanpa Vercel (lokal) | `npm start` berjalan normal, static & API aktif |
| NFR-07 | P1 | - | Buka `/api/health` | HTTP 200 `{"status":"ok","message":"Server E-Sparepart Aktif"}` |
| NFR-08 | P2 | Login lagi setelah logout | Login user lain di tab yang sama | Sesi tidak tercampur (sessionStorage diperbarui) |

### J. Menunggu Keputusan (BLOCKED sampai ada info Ka Fadhil)

| ID | P | Langkah | Kondisi Sekarang | Diperlukan |
|---|---|---|---|---|
| PRS-01 | P2 | Klik menu **PR Summary** (supervisor/officer) | Muncul toast "Modul ini sedang dalam pengembangan." | Konfirmasi scope PR Summary |
| URG-01 | P2 | Cari field Urgency di form | Tidak ada | Format & nilai (Normal/Urgent) untuk KPI <10% |
| JA-01 | P2 | Ajukan barang Jasa (JA)/BR | Tidak bisa disimpan (Item Code wajib) | Keputusan apakah JA/BR masuk cakupan |
| REP-11 | P2 | Bandingkan format laporan dengan Looker Studio lama | Format mengikuti versi aplikasi | Format final Monthly/Min-Max Report |

---

## 8. Matriks Traceability (Tujuan → Test Case)

| Tujuan Proyek | Test Case Utama |
|---|---|
| Formulir digital dengan parameter spesifikasi lengkap | FORM-01..15 |
| Review/persetujuan Supervisor (dan Manager) | RBAC-04/05, APP-01..06, APP-11 |
| Dasbor monitoring real-time & transparan | MON-01..13, APP-12/13 |
| Critical Sparepart List tersentralisasi | STOK-01/02/05/10 |
| On-Hand Stock control & min-max | STOK-01/03/07/08 |
| Akses Manager, Supervisor, Teknisi real-time | RBAC-01..07, STOK-04 |
| Monthly Report | REP-01..10 |
| KPI menurunkan pengadaan urgent >10% → <10% | TERBLOKIR (URG-01) — belum ada field urgensi |

---

## 9. Batasan yang Diketahui (Known Limitations)

1. **PR Summary** belum diimplementasikan (placeholder) — menunggu scope.
2. **Field Urgency** belum ada, sehingga KPI "urgent <10%" belum bisa dihitung.
3. **Jasa (JA) / BR** belum bisa disimpan: tabel `pengajuan_bq` mewajibkan `item_code`.
4. **329 baris RO** (prefix `MFH`/`SHF`) tidak terimpor karena user belum ada di tabel `users`.
5. Password awal di `database/seed.sql` masih plaintext; otomatis menjadi hash saat login pertama
   (atau jalankan `node scripts/hashPasswords.js`).
6. Autentikasi memakai identitas per-request (belum token/JWT) — sesuai keputusan versi aman.
7. Komentar pipeline status di `database/schema.sql` masih berbeda dari nilai aplikasi.

---

## 10. Kriteria Lulus (Exit Criteria)

- Semua **P0 = 100% PASS**.
- **P1 ≥ 90% PASS**; sisanya tercatat sebagai known issue + workaround.
- Tidak ada bug **Critical/High** yang terbuka pada alur utama (login → pengajuan → approval →
  monitoring → laporan).
- Bukti uji tersimpan (screenshot/log di `tests/screenshots/`).

---

## 11. Template Laporan Bug

| Field | Isi |
|---|---|
| ID Bug | BUG-001 |
| Test Case | (mis. APP-04) |
| Prioritas | Critical / High / Medium / Low |
| Role & Akun | (mis. manager/KSW) |
| Langkah Reproduksi | 1) ... 2) ... 3) ... |
| Hasil Aktual | ... |
| Hasil Diharapkan | ... |
| Bukti | screenshot / error log |
| Status | Open / Fixed / Verified |

---

## 12. Catatan Eksekusi Cepat (Smoke Test 10 Menit)

Jika waktu terbatas, jalankan minimal ini:
AUTH-01..05, RBAC-01..05, FORM-01..03, APP-01/03/04, MON-01/08/09, STOK-01/02/05, REP-01/06,
EXP-01, NFR-07.
