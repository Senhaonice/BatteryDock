function stripDevices(devices, settings) {
  return devices.filter(device => settings.visible[device.id]);
}

function taskbarWorkArea(display, taskbar) {
  const work = { ...display.workArea };
  const bounds = taskbar?.bounds || display.bounds;
  const rect = taskbar?.rect;
  if (!taskbar?.autoHide || !rect || !Object.values(rect).every(Number.isFinite)) return work;
  // Electron's work area can remain unchanged while an auto-hidden taskbar slides.
  const horizontal = rect.width > rect.height;
  if (!horizontal || rect.x >= bounds.x + bounds.width || rect.x + rect.width <= bounds.x) return work;
  if (rect.y + rect.height / 2 >= bounds.y + bounds.height / 2) {
    const bottom = Math.max(bounds.y, Math.min(bounds.y + bounds.height, rect.y));
    work.height = Math.max(0, bottom - work.y);
  }
  return work;
}

function stripBounds(work, count) {
  const width = Math.min(work.width, 16 + Math.max(1, count) * 118);
  const height = Math.min(72, work.height);
  return {
    x: Math.round(Math.max(work.x, work.x + work.width - width - 12)),
    y: Math.round(Math.max(work.y, work.y + work.height - height - 4)),
    width, height
  };
}

module.exports = { stripDevices, stripBounds, taskbarWorkArea };
