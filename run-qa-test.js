const puppeteer = require('puppeteer');
function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const browser = await puppeteer.launch({ headless: true, timeout: 30000 });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  try {
    await page.goto('http://localhost:3000/qa-test.html', { waitUntil: 'networkidle0', timeout: 15000 });
    await page.waitForSelector('#btn-run', { timeout: 10000 });

    // Speed Cepat
    await page.select('#sel-speed', '0.2');
    await wait(500);

    // UI tetap dicentang (user sudah start server manual)
    const uiChecked = await page.$eval('#chk-ui', el => el.checked);
    if (!uiChecked) {
      await page.click('#chk-ui');
      await wait(200);
    }
    // E2E dicentang (user sudah start server manual)
    const e2eChecked = await page.$eval('#chk-e2e', el => el.checked);
    if (!e2eChecked) {
      await page.click('#chk-e2e');
      await wait(200);
    }

    // Click "Jalankan Semua"
    await page.click('#btn-run');
    await wait(500);

    const maxWait = 180000;
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      const btnTxt = await page.$eval('#btn-txt', el => el.textContent.trim());
      const doneText = await page.$eval('#c-done', el => el.textContent.trim());
      if (btnTxt === 'Jalankan Semua' && doneText !== '0 / 0 selesai') break;
      await wait(1000);
    }

    await wait(3000);

    const results = await page.evaluate(() => {
      const pass = document.getElementById('c-pass').textContent;
      const fail = document.getElementById('c-fail').textContent;
      const skip = document.getElementById('c-skip').textContent;
      const done = document.getElementById('c-done').textContent;
      const time = document.getElementById('c-time').textContent;
      const btnTxt = document.getElementById('btn-txt').textContent.trim();

      const cards = document.querySelectorAll('.tcard');
      const details = [];
      cards.forEach(card => {
        const id = card.id.replace('card-', '');
        const status = card.dataset.status;
        const msg = card.querySelector('.exmsg') ? card.querySelector('.exmsg').textContent : '';
        const dur = card.querySelector('.tdur') ? card.querySelector('.tdur').textContent : '';
        details.push({ id, status, message: msg, duration: dur });
      });

      return { pass, fail, skip, done, time, btnTxt, details };
    });

    console.log('\n=== HASIL QA TEST ===');
    console.log(`Status: ${results.btnTxt}`);
    console.log(`Time: ${results.time}`);
    console.log(`\n${results.pass} | ${results.fail} | ${results.skip}`);
    console.log(`Total: ${results.done}`);

    if (results.fail !== '0 FAIL') {
      console.log('\n--- TES GAGAL ---');
      results.details.filter(d => d.status === 'fail').forEach(d => {
        console.log(`  ${d.id}: ${d.message} (${d.duration})`);
      });
    }

    if (results.skip !== '0 SKIP') {
      console.log('\n--- TES DILEWAT ---');
      results.details.filter(d => d.status === 'skip').forEach(d => {
        console.log(`  ${d.id}: ${d.message}`);
      });
    }

    console.log('\n--- RINGKASAN PER BAGIAN ---');
    const groups = {};
    results.details.forEach(d => {
      if (!groups[d.id]) groups[d.id] = d;
    });
    const sectionMap = { NFR:0, AUTH:1, RBAC:2, FORM:3, APP:4, STOK:5, MON:6, REP:7, EXP:8, UI:9, E2E:10 };
    const sections = {};
    results.details.forEach(d => {
      if (!sections[d.group]) sections[d.group] = { total:0, pass:0, fail:0, skip:0 };
      sections[d.group].total++;
      if (d.status === 'pass') sections[d.group].pass++;
      else if (d.status === 'fail') sections[d.group].fail++;
      else if (d.status === 'skip') sections[d.group].skip++;
    });
    Object.keys(sections).forEach(g => {
      const s = sections[g];
      console.log(`  ${g}: ${s.pass}/${s.total} lulus${s.fail > 0 ? ', ' + s.fail + ' gagal' : ''}${s.skip > 0 ? ', ' + s.skip + ' skip' : ''}`);
    });

  } catch (e) {
    console.error('Error:', e.message);
  }

  await browser.close();
  console.log('\nTest selesai.');
  process.exit(0);
})();
