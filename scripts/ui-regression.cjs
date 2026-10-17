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
    const window = BrowserWindow.getAllWindows()[0];
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
  const record = { scale, samples: [], errors: [] };
  try {
    const env = { ...process.env, BATTERY_DOCK_TEST: '1', BATTERY_DOCK_TEST_PROFILE: path.join(directory, `ui-${process.pid}-${scale}`) };
    delete env.ELECTRON_RUN_AS_NODE;
    const executable = process.env.BATTERY_DOCK_EXECUTABLE;
    const args = [`--force-device-scale-factor=${scale}`];
    if (!executable) args.unshift(root);
    application = await electron.launch({ env, args, ...(executable ? { executablePath: executable } : {}), timeout: 30000 });
    const page = await application.firstWindow();
    page.on('pageerror', error => record.errors.push(error.message));
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.waitForSelector('#numbers');
    await wait(450);
    record.initial = await geometry(application, page);
    const actions = [
      ...['浅色', '深色', '跟随系统', '设备列表', '电池小组件'].map(name => ({ name, run: () => page.getByRole('button', { name, exact: true }).click() })),
      { name: 'numbers off', run: () => page.locator('#numbers').uncheck() },
      { name: 'numbers on', run: () => page.locator('#numbers').check() },
      { name: 'alerts off', run: () => page.locator('#alerts').uncheck() },
      { name: 'alerts on', run: () => page.locator('#alerts').check() },
      { name: 'threshold', run: () => page.locator('#threshold').fill('30') },
      { name: 'refresh', run: () => page.locator('#refresh').selectOption('30') }
    ];
    for (let cycle = 0; cycle < 2; cycle++) {
      for (const action of actions) {
        await action.run();
        await page.waitForFunction(() => !document.getElementById('numbers').disabled);
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
