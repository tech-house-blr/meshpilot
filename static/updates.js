/* Updates: the page shell renders once. Polling only patches changed pieces, so nothing flickers or loses scroll and focus. */
P.updates = () => {
  let pk = [], job = {}, off = 0, wasRunning = null, filt = '', lastRefresh = null, needsRestart = false, loadedPk = false, stick = true;
  main.innerHTML = `<div class="page">${head('Updates')}<div id="live">
    <div id="unote" class="notice" hidden>A restart is required to finish applying updates. Use the Power page when ready.</div>
    <div class="surface"><div class="head"><div><h2 id="utitle">Checking</h2><div class="muted sm" id="usub">Reading package lists</div></div>
      <div class="acts"><button class="btn" type="button" id="chk">Check for updates</button><button class="btn primary" type="button" id="upg" disabled>Install updates</button></div></div>
      <div class="uprog" id="uprog" hidden><div class="uprog-bar"><i id="ubar"></i></div><div class="muted sm" id="uptxt" aria-live="polite"></div></div>
      <div class="tools" id="utools" hidden><input id="uq" placeholder="Filter packages" size="26" aria-label="Filter packages"><span class="muted sm" id="ucount"></span></div>
      <div id="upk"><div class="loading">${skel(3)}</div></div></div>
    <div class="surface" id="ujob" hidden><div class="head"><h2 id="ujt">Last job</h2><div class="acts"><span id="ujs"></span><button class="btn s" type="button" id="ucopy">Copy log</button></div></div>
      <pre class="log" id="ul" tabindex="0" aria-label="Job output"></pre><button class="btn s ujump" type="button" id="ujump" hidden>Jump to latest</button></div></div></div>`;
  const log = $('#ul'), atBottom = () => log.scrollHeight - log.scrollTop - log.clientHeight < 24;
  log.addEventListener('scroll', () => { stick = atBottom(); $('#ujump').hidden = stick });
  $('#ujump').onclick = () => { log.scrollTop = log.scrollHeight; stick = true; $('#ujump').hidden = true };
  $('#ucopy').onclick = async () => { try { await navigator.clipboard.writeText(log.textContent); toast('Log copied') } catch { toast('Copy needs HTTPS or localhost') } };
  const setText = (el, t) => { if (el.textContent !== t) el.textContent = t };

  const drawPk = () => {
    const q = filt.toLowerCase(), list = pk.filter(p => !q || p.name.toLowerCase().includes(q) || p.repo.toLowerCase().includes(q));
    $('#utools').hidden = pk.length < 8; setText($('#ucount'), q ? `${list.length} of ${pk.length} shown` : `${pk.length} packages`);
    $('#upk').innerHTML = !pk.length ? '<div class="empty">Everything is up to date. Run a check to refresh the package lists.</div>' : list.length ? `<div class="tw short" style="max-height:360px"><table class="stack"><thead><tr><th>Package</th><th>Installed</th><th>Available</th><th>Repository</th></tr></thead><tbody>${list.map(p => `<tr><td data-l="Package">${esc(p.name)}</td><td class="m muted" data-l="Installed">${esc(p.old)}</td><td class="m" data-l="Available">${esc(p.new)}</td><td class="muted" data-l="Repository">${esc(p.repo)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No package matches this filter.</div>';
  };
  const drawHead = () => {
    const run = !!job.running, n = pk.length;
    setText($('#utitle'), run ? (job.action == 'upgrade' ? 'Installing updates' : 'Checking for updates') : !loadedPk ? 'Checking' : n ? `${n} package${n == 1 ? '' : 's'} can be upgraded` : 'System is up to date');
    setText($('#usub'), run ? 'You can leave this page. The job keeps running.' : `Package lists refreshed ${lastRefresh || 'never'}`);
    $('#chk').disabled = run; $('#upg').disabled = run || !n; setText($('#upg'), n ? `Install ${n} update${n == 1 ? '' : 's'}` : 'Install updates');
    $('#unote').hidden = !needsRestart;
    $('#ujob').hidden = !job.action;
    if (job.action) {
      setText($('#ujt'), job.action == 'upgrade' ? 'Install updates' : 'Check for updates');
      const h = run ? chip('running', 'amber') : job.rc === 0 ? chip('finished ' + job.finished, 'ok') : chip('failed, exit ' + job.rc, 'bad');
      if ($('#ujs').innerHTML !== h) $('#ujs').innerHTML = h;
    }
    const pr = $('#uprog'); pr.hidden = !(run && job.action == 'upgrade' && job.total);
    if (!pr.hidden) {
      const done = (log.textContent.match(/^Setting up /gm) || []).length, pct = Math.min(99, Math.round(done / job.total * 100));
      $('#ubar').style.transform = `scaleX(${pct / 100})`; setText($('#uptxt'), `${done} of ${job.total} packages configured`);
    }
  };
  let t;
  const next = ms => { clearTimeout(t); t = setTimeout(() => { poll().catch(e => { if (e !== 0 && page == 'updates') next(5000) }) }, ms); timers.push(t) };
  async function poll() {
    const r = await get('/api/updates/status?since=' + off);
    if (page != 'updates') return;
    if (r.offset < off) log.textContent = '';
    if (r.log) { log.appendChild(document.createTextNode(r.log)); if (stick) log.scrollTop = log.scrollHeight }
    off = r.offset; job = r.job; lastRefresh = r.last_refresh; needsRestart = r.reboot_required;
    if ((wasRunning === true && !job.running) || !loadedPk) { const u = await get('/api/updates'); if (page != 'updates') return; pk = u.packages; loadedPk = true; drawPk() }
    if (wasRunning === true && !job.running) toast(job.rc === 0 ? 'Finished' : 'Job failed, see the log');
    wasRunning = !!job.running; drawHead(); next(job.running ? 1200 : 8000);
  }
  poll().catch(e => { if (e !== 0) $('#upk').innerHTML = errbox(e) });
  $('#uq').oninput = e => { filt = e.target.value; drawPk() };
  async function run(a) {
    const b = a == 'upgrade' ? $('#upg') : $('#chk'); b.disabled = true;
    const r = await post('/api/updates/run', {action: a});
    if (!r.ok) { toast('Failed: ' + r.error); b.disabled = false; return }
    stick = true; off = 0; log.textContent = ''; job = {running: true, action: a, total: r.total || 0}; wasRunning = true; drawHead(); next(300);
  }
  $('#chk').onclick = () => run('refresh');
  $('#upg').onclick = async () => { if (await ask(`Install all ${pk.length} available updates now? This can take several minutes and cannot be cancelled.`)) run('upgrade') };
};
