const path = require('node:path');

function executableForLogin(processInfo = process) {
  return path.resolve(processInfo.env.PORTABLE_EXECUTABLE_FILE || processInfo.execPath);
}

function loginOptions(executable, name = 'BatteryDock') {
  return { path: executable, args: ['--silent'], name };
}

function enabledFrom(info, name) {
  if (Array.isArray(info.launchItems)) {
    const entry = info.launchItems.find(item => item.name === name && item.args?.includes('--silent'));
    return Boolean(entry?.enabled);
  }
  return Boolean(info.openAtLogin);
}

module.exports = { executableForLogin, loginOptions, enabledFrom };
