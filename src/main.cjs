const { app, BrowserWindow, Menu, Tray, nativeImage, nativeTheme, screen, ipcMain, Notification, powerMonitor, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { Worker } = require('node:worker_threads');
const { execFileSync, spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const { normalize, initialDevices, mergeReadings, notificationBucket } = require('./state.cjs');
const { executableForLogin, loginOptions, enabledFrom } = require('./startup.cjs');
const { trayGuid, trayAsset } = require('./tray.cjs');
const { stripDevices, stripBounds, taskbarWorkArea } = require('./strip.cjs');

const testMode = process.env.BATTERY_DOCK_TEST === '1';
if (testMode) {
  if (!process.env.BATTERY_DOCK_TEST_PROFILE) throw new Error('Test profile required');
  app.setPath('userData', process.env.BATTERY_DOCK_TEST_PROFILE);
}
app.setName('BatteryDock');
const loginName = testMode ? 'BatteryDock_Test' : 'BatteryDock';
const loginExecutable = executableForLogin();
const loginConfig = loginOptions(loginExecutable, loginName);
if (testMode && !app.isPackaged) loginConfig.args.unshift(app.getAppPath());
let settings = normalize();
let devices = initialDevices();
let panel = null;
let strip = null;
let stripLoading = null;
let worker = null;
let pollTimer = null;
let watchdog = null;
let refreshing = false;
let quitting = false;
let pollAt = null;
let lastTray = null;
let startedAt = Date.now();
let lastAnchor = null;
let busyMenu = false;
let lastPanelSize = null;
let lastPanelPosition = null;
let lastStripBounds = null;
let taskbarState = null;
let taskbarTestOverride = false;
let taskbarWatcher = null;
let taskbarRestart = null;
const trays = new Map();
const notified = new Map();
const assetPath = (...parts) => path.join(__dirname, '..', 'assets', ...parts);
const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');

function log(error) {
  try {
    const file = path.join(app.getPath('userData'), 'app.log');
    if (fs.existsSync(file) && fs.statSync(file).size > 200000) fs.renameSync(file, file + '.old');
    fs.appendFileSync(file, `${new Date().toISOString()} ${String(error?.stack || error)}\n`);
  } catch {}
}

function startupCommand() {
  try {
    const output = execFileSync('reg.exe', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', '/v', loginName], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], timeout: 3000 });
    return output.match(/REG_SZ\s+(.+)/)?.[1].trim() || '';
  } catch { return ''; }
}

function startupEnabled() {
  try {
    const info = app.getLoginItemSettings(loginConfig);
    const entry = info.launchItems?.find(item => item.name === loginName);
    const command = startupCommand();
    const expected = `"${loginExecutable}" ${loginConfig.args.map(arg => arg === '--silent' ? arg : `"${arg}"`).join(' ')}`;
    return Boolean(entry?.enabled && command.toLowerCase() === expected.toLowerCase());
  }
  catch (error) { log(error); return false; }
}

function setStartup(enabled) {
  if (!app.isPackaged && !testMode) throw new Error('请在封包版本中设置开机自启');
  app.setLoginItemSettings({ ...loginConfig, openAtLogin: enabled, enabled });
  const actual = startupEnabled();
  if (actual !== enabled) throw new Error('开机启动项未生效，请检查 Windows 启动应用设置');
  return actual;
}

function saveSettings() {
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  const file = settingsPath();
  fs.writeFileSync(file + '.tmp', JSON.stringify(settings, null, 2), 'utf8');
  fs.renameSync(file + '.tmp', file);
}

function snapshot() {
  return { settings, devices, refreshing, pollAt, version: app.getVersion(), themeDark: nativeTheme.shouldUseDarkColors, autostartSupported: app.isPackaged || testMode };
}

function broadcast() {
  if (panel && !panel.isDestroyed()) panel.webContents.send('battery:state', snapshot());
  if (strip && !strip.isDestroyed()) strip.webContents.send('battery:state', snapshot());
}

function relativeStatus(d) {
  if (d.status === 'loading') return '读取中';
  if (d.status === 'unsupported') return '暂不支持读取';
  if (d.status === 'disconnected') return '接收器未连接';
  if (d.status !== 'fresh') return '休眠或暂不可读';
  return `${d.percentage}%${d.charging ? ' · 充电中' : ''}`;
}

function trayImage(d) {
  const theme = nativeTheme.shouldUseDarkColorsForSystemIntegratedUI ? 'dark' : 'light';
  let image = nativeImage.createFromPath(assetPath('tray', trayAsset(d, settings.numbers, theme)));
  if (image.isEmpty()) image = nativeImage.createFromPath(assetPath('app.png'));
  return image;
}

function contextMenu() {
  return Menu.buildFromTemplate([
    { label: '打开电量面板', click: () => showPanel(lastAnchor) },
    { label: '立即刷新', enabled: !refreshing, click: () => poll() },
    { label: '显示电量条', type: 'checkbox', checked: settings.strip, click: item => { try { updateSettings({ strip: item.checked }); } catch (e) { showError(e.message); } } },
    { type: 'separator' },
    ...devices.map(d => ({ label: `${d.name}  ${relativeStatus(d)}`, enabled: false })),
    { type: 'separator' },
    { label: '开机静默自启', type: 'checkbox', checked: settings.autostart, click: item => { try { updateSettings({ autostart: item.checked }); } catch (e) { showError(e.message); } } },
    { label: '设置', click: () => showPanel(lastAnchor, 'settings') },
    { label: '任务栏图标设置', click: () => openTaskbarSettings() },
    { label: '退出 BatteryDock', click: () => app.quit() }
  ]);
}

function showError(body) {
  if (Notification.isSupported()) new Notification({ title: 'BatteryDock', body, icon: assetPath('app.png') }).show();
}

function syncTrays() {
  const shown = settings.strip ? [] : devices.filter(d => d.id !== 'controller' && settings.visible[d.id]);
  const desired = shown.length ? shown : [{ id: 'app', name: 'BatteryDock', short: '电量', status: 'idle' }];
  for (const [id, item] of trays) if (!desired.some(d => d.id === id)) { item.destroy(); trays.delete(id); }
  for (const d of desired) {
    let item = trays.get(d.id);
    if (!item) {
      item = new Tray(trayImage(d), trayGuid(d.id, process.execPath, testMode ? app.getPath('userData') : ''));
      trays.set(d.id, item);
      item.on('click', (_event, bounds) => {
        lastTray = item;
        const anchor = { ...bounds };
        if (panel?.isVisible()) panel.hide(); else showPanel(anchor);
      });
      item.on('right-click', () => {
        lastTray = item;
        lastAnchor = item.getBounds();
        busyMenu = true;
        item.popUpContextMenu(contextMenu());
        setTimeout(() => { busyMenu = false; }, 200);
      });
    }
    item.setImage(trayImage(d));
    const old = d.observedAt && d.status !== 'fresh' ? `\n上次读取：${d.percentage}% · ${new Date(d.observedAt).toLocaleTimeString('zh-CN')}` : '';
    item.setToolTip(d.id === 'app' ? 'BatteryDock · 设备电量' : `${d.name}\n${relativeStatus(d)}${old}`);
  }
}

function positionStrip() {
  if (!strip || strip.isDestroyed()) return;
  const work = taskbarWorkArea(screen.getPrimaryDisplay(), taskbarState);
  const bounds = stripBounds(work, stripDevices(devices, settings).length);
  if (!lastStripBounds || Object.keys(bounds).some(key => bounds[key] !== lastStripBounds[key])) {
    lastStripBounds = bounds;
    strip.setBounds(bounds, false);
  }
  if (lastAnchor?.strip && panel?.isVisible()) positionPanel(lastAnchor);
}

function startTaskbarWatcher() {
  if (quitting || taskbarWatcher) return;
  const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const watcherPath = path.join(__dirname, 'taskbar-watch.ps1').replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
  const child = spawn(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', watcherPath], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  taskbarWatcher = child;
  const lines = createInterface({ input: child.stdout });
  lines.on('line', line => {
    try {
      if (testMode && taskbarTestOverride) return;
      const value = JSON.parse(line);
      if (typeof value.autoHide !== 'boolean' || ![value.rect,value.bounds].every(rect => rect && ['x','y','width','height'].every(key => Number.isFinite(rect[key])))) return;
      taskbarState = { ...value, rect: screen.screenToDipRect(null, value.rect), bounds: screen.screenToDipRect(null, value.bounds) };
      positionStrip();
      if (!strip?.isVisible() && panel?.isVisible()) {
        const work = taskbarWorkArea(screen.getPrimaryDisplay(), taskbarState);
        lastAnchor = { x: work.x + work.width - 24, y: work.y + work.height, width: 16, height: 0 };
        positionPanel(lastAnchor);
      }
    } catch {}
  });
  child.stderr.on('data', data => log('Taskbar watcher: ' + String(data).slice(0, 1000)));
  child.on('error', log);
  child.on('close', () => {
    lines.close();
    if (taskbarWatcher === child) taskbarWatcher = null;
    if (!quitting) taskbarRestart = setTimeout(startTaskbarWatcher, 10000);
  });
}

async function syncStrip() {
  if (!settings.strip) { strip?.hide(); return; }
  if (stripLoading) { await stripLoading; return; }
  if (!strip || strip.isDestroyed()) {
    strip = new BrowserWindow({
      ...stripBounds(taskbarWorkArea(screen.getPrimaryDisplay(), taskbarState), stripDevices(devices, settings).length),
      show: false, useContentSize: true, frame: false, transparent: true, backgroundColor: '#00000000',
      resizable: false, maximizable: false, minimizable: false, skipTaskbar: true, alwaysOnTop: true,
      hasShadow: false, autoHideMenuBar: true, title: 'BatteryDock Battery Strip', icon: assetPath('app.ico'),
      webPreferences: { preload: path.join(__dirname, 'strip-preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, devTools: testMode }
    });
    strip.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    strip.webContents.on('will-navigate', event => event.preventDefault());
    strip.on('close', event => { if (!quitting) event.preventDefault(); });
    strip.on('closed', () => { strip = null; lastStripBounds = null; });
    stripLoading = strip.loadFile(path.join(__dirname, 'strip.html'));
    try { await stripLoading; } finally { stripLoading = null; }
  }
  if (quitting || !settings.strip || !strip || strip.isDestroyed()) return;
  positionStrip();
  strip.webContents.send('battery:state', snapshot());
  strip.showInactive();
  if (panel?.isVisible()) {
    lastAnchor = { ...strip.getBounds(), strip: true };
    positionPanel(lastAnchor);
  }
}

function positionPanel(anchor) {
  if (!panel) return;
  if (anchor?.strip && strip && !strip.isDestroyed()) anchor = { ...strip.getBounds(), strip: true };
  const point = anchor?.width ? { x: anchor.x, y: anchor.y } : screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(point);
  const work = display.id === screen.getPrimaryDisplay().id ? taskbarWorkArea(display, taskbarState) : display.workArea;
  const [width, height] = lastPanelSize ? [lastPanelSize.width, lastPanelSize.height] : panel.getSize();
  const source = anchor?.width ? anchor : { x: work.x + work.width - 24, y: work.y + work.height, width: 16, height: 0 };
  let x = source.x + source.width - width + 10;
  let y = source.y - height - 3;
  if (source.y < work.y + 30) y = source.y + source.height + 3;
  x = Math.round(Math.max(work.x, Math.min(x, work.x + work.width - width)));
  y = Math.round(Math.max(work.y, Math.min(y, work.y + work.height - height)));
  if (lastPanelPosition?.x === x && lastPanelPosition?.y === y) return;
  lastPanelPosition = { x, y };
  // Reapply requested dimensions when moving: Windows may round a fractional-DPI move as a resize.
  panel.setBounds({ x, y, width, height }, false);
}

async function createPanel() {
  if (panel && !panel.isDestroyed()) return panel;
  panel = new BrowserWindow({
    width: 400, height: 440, minWidth: 340, minHeight: 180, show: false, useContentSize: true,
    frame: false, transparent: true, backgroundColor: '#00000000', resizable: false,
    maximizable: false, minimizable: false, skipTaskbar: true, alwaysOnTop: true,
    hasShadow: false, autoHideMenuBar: true, title: 'BatteryDock', icon: assetPath('app.ico'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, devTools: testMode }
  });
  panel.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  panel.webContents.on('will-navigate', event => event.preventDefault());
  panel.on('blur', () => { if (!busyMenu && !testMode) panel?.hide(); });
  panel.on('close', event => { if (!quitting) { event.preventDefault(); panel.hide(); } });
  panel.on('closed', () => { panel = null; lastPanelSize = null; lastPanelPosition = null; });
  await panel.loadFile(path.join(__dirname, 'index.html'));
  broadcast();
  return panel;
}

async function showPanel(anchor, view = 'main') {
  try {
    if (settings.strip) await syncStrip();
    await createPanel();
    const bounds = strip?.isVisible() ? { ...strip.getBounds(), strip: true } : anchor || lastTray?.getBounds();
    lastAnchor = bounds ? { ...bounds } : null;
    positionPanel(lastAnchor);
    panel.webContents.send('battery:view', view);
    broadcast();
    panel.show();
    panel.focus();
    if (!refreshing && (!pollAt || Date.now() - pollAt > 3000)) poll();
  } catch (e) { log(e); }
}

function notifyLowBatteries() {
  for (const d of devices) {
    const bucket = notificationBucket(d, settings.threshold);
    if (d.status === 'fresh' && (d.charging || d.percentage > settings.threshold)) notified.delete(d.id);
    if (bucket === null || !settings.alerts || testMode || Date.now() - startedAt < 60000) continue;
    const previous = notified.get(d.id);
    if (previous !== undefined && bucket >= previous) continue;
    notified.set(d.id, bucket);
    if (Notification.isSupported()) {
      const notification = new Notification({ title: `${d.name} 电量偏低`, body: `剩余 ${d.percentage}%，请及时充电。`, icon: assetPath('app.png'), silent: true });
      notification.on('click', () => showPanel(lastAnchor));
      notification.show();
    }
  }
}

function schedulePoll(delay = settings.refresh * 1000) {
  clearTimeout(pollTimer);
  pollTimer = setTimeout(poll, delay);
}

function createWorker() {
  const owned = new Worker(path.join(__dirname, 'hid-worker.cjs'));
  worker = owned;
  owned.on('message', result => {
    if (worker !== owned || quitting) return;
    clearTimeout(watchdog);
    refreshing = false;
    devices = mergeReadings(devices, result.readings || []);
    pollAt = result.completedAt || Date.now();
    syncTrays(); broadcast(); notifyLowBatteries(); schedulePoll();
  });
  const failed = error => {
    if (worker !== owned || quitting) return;
    log(error);
    worker = null;
    clearTimeout(watchdog);
    refreshing = false;
    devices = devices.map(d => ({ ...d, status: d.status === 'unsupported' ? d.status : 'unavailable', charging: false }));
    syncTrays(); broadcast(); schedulePoll(10000);
  };
  owned.on('error', failed);
  owned.on('exit', code => { if (worker === owned && !quitting) failed(`HID worker exited (${code})`); });
  return owned;
}

function poll() {
  if (refreshing || quitting) return;
  clearTimeout(pollTimer);
  refreshing = true; broadcast();
  try {
    const active = worker || createWorker();
    active.postMessage('poll');
    watchdog = setTimeout(() => {
      if (worker !== active) return;
      log('HID polling timed out');
      worker = null;
      void active.terminate();
      refreshing = false;
      devices = devices.map(d => ({ ...d, status: d.status === 'unsupported' ? d.status : 'unavailable', charging: false }));
      syncTrays(); broadcast(); schedulePoll(10000);
    }, 6000);
  } catch (error) { refreshing = false; log(error); broadcast(); schedulePoll(); }
}

function updateSettings(patch) {
  const next = normalize(patch, settings);
  if (Object.prototype.hasOwnProperty.call(patch, 'autostart')) next.autostart = setStartup(next.autostart);
  if (next.threshold !== settings.threshold || next.alerts !== settings.alerts) notified.clear();
  settings = next;
  nativeTheme.themeSource = settings.theme;
  saveSettings(); syncTrays(); broadcast();
  void syncStrip().catch(log);
  if (!refreshing) schedulePoll();
  return snapshot();
}

function fromPanel(event) { return panel && event.sender === panel.webContents; }
function fromStrip(event) { return strip && event.sender === strip.webContents; }
ipcMain.handle('battery:get', event => { if (!fromPanel(event) && !fromStrip(event)) throw new Error('Invalid sender'); return snapshot(); });
ipcMain.on('battery:open', event => { if (fromStrip(event)) void showPanel({ ...strip.getBounds(), strip: true }); });
ipcMain.on('battery:menu', event => {
  if (!fromStrip(event)) return;
  lastAnchor = { ...strip.getBounds(), strip: true };
  busyMenu = true;
  contextMenu().popup({ window: strip, callback: () => { busyMenu = false; } });
});
ipcMain.handle('battery:settings', (event, patch) => { if (!fromPanel(event) || !patch || typeof patch !== 'object') throw new Error('Invalid settings'); return updateSettings(patch); });
ipcMain.handle('battery:refresh', event => { if (!fromPanel(event)) return; poll(); });
ipcMain.on('battery:hide', event => { if (fromPanel(event)) panel.hide(); });
ipcMain.on('battery:resize', (event, height) => {
  if (!fromPanel(event) || !Number.isFinite(height)) return;
  const display = screen.getDisplayNearestPoint(lastAnchor || screen.getCursorScreenPoint());
  const work = display.id === screen.getPrimaryDisplay().id ? taskbarWorkArea(display, taskbarState) : display.workArea;
  const availableHeight = lastAnchor?.strip && strip?.isVisible() ? strip.getBounds().y - work.y - 3 : work.height - 8;
  const size = { width: Math.min(400, work.width), height: Math.max(180, Math.min(Math.ceil(height), availableHeight)) };
  // At fractional DPI, repeating a native resize can accumulate rounding errors.
  if (lastPanelSize?.width === size.width && lastPanelSize?.height === size.height) return;
  lastPanelSize = size;
  panel.setContentSize(size.width, size.height, false);
  if (panel.isVisible()) positionPanel(lastAnchor);
});
function openTaskbarSettings() { return shell.openExternal('ms-settings:taskbar'); }
ipcMain.handle('battery:taskbar', event => { if (!fromPanel(event)) throw new Error('Invalid sender'); return openTaskbarSettings(); });
ipcMain.handle('battery:logs', event => { if (fromPanel(event)) shell.openPath(app.getPath('userData')); });
ipcMain.on('battery:quit', event => { if (fromPanel(event)) app.quit(); });

const locked = app.requestSingleInstanceLock();
if (!locked) app.quit();
else {
  app.on('second-instance', (_event, argv) => { if (!argv.includes('--silent')) showPanel(lastAnchor); });
  app.on('window-all-closed', () => {});
  app.on('before-quit', () => {
    quitting = true;
    clearTimeout(pollTimer); clearTimeout(watchdog);
    clearTimeout(taskbarRestart);
    taskbarWatcher?.kill();
    worker?.terminate();
    for (const item of trays.values()) item.destroy();
    trays.clear();
  });
  app.whenReady().then(() => {
    app.setAppUserModelId('local.batterydock.app');
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    try { settings = normalize(JSON.parse(fs.readFileSync(settingsPath(), 'utf8'))); } catch {}
    settings.autostart = startupEnabled();
    nativeTheme.themeSource = settings.theme;
    syncTrays(); void syncStrip().catch(log); startTaskbarWatcher(); poll();
    const displaysChanged = () => { positionStrip(); if (panel?.isVisible()) positionPanel(lastAnchor); };
    screen.on('display-metrics-changed', displaysChanged);
    screen.on('display-added', displaysChanged);
    screen.on('display-removed', displaysChanged);
    nativeTheme.on('updated', () => { syncTrays(); broadcast(); });
    powerMonitor.on('resume', () => { startedAt = Date.now(); schedulePoll(2000); });
    if (!process.argv.includes('--silent')) showPanel(lastAnchor);
    if (testMode) {
      globalThis.batteryTest = {
        state: snapshot,
        show: showPanel,
        setSettings: updateSettings,
        login: () => ({ name: loginName, options: loginConfig, command: startupCommand(), enabled: startupEnabled(), actual: app.getLoginItemSettings(loginConfig) }),
        trayCount: () => trays.size,
        trayIdentity: () => [...trays].map(([id, tray]) => ({ id, guid: tray.getGUID(), image: trayAsset(devices.find(d => d.id === id) || { id: 'app' }, settings.numbers, 'light') })),
        hide: () => panel?.hide(),
        strip: () => strip && !strip.isDestroyed() ? { visible: strip.isVisible(), bounds: strip.getBounds() } : null,
        setDevices: readings => { devices = mergeReadings(devices, readings); syncTrays(); broadcast(); },
        positionStrip,
        taskbar: () => taskbarState,
        setTaskbar: value => { taskbarTestOverride = value !== null; taskbarState = value; positionStrip(); }
      };
    }
  }).catch(error => { log(error); app.quit(); });
}
process.on('uncaughtException', log);
process.on('unhandledRejection', log);
