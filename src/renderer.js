(() => {
  const app = document.getElementById('app');
  let state = null;
  let view = 'main';
  let selected = 'mouse';
  let message = '';
  let saving = false;
  let resizeFrame = 0;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = name => `<i data-lucide="${name}" aria-hidden="true"></i>`;
  const iconButton = (action, name, label, extra = '') => `<button type="button" class="icon-button" data-action="${action}" aria-label="${label}" data-tooltip="${label}" ${extra}>${icon(name)}</button>`;
  const fresh = d => d.status === 'fresh';
  const low = d => fresh(d) && !d.charging && d.percentage <= 20;
  const colorClass = d => low(d) ? 'low-text' : fresh(d) && d.charging ? 'green-text' : '';
  function statusText(d) {
    if (d.status === 'loading') return '读取中';
    if (d.status === 'unsupported') return '暂不支持';
    if (d.status === 'disconnected') return '接收器未连接';
    if (!fresh(d)) return '休眠或暂不可读';
    return d.charging ? '充电中' : low(d) ? '电量偏低' : '已连接';
  }
  const time = stamp => stamp ? new Date(stamp).toLocaleTimeString('zh-CN', { hour12: false }) : '尚未读取';
  function meter(d) {
    return `<span class="meter ${low(d) ? 'low' : !fresh(d) ? 'unknown' : ''}" aria-hidden="true"><svg class="ring" viewBox="0 0 54 54"><circle class="ring-track" cx="27" cy="27" r="24"/><circle class="ring-value" cx="27" cy="27" r="24" pathLength="100" stroke-dasharray="${fresh(d) ? d.percentage : 0} 100"/></svg>${icon(fresh(d) && d.charging ? 'battery-charging' : d.icon)}</span>`;
  }
  function number(d) {
    return fresh(d) ? `<span class="number ${colorClass(d)}"><strong>${d.percentage}</strong><small>%</small></span>` : `<span class="unknown-value">${d.percentage === null ? '—' : '上次 ' + d.percentage + '%'}</span>`;
  }
  function header(title, subtitle) {
    return `<header class="header">${view !== 'main' ? iconButton('back','chevron-left','返回电量面板') : ''}<div class="heading"><h1>${escape(title)}</h1>${subtitle ? `<div class="subtitle">${escape(subtitle)}</div>` : ''}</div>${view === 'main' ? iconButton('settings','settings-2','设置') : ''}</header>`;
  }
  function footer() {
    const count = state.devices.filter(fresh).length;
    return `<footer class="footer"><span class="status" role="status" aria-live="polite"><span class="dot ${count ? 'fresh' : ''}"></span>${state.refreshing ? '正在读取设备' : state.pollAt ? '更新于 ' + time(state.pollAt) : '等待首次读取'}</span><span class="footer-right">${state.settings.refresh} 秒<button type="button" class="icon-button ${state.refreshing ? 'spinning' : ''}" data-action="refresh" aria-label="刷新电量" data-tooltip="刷新电量" ${state.refreshing ? 'disabled' : ''}>${icon('refresh-cw')}</button></span></footer>`;
  }
  function renderMain() {
    const ds = state.devices;
    const count = ds.filter(fresh).length;
    const subtitle = `${count} 台已读取 · ${ds.length - count} 台待确认`;
    const list = state.settings.layout === 'list';
    if (list) return header('设备电量',subtitle) + `<div class="devices">${ds.map(d => `<button type="button" class="device" data-action="detail" data-device="${d.id}" aria-label="${escape(d.name)}，查看详情">${meter(d)}<span class="device-info"><span class="device-name">${escape(d.name)}</span><span class="device-meta"><span class="${colorClass(d)}">${statusText(d)}</span><span aria-hidden="true">·</span><span>2.4 GHz</span></span></span>${number(d)}</button>`).join('')}</div>`;
    const lowDevice = ds.find(low);
    const stale = ds.find(d => d.percentage !== null && !fresh(d));
    const caption = lowDevice ? `${lowDevice.short}电量偏低，建议充电` : stale ? `${stale.short}暂不可读，保留上次电量` : count ? `${count} 台设备电量已更新` : '正在等待设备电量';
    return header('电池',subtitle) + `<div class="grid">${ds.map(d => `<button type="button" class="grid-device" data-action="detail" data-device="${d.id}" aria-label="${escape(d.name)}，查看详情">${meter(d)}<span class="reading">${number(d)}</span><span class="grid-name">${d.short}</span><span class="grid-status ${colorClass(d)}">${statusText(d)}</span></button>`).join('')}</div><div class="caption ${lowDevice ? 'low-text' : ''}">${icon(lowDevice ? 'battery-low' : stale ? 'moon' : 'radio')}<span>${caption}</span></div>`;
  }
  const segment = (key, options) => `<div class="segment" role="group" aria-label="${key === 'theme' ? '外观' : '面板布局'}">${options.map(([value,label]) => `<button type="button" data-pref-button="${key}" data-value="${value}" aria-pressed="${state.settings[key] === value}" ${saving ? 'disabled' : ''}>${label}</button>`).join('')}</div>`;
  function toggle(key,label,note = '') {
    return `<div class="setting-row"><label for="${key}"><span class="setting-label">${label}</span>${note ? `<div class="setting-note">${note}</div>` : ''}</label><input type="checkbox" role="switch" class="switch" id="${key}" data-pref="${key}" aria-label="${label}" ${state.settings[key] ? 'checked' : ''} ${saving || key === 'autostart' && !state.autostartSupported ? 'disabled' : ''}></div>`;
  }
  function renderSettings() {
    const s = state.settings;
    return header('设置') + `<div class="settings"><div class="preference-group"><div class="section-label">外观</div>${segment('theme',[['system','跟随系统'],['light','浅色'],['dark','深色']])}</div><div class="preference-group"><div class="section-label">面板布局</div>${segment('layout',[['widget','电池小组件'],['list','设备列表']])}</div>${toggle('numbers','托盘显示电量数字')}${toggle('alerts','低电量提醒')}<div class="threshold"><label class="threshold-label" for="threshold"><span>提醒阈值</span><output id="threshold-output">${s.threshold}%</output></label><input type="range" min="5" max="40" step="5" value="${s.threshold}" id="threshold" data-pref="threshold" aria-label="提醒阈值" ${!s.alerts || saving ? 'disabled' : ''}></div><div class="setting-row"><label class="setting-label" for="refresh">刷新频率</label><select class="select" id="refresh" data-pref="refresh" aria-label="刷新频率" ${saving ? 'disabled' : ''}>${[10,30,60].map(v=>`<option value="${v}" ${s.refresh === v ? 'selected' : ''}>每 ${v} 秒</option>`).join('')}</select></div>${toggle('autostart','开机静默自启','登录后仅在托盘运行，不弹出面板')}</div><div class="about"><span>BatteryDock ${escape(state.version)}</span><button type="button" class="text-button" data-action="logs">日志</button><button type="button" class="text-button" data-action="quit">退出应用</button></div>`;
  }
  function renderDetail() {
    const d = state.devices.find(d => d.id === selected);
    const rows = [['连接方式','2.4 GHz 接收器'], ['设备状态',statusText(d)], ['最后成功读取',time(d.observedAt)]];
    if (d.voltageMv !== null && d.observedAt) rows.push(['电池电压',(d.voltageMv / 1000).toFixed(2) + ' V' + (!fresh(d) ? '（上次）' : '')]);
    const description = fresh(d) ? d.charging ? '正在充电' : '未充电' : d.id === 'controller' ? '此接收器暂未适配电量协议' : d.status === 'disconnected' ? '请检查 USB 接收器' : '可尝试唤醒设备后刷新';
    return header(d.name,d.short) + `<div class="detail-hero">${meter(d)}${number(d)}<div class="detail-state ${colorClass(d)}">${description}</div></div><dl class="properties">${rows.map(([label,value])=>`<div class="property"><dt>${label}</dt><dd>${escape(value)}</dd></div>`).join('')}</dl>${d.id === 'controller' ? '' : `<div class="detail-toggle"><div class="setting-row"><label for="visible-device">显示在托盘</label><input type="checkbox" role="switch" class="switch" id="visible-device" data-visible="${d.id}" aria-label="显示在托盘" ${state.settings.visible[d.id] ? 'checked' : ''} ${saving ? 'disabled' : ''}></div></div>`}`;
  }
  function resize() {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => window.battery.resize(app.getBoundingClientRect().height));
  }
  function render() {
    if (!state) return;
    const focusId = document.activeElement?.id;
    document.documentElement.style.colorScheme = state.settings.theme === 'system' ? (state.themeDark ? 'dark' : 'light') : state.settings.theme;
    const content = view === 'settings' ? renderSettings() : view === 'detail' ? renderDetail() : renderMain();
    app.innerHTML = `<section class="panel" aria-label="设备电量面板">${content}${message ? `<div class="error" role="alert">${escape(message)}</div>` : ''}${footer()}</section>`;
    lucide.createIcons({ attrs: { 'stroke-width': 1.65 } });
    if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
    resize();
  }
  async function save(patch) {
    saving = true;
    message = '';
    state.settings = { ...state.settings, ...patch, visible: { ...state.settings.visible, ...patch.visible } };
    render();
    try { state = await window.battery.settings(patch); }
    catch (e) { state = await window.battery.state(); message = e.message.replace(/^Error invoking remote method '[^']+': Error: /,''); }
    finally { saving = false; render(); }
  }
  app.addEventListener('click', event => {
    const preference = event.target.closest('[data-pref-button]');
    if (preference) { void save({ [preference.dataset.prefButton]: preference.dataset.value }); return; }
    const control = event.target.closest('[data-action]');
    if (!control) return;
    message = '';
    switch (control.dataset.action) {
      case 'settings': view = 'settings'; break;
      case 'back': view = 'main'; break;
      case 'detail': view = 'detail'; selected = control.dataset.device; break;
      case 'refresh': void window.battery.refresh().catch(e => { message = e.message; render(); }); break;
      case 'logs': void window.battery.logs(); break;
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
  window.battery.onState(value => { state = value; render(); });
  window.battery.onView(value => { view = value === 'settings' ? 'settings' : 'main'; message = ''; render(); });
  window.battery.state().then(value => { state = value; render(); }).catch(error => { app.textContent = error.message; });
})();
