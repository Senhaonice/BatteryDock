(() => {
  const app = document.getElementById('app');
  let state = null;
  let view = 'main';
  let selected = 'mouse';
  let message = '';
  let saving = false;
  let resizeFrame = 0;
  let lastHeight = 0;
  let scrollKey = '';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = name => `<i data-lucide="${name}" aria-hidden="true"></i>`;
  const iconButton = (action, name, label, extra = '') => `<button type="button" class="icon-button" data-action="${action}" aria-label="${label}" data-tooltip="${label}" ${extra}>${icon(name)}</button>`;
  const fresh = d => d.status === 'fresh';
  const low = d => fresh(d) && !d.charging && d.percentage <= state.settings.threshold;
  const colorClass = d => low(d) ? 'low-text' : fresh(d) && d.charging ? 'green-text' : '';
  function statusText(d) {
    if (d.status === 'loading') return '读取中';
    if (d.status === 'unsupported') return '暂不支持';
    if (d.status === 'disconnected') return '接收器未连接';
    if (!fresh(d)) return '休眠或暂不可读';
    return d.charging ? '充电中' : low(d) ? '电量偏低' : '已连接';
  }
  const time = stamp => stamp ? new Date(stamp).toLocaleTimeString('zh-CN', { hour12: false }) : '尚未读取';
  function photo(d) {
    return `<img class="device-photo" src="../assets/devices/${d.id}.png" alt="${escape(d.short)}${d.id === 'keyboard' ? '外观参考图' : '实物图'}" draggable="false">`;
  }
  function number(d) {
    return fresh(d) ? `<span class="number ${colorClass(d)}"><strong>${d.percentage}</strong><small>%</small></span>` : `<span class="unknown-value">${d.percentage === null ? '--' : '上次 ' + d.percentage + '%'}</span>`;
  }
  function header(title, subtitle) {
    return `<header class="header">${view !== 'main' ? iconButton('back','chevron-left','返回电量面板') : ''}<div class="heading"><h1>${escape(title)}</h1>${subtitle ? `<div class="subtitle">${escape(subtitle)}</div>` : ''}</div>${view === 'main' ? `<div class="header-tools">${iconButton('widget','layout-grid','电池小组件','aria-pressed="true"')}${iconButton('list','list','设备列表')}${iconButton('settings','settings-2','设置')}${iconButton('close','x','收起电量面板')}</div>` : ''}</header>`;
  }
  function footer() {
    const count = state.devices.filter(fresh).length;
    return `<footer class="footer"><span class="status" role="status" aria-live="polite"><span class="dot ${count ? 'fresh' : ''}"></span>${state.refreshing ? '正在读取设备' : state.pollAt ? '更新于 ' + time(state.pollAt) : '等待首次读取'}</span><span class="footer-right">${state.settings.refresh} 秒<button type="button" class="icon-button ${state.refreshing ? 'spinning' : ''}" data-action="refresh" aria-label="刷新电量" data-tooltip="刷新电量" ${state.refreshing ? 'disabled' : ''}>${icon('refresh-cw')}</button></span></footer>`;
  }
  function renderMain() {
    const ds = state.devices;
    const count = ds.filter(fresh).length;
    const subtitle = `${count} 台已读取 · ${ds.length - count} 台待确认`;
    const lowDevice = ds.find(low);
    const stale = ds.find(d => d.percentage !== null && !fresh(d));
    const caption = lowDevice ? `${lowDevice.short}电量偏低，建议充电` : stale ? `${stale.short}暂不可读，保留上次电量` : count ? `${count} 台设备电量已更新` : '正在等待设备电量';
    return header('电池',subtitle) + `<div class="grid">${ds.map(d => `<button type="button" class="grid-device" data-action="detail" data-device="${d.id}" aria-label="${escape(d.name)}，查看详情">${photo(d)}<span class="reading">${number(d)}</span><span class="grid-name">${d.short}</span><span class="grid-status ${colorClass(d)}">${statusText(d)}</span></button>`).join('')}</div><div class="caption ${lowDevice ? 'low-text' : ''}">${icon(lowDevice ? 'battery-low' : stale ? 'moon' : 'radio')}<span>${caption}</span></div>`;
  }
  function deviceRows(d) {
    const unsupported = d.status === 'unsupported';
    const unavailable = unsupported ? '暂不支持读取' : '暂不可读';
    const colors = { mouse:'星宇橙', keyboard:'黑色本体 · 透明键帽', controller:'紫色' };
    return [
      ['设备类型',d.short],
      ['配色',colors[d.id]],
      ['连接方式','2.4 GHz 接收器'],
      ['设备状态',statusText(d)],
      ['电量',fresh(d) ? d.percentage + '%' : d.observedAt ? '上次 ' + d.percentage + '%' : unavailable],
      ['充电状态',fresh(d) ? d.charging ? '充电中' : '未充电' : unavailable],
      ['电池电压',Number.isFinite(d.voltageMv) && d.observedAt ? (d.voltageMv / 1000).toFixed(3) + ' V' + (fresh(d) ? '' : '（上次）') : unsupported ? '暂不支持读取' : '设备未提供'],
      ['充电电压',unsupported ? '暂不支持读取' : '设备未提供'],
      ['充电电流',unsupported ? '暂不支持读取' : '设备未提供'],
      ['充电功率',unsupported ? '暂不支持读取' : '设备未提供'],
      ['最后成功读取',d.observedAt ? new Date(d.observedAt).toLocaleString('zh-CN',{hour12:false}) : '尚未读取'],
      ...(d.id === 'keyboard' ? [['设备图片','HI75C 系列外观参考，Pro 图待核实']] : [])
    ];
  }
  const properties = rows => `<dl class="properties">${rows.map(([label,value])=>`<div class="property"><dt>${escape(label)}</dt><dd>${escape(value)}</dd></div>`).join('')}</dl>`;
  function renderDeviceList() {
    return `<div class="devices device-information" aria-label="全部设备信息">${state.devices.map(d => `<section class="device-section" aria-label="${escape(d.name)}完整信息"><div class="device" data-device="${d.id}">${photo(d)}<div class="device-info"><span class="device-name">${escape(d.name)}</span><span class="device-meta ${colorClass(d)}">${statusText(d)}</span></div>${number(d)}</div>${properties(deviceRows(d))}<div class="setting-row device-visibility"><label for="visible-${d.id}">显示在电量条</label><input type="checkbox" role="switch" class="switch" id="visible-${d.id}" data-visible="${d.id}" aria-label="显示${escape(d.name)}" ${state.settings.visible[d.id] ? 'checked' : ''} ${saving ? 'disabled' : ''}></div></section>`).join('')}</div>`;
  }
  const segment = (key, options) => `<div class="segment" role="group" aria-label="${key === 'theme' ? '外观' : '面板布局'}">${options.map(([value,label]) => `<button type="button" data-pref-button="${key}" data-value="${value}" aria-pressed="${state.settings[key] === value}" ${saving ? 'disabled' : ''}>${label}</button>`).join('')}</div>`;
  function toggle(key,label,note = '') {
    return `<div class="setting-row"><label for="${key}"><span class="setting-label">${label}</span>${note ? `<div class="setting-note">${note}</div>` : ''}</label><input type="checkbox" role="switch" class="switch" id="${key}" data-pref="${key}" aria-label="${label}" ${state.settings[key] ? 'checked' : ''} ${saving || key === 'autostart' && !state.autostartSupported ? 'disabled' : ''}></div>`;
  }
  function renderSettings() {
    const s = state.settings;
    return header('设置') + `<div class="settings">
      <div class="preference-group"><div class="section-label">外观</div>${segment('theme',[['system','跟随系统'],['light','浅色'],['dark','深色']])}</div>
      <div class="preference-group"><div class="section-label">设备视图</div>${segment('layout',[['widget','电池小组件'],['list','设备列表']])}</div>
      ${s.layout === 'list' ? renderDeviceList() : ''}
      ${toggle('strip','显示任务栏上方电量条')}
      <div class="setting-row"><span class="setting-label">Windows 任务栏图标</span>${iconButton('taskbar','external-link','打开 Windows 任务栏图标设置')}</div>
      ${toggle('alerts','低电量提醒')}
      <div class="threshold"><label class="threshold-label" for="threshold"><span>提醒阈值</span><output id="threshold-output">${s.threshold}%</output></label><input type="range" min="5" max="40" step="5" value="${s.threshold}" id="threshold" data-pref="threshold" aria-label="提醒阈值" ${!s.alerts || saving ? 'disabled' : ''}></div>
      <div class="setting-row"><label class="setting-label" for="refresh">刷新频率</label><select class="select" id="refresh" data-pref="refresh" aria-label="刷新频率" ${saving ? 'disabled' : ''}>${[10,30,60].map(v=>`<option value="${v}" ${s.refresh === v ? 'selected' : ''}>每 ${v} 秒</option>`).join('')}</select></div>
      ${toggle('autostart','开机静默自启','登录后不弹出面板')}
      </div><div class="about"><span>BatteryDock ${escape(state.version)}</span><button type="button" class="text-button" data-action="logs">日志</button><button type="button" class="text-button" data-action="quit">退出应用</button></div>`;
  }
  function renderDetail() {
    const d = state.devices.find(d => d.id === selected);
    const rows = deviceRows(d);
    const description = fresh(d) ? d.charging ? '正在充电' : '未充电' : d.id === 'controller' ? '此接收器暂未适配电量协议' : d.status === 'disconnected' ? '请检查 USB 接收器' : '可尝试唤醒设备后刷新';
    return header(d.name,d.short) + `<div class="detail-hero" data-device="${d.id}">${photo(d)}${number(d)}<div class="detail-state ${colorClass(d)}">${description}</div></div>${properties(rows)}<div class="detail-toggle"><div class="setting-row"><label for="visible-device">显示在电量条</label><input type="checkbox" role="switch" class="switch" id="visible-device" data-visible="${d.id}" aria-label="显示此设备" ${state.settings.visible[d.id] ? 'checked' : ''} ${saving ? 'disabled' : ''}></div></div>`;
  }
  function resize() {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      const height = Math.ceil(app.querySelector('.panel').getBoundingClientRect().height + 16);
      if (height === lastHeight) return;
      lastHeight = height;
      window.battery.resize(height);
    });
  }
  function render() {
    if (!state) return;
    const focusId = document.activeElement?.id;
    document.documentElement.style.colorScheme = state.settings.theme === 'system' ? (state.themeDark ? 'dark' : 'light') : state.settings.theme;
    const content = view === 'settings' ? renderSettings() : view === 'detail' ? renderDetail() : renderMain();
    app.innerHTML = `<section class="panel" aria-label="设备电量面板">${content}${message ? `<div class="error" role="alert">${escape(message)}</div>` : ''}${footer()}</section>`;
    const nextScrollKey = `${view}:${view === 'settings' ? state.settings.layout : view === 'detail' ? selected : ''}`;
    if (nextScrollKey !== scrollKey) { app.scrollTop = 0; scrollKey = nextScrollKey; }
    lucide.createIcons({ attrs: { 'stroke-width': 1.65 } });
    if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
    resize();
  }
  async function save(patch, showMain = false) {
    saving = true;
    message = '';
    state.settings = { ...state.settings, ...patch, visible: { ...state.settings.visible, ...patch.visible } };
    render();
    try {
      state = await window.battery.settings(patch);
      if (showMain) view = 'main';
    }
    catch (e) { state = await window.battery.state(); message = e.message.replace(/^Error invoking remote method '[^']+': Error: /,''); }
    finally { saving = false; render(); }
  }
  app.addEventListener('click', event => {
    const preference = event.target.closest('[data-pref-button]');
    if (preference) {
      const key = preference.dataset.prefButton;
      void save({ [key]: preference.dataset.value }, key === 'layout' && preference.dataset.value === 'widget');
      return;
    }
    const control = event.target.closest('[data-action]');
    if (!control) return;
    message = '';
    switch (control.dataset.action) {
      case 'settings': view = 'settings'; break;
      case 'close': window.battery.hide(); return;
      case 'widget': void save({ layout: 'widget' }, true); return;
      case 'list': view = 'settings'; void save({ layout: 'list' }); return;
      case 'back': view = 'main'; break;
      case 'detail': view = 'detail'; selected = control.dataset.device; break;
      case 'refresh': void window.battery.refresh().catch(e => { message = e.message; render(); }); break;
      case 'logs': void window.battery.logs(); break;
      case 'taskbar': void window.battery.taskbar().catch(e => { message = e.message; render(); }); break;
      case 'quit': window.battery.quit(); return;
    }
    render();
  });
  app.addEventListener('input', event => { if (event.target.dataset.pref === 'threshold') document.getElementById('threshold-output').textContent = event.target.value + '%'; });
  app.addEventListener('change', event => {
    const el = event.target;
    if (el.dataset.visible) { void save({ visible: { [el.dataset.visible]: el.checked } }); return; }
    if (!el.dataset.pref) return;
    const value = el.type === 'checkbox' ? el.checked : Number(el.value);
    void save({ [el.dataset.pref]: value });
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (view !== 'main') { view = 'main'; render(); } else window.battery.hide();
  });
  let tooltip = null;
  let tooltipTimer = null;
  const clearTip = () => { clearTimeout(tooltipTimer); tooltip?.remove(); tooltip = null; };
  app.addEventListener('pointerover', event => {
    const control = event.target.closest('[data-tooltip]');
    if (!control || control.contains(event.relatedTarget)) return;
    clearTip();
    tooltipTimer = setTimeout(() => {
      if (!control.isConnected) return;
      tooltip = document.createElement('div');
      tooltip.className = 'tooltip'; tooltip.role = 'tooltip'; tooltip.textContent = control.dataset.tooltip;
      document.body.appendChild(tooltip);
      const r = control.getBoundingClientRect();
      tooltip.style.left = Math.max(8, Math.min(r.right - tooltip.offsetWidth, innerWidth - tooltip.offsetWidth - 8)) + 'px';
      tooltip.style.top = Math.max(8, r.top - tooltip.offsetHeight - 4) + 'px';
    }, 400);
  });
  app.addEventListener('pointerout', clearTip);
  app.addEventListener('pointerdown', clearTip);
  window.addEventListener('blur', clearTip);
  window.addEventListener('resize', resize);
  window.battery.onState(value => { state = value; render(); });
  window.battery.onView(value => { view = value === 'settings' ? 'settings' : 'main'; message = ''; render(); });
  window.battery.state().then(value => { state = value; render(); }).catch(error => { app.textContent = error.message; });
})();
