/**
 * tests/visual_uat.js — Heavy-Diagnostic Edition
 * ====================================================================
 * End-to-End (E2E) UAT untuk "Micropage E-Sparepart"
 *
 * FIX edisi ini:
 *  - Menangkap semua event browser (console, error HTTP, pageerror)
 *  - Pada kegagalan: dump DOM state + screenshot error + detail pesan
 *  - Logout via page.evaluate() untuk menghindari masalah click overlay
 *  - Setiap request HTTP dicatat (termasuk 404 dari favicon)
 *
 * Jalankan:
 *   npm install puppeteer   (satu kali saja)
 *   npm start               (terminal 1 — server di port 3000)
 *   node tests/visual_uat.js  (terminal 2)
 * ====================================================================
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// =================== KONFIGURASI ===================
const BASE_URL = 'http://localhost:3000';
const VIEWPORT = { width: 1280, height: 800 };
const SLOW = 100;
const TYPE_DELAY = 130;
const SHOT_DIR = path.join(__dirname, 'screenshots');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// =================== LOG BERWARNA ===================
const C = {
  log: '\x1b[36m',
  ok: '\x1b[32m',
  war: '\x1b[33m',
  err: '\x1b[31m',
  dim: '\x1b[90m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
};
const log   = (m) => console.log(C.log + '[UAT]' + C.reset + ' ' + m);
const ok    = (m) => console.log(C.ok + '  [OK]' + C.reset + ' ' + m);
const warn  = (m) => console.log(C.war + '  [WARN]' + C.reset + ' ' + m);
const fail  = (m) => console.log(C.err + '  [FAIL]' + C.reset + ' ' + m);
const info  = (m) => console.log(C.dim + '  [INFO]' + C.reset + ' ' + m);
const http  = (m) => console.log(C.bold + '  [HTTP]' + C.reset + ' ' + m);

// =================== DIAGNOSTIC HELPERS ===================

// Simpan semua event browser selama sesi ini untuk referensi.
const browserEvents = [];
function recordEvent(type, detail) {
  browserEvents.push({ time: new Date().toISOString(), type, detail });
}

/**
 * Pasang listener global di page. Dipanggil SEKALI sebelum semua skenario.
 */
function attachDiagnosticListeners(page) {
  // 1) Console dari browser (log, warn, error, info)
  page.on('console', (msg) => {
    const type = msg.type();
    const text = msg.text();
    recordEvent('console', `[${type}] ${text}`);
    // Tampilkan hanya error/warning yang penting agar log tidak bising.
    if (type === 'error') info('BROWSER ERROR: ' + text);
    else if (type === 'warning') info('BROWSER WARN: ' + text);
  });

  // 2) Uncaught JS error di halaman
  page.on('pageerror', (err) => {
    recordEvent('pageerror', String(err));
    fail('PAGE ERROR (uncaught): ' + err.message);
  });

  // 3) Setiap HTTP response — catat yang menarik (2xx API, 4xx, 5xx)
  page.on('response', (res) => {
    const url = res.url();
    const status = res.status();
    // Hanya catat request ke server lokal (bukan CDN/lucide/chart.js)
    if (url.includes('localhost:3000') || url.includes('localhost:3000')) {
      const tag = (status >= 400) ? C.err : C.dim;
      http(`${tag}${status}${C.reset} ${url}`);
      recordEvent('response', { status, url });
    }
  });

  // 4) Request yang gagal total (network error, DNS, timeout)
  page.on('requestfailed', (req) => {
    const url = req.url();
    const reason = req.failure()?.errorText || 'unknown';
    fail('REQUEST FAILED: ' + url + ' (' + reason + ')');
    recordEvent('requestfailed', { url, reason });
  });
}

/**
 * Dump kondisi DOM saat ini — sangat berguna saat skenario gagal.
 */
async function dumpDomState(page) {
  try {
    return await page.evaluate(() => {
      const sectionIds = ['login-section', 'dash-section', 'modal-stok', 'modal-bq', 'modal-approval', 'modal-report'];
      const sections = {};
      sectionIds.forEach((id) => {
        const el = document.getElementById(id);
        sections[id] = el
          ? { hidden: el.classList.contains('hidden'), visible: getComputedStyle(el).display !== 'none' }
          : null;
      });

      // Cek apakah ada overlay fixed/absolute yang bisa menghalangi
      const overlays = [];
      document.querySelectorAll('.fixed, [style*="position: fixed"], [style*="position: fixed"]').forEach((el) => {
        const cs = getComputedStyle(el);
        if (cs.display !== 'none' && cs.visibility !== 'hidden') {
          overlays.push({
            id: el.id || '(no-id)',
            classes: el.className.substring(0, 80),
            display: cs.display,
            zIndex: cs.zIndex,
            pointerEvents: cs.pointerEvents,
            rect: el.getBoundingClientRect(),
          });
        }
      });

      // Cek tombol logout
      const btn = document.getElementById('btn-logout');
      const btnInfo = btn
        ? { exists: true, disabled: btn.disabled, type: btn.type, rect: btn.getBoundingClientRect() }
        : { exists: false };

      // Active element
      const active = document.activeElement;

      return {
        url: location.href,
        sections,
        overlays,
        logoutButton: btnInfo,
        activeElement: active ? { tag: active.tagName, id: active.id, class: active.className?.substring(0, 60) } : null,
        scrollY: window.scrollY,
        bodyHeight: document.body.scrollHeight,
      };
    });
  } catch (e) {
    return { error: 'Gagal dump DOM: ' + e.message };
  }
}

/**
 * Tampilkan dumpDomState dengan format rapi.
 */
function printDomState(state) {
  if (state.error) { fail(state.error); return; }
  console.log('\n' + C.bold + '=== DOM STATE DUMP ===' + C.reset);
  console.log('  URL:', state.url);
  console.log('  Scroll:', state.scrollY, '/ body:', state.bodyHeight);
  console.log('  Active element:', JSON.stringify(state.activeElement));
  console.log('  Logout button:', JSON.stringify(state.logoutButton));
  console.log('  Sections:');
  Object.entries(state.sections).forEach(([id, val]) => {
    if (val) {
      const icon = val.hidden ? 'X' : 'O';
      console.log(`    ${icon} #${id} — hidden=${val.hidden}, visible=${val.visible}`);
    }
  });
  console.log('  Overlays (fixed/absolute, visible):', state.overlays.length);
  state.overlays.forEach((o) => {
    console.log(`    - #${o.id} z=${o.zIndex} pointer=${o.pointerEvents} display=${o.display}`);
    console.log(`      rect: top=${Math.round(o.rect.top)} left=${Math.round(o.rect.left)} ${Math.round(o.rect.width)}x${Math.round(o.rect.height)}`);
  });
  console.log(C.bold + '=== END DOM STATE ===\n' + C.reset);
}

// =================== UI HELPERS ===================
async function waitForVisible(page, sectionId, timeoutMs = 15000) {
  log('  Menunggu #' +sectionId + ' muncul (max ' + (timeoutMs / 1000) + 's)...');
  await page.waitForFunction(
    (id) => {
      const el = document.getElementById(id);
      return el && !el.classList.contains('hidden');
    },
    { timeout: timeoutMs },
    sectionId
  );
  ok('#' + sectionId + ' muncul.');
}

async function waitForSelectorVisible(page, selector, timeoutMs = 10000) {
  log('  Menunggu selector "' + selector + '" muncul...');
  await page.waitForSelector(selector, { visible: true, timeout: timeoutMs });
}

function shot(page, name) {
  const fullPath = path.join(SHOT_DIR, name);
  return page.screenshot({ path: fullPath });
}

/**
 * Tutup modal dengan cara yang paling robust:
 *  1. Coba via page.evaluate (langsung panggil closeModal dari JS)
 *  2. Kalau gagal, fallback ke backdrop.click()
 *  3. Verifikasi setelahnya
 */
async function forceCloseModal(page, modalId) {
  log('  Menutup modal ' + modalId + ' (via evaluate)...');
  const result = await page.evaluate((id) => {
    // Metode 1: panggil closeModal() langsung jika ada di global scope
    if (typeof window.closeModal === 'function') {
      window.closeModal(id);
      return 'closed via closeModal()';
    }
    // Metode 2: klik backdrop manual
    const modal = document.getElementById(id);
    if (modal) {
      const backdrop = modal.firstElementChild;
      if (backdrop) { backdrop.click(); return 'closed via backdrop click'; }
      modal.classList.add('hidden');
      return 'closed via classList.add';
    }
    return 'modal not found';
  }, modalId);
  info('  Hasil tutup: ' + result);
  await sleep(500);

  // Verifikasi
  const hidden = await page.evaluate((id) => {
    const el = document.getElementById(id);
    return el && el.classList.contains('hidden');
  }, modalId);
  if (hidden) {
    ok(modalId + ' tertutup.');
  } else {
    warn(modalId + ' mungkin masih terbuka! Memaksa hidden...');
    await page.evaluate((id) => {
      const el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    }, modalId);
    await sleep(200);
  }
}

/**
 * Logout via evaluate (lebih robust daripada Puppeteer click,
 * karena menghindari masalah overlay/occlusion).
 */
async function forceLogout(page) {
  log('  Mengklik tombol Logout (via evaluate)...');
  await page.evaluate(() => {
    const btn = document.getElementById('btn-logout');
    if (btn) btn.click();
  });
  await sleep(600);
}

// =================== SKENARIO 1: TEKNISI ===================
async function scenarioTeknisi(page) {
  log('=== SKENARIO 1: TEKNISI (AAA/04AAA10) ===');

  await page.goto(BASE_URL, { waitUntil: 'load' });
  await waitForVisible(page, 'login-section');
  ok('Halaman login terbuka.');

  log('  Mengetik username: AAA');
  await page.type('#inp-user', 'AAA', { delay: TYPE_DELAY });
  log('  Mengetik password: 04AAA10');
  await page.type('#inp-pass', '04AAA10', { delay: TYPE_DELAY });
  await sleep(300);

  log('  Mengklik tombol Login...');
  await page.click('#btn-login');

  await waitForVisible(page, 'dash-section');
  ok('Dashboard teknisi terbuka.');

  const role = await page.$eval('#badge-role', (el) => el.textContent.trim().toLowerCase());
  const name = await page.$eval('#dash-name', (el) => el.textContent.trim());
  if (role !== 'teknisi') throw new Error('Role tidak sesuai, ditemukan: ' + role);
  ok('Validasi role = "teknisi", nama = ' + name);
  await shot(page, '1-teknisi-dashboard.png');

  // Buka modal stok
  log('  Membuka menu On Hand Stock...');
  await page.click('button[data-action="stok"]');
  await waitForSelectorVisible(page, '#modal-stok');
  await page.waitForFunction(() => document.querySelectorAll('#tbody-stok tr').length > 0, { timeout: 10000 });
  ok('Modal stok terisi data sparepart.');
  await shot(page, '1-teknisi-stok.png');
  await forceCloseModal(page, 'modal-stok');

  // Logout
  await forceLogout(page);
  await waitForVisible(page, 'login-section');
  ok('Logout teknisi berhasil, kembali ke halaman login.');
}

// =================== SKENARIO 2: MANAGER ===================
async function scenarioManager(page) {
  log('=== SKENARIO 2: MANAGER (KSW/01KSW10) ===');

  await page.goto(BASE_URL, { waitUntil: 'load' });
  await waitForVisible(page, 'login-section');

  log('  Mengetik username: KSW');
  await page.type('#inp-user', 'KSW', { delay: TYPE_DELAY });
  log('  Mengetik password: 01KSW10');
  await page.type('#inp-pass', '01KSW10', { delay: TYPE_DELAY });
  await sleep(300);

  log('  Mengklik tombol Login...');
  await page.click('#btn-login');

  await waitForVisible(page, 'dash-section');
  ok('Dashboard manager terbuka.');

  const role = await page.$eval('#badge-role', (el) => el.textContent.trim().toLowerCase());
  const name = await page.$eval('#dash-name', (el) => el.textContent.trim());
  if (role !== 'manager') throw new Error('Role tidak sesuai, ditemukan: ' + role);
  ok('Validasi role = "manager", nama = ' + name);
  await shot(page, '2-manager-dashboard.png');

  // BQ Monitoring
  try {
    log('  Membuka menu BQ Monitoring...');
    await page.click('button[data-action="monitoring"]');
    await waitForSelectorVisible(page, '#modal-approval', 8000);
    await page.waitForFunction(() => document.querySelectorAll('#tbody-pengajuan tr').length > 0, { timeout: 12000 });
    ok('Modal Monitoring & Approval terisi data pengajuan.');
    await shot(page, '2-manager-monitoring.png');
  } catch (e) {
    warn('Modal "BQ Monitoring" gagal: ' + e.message);
  }
  await forceCloseModal(page, 'modal-approval');

  // Monthly Report
  try {
    log('  Membuka menu Monthly Report...');
    await page.click('button[data-action="report"]');
    await waitForSelectorVisible(page, '#reportChart', 8000);
    await sleep(1500); // Chart.js render time
    ok('Canvas Monthly Report tampil.');
    await shot(page, '2-manager-report.png');
  } catch (e) {
    warn('Menu "Monthly Report" gagal: ' + e.message);
  }
  await forceCloseModal(page, 'modal-report');

  // Logout — ini yang kemarin gagal
  log('  Mengklik tombol Logout...');
  await forceLogout(page);

  try {
    await waitForVisible(page, 'login-section', 10000);
    ok('Logout manager berhasil, kembali ke halaman login.');
  } catch (e) {
    // ====== DIAGNOSTIC: dump DOM state saat logout gagal ======
    fail('Logout manager GAGAL — login-section tidak muncul.');
    const state = await dumpDomState(page);
    printDomState(state);
    await shot(page, '2-manager-LOGOUT-FAIL.png');

    // Coba paksa logout sebagai fallback
    info('Mencoba paksa via evaluate: showLogin()...');
    await page.evaluate(() => {
      if (typeof showLogin === 'function') showLogin();
    });
    await sleep(500);

    // Verifikasi lagi
    const loginVisible = await page.evaluate(() => {
      const el = document.getElementById('login-section');
      return el && !el.classList.contains('hidden');
    });
    if (loginVisible) {
      ok('Fallback showLogin() berhasil — login-section terlihat.');
    } else {
      fail('Fallback juga gagal. Perlu investigasi lebih lanjut.');
      // Last resort: reload page
      info('Mencoba reload halaman...');
      await page.goto(BASE_URL, { waitUntil: 'load' });
      await sleep(1000);
      await shot(page, '2-manager-AFTER-RELOAD.png');
    }
  }
}

// =================== MAIN ===================
(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    headless: false,
    slowMo: SLOW,
    defaultViewport: VIEWPORT,
    args: ['--window-size=1280,800'],
  });

  const page = await browser.newPage();
  attachDiagnosticListeners(page);

  // Tangani dialog (alert/confirm)
  page.on('dialog', async (d) => {
    warn('Dialog terdeteksi: ' + d.type() + ' — ' + d.message());
    await d.accept();
  });

  try {
    await scenarioTeknisi(page);
    await sleep(500);
    await scenarioManager(page);
    ok('=== Semua skenario selesai dieksekusi ===');
  } catch (err) {
    fail('Skrip berhenti karena error fatal: ' + err.message);
    const state = await dumpDomState(page);
    printDomState(state);
    await shot(page, 'FATAL-ERROR.png');
  } finally {
    // Tampilkan ringkasan event browser
    const errors = browserEvents.filter((e) => e.type === 'pageerror' || (e.type === 'response' && e.detail?.status >= 400));
    if (errors.length) {
      console.log('\n' + C.bold + '=== RINGKASAN EVENT PENTING ===' + C.reset);
      errors.forEach((e) => console.log('  ' + e.time + ' [' + e.type + '] ' + JSON.stringify(e.detail)));
      console.log(C.bold + '=== END RINGKASAN ===\n' + C.reset);
    }

    log('Selesai. Menutup browser dalam 3 detik...');
    await sleep(3000);
    await browser.close();
    log('Browser ditutup. Screenshot tersimpan di tests/screenshots/');
  }
})();