(() => {
  const strip = document.getElementById('strip');
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  function render(state) {
    document.documentElement.style.colorScheme = state.settings.theme === 'system' ? (state.themeDark ? 'dark' : 'light') : state.settings.theme;
    const devices = state.devices.filter(device => state.settings.visible[device.id]);
    strip.innerHTML = devices.map(device => {
      const fresh = device.status === 'fresh';
      const low = fresh && !device.charging && device.percentage <= state.settings.threshold;
      const status = fresh ? `${device.percentage}%${device.charging ? '，充电中' : ''}` : device.status === 'unsupported' ? '暂不支持读取' : device.status === 'loading' ? '读取中' : '休眠或暂不可读';
      const last = !fresh && device.observedAt ? `，上次电量 ${device.percentage}%` : '';
      return `<button class="strip-device" type="button" data-device="${device.id}" aria-label="${escape(device.name)}，${status}${last}，展开电量面板" title="${escape(device.name)} · ${status}${last}"><img class="strip-photo" src="../assets/devices/${device.id}.png" alt="" draggable="false"><span class="strip-copy"><span class="strip-label">${device.short}</span><span class="strip-reading ${low ? 'low-text' : fresh && device.charging ? 'green-text' : fresh ? '' : 'muted'}">${fresh ? device.percentage + '<small>%</small>' : '--'}${fresh && device.charging ? '<i data-lucide="zap" aria-hidden="true"></i>' : ''}</span></span></button>`;
    }).join('') || '<button type="button" class="strip-device strip-empty" aria-label="打开 BatteryDock"><i data-lucide="battery-medium" aria-hidden="true"></i>BatteryDock</button>';
    lucide.createIcons({ attrs: { 'stroke-width': 1.65 } });
  }
  strip.addEventListener('click', () => window.batteryStrip.open());
  strip.addEventListener('contextmenu', event => { event.preventDefault(); window.batteryStrip.menu(); });
  window.batteryStrip.onState(render);
  window.batteryStrip.state().then(render).catch(() => { strip.textContent = 'BatteryDock'; });
})();
