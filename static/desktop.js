/* Remote desktop: noVNC client over an authenticated WebSocket to wayvnc on the Pi. */
let RFBC = null, rfb = null;
function desktopStop() { if (rfb) { try { rfb.disconnect() } catch (e) {} rfb = null } }
addEventListener('hashchange', () => { if (location.hash.slice(1) != 'desktop') desktopStop() });
P.desktop = () => {
  desktopStop();
  main.innerHTML = `<div class="page">${head('Desktop')}<div class="surface"><div class="tools">
    <button class="btn" type="button" id="dc">Connect</button>
    <button class="btn" type="button" id="dctl" disabled aria-pressed="false">Control: off</button>
    <button class="btn" type="button" id="dfs" disabled>Fullscreen</button>
    <button class="btn" type="button" id="dkeys" disabled>Send keys</button>
    <span class="muted sm" id="dst">Not connected. Starts in view-only mode.</span></div>
    <div class="tools" id="dclip" hidden><input id="dcin" placeholder="Text to place in the Pi clipboard" size="40" aria-label="Clipboard text"><button class="btn" type="button" id="dcs">Send to Pi clipboard</button><span class="muted sm" id="dcm">Copy on the Pi arrives in your clipboard when allowed.</span></div>
    <div id="dscr" style="background:#000;position:relative;outline:none;margin:0 auto;aspect-ratio:16/9;width:100%"></div></div></div>`;
  const st = t => $('#dst').textContent = t, scr = $('#dscr');
  let ctl = false, ar = 16 / 9;
  const fit = () => {
    if (document.fullscreenElement === scr) { scr.style.width = '100vw'; scr.style.height = '100vh'; scr.style.aspectRatio = 'auto'; return }
    scr.style.height = ''; scr.style.aspectRatio = ar; scr.style.width = `min(100%, calc((100vh - 8rem) * ${ar}))`;
  };
  const sizeFromFb = () => { const c = scr.querySelector('canvas'); if (c && c.width > 1 && c.height > 1) { const r = c.width / c.height; if (Math.abs(r - ar) > 0.001) { ar = r; fit() } } };
  scr.onfullscreenchange = () => { fit(); setTimeout(() => dispatchEvent(new Event('resize')), 50) };
  fit();
  const setCtl = on => { ctl = on; if (rfb) rfb.viewOnly = !on; const b = $('#dctl'); b.textContent = 'Control: ' + (on ? 'on' : 'off'); b.setAttribute('aria-pressed', on); if (on && rfb) rfb.focus() };
  const ui = on => { ['#dctl', '#dfs', '#dkeys'].forEach(s => $(s).disabled = !on); $('#dclip').hidden = !on; $('#dc').textContent = on ? 'Disconnect' : 'Connect' };
  async function connect() {
    st('Connecting...');
    try {
      const s = await get('/api/desktop/status');
      if (!s.up) { st('The desktop service (wayvnc) is not running on the Pi.'); return }
      if (!RFBC) RFBC = (await import('/static/novnc/core/rfb.js')).default;
      if (page != 'desktop') return;
      const proto = location.protocol == 'https:' ? 'wss' : 'ws';
      rfb = new RFBC(scr, `${proto}://${location.host}/ws/desktop`);
      rfb.scaleViewport = true; rfb.resizeSession = false; rfb.viewOnly = true; rfb.clipViewport = false;
      rfb.addEventListener('connect', () => { sizeFromFb(); setTimeout(sizeFromFb, 300); ui(true); setCtl(false); st('Connected, view-only. Turn Control on to use mouse and keyboard.') });
      rfb.addEventListener('disconnect', e => { rfb = null; ui(false); st(e.detail.clean ? 'Disconnected.' : 'Connection lost.') });
      rfb.addEventListener('desktopname', () => sizeFromFb()); rfb.addEventListener('clipboard', e => { navigator.clipboard && navigator.clipboard.writeText(e.detail.text).then(() => $('#dcm').textContent = 'Pi clipboard copied to yours.', () => {}) });
    } catch (e) { if (e !== 0) st('Could not connect: ' + (e.message || e)) }
  }
  $('#dc').onclick = () => rfb ? rfb.disconnect() : connect();
  $('#dctl').onclick = () => setCtl(!ctl);
  $('#dfs').onclick = () => scr.requestFullscreen && scr.requestFullscreen();
  $('#dcs').onclick = () => { if (rfb) { rfb.clipboardPasteFrom($('#dcin').value); $('#dcm').textContent = 'Sent to the Pi clipboard. Press Ctrl+V on the Pi.' } };
  $('#dkeys').onclick = async () => {
    if (!rfb) return;
    if (!ctl) { toast('Turn Control on first'); return }
    const k = prompt('Key combo: ctrlaltdel, esc, super, ctrl+c, alt+tab, alt+f4') || '';
    const M = {ctrlaltdel: [['ControlLeft', 'Control_L'], ['AltLeft', 'Alt_L'], ['Delete', 'Delete']], esc: [['Escape', 'Escape']], super: [['MetaLeft', 'Super_L']], 'ctrl+c': [['ControlLeft', 'Control_L'], ['KeyC', 'c']], 'alt+tab': [['AltLeft', 'Alt_L'], ['Tab', 'Tab']], 'alt+f4': [['AltLeft', 'Alt_L'], ['F4', 'F4']]}[k.trim().toLowerCase()];
    if (!M) { toast('Unknown combo'); return }
    const sym = {Control_L: 0xffe3, Alt_L: 0xffe9, Delete: 0xffff, Escape: 0xff1b, Super_L: 0xffeb, c: 0x63, Tab: 0xff09, F4: 0xffc1};
    M.forEach(([c, n]) => rfb.sendKey(sym[n], c, true)); M.slice().reverse().forEach(([c, n]) => rfb.sendKey(sym[n], c, false));
  };
  connect();
};
