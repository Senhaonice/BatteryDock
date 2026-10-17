const { DEFINITIONS } = require('./protocol.cjs');

const DEFAULTS = Object.freeze({ theme: 'system', layout: 'widget', strip: true, numbers: true, alerts: true, threshold: 20, refresh: 10, autostart: false, visible: { mouse: true, keyboard: true, controller: true } });

function normalize(input = {}, current = DEFAULTS) {
  const next = { ...DEFAULTS, ...current, visible: { ...DEFAULTS.visible, ...current.visible } };
  if (['system', 'light', 'dark'].includes(input.theme)) next.theme = input.theme;
  if (['widget', 'list'].includes(input.layout)) next.layout = input.layout;
  for (const key of ['strip', 'numbers', 'alerts', 'autostart']) if (typeof input[key] === 'boolean') next[key] = input[key];
  if (Number.isInteger(input.threshold) && input.threshold >= 5 && input.threshold <= 40 && input.threshold % 5 === 0) next.threshold = input.threshold;
  if ([10, 30, 60].includes(input.refresh)) next.refresh = input.refresh;
  if (input.visible && typeof input.visible === 'object') for (const key of ['mouse', 'keyboard', 'controller']) if (typeof input.visible[key] === 'boolean') next.visible[key] = input.visible[key];
  return next;
}

function initialDevices() {
  return DEFINITIONS.map(({ id, name, short, icon, unsupported }) => ({ id, name, short, icon, percentage: null, charging: false, voltageMv: null, observedAt: null, status: unsupported ? 'unsupported' : 'loading' }));
}

function mergeReadings(previous, readings) {
  return previous.map(d => {
    const reading = readings.find(r => r.id === d.id);
    if (!reading) return d;
    if (reading.status === 'fresh') return { ...d, ...reading };
    return { ...d, status: reading.status, charging: false };
  });
}

function notificationBucket(d, threshold) {
  if (d.status !== 'fresh' || d.charging || d.percentage > threshold) return null;
  return d.percentage <= 5 ? 5 : d.percentage <= 10 ? 10 : threshold;
}

module.exports = { DEFAULTS, normalize, initialDevices, mergeReadings, notificationBucket };
