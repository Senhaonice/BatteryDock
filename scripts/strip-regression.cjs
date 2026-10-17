const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { _electron: electron } = require('playwright-core');
const root = path.join(__dirname, '..');
const directory = path.join(root, '..', 'verification');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const executable = process.env.BATTERY_DOCK_EXECUTABLE;

async function until(read, condition) {
  for (let i = 0; i < 100; i++) {
    const value = await read();
    if (condition(value)) return value;
    await wait(100);
  }
  throw new Error('State did not settle');
}

async function run(scale) {
  let app;
  const errors = [];
  try {
    const env = { ...process.env, BATTERY_DOCK_TEST: '1', BATTERY_DOCK_TEST_PROFILE: path.join(directory, `strip-${process.pid}-${scale}`) };
    delete env.ELECTRON_RUN_AS_NODE;
    const args = ['--silent', `--force-device-scale-factor=${scale}`];
    if (!executable) args.unshift(root);
    app = await electron.launch({ env, args, ...(executable ? { executablePath: executable } : {}), timeout: 30000 });
    await until(() => app.evaluate(() => globalThis.batteryTest?.strip()), value => value?.visible);
    const strip = app.windows().find(page => page.url().endsWith('/strip.html'));
    assert.ok(strip);
    strip.on('pageerror', error => errors.push(error.message));
    const startup = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(window => ({ title: window.getTitle(), visible: window.isVisible(), focused: window.isFocused() })));
    assert.equal(startup.filter(window => window.visible).length, 1);
    assert.ok(startup.every(window => !window.focused));
    assert.ok(!app.windows().some(page => page.url().endsWith('/index.html')));
    await until(() => app.evaluate(() => globalThis.batteryTest.state()), value => value.pollAt && !value.refreshing);
    await app.evaluate(() => globalThis.batteryTest.setSettings({ refresh: 60 }));
    // Synthetic states exercise display rules only, after the real HID poll has completed.
    await app.evaluate(() => globalThis.batteryTest.setDevices([
      { id: 'mouse', status: 'fresh', percentage: 5, charging: false, observedAt: Date.now() },
      { id: 'keyboard', status: 'fresh', percentage: 100, charging: true, observedAt: Date.now() }
    ]));
    for (const theme of ['light', 'dark']) {
      await app.evaluate((_electron, theme) => globalThis.batteryTest.setSettings({ theme }), theme);
      await strip.waitForFunction(theme => document.documentElement.style.colorScheme === theme, theme);
      await strip.waitForFunction(() => [...document.images].every(image => image.complete && image.naturalWidth > 0));
      assert.equal((await strip.locator('[data-device="mouse"] .strip-reading').innerText()).replace(/\s/g, ''), '5%');
      assert.equal(await strip.locator('[data-device="mouse"] .low-text').count(), 1);
      assert.equal(await strip.locator('[data-device="keyboard"] .green-text svg').count(), 1);
      assert.equal(await strip.locator('[data-device="controller"] .strip-reading').innerText(), '--');
      const overflow = await strip.locator('.strip-device').evaluateAll(buttons => buttons.filter(button => {
        const bounds = button.getBoundingClientRect();
        return [...button.querySelectorAll('*')].some(child => {
          const box = child.getBoundingClientRect();
          return box.left < bounds.left - 1 || box.right > bounds.right + 1;
        });
      }).map(button => button.dataset.device));
      assert.deepEqual(overflow, [], `Strip contents overflow at ${scale}/${theme}`);
      await strip.screenshot({ path: path.join(directory, `strip-${scale}-${theme}-fixture.png`) });
    }
    await app.evaluate(() => globalThis.batteryTest.setDevices([{ id: 'mouse', status: 'unavailable' }, { id: 'keyboard', status: 'disconnected' }]));
    await strip.waitForFunction(() => [...document.querySelectorAll('.strip-reading')].every(element => element.textContent === '--'));
    assert.equal(await strip.locator('.low-text, .green-text').count(), 0);
    assert.match(await strip.locator('[data-device="mouse"]').getAttribute('aria-label'), /上次电量 5%/);
    await app.evaluate(() => globalThis.batteryTest.setSettings({ visible: { mouse: false, keyboard: false, controller: false } }));
    await strip.getByRole('button', { name: '打开 BatteryDock', exact: true }).waitFor();
    await app.evaluate(() => globalThis.batteryTest.setSettings({ visible: { mouse: true, keyboard: true, controller: true } }));
    await strip.locator('[data-device="mouse"]').click();
    await until(() => Promise.resolve(app.windows().find(page => page.url().endsWith('/index.html'))), Boolean);
    const panel = app.windows().find(page => page.url().endsWith('/index.html'));
    await panel.getByRole('button', { name: '收起电量面板', exact: true }).click();
    await until(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/index.html')).isVisible()), visible => !visible);
    await strip.locator('[data-device="keyboard"]').click();
    await until(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/index.html')).isVisible()), Boolean);
    const geometry = await app.evaluate(({ BrowserWindow, screen }) => {
      globalThis.batteryTest.positionStrip();
      return { panel: BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/index.html')).getBounds(), strip: globalThis.batteryTest.strip().bounds, work: screen.getPrimaryDisplay().workArea };
    });
    assert.ok(geometry.panel.y + geometry.panel.height <= geometry.strip.y + 2);
    assert.ok(geometry.strip.y + geometry.strip.height <= geometry.work.y + geometry.work.height);
    const actualTaskbar = await until(() => app.evaluate(() => globalThis.batteryTest.taskbar()), Boolean);
    const movement = await app.evaluate(({ screen, BrowserWindow }) => {
      const display = screen.getPrimaryDisplay();
      const bounds = globalThis.batteryTest.taskbar().bounds;
      const bottom = bounds.y + bounds.height;
      const rect = { x: bounds.x, y: bottom - 48, width: bounds.width, height: 48 };
      globalThis.batteryTest.setTaskbar({ autoHide: true, rect, bounds });
      const expanded = { strip: globalThis.batteryTest.strip().bounds, panel: BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/index.html')).getBounds() };
      globalThis.batteryTest.setTaskbar({ autoHide: true, rect: { ...rect, y: bottom - 2 }, bounds });
      const hidden = { strip: globalThis.batteryTest.strip().bounds, panel: BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/index.html')).getBounds() };
      globalThis.batteryTest.setTaskbar({ autoHide: true, rect, bounds });
      const restored = { strip: globalThis.batteryTest.strip().bounds, panel: BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/index.html')).getBounds() };
      return { expanded, hidden, restored, display: {bounds:display.bounds,work:display.workArea} };
    });
    assert.ok(Math.abs(movement.hidden.strip.y - movement.expanded.strip.y - 46) <= 2);
    assert.ok(Math.abs(movement.hidden.panel.y - movement.expanded.panel.y - 46) <= 2, JSON.stringify(movement));
    assert.ok(Math.abs(movement.restored.strip.y - movement.expanded.strip.y) <= 1);
    await app.evaluate((_electron, actual) => globalThis.batteryTest.setTaskbar(actual), actualTaskbar);
    assert.deepEqual(errors, []);
    return { scale, passed: true, silentStart: startup, geometry, actualTaskbar, simulatedTaskbarMovement:movement, checks: 'photos, charging 100%, low battery, stale/unsupported values, light/dark, zero/three devices, click/close/reopen, native taskbar watcher, simulated auto-hide movement', errors };
  } finally { if (app) await app.close(); }
}

(async () => {
  fs.mkdirSync(directory, { recursive: true });
  const results = [];
  for (const scale of (process.env.BATTERY_DOCK_SCALES || '1,1.25,1.5,2').split(',')) {
    results.push(await run(scale));
    console.log(JSON.stringify(results.at(-1)));
  }
  fs.writeFileSync(path.join(directory, executable ? 'packaged-strip-regression.json' : 'strip-regression.json'), JSON.stringify(results, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
