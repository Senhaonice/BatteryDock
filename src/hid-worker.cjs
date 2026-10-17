const { parentPort } = require('node:worker_threads');
const HID = require('node-hid');
const { DEFINITIONS, readDevice } = require('./protocol.cjs');

parentPort.on('message', message => {
  if (message !== 'poll') return;
  try {
    const inventory = HID.devices();
    parentPort.postMessage({ readings: DEFINITIONS.map(d => readDevice(HID, d, inventory)), completedAt: Date.now() });
  } catch (error) {
    parentPort.postMessage({ readings: DEFINITIONS.map(d => ({ id: d.id, status: 'unavailable' })), error: error.message, completedAt: Date.now() });
  }
});
