const path=require('node:path');
const { _electron }=require('playwright-core');
(async()=>{
  const env={...process.env,BATTERY_DOCK_TEST:'1',BATTERY_DOCK_TEST_PROFILE:path.resolve(__dirname,'../../verification/test-profile')};delete env.ELECTRON_RUN_AS_NODE;
  const instance=await _electron.launch({args:[path.resolve(__dirname,'..')],env});
  try {
    const page=await instance.firstWindow();
    await page.waitForSelector('.panel');
    console.log('before',JSON.stringify(await instance.evaluate(()=>globalThis.batteryTest.login())));
    try { console.log('set',JSON.stringify(await page.evaluate(()=>window.battery.settings({autostart:true})))); }catch(e){console.log('set-error',e.message);}
    console.log('after',JSON.stringify(await instance.evaluate(()=>globalThis.batteryTest.login())));
    console.log('registry',require('child_process').execFileSync('reg.exe',['query','HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run','/v','BatteryDock_Test'],{encoding:'utf8'}));
    await page.getByRole('button',{name:'设置',exact:true}).click();
    await page.screenshot({path:path.resolve(__dirname,'../../verification/startup-diagnostic.png')});
    console.log('settings-dom',await page.locator('body').innerText());
  } finally {try{await instance.evaluate(()=>globalThis.batteryTest.setSettings({autostart:false}));}catch{}await instance.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
