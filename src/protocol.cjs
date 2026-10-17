const DEFINITIONS = Object.freeze([
  { id: 'mouse', name: '蜻蜓 3 Master+', short: '鼠标', icon: 'mouse', vid: 0x391d, pid: 0x1a05 },
  { id: 'keyboard', name: 'LeoBog HI75C Pro', short: '键盘', icon: 'keyboard', vid: 0x3554, pid: 0xfa09 },
  { id: 'controller', name: '8BitDo Ultimate 2', short: '手柄', icon: 'gamepad-2', vid: 0x2dc8, pid: 0x6013, unsupported: true }
]);

function requestFor(id) {
  if (id === 'mouse') {
    const packet = Buffer.alloc(17);
    packet[0] = 8;
    packet[1] = 4;
    packet[16] = 0x49;
    return packet;
  }
  if (id === 'keyboard') {
    const packet = Buffer.alloc(20);
    packet[0] = 19;
    packet[1] = 0x4a;
    packet[2] = 1;
    packet[19] = 0x5e;
    return packet;
  }
  throw new Error('Unsupported battery protocol');
}

const sum = bytes => bytes.reduce((total, byte) => total + byte, 0) & 255;

function decode(id, input) {
  const bytes = Buffer.from(input);
  if (id === 'mouse') {
    if (bytes.length < 17 || bytes[0] !== 8 || bytes[1] !== 4 || bytes[2] !== 0 || sum(bytes.subarray(0, 17)) !== 0x55 || bytes[6] > 100) return null;
    const voltageMv = bytes.readUInt16BE(8);
    return { percentage: bytes[6], charging: bytes[7] === 1, voltageMv: voltageMv >= 2000 && voltageMv <= 5000 ? voltageMv : null };
  }
  if (id === 'keyboard') {
    if (bytes.length < 20 || bytes[0] !== 19 || bytes[1] !== 0x4a || bytes[2] !== 1 || bytes[3] !== 0 || bytes[4] !== 2 || bytes[5] > 100 || sum(bytes.subarray(0, 19)) !== bytes[19]) return null;
    return { percentage: bytes[5], charging: (bytes[6] >> 4) === 1, voltageMv: null };
  }
  return null;
}

function readDevice(HID, definition, inventory, timeout = 1000) {
  const matches = inventory.filter(d => d.vendorId === definition.vid && d.productId === definition.pid && d.usagePage === 0xff02);
  if (definition.unsupported) return { id: definition.id, status: inventory.some(d => d.vendorId === definition.vid && d.productId === definition.pid) ? 'unsupported' : 'disconnected' };
  if (!matches.length) return { id: definition.id, status: 'disconnected' };
  let error = null;
  for (const info of matches) {
    let device;
    try {
      device = new HID.HID(info.path);
      const packet = requestFor(definition.id);
      if (device.write([...packet]) !== packet.length) throw new Error('Incomplete HID query');
      const deadline = Date.now() + timeout;
      let frames = 0;
      while (Date.now() < deadline && frames++ < 40) {
        const data = device.readTimeout(Math.max(1, deadline - Date.now()));
        if (!data.length) break;
        const reading = decode(definition.id, data);
        if (reading) return { id: definition.id, status: 'fresh', ...reading, observedAt: Date.now() };
      }
    } catch (e) { error = e.message; }
    finally { try { device?.close(); } catch {} }
  }
  return { id: definition.id, status: 'unavailable', error: error ? 'HID access failed' : 'No valid battery response' };
}

module.exports = { DEFINITIONS, requestFor, decode, readDevice };
