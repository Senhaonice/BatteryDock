const test = require('node:test');
const assert = require('node:assert/strict');
const { stripBounds, stripDevices, taskbarWorkArea } = require('../src/strip.cjs');
const { normalize, initialDevices } = require('../src/state.cjs');

test('strip is disabled by default while explicit choices and other preferences survive', () => {
  const settings = normalize({ numbers: false, layout: 'list', visible: { mouse: false } });
  assert.equal(settings.strip, false);
  assert.equal(settings.numbers, false);
  assert.deepEqual(stripDevices(initialDevices(), settings).map(d => d.id), ['keyboard', 'controller']);
  assert.equal(normalize({ strip: false }, settings).strip, false);
  assert.equal(normalize({ strip: true }, settings).strip, true);
  assert.equal(normalize({ strip: 'false' }, settings).strip, false);
});

test('auto-hidden taskbar moves strip to screen edge and expanded taskbar moves it back up', () => {
  const display = { bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1032 } };
  const expanded = { autoHide: true, rect: { x: 0, y: 1032, width: 1920, height: 48 } };
  const hidden = { autoHide: true, rect: { x: 0, y: 1078, width: 1920, height: 48 } };
  const before = stripBounds(taskbarWorkArea(display, expanded), 3);
  const after = stripBounds(taskbarWorkArea(display, hidden), 3);
  assert.equal(after.y - before.y, 46);
  assert.equal(after.y + after.height, 1074);
  assert.deepEqual(taskbarWorkArea(display, { ...hidden, autoHide: false }), display.workArea);
  const virtualizedDisplay = { ...display, bounds: { x: 0, y: 0, width: 960, height: 540 } };
  assert.equal(taskbarWorkArea(virtualizedDisplay, { ...hidden, bounds: display.bounds }).height,1078);
});

test('strip stays inside usable desktop coordinates with taskbars and negative display origins', () => {
  for (const work of [
    { x: 0, y: 0, width: 1920, height: 1032 },
    { x: -1280, y: -720, width: 1280, height: 672 },
    { x: 48, y: 0, width: 1232, height: 720 },
    { x: 0, y: 48, width: 320, height: 592 }
  ]) {
    for (const count of [0, 1, 2, 3]) {
      const bounds = stripBounds(work, count);
      assert.ok(bounds.x >= work.x);
      assert.ok(bounds.y >= work.y);
      assert.ok(bounds.x + bounds.width <= work.x + work.width);
      assert.ok(bounds.y + bounds.height <= work.y + work.height);
    }
  }
});
