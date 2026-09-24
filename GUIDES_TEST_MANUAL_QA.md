# GUIDES TEST MANUAL QA - Fonko Gemini

> **Total Test: 68** (NFR: 4, AUTH: 8, RBAC: 8, FORM: 6, APP: 9, STOK: 2, MON: 4, REP: 3, EXP: 5, UI: 11, E2E: 8)
>
> **Terakhir diperbarui:** 23 September 2026
>
> **Tips kemudahan:** Semua data yang dibutuhkan (username, password, itemCode, `no_registrasi`, dst.) **sudah dicantumkan langsung di catatan ini** — cukup **copy-paste** dari tabel/data di bawah, TANPA perlu mengambil data dari API.

---

## ✅ CARA MULAI JALAN

1. Pastikan server hidup (`node server.js`)
2. Buka browser di `http://localhost:3000`
3. Login menggunakan kredensial di bawah ini
4. Jalankan test per-section dengan mengisi form / menjalankan aksi sesuai langkah (data sudah disiapkan)

---

## 📋 DATA UJI SIAP PAKAI (copy-paste dari sini)

### 1) Kredensial Login

| Role | Username | Password | Group Test |
|---|---|---|---|
| Teknisi | `AAA` | `04AAA10` | AUTH, FORM, STOK, MON, UI, E2E |
| Supervisor 1 | `INN` | `30INN11` | AUTH, RBAC, APP, MON, E2E |
| Supervisor 2 | `KAA` | `KAA1910` | RBAC, APP, MON |
| Officer | `ANS` | `ANS1805` | AUTH, RBAC, FORM, STOK, E2E |
| Manager | `KSW` | `01KSW10` | AUTH, RBAC, APP, MON, REP, UI, E2E |

### 2) Contoh `no_registrasi` (dicek langsung ke DB, 23 Sep 2026)

| no_registrasi | Status SPV | Status MGR | Status Pengadaan | Dipakai untuk |
|---|---|---|---|---|
| `BQ-20260922-5147` | Disetujui | Disetujui | Proses PO | RBAC-09, RBAC-10, APP-09, APP-10, APP-11, MON-09 (punya 3 log) |
| `BQ-20260922-2931` | Menunggu | Menunggu | BQ Baru | RBAC-11 (Manager terblokir) |
| `BQ-20260922-4509` | Menunggu | Menunggu | BQ Baru | RBAC-15 (KAA approve SPV) |

> **PENTING — di mana mencari `no_registrasi`:** kolom "Cari" ada di menu **Approval BQ** (modal "Monitoring & Approval BQ", bagian atas tabel) — menu ini **hanya untuk Supervisor / Officer / Manager**, bukan Teknisi. Halaman **Stok** punya kotak pencarian sendiri yang hanya mencari **Item Code / nama sparepart** — kalau kamu ketik `no_registrasi` di sana hasilnya kosong (itu normal, bukan bug).
>
> Contoh di atas adalah data **live**; jika ada yang statusnya sudah berubah karena pernah ditest, cukup ganti dengan baris yang statusnya sama yang tampil di menu Approval BQ.
>
> **Fitur baru (form BQ Personal):** kolom Item Code kini **bisa diketik untuk mencari** — ketik kode ATAU nama sparepart (mis. "O-50834" atau "Bearing"), daftar tersaring otomatis, lalu klik hasilnya. Bisa juga pakai panah ↑/↓ + Enter; tidak perlu scroll ribuan baris lagi.

### 3) Contoh `itemCode` sparepart

| itemCode | Keterangan |
|---|---|
| `O-50834-00` | Autoclave Fedegari (valid — untuk test yang harus berhasil) |
| `O-11181-00` | Bearing 626-2Z SKF (valid) |
| `QA-TIDAK-ADA-999` | Item palsu — untuk test yang harus ditolak |

---

## ⚙️ SECTION 1: NFR (Kesiapan Sistem)

**NFR-07: Cek server hidup**
- Langkah: Buka `/api/health` dari browser
- Expected: `{"status":"ok","message":"Server E-Sparepart Aktif"}`

**NFR-04: Endpoint tidak dikenal**
- Langkah: Buka `/api/qa-tidak-ada` (bukan rute yang ada)
- Expected: `{"status":"error","message":"Endpoint tidak ditemukan"}`

**NFR-06: Static app tersaji**
- Langkah: Buka alamat utama `/`
- Expected: Halaman HTML aplikasi terbuka (bukan kosong), content-type `text/html`

**NFR-10: Link Looker Studio diakses dengan sukses**
- Langkah: Klik link Looker Studio di halaman aplikasi → `https://lookerstudio.google.com/reporting/9bb14be8-f9d4-458e-9811-a89e9c8bb216`
- Expected: Link terbuka, konten Laporan Bulanan tampil

---

## 🔐 SECTION 2: AUTH (Login & Keluar)

**AUTH-01: Login Teknisi (AAA)**
- Input: Username `AAA` / Password `04AAA10`
- Expected: Login berhasil, role `teknisi`, ada `bqLink`, password tidak ditampilkan

**AUTH-02: Login Supervisor (INN)**
- Input: Username `INN` / Password `30INN11`
- Expected: Login berhasil, role `Supervisor 1`

**AUTH-03: Login Officer (ANS)**
- Input: Username `ANS` / Password `ANS1805`
- Expected: Login berhasil, role `Officer`

**AUTH-04: Login Manager (KSW)**
- Input: Username `KSW` / Password `01KSW10`
- Expected: Login berhasil, role `manager`

**AUTH-05: Password salah ditolak**
- Input: Username `AAA` / Password `salah-sekali`
- Expected: Ditolak (401), pesan `Kombinasi Username atau Password salah`

**AUTH-06: Username tak terdaftar**
- Input: Username `QA-TIDAK-ADA-XYZ` / Password `abc`
- Expected: Ditolak (401), pesan SAMA seperti AUTH-05

**AUTH-07: Body login kosong**
- Langkah: Submit form login tanpa username & password
- Expected: Ditolak (400), pesan `Parameter username dan password wajib diisi`

**AUTH-11: Rate limit (5 gagal -> 429)**
- Langkah: Coba login salah sebanyak 6x dengan Username `QA-RATE` / Password `SALAH` (user dummy agar akun asli tidak ikut terkunci)
- Expected: 5x ditolak (401), percobaan ke-6 → 429 dengan `retryAfter > 0`

---

## 🚪 SECTION 3: RBAC (Akses Berdasarkan Peran)

> **CARA MEMBUKA MENU "APPROVAL BQ":** menu ini **tidak tersedia untuk Teknisi** — ini memang aturan RBAC. Tersedia hanya untuk:
> - **Supervisor 1 (INN) / Supervisor 2 (KAA) / Officer (ANS)** → tile **"Approval BQ Tahap Supervisor"**
> - **Manager (KSW)** → tile **"Approval BQ Urgent"**
> - klik tile tersebut → muncul modal **"Monitoring & Approval BQ"**
>
> **Peta kolom tabel (kiri → kanan):**
> 1. **No. Registrasi** — nomor unik (pakai kolom "Cari" di atas tabel untuk mencari baris)
> 2. **Waktu** — tanggal & jam pengajuan
> 3. **Teknisi** — nama + username + No. EJO/mesin
> 4. **Barang** — `item_code` + deskripsi + purpose/pcs
> 5. **Urgensi** — Normal / Urgent
> 6. **Qty** — jumlah diminta
> 7. **Status Approval** — badge **SPV** (atas) + **MGR** (bawah)
> 8. **Status Pengadaan** — **dropdown** (hanya Officer & Manager) / **badge baca-saja** (Supervisor)
> 9. **Aksi** (paling kanan) — tombol **Approve** (hijau) / **Reject** (merah) sesuai role + ikon **Riwayat** (abu, bergambar history)
>
> **Yang tampil di kolom Aksi per role:**
> - Teknisi (`AAA`) → tidak bisa membuka menu ini (lihat RBAC-08)
> - Supervisor (`INN`/`KAA`) → tombol hijau **Approve** + merah **Reject** (tahap SPV); kolom 8 baca-saja
> - Officer (`ANS`) → dropdown Status Pengadaan (kolom 8); tanpa tombol approve
> - Manager (`KSW`) → dropdown Status Pengadaan (kolom 8) + tombol hijau **Approve** + merah **Reject** (tahap MGR; redup kalau SPV belum Disetujui)
> - Ikon **Riwayat** = buka kronologi audit (field, status lama → baru, aktor & waktu)

**RBAC-08: Teknisi tidak punya akses ubah status**
- Login: `AAA` / `04AAA10`
- Langkah: lihat tile/menu di dashboard
- Expected: menu Teknisi hanya **BQ Personal**, **On Hand Stock**, dan **BQ Summary** — **TIDAK ADA tile "Approval BQ"**. Karena tidak ada menu-nya, teknisi mustahil mengubah status apa pun. (Aturan backend 403: `Anda tidak memiliki akses untuk mengubah status pengajuan`)

**RBAC-09: Supervisor tidak bisa approve tahap Manager**
- Login: `INN` / `30INN11` → buka **Approval BQ Tahap Supervisor**
- Langkah: baris `BQ-20260922-5147`, lihat kolom 9
- Expected: cuma tombol Approve/Reject tahap **SPV**; tidak ada tombol approval Manager. Kolom 8 baca-saja. (Backend 403: `Supervisor tidak bisa approve/mengubah status Manager`)

**RBAC-10: Manager tidak bisa approve tahap SPV**
- Login: `KSW` / `01KSW10` → buka **Approval BQ Urgent**
- Langkah: baris `BQ-20260922-5147`, lihat kolom 9
- Expected: tombol Approve/Reject untuk tahap **MGR** saja (tahap akhir); tidak ada tombol approval SPV. (Backend 403: `Manager tidak bisa approve/mengubah status SPV`)

**RBAC-11: Manager diblokir sampai SPV setuju**
- Login: `KSW` / `01KSW10` → buka **Approval BQ Urgent**
- Langkah: baris `BQ-20260922-2931` (badge SPV = Menunggu), kolom 9
- Expected: tombol Approve & Reject tampak **redup/disabled** (opacity rendah); kursor di atasnya muncul tooltip `Menunggu persetujuan Supervisor (SPV)`; klik tidak mengubah apa pun. (Backend 400: `Manager hanya bisa menyetujui setelah Supervisor menyetujui`)

**RBAC-12: User tak terdaftar ditolak (Level API, opsional)**
- Langkah: kirim ubah status dengan username `QA-TIDAK-ADA-XYZ`
- Expected: `User tidak ditemukan` (401) — tidak bisa dilakukan lewat UI, cukup verifikasi endpoint

**RBAC-13: Aksi tanpa login ditolak (Level API, opsional)**
- Langkah: kirim ubah status tanpa username
- Expected: `Anda harus login terlebih dahulu` (401) — tidak bisa dilakukan lewat UI

**RBAC-14: Teknisi hanya melihat data sendiri**
- Login: `AAA` / `04AAA10` → buka **BQ Summary**
- Expected: ringkasan hanya berisi pengajuan milik `AAA` (Total Pengajuan = jumlah punya AAA); tidak ada data user lain

**RBAC-15: KAA (Supervisor 2) berhasil approve SPV**
- Login: `KAA` / `KAA1910` → buka **Approval BQ Tahap Supervisor**
- Langkah: cari baris `BQ-20260922-4509` (badge SPV = Menunggu) → kolom 9 → klik tombol hijau **Approve**
- Expected: badge SPV (kolom 7, baris atas) berubah jadi hijau `Disetujui`; muncul toast `Pengajuan BQ-20260922-4509 disetujui.`; klik ikon Riwayat → ada 1 entri Approval SPV oleh KAA

---

## 🧾 SECTION 4: FORM (Validasi Isian Pengajuan)

**FORM-05: Pengajuan valid berhasil dibuat**
- Login: `AAA` / `04AAA10` → klik tile **BQ Personal** (buka Form Pengajuan BQ)
- Item Code: di kolom Item Code **ketik "O-50834"** → di daftar hasil yang muncul klik `O-50834-00` (Autoclave Fedegari…) → kode terisi otomatis
- Data lain: `qty: 2`, `uom: PCS`, `purpose: CONSUMABLE`, `no_ejo: EJO/QA/05/2026`, `mesin_area: Mesin Capping VCM200`, `merk: QATest`, `spesifikasi: Spesifikasi test manual QA`, `jenis: Sparepart`, `urgency: Normal`
- Klik **KIRIM PENGAJUAN**
- Expected: alert `Pengajuan Berhasil`; `no_registrasi` (bentuk `BQ-2026-09-..-....`) tampil di **Approval BQ Tahap Supervisor** (login `KAA`); qty_diminta = `2`

**FORM-06: Penyimpanan timestamp**
- Login: `KAA` / `KAA1910` → buka **Approval BQ Tahap Supervisor**
- Langkah: cari `no_registrasi` hasil FORM-05 → lihat kolom 2 (Waktu)
- Expected: `timestamp` tersimpan (terlihat jam/tanggal, bukan kosong)

**FORM-08: Item Code kosong ditolak**
- Login: `AAA` / `04AAA10` → **BQ Personal** → biarkan kolom Item Code kosong (jangan pilih apa pun), isi field lain lengkap
- Expected: pengiriman **ditolak** — toast `Field yang ditandai wajib diisi`; bila di-bypass, server 400 dengan daftar field `Item Code, UoM, Purpose, No. EJO, dan Mesin/Area`

**FORM-09: qty di bawah 1 ditolak**
- Data: isi seperti FORM-05 tetapi `qty: 0`
- Expected: browser menolak submit (input bertipe `min=1`), atau server menolak `Quantity minimal 1` (400)

**FORM-12: Item Code tidak ditemukan ditolak**
- Login: `AAA` / `04AAA10` → **BQ Personal**
- Item Code: **ketik "QA-TIDAK-ADA-999"** → dropdown menampilkan `Tidak ditemukan…` → tetap ketik kode tersebut secara manual, isi field lain
- Expected: server menolak → toast `Item Code 'QA-TIDAK-ADA-999' tidak ditemukan di database.`

**FORM-13: Pengajuan jasa (tanpa itemCode) berhasil**
- Login: `AAA` / `04AAA10` → **BQ Personal** → pilih `jenis: Jasa (JA/BR)` → muncul kotak **Keterangan Jasa**
- Data: item code **dibiarkan kosong**, `qty: 1`, `uom: Job`, `purpose: EJO`, `no_ejo: EJO/QA/13/2026`, `mesin_area: Mesin Capping VCM200`, `spesifikasi: Jasa kalibrasi test manual QA`, `urgency: Normal`
- Expected: Berhasil (201); `no_registrasi` tersedia; item code tidak wajib

---

## 🔄 SECTION 5: APP (Alur Status Pengajuan)

**APP-09: Status pengadaan tidak valid ditolak (Level API, opsional)**
- Login: `ANS` / `ANS1805`
- Langkah: kirim `status_pengadaan: SALAH-STATUS` pada `BQ-20260922-5147`
- Expected: Ditolak (400), pesan `status_pengadaan tidak valid` — di UI dropdown hanya menyediakan opsi valid, jadi cukup verifikasi endpoint

**APP-10: Status SPV tidak valid ditolak (Level API, opsional)**
- Login: `INN` / `30INN11`
- Langkah: kirim `status_approval_spv: SALAH-STATUS` pada `BQ-20260922-5147`
- Expected: Ditolak (400), pesan `status_approval_spv tidak valid` — di UI tombol hanya menyediakan Approve/Reject

**APP-11: Ubah status tanpa kirim status ditolak (Level API, opsional)**
- Login: `KSW` / `01KSW10`
- Langkah: kirim update tanpa field `status_*` pada `BQ-20260922-5147`
- Expected: Ditolak (400), pesan `Tidak ada status yang dikirim untuk diubah` — tidak bisa dilakukan lewat UI

**APP-12: Rekap pengajuan (Dashboard Bulanan)**
- Login: `KSW` / `01KSW10`
- Langkah: lihat kartu di dashboard (Total Pengajuan)
- Expected: kartu menampilkan total pengajuan **>= 1481** (live per 23 Sep 2026: **1493**)

**APP-13: Alur lengkap Teknisi -> SPV -> Officer -> Manager (BQS-01)**
- Login: `AAA` / `04AAA10` → klik tile **BQ Personal**
- Data: Item Code cari/ketik `O-50834` → pilih `O-50834-00`; `qty: 1`, `uom: PCS`, `purpose: CONSUMABLE`, `no_ejo: EJO/QA/E2E/2026`, `mesin_area: Mesin Capping VCM200`, `merk: QATest`, `spesifikasi: Spesifikasi untuk test alur lengkap`, `jenis: Sparepart`, `urgency: Normal`
- Klik **KIRIM PENGAJUAN** → catat `no_registrasi` hasilnya sebagai `[no]`
- Expected: Berhasil (201)

**BQS-02: SPV approve (INN)**
- Login: `INN` / `30INN11` → buka **Approval BQ Tahap Supervisor**
- Langkah: cari `[no]` di kolom Cari → kolom 9 → klik tombol hijau **Approve** (tahap SPV)
- Expected: Berhasil; badge SPV berubah menjadi `Disetujui`

**MON-RPT: Officer tandai 'Proses PO' (ANS)**
- Login: `ANS` / `ANS1805` → buka **Approval BQ Tahap Supervisor**
- Langkah: baris `[no]` → kolom 8 (Status Pengadaan) → pilih opsi **Proses PO** dari dropdown
- Expected: Berhasil; status berubah menjadi `Proses PO` (tersimpan otomatis saat dipilih)

**MON-RPT2: Manager setujui final (KSW)**
- Login: `KSW` / `01KSW10` → buka **Approval BQ Urgent**
- Langkah: baris `[no]` (SPV sudah Disetujui → tombol aktif) → kolom 9 → klik tombol hijau **Approve** (tahap MGR)
- Expected: Berhasil; badge SPV & MGR `Disetujui`, Pengadaan `Proses PO`

---

## 📦 SECTION 6: STOK (Stok Sparepart)

**STOK-01: Buka data stok sparepart (Teknisi)**
- Login: `AAA` / `04AAA10`
- Langkah: Buka halaman stok sparepart
- Expected: Ada data, minimal kolom: `Kode` / Item Code, Nama, Stok Total, Satuan, Status Stok. Jumlah item utama terbaca (**3022**)

**STOK-02: Alert stok kritis tidak kosong (Officer)**
- Login: `ANS` / `ANS1805`
- Langkah: Buka data alert stok (maksimum 20 baris)
- Expected: Ada data dengan `stok_total` kecil / habis (total real: **210 kritis**, **356 rendah**, **1887 habis**) dan terdapat baris `stok_total: 0`

---

## 📊 SECTION 7: MON (Monitoring / Auditable)

**MON-01: Ringkasan pengajuan milik Teknisi (BQ Summary)**
- Login: `AAA` / `04AAA10`
- Langkah: klik tile **BQ Summary**
- Expected: ringkasan hanya dari pengajuan milik `AAA` (Total Pengajuan = jumlah punya AAA; tidak ada data user lain); isi total sesuai DB (**>= 1481**, live per 23 Sep 2026: **1493**)

**MON-02: Tabel Approval BQ menampilkan kolom yang benar**
- Login: `KSW` / `01KSW10` → buka **Approval BQ Urgent**
- Expected: header tabel 9 kolom: `No. Registrasi, Waktu, Teknisi, Barang, Urgensi, Qty, Status Approval (SPV+MGR), Status Pengadaan, Aksi`; detail baris memuat `no_registrasi, timestamp, username_teknisi, nama_teknisi, item_code, deskripsi, qty_diminta, uom, purpose, no_ejo, mesin_area, status_approval_spv, status_pengadaan, status_approval_manager`

**MON-03: Rentang data terisi otomatis**
- Login: `KSW` / `01KSW10` → buka **Monthly Report**
- Langkah: buka dropdown pilihan bulan
- Expected: pilihan bulan tersedia dari **Jan 2025 (bulan 1)** s.d. **Sep 2026 (bulan 9)** = **21 bulan** (data lengkap)

**MON-09: Log audit berukuran tetap (3)**
- Login: `KSW` / `01KSW10` → buka **Approval BQ Urgent**
- Langkah: cari baris `BQ-20260922-5147` → kolom 9 → klik ikon **Riwayat** (tombol abu-abu bergambar history)
- Expected: modal Riwayat menampilkan **3 entri**: Approval SPV, pengadaan ubah status, Approval Manager

---

## 📈 SECTION 8: REP (Laporan Bulanan)

**REP-05: Laporan bulan valid berhasil**
- Login: `KSW` / `01KSW10`
- Data: Bulan `9`, Tahun `2026`
- Langkah: Buka laporan bulan 9 tahun 2026
- Expected: Berhasil; jumlah pengajuan sesuai preview bulan itu (**>= 43**) dan tabel tanggal 1 s.d. akhir bulan muncul

**REP-06: Laporan satu entri (data kosong)**
- Data: Bulan `2`, Tahun `2025`
- Expected: Berhasil; tabel 28 baris (Feb 2025), tanpa data entri (atau data lama **>= 132**)

**REP-07: Bulan tidak valid ditolak**
- Data: Bulan `13`, Tahun `2026`
- Expected: Ditolak (400); pesan `Bulan tidak valid (1-12)` atau serupa

---

## 📤 SECTION 9: EXP (Export Data)

**EXP-01: Export row & kolom valid (spareparts)**
- Login: `AAA` / `04AAA10`
- Data (JSON payload export):
```json
{
  "columns": ["item_code", "nama_sparepart", "satuan"],
  "rows": [["O-50834-00", "Autoclave Fedegari", "pcs"]]
}
```
- Expected: Berhasil; data yang diexport sesuai isi `rows`

**EXP-04: Parameter kolom & baris kosong ditolak**
- Data: kirim export tanpa `columns`/`rows`
- Expected: Ditolak (400)
- Expected: pesan `Parameter columns dan rows wajib diisi`

**EXP-05: Data terlalu besar ditolak**
- Data: `rows` berisi lebih dari **20.000** entri (contoh: 20.001 baris dummy)
- Expected: Ditolak; pesan `Data terlalu besar untuk diexport (maksimal 20000 baris)`

**EXP-06: Ekspor seluruh pengajuan (Level API, opsional)**
- Login: `AAA` / `04AAA10`
- Langkah: ekspor data pengajuan milik `AAA` (endpoint export pengajuan — tidak ada menu monitoring di UI Teknisi, hanya Stok yang punya tombol Export)
- Expected: Berhasil; jumlah baris export sesuai data milik `AAA`, file dapat dibuka di Excel

**EXP-07: Ekspor pengajuan jasa (tanpa itemCode) (Level API, opsional)**
- Langkah: Buat pengajuan jasa (lihat FORM-13) → ekspor datanya
- Data: kolom mencakup `no_registrasi` dan `spesifikasi_lengkap`
- Expected: Berhasil; baris jasa tampil, kolom itemCode tidak kosong/eror

---

## 🖥️ SECTION 10: UI (Antarmuka Halaman)

**UI-01: Halaman login tampil benar**
- Buka `/`
- Expected: Form login dengan field username & password, tombol Login

**UI-02: Header aplikasi brand baru**
- Expected: Header / navbar menampilkan **Fonko Gemini** (bukan Micropage E-Sparepart)

**UI-03: Navigasi menu lengkap sesuai peran**
- Login: `AAA` / `04AAA10`
- Expected: dashboard Teknisi memuat tile: **BQ Personal**, **On Hand Stock**, **BQ Summary** — dan **tidak ada** tile "Approval BQ". (Role Supervisor/Officer/Manager menambah tile **Approval BQ Tahap Supervisor** / **Approval BQ Urgent**, **Critical Part List**, **Monthly Report**, **PR Summary** sesuai role)

**UI-04: Search monitoring berfungsi**
- Login: `KAA` / `KAA1910` → buka **Approval BQ Tahap Supervisor**
- Kata kunci: `BQ-20260922-4509`
- Expected: Hasil menemukan pengajuan dengan no tersebut

**UI-05: Badge status penting konsisten**
- Expected: Label: `BQ Baru` (biru/abu), `Proses PO` (kuning), `Disetujui` (hijau), `Ditolak`/`Selesai` (merah/abu); warna berbeda antarstatus

**UI-06: Pemilihan menu memfilter data**
- Login: `AAA` / `04AAA10`
- Expected: Filter pengajuan bisa diubah dan daftar berubah sesuai pilihan

**UI-07: Ceklis pemilihan untuk PQ**
- Expected: Ada checkbox dalam tabel monitoring (untuk pemilihan pengajuan)

**UI-08: Dropdown bulk action**
- Langkah: Pilih beberapa baris via checklist
- Expected: Muncul dropdown aksi (pilihan: *Proses PO*, *Ditolak*, *PO Open*, *Mencari Penawaran*, *Barang Dikirim*, *Tiba di Gudang*, *Completed* dsb.)

**UI-09: Tombol export**
- Login: `AAA` / `04AAA10`
- Expected: Tombol "Export" tampil di halaman **On Hand Stock** (dan di modal **Approval BQ** untuk role Supervisor/Officer/Manager), mengunduh file Excel

**UI-10: Logout berfungsi**
- Langkah: Klik tombol Logout
- Expected: Kembali ke halaman login, token login tersimpan tidak diperbarui/dipakai lagi

**UI-11: Halaman dashboard berisi 6 kartu info**
- Login: `KSW` / `01KSW10`
- Expected: 6 kartu data: Total Sparepart (**3022**), Kritis (**210**), Rendah (**356**), Habis (**1887**), Total Pengajuan (**>= 1481**, live), Bulan Aktif (**21**)

---

## 🎬 SECTION 11: E2E (Alur Lengkap: Buat Sampai Setuju)

> ⚠️ Jalankan **berurutan E2E-01 → E2E-08** (hasil langkah 1 dipakai di langkah berikutnya).

**E2E-01: Teknisi membuat pengajuan**
- Login: `AAA` / `04AAA10` → klik tile **BQ Personal**
- Item Code: **ketik "O-50834"** → klik hasil `O-50834-00`; lalu `qty: 2`, `uom: PCS`, `purpose: EJO`, `no_ejo: EJO/QA/E2E/2026`, `mesin_area: Mesin Capping VCM200`, `merk: QATest`, `spesifikasi: Spesifikasi QA alur E2E`, `jenis: Sparepart`, `urgency: Normal`
- Klik **KIRIM PENGAJUAN**
- Expected: Berhasil (201). **Catat `no_registrasi` hasilnya → pakai sebagai `[no]` di test berikutnya**

**E2E-02: Status awal pengajuan baru**
- Login: `KAA` / `KAA1910` → buka **Approval BQ Tahap Supervisor**
- Langkah: cari `[no]` di kolom Cari
- Expected: kolom 7: SPV `Menunggu`, MGR `Menunggu`; kolom 8: `BQ Baru`; Teknisi: `AAA`; Qty: `2`

**E2E-03: Supervisor menyetujui**
- Login: `INN` / `30INN11` → buka **Approval BQ Tahap Supervisor**
- Langkah: baris `[no]` → kolom 9 → klik tombol hijau **Approve** (tahap SPV)
- Expected: badge SPV menjadi `Disetujui`

**E2E-04: Officer ubah status pengadaan**
- Login: `ANS` / `ANS1805` → buka **Approval BQ Tahap Supervisor**
- Langkah: baris `[no]` → kolom 8 → pilih **Proses PO** dari dropdown
- Expected: Status Pengadaan menjadi `Proses PO`

**E2E-05: Audit trail dua aksi tercatat**
- Login: `INN` / `30INN11` → buka **Approval BQ Tahap Supervisor**
- Langkah: baris `[no]` → kolom 9 → klik ikon **Riwayat**
- Expected: modal Riwayat menampilkan **2 entri**: Approval SPV (INN) dan Status Pengadaan (ANS)

**E2E-06: Manager menyetujui final**
- Login: `KSW` / `01KSW10` → buka **Approval BQ Urgent**
- Langkah: baris `[no]` (SPV sudah Disetujui → tombol aktif) → kolom 9 → klik tombol hijau **Approve** (tahap MGR)
- Expected: badge MGR menjadi `Disetujui`

**E2E-07: Audit trail tiga aksi tercatat**
- Login: `KAA` / `KAA1910` → buka **Approval BQ Tahap Supervisor**
- Langkah: baris `[no]` → kolom 9 → klik ikon **Riwayat**
- Expected: **3 entri** (Approval SPV, Status Pengadaan, Approval Manager); muncul aktor dengan role `manager`

**E2E-08: Status akhir konsisten**
- Login: `KSW` / `01KSW10` → buka **Approval BQ Urgent**
- Langkah: cari `[no]` → periksa kolom 7 dan 8
- Expected: SPV `Disetujui`, MGR `Disetujui`, Pengadaan `Proses PO`

---

## 📝 CATATAN PENTING UNTUK TEST

1. **Urutan aman:** AUTH → RBAC → FORM → APP → STOK → MON → REP → EXP → UI → E2E. Test APP & E2E **menulis data** ke database — jalankan terakhir bila concern.
2. **AUTH-11 (rate limit):** gunakan user dummy `QA-RATE` agar akun `AAA` dkk. tidak terkunci 15 menit (kunci = IP + username). Jika terkunci, tunggu 15 menit atau restart server.
3. **Rekap/MON multi-user:** RBAC-14 menggunakan data asli `AAA` — jumlah pasti tergantung DB, yang penting hanya milik `AAA` yang tampil.
4. **Data no_registrasi contoh:** berasal dari seed; bila tidak ada di DB Anda, salin dari baris yang statusnya sama di menu **Approval BQ** (login Supervisor/Officer/Manager).
5. **Baseline (update 23 Sep 2026):** sparepart 3022 / kritis 210 / rendah 356 / habis 1887; pengajuan 1481 (live saat ini **1493**); 21 bulan (Jan 2025–Sep 2026); Sep 2026 `>= 43`; Jan 2025 `>= 63`; Feb 2025 `>= 132`; `BQ-20260922-5147` = 3 log.

---

## 📊 RINGKASAN PER SECTION

| Section | Jumlah Test | ID Test |
|---|---|---|
| NFR | 4 | NFR-07, NFR-04, NFR-06, NFR-10 |
| AUTH | 8 | AUTH-01..07, AUTH-11 |
| RBAC | 8 | RBAC-08..RBAC-15 |
| FORM | 6 | FORM-05, FORM-06, FORM-08, FORM-09, FORM-12, FORM-13 |
| APP | 9 | APP-09..APP-13, BQS-01, BQS-02, MON-RPT, MON-RPT2 |
| STOK | 2 | STOK-01, STOK-02 |
| MON | 4 | MON-01, MON-02, MON-03, MON-09 |
| REP | 3 | REP-05, REP-06, REP-07 |
| EXP | 5 | EXP-01, EXP-04, EXP-05, EXP-06, EXP-07 |
| UI | 11 | UI-01..UI-11 |
| E2E | 8 | E2E-01..E2E-08 |
| **TOTAL** | **68** | |

> Semua field input sudah disiapkan di atas. Tinggal **copy-paste data** → isi → bandingkan hasil dengan Expected.
