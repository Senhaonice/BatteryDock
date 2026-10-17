const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { _electron: electron } = require('playwright-core');
const root = path.join(__dirname, '..');
const reportDirectory = path.join(root, '..', 'verification');
fs.mkdirSync(reportDirectory, { recursive: true });
const profile = path.join(reportDirectory, 'test-profile');
const env = { ...process.env, BATTERY_DOCK_TEST:'1',BATTERY_DOCK_TEST_PROFILE:profile };
delete env.ELECTRON_RUN_AS_NODE;
const executable = process.env.BATTERY_DOCK_EXECUTABLE;

async function launch(silent = false) {
  const options = { env, args: executable ? (silent ? ['--silent'] : []) : [root, ...(silent ? ['--silent'] : [])], timeout:30000 };
  if (executable) options.executablePath=executable;
  return electron.launch(options);
}
async function settle(app) {
  for(let i=0;i<60;i++) {
    const value=await app.evaluate(()=>globalThis.batteryTest?.state());
    if(value?.pollAt && !value.refreshing) return value;
    await new Promise(resolve=>setTimeout(resolve,150));
  }
  throw new Error('Battery poll did not finish');
}
async function save(page,patch) {
  await page.evaluate(patch=>window.battery.settings(patch),patch);
}

async function main() {
  let app;
  const errors=[];
  const report={ executable:executable || 'development',checks:[] };
  try {
    app=await launch();
    const page=await app.firstWindow();
    page.on('pageerror',e=>errors.push(e.message));
    await page.waitForSelector('.panel');
    report.hardware=await settle(app);
    assert.equal(await app.evaluate(()=>globalThis.batteryTest.trayCount()),2);
    const identities=await app.evaluate(()=>globalThis.batteryTest.trayIdentity());
    assert.deepEqual(identities.map(x=>x.id).sort(),['keyboard','mouse']);
    assert.notEqual(identities[0].guid,identities[1].guid);
    report.checks.push('Two native tray icons created; real HID poll completed');
    await page.screenshot({path:path.join(reportDirectory,'widget-live.png')});
    await page.getByRole('button',{name:'LeoBog HI75C Pro，查看详情',exact:true}).click();
    assert.equal(await page.locator('h1').innerText(),'LeoBog HI75C Pro');
    await page.getByRole('switch',{name:'显示在托盘',exact:true}).uncheck();
    await page.waitForFunction(()=>!document.querySelector('[data-visible]').disabled);
    assert.equal(await app.evaluate(()=>globalThis.batteryTest.trayCount()),1);
    await page.getByRole('switch',{name:'显示在托盘',exact:true}).check();
    await page.waitForFunction(()=>!document.querySelector('[data-visible]').disabled);
    assert.deepEqual((await app.evaluate(()=>globalThis.batteryTest.trayIdentity())).map(({id,guid})=>({id,guid})),identities.map(({id,guid})=>({id,guid})));
    report.checks.push('Device-specific tray identities survive icon recreation');
    await page.getByRole('button',{name:'返回电量面板',exact:true}).click();
    await page.getByRole('button',{name:'设置',exact:true}).click();
    await app.evaluate(({shell})=>{
      globalThis.originalOpenExternal=shell.openExternal;
      shell.openExternal=async url=>{globalThis.taskbarSettingsUrl=url;};
    });
    try {
      await page.getByRole('button',{name:'打开 Windows 任务栏图标设置',exact:true}).click();
      assert.equal(await app.evaluate(()=>globalThis.taskbarSettingsUrl),'ms-settings:taskbar');
    } finally {
      await app.evaluate(({shell})=>{shell.openExternal=globalThis.originalOpenExternal;delete globalThis.originalOpenExternal;});
    }
    report.checks.push('Taskbar settings control routes through validated IPC to the Windows taskbar settings URI');
    await page.getByRole('button',{name:'深色',exact:true}).click();
    await page.waitForFunction(()=>document.documentElement.style.colorScheme==='dark');
    await page.waitForFunction(()=>!document.getElementById('numbers').disabled);
    const boundsBeforeStartup=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getBounds());
    await page.getByRole('switch',{name:'开机静默自启',exact:true}).check();
    await page.waitForFunction(()=>!document.getElementById('autostart').disabled);
    assert.deepEqual(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getBounds()),boundsBeforeStartup);
    const startup=await app.evaluate(()=>globalThis.batteryTest.login());
    assert.equal(startup.enabled,true);
    assert.ok(startup.command.endsWith('--silent'));
    assert.ok(startup.actual.launchItems.some(x=>x.name==='BatteryDock_Test' && x.enabled));
    report.startup={name:startup.name,options:startup.options,enabled:startup.enabled,command:startup.command};
    report.checks.push('Startup registration verified against current-user login item with --silent');
    await page.getByRole('button',{name:'设备列表',exact:true}).click();
    await page.waitForSelector('.devices .device');
    assert.equal(await page.locator('.devices .device').count(),3);
    assert.equal(await page.locator('.grid').count(),0);
    await page.screenshot({path:path.join(reportDirectory,'list-live-dark.png')});
    await page.getByRole('button',{name:'设置',exact:true}).click();
    await page.getByRole('button',{name:'设备列表',exact:true}).click();
    await page.waitForSelector('.devices .device');
    await page.getByRole('button',{name:'设置',exact:true}).click();
    await page.getByRole('button',{name:'电池小组件',exact:true}).click();
    await page.waitForSelector('.grid .grid-device');
    assert.equal(await page.locator('.grid .grid-device').count(),3);
    assert.equal(await page.locator('.devices').count(),0);
    await page.getByRole('button',{name:'设置',exact:true}).click();
    await page.getByRole('button',{name:'设备列表',exact:true}).click();
    await page.waitForSelector('.devices .device');
    await page.getByRole('button',{name:'设置',exact:true}).click();
    report.checks.push('Selecting either layout immediately displays it, including switching back and selecting the saved layout');
    await page.waitForFunction(()=>!document.getElementById('numbers').disabled);
    await page.getByRole('slider',{name:'提醒阈值',exact:true}).fill('25');
    await page.waitForFunction(()=>!document.getElementById('numbers').disabled);
    await page.screenshot({path:path.join(reportDirectory,'settings-dark.png')});
    await page.getByRole('button',{name:'返回电量面板',exact:true}).click();
    await page.screenshot({path:path.join(reportDirectory,'list-live-dark.png')});
    await app.evaluate(()=>globalThis.batteryTest.hide());
    await app.close();app=null;
    app=await launch(true);
    const persisted=await settle(app);
    assert.equal(persisted.settings.theme,'dark');assert.equal(persisted.settings.layout,'list');assert.equal(persisted.settings.threshold,25);
    const windows=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().map(w=>({visible:w.isVisible(),skipTaskbar:w.isSkipTaskbar()})));
    assert.equal(windows.filter(w=>w.visible).length,0);
    report.silentStart={visibleWindows:0,trays:await app.evaluate(()=>globalThis.batteryTest.trayCount())};
    assert.equal(report.silentStart.trays,2);
    assert.deepEqual((await app.evaluate(()=>globalThis.batteryTest.trayIdentity())).map(({id,guid})=>({id,guid})),identities.map(({id,guid})=>({id,guid})));
    report.checks.push('Tray identities survive silent relaunch at the same executable path');
    report.checks.push('Silent relaunch creates tray icons and polls hardware with no visible window');
    report.checks.push('Theme, layout and threshold survive relaunch');
    await app.evaluate(()=>globalThis.batteryTest.setSettings({autostart:false}));
    assert.equal((await app.evaluate(()=>globalThis.batteryTest.login())).enabled,false);
    report.checks.push('Turning off startup removes test login item');
    await app.evaluate(()=>globalThis.batteryTest.show());
    const second=await app.firstWindow();
    await save(second,{theme:'system',layout:'widget',threshold:20,numbers:true,visible:{mouse:true,keyboard:true}});
    for (const width of [400,340]) {
      await app.evaluate(({BrowserWindow},width)=>{const w=BrowserWindow.getAllWindows()[0];w.setSize(width,w.getSize()[1]);},width);
      const layout=await second.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
      assert.ok(layout.scroll<=layout.width);
    }
    report.checks.push('Main UI fits 340 and 400 DIP widths');
    assert.deepEqual(errors,[]);
    report.checks.push('No renderer exceptions');
    fs.writeFileSync(path.join(reportDirectory,executable ? 'packaged-smoke.json' : 'smoke.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify(report,null,2));
  } finally {
    if(app){try{await app.evaluate(()=>globalThis.batteryTest.setSettings({autostart:false}));}catch{}await app.close();}
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
