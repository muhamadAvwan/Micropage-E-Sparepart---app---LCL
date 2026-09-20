# GUIDES TEST MANUAL QA - Micropage E-Sparepart
**Update: 18 September 2026 — Total 61 Test**

---

✅ CARA MULAI
1. Pastikan server hidup (`node server.js`)
2. Buka browser di `http://localhost:3000/qa-test.html`
3. Login menggunakan kredensial di bawah ini
4. Klik "Jalankan Semua" atau test per-section

---

🔑 KREDENSIAL LOGIN (untuk test manual)

| Role | Username | Password | Group Test |
|------|----------|----------|------------|
| Teknisi | AAA | 04AAA10 | AUTH, FORM, STOK, MON, UI |
| Supervisor 1 | INN | 30INN11 | AUTH, RBAC, APP, MON |
| Supervisor 2 | MUN | 2506MUN | RBAC, APP, MON |
| Supervisor 2 | KAA | KAA1910 | RBAC, APP, MON |
| Officer | ANS | ANS1805 | AUTH, RBAC, FORM, STOK |
| Manager | KSW | 01KSW10 | APP, MON, REP, UI, E2E |

---

📊 MAPPING TIM SUPERVISOR (supervisor_id)

| Supervisor | ID | Tim Teknisi | Jumlah |
|------------|----|-------------|--------|
| **INN** (Supervisor 1) | 14 | AAA, ANO, BDU, MOB, MRN, NDS | 6 |
| **MUN** (Supervisor 2) | 15 | RIA, ROS, SFH, KFF, ERA | 5 |
| **KAA** (Supervisor 2) | 16 | WAP, MCL | 2 |

> **Catatan:** PR Summary hanya bisa diakses **Manager (KSW)** dan **Supervisor 1 (INN)** saja. Supervisor 2 (MUN, KAA) dan role lainnya mendapat **403** saat akses PR Summary.

---

📋 DAFTAR TEST SESIAP DIJALANKAN

---

⚙️ SECTION 1: NFR (Kesiapan Sistem) — 4 test

**NFR-07: Cek server hidup**
- Langkah: Klik "Jalankan Semua" atau akses `/api/health`
- Expected: `{"status":"ok","message":"Server E-Sparepart Aktif"}`

**NFR-04: Endpoint tidak dikenal**
- Langkah: Akses `/api/qa-tidak-ada`
- Expected: `{"status":"error","message":"Endpoint tidak ditemukan"}`

**NFR-06: Static app tersaji**
- Langkah: Akses root `/`
- Expected: Halaman HTML aplikasi terbuka (bukan kosong)

**NFR-10: Link Looker Studio diakses** ✅ *Tambah 18 Sep*
- Langkah: Akses link Looker Studio di index.html baris 485: `https://lookerstudio.google.com/reporting/9bb14be8-f9d4-458e-9811-a89e9c8bb216`
- Expected: Link terbuka, konten Laporan Bulanan tampil

---

🔐 SECTION 2: AUTH (Login & Keluar) — 7 test

**AUTH-01: Login Teknisi (AAA)** → 200, role teknisi, ada bqLink, password tidak bocor
**AUTH-02: Login Supervisor (INN)** → 200, role Supervisor 1
**AUTH-03: Login Officer (ANS)** → 200, role Officer
**AUTH-04: Login Manager (KSW)** → 200, role manager
**AUTH-05: Password salah ditolak** → 401, message "Kombinasi Username atau Password salah"
**AUTH-06: Username tak terdaftar** → 401, pesan sama seperti AUTH-05
**AUTH-07: Body login kosong** → 400, message "Parameter username dan password wajib diisi"
**AUTH-11: Rate limit (5 gagal → 429)** → 5x 401, 6x 429 + retryAfter

---

🛡️ SECTION 3: RBAC (Hak Akses per Peran) — 8 test

**RBAC-08: Teknisi tidak boleh approval** → Login AAA, coba approve SPV → 403
**RBAC-09: Supervisor tidak boleh approval MGR** → Login INN, coba approve MGR → 403 (hanya Manager yang boleh)
**RBAC-10: Officer tidak boleh approval** → Login ANS, coba approve SPV → 403
**RBAC-11: Manager menunggu approval SPV** → Login KSW, approve MGR saat SPV belum → 400 (pesan alur)
**RBAC-12: User tak dikenal** → Login ghost, ubah status → 401
**RBAC-13: Buat pengajuan tanpa login** → POST /api/pengajuan tanpa username → 401

**RBAC-14: Hanya Manager & Supervisor 1 boleh akses PR Summary** ✅ *Tambah 18 Sep*
- Langkah: Coba akses `/api/pengajuan/summary` dengan tiap role:
  - Login AAA → GET summary → Expected: **403** (ditolak)
  - Login INN → GET summary → Expected: **200** (boleh)
  - Login KAA → GET summary → Expected: **403** (ditolak)
  - Login ANS → GET summary → Expected: **403** (ditolak)
  - Login KSW → GET summary → Expected: **200** (boleh)

**RBAC-15: Supervisor 2 (KAA) boleh approve SPV** ✅ *Tambah 18 Sep*
- Langkah: Login KAA, coba approve SPV pengajuan yang statusnya Menunggu → Expected: **200**

---

📝 SECTION 4: FORM (Form Pengajuan Barang) — 6 test

**FORM-08: Field pelengkap wajib** → POST tanpa uom → 400 "UoM, Purpose..."
**FORM-09: Item Code & spesifikasi wajib** → POST tanpa spesifikasi → 400
**FORM-12: Item Code tak ada di DB** → POST itemCode palsu → 400
**FORM-05: Qty 0 ditolak** → POST qty=0 → 400
**FORM-06: Qty pecahan ditolak** → POST qty=1.5 → 400
**FORM-13: Buat pengajuan Jasa** → POST {jenis_pengajuan:"jasa"} → 201, item_code null

---

📦 SECTION 5: APP (Persetujuan & Perubahan Status) — 5 test

**APP-09: Status pengadaan invalid ditolak** → PUT status_pengadaan="Selesai" → 400
**APP-10: Nilai approval invalid ditolak** → PUT status_approval_spv="setuju" → 400
**APP-11: Tanpa status** → PUT tanpa field status → 400
**APP-12: PR Summary menampilkan pengajuan menunggu** → GET summary → 200, data array
**APP-13: Buat pengajuan urgency=Urgent** → POST {urgency:"Urgent"} → 201

---

📦 SECTION 6: STOK (Data Stok & KPI) — 2 test

**STOK-01: KPI ringkasan stok akurat** → total_item: 663, critical: 155, rendah: 284, habis: 140
**STOK-02: Daftar sparepart lengkap** → 663 item, field lengkap

---

👁️ SECTION 7: MON (Pantau Pengajuan) — 4 test

**MON-01: Monitoring memuat seluruh pengajuan** → count = jumlah data, terbaru di atas
**MON-02: Kolom monitoring lengkap** → 15 kolom ada di tiap baris (termasuk urgency & jenis_pengajuan)
**MON-09: Audit trail tersimpan** → Log BQ-2026-09-01-0001 → 3 entri
**MON-03: Kolom jenis & urgency di monitoring** → Setiap baris punya jenis_pengajuan & urgency

---

📈 SECTION 8: REP (Laporan Bulanan) — 3 test

**REP-05: Periode laporan tersedia** → 21 bulan (Jan 2025 - Sep 2026)
**REP-06: Rekap Sep 2026** → Jumlah >= 8
**REP-07: Rekap Jan & Feb 2025** → Jan >= 16, Feb >= 20

---

📤 SECTION 9: EXP (Ekspor Excel) — 4 test

**EXP-01: Export Excel valid** → 200, content-type spreadsheet, magic bytes PK
**EXP-04: Export tanpa columns/rows** → 400
**EXP-05: Batas ukuran export** → 20001 baris → 413
**EXP-06: Alert stok di bawah minimum** → 200, array sparepart defisit
**EXP-07: Buat pengajuan Jasa via Export** → POST jasa → 201

---

🖥️ SECTION 10: UI (Uji Tampilan Aplikasi) — 8 test

**UI-01: Menu Manager (4 modul)** → BQ Monitoring, Monthly Report, Critical Part List, PR Summary
**UI-02: Buka BQ Monitoring** → Tabel + pagination + tombol Riwayat
**UI-03: Pencarian di BQ Monitoring** → Filter hasil
**UI-04: Monthly Report tampil** → Ringkasan + periode + chart
**UI-05: Menu Teknisi (2 modul)** → BQ Personal, On Hand Stock, KPI total = 663
**UI-06: On Hand Stock** → 663 item, cari bearing → menyusut
**UI-07: Logout membersihkan sesi** → Kembali ke login, sessionStorage terhapus
**UI-08: Kartu Critical Part** → Modal "Critical Part List", jumlah = 155

---

📝 E2E (Alur Lengkap) — 8 test *(hanya jalan jika centang "E2E tulis data")*

**E2E-01 s.d. E2E-08:** Buat pengajuan → approve SPV (INN) → ubah status (ANS) → approve MGR (KSW) → cek audit trail → cek status akhir

---

📌 RINGKASAN PERUBAHAN 18 SEPTEMBER 2026

| Perubahan | Detail |
|-----------|--------|
| **RBAC-14** (baru) | Hanya Manager & Supervisor 1 boleh akses PR Summary |
| **NFR-10** (baru) | Link Looker Studio diakses |
| **RBAC-15** (baru) | Supervisor 2 (KAA) boleh approve SPV |
| **Database** | supervisor_id mapping 13 teknisi → 3 supervisor |
| **Total Test** | 58 → **61** |

---

📝 CATATAN PENTING
1. Speed test: Di qa-test.html bisa ubah ke "Cepat" (0.2) atau "Mudah dilihat manusia" (6)
2. E2E test: Beberapa test menulis data. Bisa reset jika ingin hapus hasil uji.
3. Section order: NFR → AUTH → RBAC → FORM → APP → STOK → MON → REP → EXP → UI → E2E
4. Prasyarat: Beberapa test memerlukan test sebelumnya (lihat DEPS di qa-test.html)
5. **Mapping tim:** 13 teknisi sudah dibagi ke 3 supervisor (INN:6, MUN:5, KAA:2)
6. **PR Summary:** Akses hanya untuk Manager (KSW) & Supervisor 1 (INN)

Saran: Mulai dari section NFR, lalu AUTH, lalu RBAC. Jika semua lulus, aplikasi full function.
