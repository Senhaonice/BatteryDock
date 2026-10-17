const { createHash } = require('node:crypto');

function trayGuid(id, executable, profile = '') {
  // Unsigned Windows tray identities are tied to the executable path.
  const hex = createHash('sha256').update(`BatteryDock\0${executable.toLowerCase()}\0${profile}\0${id}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function trayAsset(device, numbers, theme) {
  const suffix = numbers && device.status === 'fresh' && Number.isInteger(device.percentage)
    ? device.percentage : numbers && device.id !== 'app' ? 'unknown' : 'icon';
  return `${theme}-${device.id}-${suffix}.png`;
}

module.exports = { trayGuid, trayAsset };
