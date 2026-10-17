const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { trayGuid, trayAsset } = require('../src/tray.cjs');

test('tray identities survive recreation and remain unique per device and executable', () => {
  const executable = 'D:\\Apps\\BatteryDock\\BatteryDock.exe';
  const mouse = trayGuid('mouse', executable);
  assert.match(mouse, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(mouse, trayGuid('mouse', executable.toUpperCase()));
  assert.notEqual(mouse, trayGuid('keyboard', executable));
  assert.notEqual(mouse, trayGuid('mouse', 'D:\\Other\\BatteryDock.exe'));
  assert.notEqual(mouse, trayGuid('mouse', executable, 'test-profile'));
});

test('tray assets identify the device and do not present stale readings as current', () => {
  for (const theme of ['light', 'dark']) {
    for (const id of ['mouse', 'keyboard']) {
      for (const percentage of [0, 20, 89, 100]) {
        const file = trayAsset({ id, status: 'fresh', percentage }, true, theme);
        assert.equal(file, `${theme}-${id}-${percentage}.png`);
        assert.ok(fs.existsSync(path.join(__dirname, '..', 'assets', 'tray', file)));
      }
      assert.equal(trayAsset({ id, status: 'unavailable', percentage: 89 }, true, theme), `${theme}-${id}-unknown.png`);
      assert.equal(trayAsset({ id, status: 'fresh', percentage: 89 }, false, theme), `${theme}-${id}-icon.png`);
    }
    assert.equal(trayAsset({ id: 'app' }, true, theme), `${theme}-app-icon.png`);
  }
});
