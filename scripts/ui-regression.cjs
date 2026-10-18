const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { _electron: electron } = require('playwright-core');

const root = path.join(__dirname, '..');
const directory = path.join(root, '..', 'verification');
const scales = (process.env.BATTERY_DOCK_SCALES || '1,1.25,1.5,2').split(',');
const results = [];
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function geometry(application, page) {
  const native = await application.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/index.html'));
    return { bounds: window.getBounds(), content: window.getContentBounds() };
  });
  const dom = await page.evaluate(() => ({
    width: innerWidth, height: innerHeight, dpr: devicePixelRatio,
    appHeight: document.getElementById('app').getBoundingClientRect().height,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight
  }));
  return { ...native, dom };
}

async function run(scale) {
  let application;
  const record = { scale, samples: [], layouts: [], errors: [] };
  try {
    const env = { ...process.env, BATTERY_DOCK_TEST: '1', BATTERY_DOCK_TEST_PROFILE: path.join(directory, `ui-${process.pid}-${scale}`) };
    delete env.ELECTRON_RUN_AS_NODE;
    const executable = process.env.BATTERY_DOCK_EXECUTABLE;
    const args = [`--force-device-scale-factor=${scale}`];
    if (!executable) args.unshift(root);
    application = await electron.launch({ env, args, ...(executable ? { executablePath: executable } : {}), timeout: 30000 });
    let page;
    for(let i=0;i<100;i++) {
      page=application.windows().find(p=>p.url().endsWith('/index.html'));
      if(page) break;
      await wait(100);
    }
    assert.ok(page,'Panel did not load');
    page.on('pageerror', error => record.errors.push(error.message));
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.waitForSelector('#alerts');
    await wait(450);
    record.initial = await geometry(application, page);
    const actions = [
      ...['浅色', '深色', '跟随系统'].map(name => ({ name, run: () => page.getByRole('button', { name, exact: true }).click() })),
      ...[['设备列表', 'list', '.devices .device'], ['电池小组件', 'widget', '.grid .grid-device']].map(([name, layout, selector]) => ({
        name,
        run: async () => {
          await page.getByRole('button', { name, exact: true }).click();
          await page.waitForSelector(selector, { timeout: 3000 });
          assert.equal(await page.locator(selector).count(), 3);
          assert.equal(await application.evaluate(() => globalThis.batteryTest.state().settings.layout), layout);
          record.layouts.push({ layout, visibleDevices: 3 });
          await page.screenshot({ path: path.join(directory, `${layout}-${scale}.png`) });
          if(layout === 'list') {
            assert.equal(await page.locator('h1').innerText(),'设置');
            assert.equal(await page.locator('.device-information .device-section').count(),3);
            assert.equal(await page.locator('.device-information .property').count(),34);
            assert.equal(await page.locator('.device-information img').evaluateAll(images=>images.every(img=>img.complete && img.naturalWidth>0)),true);
            // Return to the same settings state before comparing native bounds.
            await page.getByRole('button',{name:'电池小组件',exact:true}).click();
            await page.waitForSelector('.grid .grid-device');
          }
          await page.getByRole('button', { name: '设置', exact: true }).click();
          await page.waitForSelector('#alerts');
        }
      })),
      { name: 'alerts off', run: () => page.locator('#alerts').uncheck() },
      { name: 'alerts on', run: () => page.locator('#alerts').check() },
      { name: 'threshold', run: () => page.locator('#threshold').fill('30') },
      { name: 'refresh', run: () => page.locator('#refresh').selectOption('30') }
    ];
    for (let cycle = 0; cycle < 2; cycle++) {
      for (const action of actions) {
        await action.run();
        await page.waitForFunction(() => !document.getElementById('alerts').disabled);
        await wait(160);
        const sample = { action: `${cycle}:${action.name}`, ...await geometry(application, page) };
        record.samples.push(sample);
      }
    }
    for (let cycle = 0; cycle < 4; cycle++) {
      await page.getByRole('button', { name: '返回电量面板', exact: true }).click();
      await wait(160);
      await page.getByRole('button', { name: '设置', exact: true }).click();
      await wait(160);
      record.samples.push({ action: `reopen:${cycle}`, ...await geometry(application, page) });
    }
    await page.screenshot({ path: path.join(directory, `settings-${scale}.png`) });
    const before = record.initial.bounds;
    record.drift = record.samples.filter(s => ['x', 'y', 'width', 'height'].some(key => Math.abs(s.bounds[key] - before[key]) > 1));
    assert.equal(record.drift.length, 0, `Settings bounds drifted at scale ${scale}: ${JSON.stringify({ before, after: record.samples.at(-1).bounds })}`);
    assert.deepEqual(record.errors, []);
    record.passed = true;
  } catch (error) {
    record.failure = error.message;
  } finally {
    if (application) await application.close();
    results.push(record);
    console.log(JSON.stringify({ scale, passed: record.passed || false, initial: record.initial, last: record.samples.at(-1), failure: record.failure }));
  }
}

(async () => {
  fs.mkdirSync(directory, { recursive: true });
  for (const scale of scales) await run(scale);
  fs.writeFileSync(path.join(directory, 'ui-regression.json'), JSON.stringify(results, null, 2));
  if (results.some(r => !r.passed)) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
