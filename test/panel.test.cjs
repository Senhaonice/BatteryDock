const test = require('node:test');
const assert = require('node:assert/strict');
const { panelAnchor } = require('../src/panel.cjs');

test('overflow icon anchor returns to the taskbar corner after the flyout closes', () => {
  const work = { x: 0, y: 0, width: 1920, height: 1032 };
  const overflow = { x: 1610, y: 790, width: 240, height: 230 };
  const icon = { x: 1630, y: 812, width: 32, height: 32 };
  assert.deepEqual(panelAnchor(work, icon, overflow), icon);
  const closed = panelAnchor(work, icon, null);
  assert.equal(closed.y, 1032);
  assert.equal(closed.x + closed.width, 1912);
  assert.deepEqual(panelAnchor(work, closed, overflow), closed);
  assert.deepEqual(panelAnchor(work, icon), closed);
});

test('visible taskbar icons, strip anchors and other monitor origins keep their placement', () => {
  const work = { x: -1920, y: -180, width: 1920, height: 1032 };
  const bottomIcon = { x: -230, y: 860, width: 24, height: 24 };
  const leftIcon = { x: -1944, y: 400, width: 24, height: 24 };
  const strip = { x: -430, y: 770, width: 370, height: 72, strip: true };
  for (const anchor of [bottomIcon, leftIcon, strip]) assert.deepEqual(panelAnchor(work, anchor, null), anchor);
  const stale = { x: -330, y: 610, width: 24, height: 24 };
  assert.deepEqual(panelAnchor(work, stale, null), { x: -24, y: 852, width: 16, height: 0 });
  assert.deepEqual(panelAnchor(work, null, null), panelAnchor(work, stale, null));
});
