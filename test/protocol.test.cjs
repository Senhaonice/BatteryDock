const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DEFINITIONS, requestFor, decode, readDevice } = require('../src/protocol.cjs');
const { normalize, initialDevices, mergeReadings, notificationBucket } = require('../src/state.cjs');
const { executableForLogin, loginOptions, enabledFrom } = require('../src/startup.cjs');

test('queries match verified read-only battery packets', () => {
  assert.equal(requestFor('mouse').toString('hex'), '0804000000000000000000000000000049');
  assert.equal(requestFor('keyboard').toString('hex'), '134a01000000000000000000000000000000005e');
  assert.throws(() => requestFor('controller'));
});

test('actual mouse response decodes and rejects corrupt or unrelated packets', () => {
  const packet = Buffer.from('08040000000205000d160000000000001f','hex');
  assert.deepEqual(decode('mouse',packet), { percentage:5,charging:false,voltageMv:3350 });
  packet[6] = 99;
  assert.equal(decode('mouse',packet),null);
  assert.equal(decode('mouse',Buffer.alloc(17)),null);
  assert.equal(decode('mouse',Buffer.alloc(5)),null);
});

test('actual keyboard response validates payload and checksum', () => {
  const packet = Buffer.from('134a0100026401000000000000000000000000c5','hex');
  assert.deepEqual(decode('keyboard',packet), { percentage:100,charging:false,voltageMv:null });
  packet[6] = 0x11;
  packet[19] = packet.subarray(0,19).reduce((a,b)=>a+b,0)&255;
  assert.equal(decode('keyboard',packet).charging,true);
  packet[5] = 101;
  packet[19] = packet.subarray(0,19).reduce((a,b)=>a+b,0)&255;
  assert.equal(decode('keyboard',packet),null);
});

test('HID handles close on error and query only targets vendor interface', () => {
  let closed=0, written=0;
  const definition=DEFINITIONS[0];
  const inventory=[{vendorId:definition.vid,productId:definition.pid,usagePage:0xff02,path:'vendor'}];
  class Fake { constructor(p){assert.equal(p,'vendor');} write(data){written++;assert.deepEqual(data,[...requestFor('mouse')]);return data.length;} readTimeout(){throw new Error('Disconnected');} close(){closed++;} }
  assert.equal(readDevice({HID:Fake},definition,inventory).status,'unavailable');
  assert.equal(closed,1);assert.equal(written,1);
  assert.equal(readDevice({HID:Fake},definition,[{...inventory[0],usagePage:1}]).status,'disconnected');
  assert.equal(written,1);
});

test('failed readings retain last valid value without reporting it as current', () => {
  const updated=mergeReadings(initialDevices(),[{id:'mouse',status:'fresh',percentage:5,charging:true,observedAt:123,voltageMv:3350}]);
  const stale=mergeReadings(updated,[{id:'mouse',status:'unavailable'}])[0];
  assert.equal(stale.percentage,5);assert.equal(stale.observedAt,123);assert.equal(stale.status,'unavailable');assert.equal(stale.charging,false);
  assert.equal(notificationBucket(stale,20),null);
});

test('settings reject invalid values and merge per-device visibility', () => {
  const s=normalize({refresh:1,theme:'pink',threshold:1000,visible:{mouse:false},autostart:true});
  assert.equal(s.refresh,10);assert.equal(s.theme,'system');assert.equal(s.threshold,20);assert.equal(s.autostart,true);
  assert.deepEqual(s.visible,{mouse:false,keyboard:true});
});

test('notifications ignore charging, disconnected and unsupported devices', () => {
  const d={status:'fresh',percentage:5,charging:false};
  assert.equal(notificationBucket(d,20),5);
  assert.equal(notificationBucket({...d,percentage:9},20),10);
  assert.equal(notificationBucket({...d,percentage:18},20),20);
  assert.equal(notificationBucket({...d,charging:true},20),null);
  assert.equal(notificationBucket({...d,status:'disconnected'},20),null);
});

test('startup points at stable portable executable and always passes silent flag', () => {
  const p=executableForLogin({execPath:'C:\\Temp\\unpacked\\BatteryDock.exe',env:{PORTABLE_EXECUTABLE_FILE:'D:\\Apps\\BatteryDock.exe'}});
  assert.equal(p,'D:\\Apps\\BatteryDock.exe');
  assert.deepEqual(loginOptions(p),{path:p,args:['--silent'],name:'BatteryDock'});
  assert.equal(enabledFrom({openAtLogin:true,launchItems:[{name:'BatteryDock',args:['--silent'],enabled:false}]},'BatteryDock'),false);
  assert.equal(enabledFrom({launchItems:[{name:'BatteryDock',args:['--silent'],enabled:true}]},'BatteryDock'),true);
});
