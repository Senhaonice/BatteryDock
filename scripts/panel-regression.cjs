const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { _electron: electron } = require('playwright-core');
const root = path.join(__dirname, '..');
const directory = path.join(root, '..', 'verification');
const executable = process.env.BATTERY_DOCK_EXECUTABLE;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function until(read, condition) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const value = await read();
    if (condition(value)) return value;
    await wait(100);
  }
  throw new Error('Panel state did not settle');
}

async function geometry(app) {
  return app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/index.html'));
    return { ...window.getBounds(), visible: window.isVisible() };
  });
}

async function run(scale) {
  let app;
  const errors = [];
  try {
    const env = { ...process.env, BATTERY_DOCK_TEST: '1', BATTERY_DOCK_TEST_PROFILE: path.join(directory, `panel-${process.pid}-${scale}`) };
    delete env.ELECTRON_RUN_AS_NODE;
    const args = ['--silent', `--force-device-scale-factor=${scale}`];
    if (!executable) args.unshift(root);
    app = await electron.launch({ env, args, ...(executable ? { executablePath: executable } : {}), timeout: 30000 });
    const native = await until(() => app.evaluate(() => globalThis.batteryTest?.taskbar()), state => state && Object.hasOwn(state, 'overflow'));
    const display = await app.evaluate(({ screen }) => screen.getPrimaryDisplay());
    const work = display.workArea;
    const overflow = { x: work.x + work.width - 280, y: work.y + work.height - 250, width: 240, height: 240 };
    const icon = { x: overflow.x + 24, y: overflow.y + 24, width: 24, height: 24 };
    const state = { ...native, autoHide: false, overflow };
    await app.evaluate((_electron, state) => globalThis.batteryTest.setTaskbar(state), state);
    assert.equal(app.windows().some(page => page.url().endsWith('/index.html')), false);
    await app.evaluate((_electron, anchor) => globalThis.batteryTest.show(anchor), icon);
    const page = await until(() => Promise.resolve(app.windows().find(page => page.url().endsWith('/index.html'))), Boolean);
    page.on('pageerror', error => errors.push(error.message));
    await page.waitForSelector('.grid-device');
    await wait(350);
    assert.equal(await page.locator('.header-tools button').count(), 2);
    const expanded = await geometry(app);
    assert.ok(Math.abs(expanded.y + expanded.height - (icon.y - 3)) <= 2);
    await page.screenshot({ path: path.join(directory, `panel-${scale}-overflow-open-fixture.png`) });
    const samples = [];
    for (let cycle = 0; cycle < 3; cycle++) {
      await app.evaluate((_electron, value) => globalThis.batteryTest.setTaskbar(value), { ...state, overflow: null });
      const closed = await geometry(app);
      assert.ok(Math.abs(closed.y + closed.height - (work.y + work.height - 3)) <= 2);
      assert.ok(Math.abs(closed.x + closed.width - (work.x + work.width)) <= 2);
      assert.ok(Math.abs(closed.width - expanded.width) <= 1);
      assert.ok(Math.abs(closed.height - expanded.height) <= 1);
      if (samples.length) assert.deepEqual(closed, samples[0], 'Repeated overflow transitions must not accumulate DPI rounding');
      assert.equal(closed.visible, true);
      samples.push(closed);
      await app.evaluate((_electron, value) => globalThis.batteryTest.setTaskbar(value), state);
      assert.deepEqual(await geometry(app), closed, 'Reopening overflow must not pull a docked panel away from the taskbar');
    }
    await page.screenshot({ path: path.join(directory, `panel-${scale}-overflow-closed-fixture.png`) });
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('button', { name: '设备列表', exact: true }).click();
    await page.waitForSelector('.device-section');
    assert.equal(await page.locator('.device-section').count(), 3);
    await page.waitForFunction(() => !document.getElementById('alerts').disabled);
    await wait(200);
    const before = await geometry(app);
    await app.evaluate((_electron, value) => globalThis.batteryTest.setTaskbar(value), { ...state, overflow: null });
    assert.deepEqual(await geometry(app), before, 'Settings must retain its bounds and contents when overflow closes');
    assert.equal(await page.locator('h1').innerText(), '设置');
    await page.getByRole('button', { name: '返回电量面板', exact: true }).click();
    await wait(200);
    await app.evaluate((_electron, anchor) => globalThis.batteryTest.show(anchor), icon);
    const stale = await geometry(app);
    assert.ok(Math.abs(stale.y + stale.height - (work.y + work.height - 3)) <= 2, 'Reusing a closed overflow icon must dock immediately');
    const bottom = native.bounds.y + native.bounds.height;
    const retracted = { ...state, overflow: null, autoHide: true, rect: { x: native.bounds.x, y: bottom - 2, width: native.bounds.width, height: 48 } };
    await app.evaluate((_electron, value) => globalThis.batteryTest.setTaskbar(value), retracted);
    const hiddenTaskbar = await geometry(app);
    assert.ok(Math.abs(hiddenTaskbar.y + hiddenTaskbar.height - (bottom - 5)) <= 2);
    await app.evaluate(() => globalThis.batteryTest.hide());
    await app.evaluate((_electron, value) => globalThis.batteryTest.setTaskbar(value), state);
    assert.equal((await geometry(app)).visible, false, 'A taskbar update must not reopen a dismissed panel');
    assert.equal(await app.evaluate(() => globalThis.batteryTest.trayCount()), 1);
    assert.deepEqual(errors, []);
    return { scale, passed: true, native, expanded, closed: samples[0], stale, hiddenTaskbar, errors, checks: 'native overflow state received; simulated overflow close/open, cached icon bounds, inline device Settings, taskbar auto-hide, one tray icon, hidden panel stays hidden' };
  } finally { if (app) await app.close(); }
}

(async () => {
  fs.mkdirSync(directory, { recursive: true });
  const results = [];
  for (const scale of (process.env.BATTERY_DOCK_SCALES || '1,1.25,1.5,2').split(',')) {
    results.push(await run(scale));
    console.log(JSON.stringify(results.at(-1)));
  }
  fs.writeFileSync(path.join(directory, executable ? 'packaged-panel-regression.json' : 'panel-regression.json'), JSON.stringify(results, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
