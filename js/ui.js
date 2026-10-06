/* WareTrack – DOM user interface */
(function () {
  const UI = (WT.UI = {});
  const $ = (s) => document.querySelector(s);
  const setHTML = (el, h) => { if (typeof el === 'string') el = $(el); if (el && el._h !== h) { el.innerHTML = h; el._h = h; } };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const money = (n) => (Math.abs(n) >= 1e9 ? '$' + (n / 1e9).toFixed(2) + 'B' : Math.abs(n) >= 1e6 ? '$' + (n / 1e6).toFixed(2) + 'M' : '$' + Math.round(n / 1000) + 'k');

  const P = {
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    bell: '<path d="M6 8a6 6 0 0112 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10.3 21a1.94 1.94 0 003.4 0"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>',
    rotR: '<path d="M21 12a9 9 0 11-2.64-6.36"/><path d="M21 3v6h-6"/>',
    rotL: '<path d="M3 12a9 9 0 102.64-6.36"/><path d="M3 3v6h6"/>',
    home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
    chevR: '<path d="M9 6l6 6-6 6"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>',
    truck: '<path d="M2 6h11v10H2z"/><path d="M13 9h5l3 3v4h-8"/><circle cx="6.5" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
    train: '<rect x="5" y="3" width="14" height="14" rx="3"/><path d="M5 10h14"/><circle cx="9" cy="13.5" r=".9"/><circle cx="15" cy="13.5" r=".9"/><path d="M8 21l2-4M16 21l-2-4"/>',
    plane: '<path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
    ship: '<path d="M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1 .6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M19.4 20A11.6 11.6 0 0021 14l-9-4-9 4c0 2.9.9 5.3 2.8 7.8"/><path d="M19 13V7a2 2 0 00-2-2H7a2 2 0 00-2 2v6"/><path d="M12 10v4M12 2v3"/>',
    package: '<path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><path d="M3.3 7L12 12l8.7-5"/><path d="M12 22V12"/>',
    warehouse: '<path d="M3 9l9-5 9 5v11H3z"/><path d="M7 20v-7h10v7"/><path d="M7 16h10"/>',
    factory: '<path d="M3 21V11l5 3V11l5 3V7l5 3V3h3v18z"/><path d="M7 17h2M12 17h2M17 17h2"/>',
    layers: '<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/>',
    play: '<path d="M7 4.5l12 7.5-12 7.5z"/>', pause: '<path d="M8 5v14M16 5v14"/>',
    target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
    follow: '<path d="M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    cube: '<path d="M21 16V8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
    cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
    trend: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    video: '<rect x="2" y="6" width="14" height="12" rx="2"/><path d="M16 10l6-3v10l-6-3"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    crane: '<path d="M4 21V5h2v16"/><path d="M6 5h15l-3 3"/><path d="M17 5v6"/><rect x="15" y="11" width="4" height="3"/><path d="M2 21h8"/>',
    sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/>',
  };
  const ic = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${P[n] || ''}</svg>`;
  UI.ic = ic;
  const MODE_ICON = { truck: 'truck', rail: 'train', air: 'plane', sea: 'ship' };
  const PHASE_ICON = ['warehouse', 'factory', 'train', 'ship', 'plane', 'sparkle'];
  let tab = 'projects';
  let unread = 0;

  /* ---------- shell ---------- */
  function shell() {
    $('#brand').innerHTML = `<svg class="logo" viewBox="0 0 32 32"><path d="M16 2l12 7v14l-12 7-12-7V9z" fill="#2f56e0"/><path d="M16 9l6 3.5v7L16 23l-6-3.5v-7z" fill="#fff"/><path d="M16 13l2.6 1.5v3L16 19l-2.6-1.5v-3z" fill="#2f56e0"/></svg><span>WareTrack</span><span class="ver" title="Version ${WT.VERSION} · build ${WT.BUILD}">v${WT.VERSION}${WT.BUILD !== 'dev' ? ' · ' + WT.BUILD : ''}</span>`;
    $('#searchIcon').innerHTML = ic('search');
    $('#bellBtn').innerHTML = ic('bell') + '<span class="badge" id="bellBadge"></span>';
    $('#mapTools').innerHTML = `
      <button data-act="zin" title="Zoom in (+)">${ic('plus')}</button>
      <button data-act="zout" title="Zoom out (−)">${ic('minus')}</button>
      <button data-act="rotr" title="Rotate (E)">${ic('rotR')}</button>
      <button data-act="rotl" title="Rotate (Q)">${ic('rotL')}</button>
      <button data-act="home" title="Reset view (H)">${ic('home')}</button>
      <span class="sep"></span>
      <button data-act="pause" id="pauseBtn" title="Pause (Space)">${ic('pause')}</button>
      <button data-act="s1" class="spd" title="1× speed (1)">1×</button>
      <button data-act="s2" class="spd" title="2× speed (2)">2×</button>
      <button data-act="s4" class="spd" title="4× speed (3)">4×</button>
      <button data-act="s8" class="spd" title="8× speed (4)">8×</button>`;
    $('#mapTools').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const a = b.dataset.act;
      if (a === 'zin') WT.zoomBy(0.75);
      if (a === 'zout') WT.zoomBy(1.33);
      if (a === 'rotr') WT.rotate(1);
      if (a === 'rotl') WT.rotate(-1);
      if (a === 'home') WT.home();
      if (a === 'pause') WT.setPaused(!WT.sim.paused);
      if (/^s\d$/.test(a)) WT.setSpeed(+a.slice(1));
    });
    WT.on('speed', speedState);
    speedState();

    $('#modeChips').addEventListener('pointerdown', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const a = b.dataset.go;
      if (a === 'auto') { WT.Cinema.toggle(); renderChips(); return; }
      if (a === 'cinema') { UI.toggleCinemaMode(); return; }
      goTo(a);
    });
    $('#cineBar').addEventListener('click', (e) => { if (e.target.closest('[data-act=exit]')) UI.toggleCinemaMode(false); });

    $('#sitePill').addEventListener('click', () => goTo('overview'));
    $('#bellBtn').addEventListener('click', (e) => { e.stopPropagation(); toggleMenu('#notifMenu'); unread = 0; renderNotif(); });
    document.addEventListener('click', (e) => { if (!e.target.closest('.dropdown') && !e.target.closest('#bellBtn')) closeMenus(); });

    const inp = $('#searchInput');
    inp.addEventListener('input', renderSearch);
    inp.addEventListener('focus', renderSearch);
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { inp.value = ''; inp.blur(); $('#searchResults').classList.remove('open'); }
      if (e.key === 'Enter') { const f = $('#searchResults [data-uid]'); if (f) f.click(); }
    });
    inp.addEventListener('blur', () => setTimeout(() => $('#searchResults').classList.remove('open'), 160));
    $('#searchResults').addEventListener('mousedown', (e) => e.preventDefault());
    $('#searchResults').addEventListener('click', (e) => {
      const r = e.target.closest('[data-uid]');
      if (!r) return;
      WT.select(WT.entities.get(r.dataset.uid), true);
      inp.value = ''; inp.blur();
      $('#searchResults').classList.remove('open');
    });

    $('#detail').addEventListener('pointerdown', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b || !WT.selected) return;
      WT.Cinema.userInput();
      if (b.dataset.act === 'close') WT.select(null);
      if (b.dataset.act === 'focus') WT.select(WT.selected, true);
      if (b.dataset.act === 'follow') { WT.follow = WT.follow === WT.selected ? null : WT.selected; renderDetail(); }
    });
    $('#tracking').addEventListener('pointerdown', (e) => {
      const b = e.target.closest('[data-uid]');
      if (b && WT.entities.has(b.dataset.uid)) WT.select(WT.entities.get(b.dataset.uid), true);
    });
    $('#docks').addEventListener('pointerdown', (e) => {
      const t = e.target.closest('[data-tab]');
      if (t) { tab = t.dataset.tab; renderTabs(); return; }
      const r = e.target.closest('[data-uid]');
      if (r && WT.entities.has(r.dataset.uid)) WT.select(WT.entities.get(r.dataset.uid), true);
    });

    WT.on('select', () => renderDetail());
    WT.on('log', (ev, toast) => { unread++; renderNotif(); if (toast) showToast(ev); });
    WT.on('cinema', renderChips);
    renderChips();
  }

  function goTo(a) {
    const F = WT.facilities.filter((f) => f.active);
    let f = null;
    if (a === 'overview') {
      const xs = WT.facilities.map((x) => x.center()[0]), zs = WT.facilities.map((x) => x.center()[1]);
      if (!xs.length) return WT.home();
      const ext = Math.max(Math.max(...xs) - Math.min(...xs), (Math.max(...zs) - Math.min(...zs)) * 1.6, 200);
      WT.Cinema.userInput();
      WT.select(null);
      WT.flyTo((Math.max(...xs) + Math.min(...xs)) / 2, (Math.max(...zs) + Math.min(...zs)) / 2, WT.clamp(ext * 1.25, 260, 1400));
      return;
    }
    if (a === 'newest') f = WT.facilities[WT.facilities.length - 1];
    if (a === 'rail') f = F.find((x) => x.type === 'Rail terminal');
    if (a === 'port') f = F.find((x) => x.type === 'Port terminal');
    if (a === 'air') f = WT.facilities.find((x) => x.type === 'Air terminal') || WT.facilities.find((x) => x.type === 'Airfield');
    if (a === 'factory') { const fs = F.filter((x) => x.type === 'Factory'); f = fs.length ? WT.pick(fs) : null; }
    if (!f) { showToast({ msg: 'Not built yet — keep watching!', tone: 'amber' }); return; }
    WT.Cinema.userInput();
    WT.select(f);
    const c = f.center();
    WT.flyTo(c[0], c[1], Math.max(110, f.radius() * 2.6));
  }

  function renderChips() {
    const C = WT.Cinema, idle = C.idleLeft();
    const autoTxt = !C.on ? 'Auto camera off' : idle ? `Auto in ${idle}s` : 'Auto camera';
    setHTML('#modeChips', `
      <button data-go="auto" class="${C.on ? (idle ? 'warm' : 'on') : ''}">${ic('video')}<span>${autoTxt}</span></button>
      <button data-go="cinema">${ic('eye')}<span>Cinema</span></button>
      <span class="chip-sep"></span>
      <button data-go="overview">${ic('layers')}<span>Overview</span></button>
      <button data-go="newest">${ic('sparkle')}<span>Newest</span></button>
      <button data-go="factory">${ic('factory')}<span>Factories</span></button>
      <button data-go="rail">${ic('train')}<span>Rail</span></button>
      <button data-go="port">${ic('ship')}<span>Port</span></button>
      <button data-go="air">${ic('plane')}<span>Air</span></button>`);
  }
  UI.toggleCinemaMode = (v) => {
    const on = v === undefined ? !document.body.classList.contains('cinema') : v;
    document.body.classList.toggle('cinema', on);
    if (on) WT.Cinema.toggle(true);
  };

  function speedState() {
    const s = WT.sim;
    $('#pauseBtn').innerHTML = ic(s.paused ? 'play' : 'pause');
    $('#pauseBtn').classList.toggle('on', s.paused);
    document.querySelectorAll('#mapTools .spd').forEach((b) => b.classList.toggle('on', !s.paused && b.dataset.act === 's' + s.speed));
    document.body.classList.toggle('paused', s.paused);
  }
  function toggleMenu(sel) {
    const el = $(sel), open = el.classList.contains('open');
    closeMenus();
    if (!open) el.classList.add('open');
  }
  function closeMenus() { document.querySelectorAll('.dropdown.open').forEach((d) => d.classList.remove('open')); }

  /* ---------- top bar + KPIs ---------- */
  const fleet = () => WT.trucks.length + WT.trains.length + WT.AIR.planes.length + WT.ships.length;
  function kpi(icon, label, value, sub, delta) {
    return `<div class="kpi card"><div class="kpi-ic">${ic(icon)}</div><div class="kpi-body"><div class="kpi-label">${label}</div>
      <div class="kpi-val">${value}${delta ? `<span class="delta up">↑ ${delta}</span>` : ''}</div><div class="kpi-sub">${esc(sub)}</div></div></div>`;
  }
  function renderTop() {
    const G = WT.G, act = WT.facilities.filter((f) => f.active).length;
    const building = G.projects.filter((p) => p.stage !== 'Online').length;
    setHTML('#sitePill', `<span class="site-badge">RLP</span><span class="site-txt"><b>Riverside Logistics Park</b><small>Phase ${G.phase() + 1} · ${act} facilities${building ? ' · ' + building + ' building' : ''}</small></span>${ic('chevR', 'muted')}`);
    $('#clock').textContent = WT.fmtTime(WT.sim.minutes);
    const rate = G.rate() * 60;
    const next = G.next();
    setHTML('#kpis', [
      kpi('cash', 'Capital', money(G.money), next ? 'next: ' + next.label + ' · ' + money(next.cost) : 'all plots planned', ''),
      kpi('warehouse', 'Facilities', act, building ? building + ' under construction' : 'none under construction', building ? '+' + building : ''),
      kpi('trend', 'Revenue', money(rate) + '/min', 'earned ' + money(G.earned), ''),
      kpi('truck', 'Fleet active', fleet(), `${WT.trucks.length} road · ${WT.trains.length} rail · ${WT.AIR.planes.length} air · ${WT.ships.length} sea`, ''),
    ].join(''));
    setHTML('#cineBar', `<span class="cb-logo">${ic('video')}</span><b>Riverside Logistics Park</b><span class="ver dark">v${WT.VERSION}</span><span>${act} facilities</span><span>${money(G.money)}</span><span>${WT.fmtTime(WT.sim.minutes)}</span>${building ? `<span class="cb-build">${ic('crane')} ${building} building</span>` : ''}<button data-act="exit">Exit cinema (U)</button>`);
    renderChips();
  }

  /* ---------- detail card ---------- */
  function renderDetail() {
    const e = WT.selected, el = $('#detail');
    document.body.classList.toggle('has-detail', !!e);
    if (!e) { setHTML(el, ''); return; }
    const c = e.card();
    setHTML(el, `
      <div class="d-head">
        <div class="d-icon" style="--c:${c.iconBg}">${c.icon}</div>
        <div class="d-titles"><div class="d-kicker">${esc(c.kicker)}</div><div class="d-title">${esc(c.title)}</div><div class="d-sub">${esc(c.sub)}</div></div>
        <button class="icon-btn sm" data-act="close" title="Close (Esc)">${ic('x')}</button>
      </div>
      <div class="d-status"><span class="chip ${c.statusTone}">${esc(c.status)}</span><span class="d-where">${esc(c.where || '')}</span></div>
      ${c.bars ? `<div class="d-bars">${c.bars.map((b) => { const p = Math.round(WT.clamp(b.val / b.max, 0, 1) * 100); return `<div class="d-bar"><div class="db-top"><span>${esc(b.label)}</span><b>${Math.round(b.val)} / ${b.max}${b.sub ? ' · ' + esc(b.sub) : ''}</b></div><div class="db-track"><i class="${p < 15 ? 'low' : p < 40 ? 'mid' : ''}" style="width:${p}%"></i></div></div>`; }).join('')}</div>` : ''}
      <div class="d-rows">${c.rows.map(([k, v]) => `<div class="d-row"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div>
      <div class="d-actions">
        <button data-act="focus">${ic('target')} Focus</button>
        ${e.kind === 'facility' ? '' : `<button data-act="follow" class="${WT.follow === e ? 'on' : ''}">${ic('follow')} ${WT.follow === e ? 'Following' : 'Follow'}</button>`}
      </div>`);
  }

  /* ---------- expansion timeline (bottom-left) ---------- */
  function renderExpansion() {
    const G = WT.G, ph = G.PHASES, reached = G.milestones.length;
    const steps = ph.map((p, i) => {
      const done = G.milestones.includes(p.key), cur = !done && i === reached;
      return `<div class="step ${done ? 'done' : ''} ${cur ? 'cur' : ''}"><div class="dot">${ic(PHASE_ICON[i])}</div><div class="s-name">${p.name}</div><div class="s-time">${done ? WT.fmtTime(p.t) : cur ? 'next' : '—'}</div></div>`;
    }).join('');
    const pct = Math.min(1, reached / (ph.length - 1));
    const act = G.projects.filter((p) => p.stage !== 'Online');
    const p = act[0] || G.projects[0];
    let card;
    if (p) {
      const pr = Math.round((p.progress || 0) * 100);
      const id = p.fac ? p.fac.id : 'RAIL-LINE';
      card = `<div class="t-card" ${p.fac ? `data-uid="${p.fac.uid}"` : ''}>
        <div class="t-veh-ic emoji">${p.icon}</div>
        <div class="t-info"><b>${id} · ${esc(p.label)}</b><small>${p.stage === 'Online' ? 'Completed' : esc(p.stage)}${act.length > 1 ? ` · +${act.length - 1} more` : ''}</small>
          <div class="pbar"><i style="width:${pr}%"></i></div><small class="t-loc">${pr}% · ${money(p.cost)}</small></div></div>`;
    } else card = `<div class="t-card"><div class="t-veh-ic">${ic('crane')}</div><div class="t-info"><b>Surveying land…</b><small>First project starting</small></div></div>`;
    setHTML('#tracking', `
      <div class="t-head"><b>Park Expansion</b><span class="t-veh">${G.done} projects complete · ${money(G.earned)} earned</span></div>
      <div class="t-body"><div class="timeline" style="--pct:${pct}"><div class="rail"><div class="fill"></div></div>${steps}</div>${card}</div>`);
  }

  /* ---------- tabs panel (bottom-right) ---------- */
  function row(uid, left, sub, mid, chip, tone, right) {
    return `<div class="r ${uid ? 'click' : ''}" ${uid ? `data-uid="${uid}"` : ''}><div class="r-l"><b>${left}</b><small>${sub}</small></div>
      <div class="r-m">${mid}</div><div class="r-c">${chip ? `<span class="chip ${tone}">${chip}</span>` : ''}</div><div class="r-r">${right || ''}</div></div>`;
  }
  const dot = (c) => `<span class="dot-s" style="background:${c}"></span>`;
  const hex = (n) => '#' + n.toString(16).padStart(6, '0');
  function renderTabs() {
    const G = WT.G;
    const act = WT.facilities.filter((f) => f.active);
    const building = G.projects.filter((p) => p.stage !== 'Online');
    const facs = act.filter((f) => f.type === 'Factory');
    const openPO = WT.SUP.orders.filter((o) => o.status !== 'Delivered' && o.status !== 'Cancelled');
    const tabs = [['projects', `Projects ${building.length}`], ['orders', `Orders ${openPO.length}`], ['supply', `Supply ${facs.filter((f) => f.starved).length ? '⚠' : facs.length}`], ['facilities', `Facilities ${act.length}`], ['fleet', `Fleet ${fleet()}`],
      ['shipments', `Shipments ${WT.shipments.filter((s) => s.stage < 4).length}`], ['log', 'Log']];
    let rows = '';
    if (tab === 'projects') {
      const n = G.next();
      if (n) rows += row('', 'Next', 'Planned', `${n.icon} ${esc(n.label)}`, money(n.cost), G.money >= n.cost ? 'green' : 'grey', Math.round(Math.min(1, G.money / n.cost) * 100) + '%');
      for (const p of G.projects.slice(0, 14)) {
        const pr = Math.round((p.progress || 0) * 100), on = p.stage === 'Online';
        rows += row(p.fac ? p.fac.uid : '', p.fac ? p.fac.id : 'RAIL', p.icon + ' ' + p.type, `<div class="mini"><i style="width:${pr}%"></i></div>`, on ? 'Online' : p.stage, on ? 'green' : 'amber', on ? '' : pr + '%');
      }
    } else if (tab === 'orders') {
      const S = WT.SUP;
      const MI = { sea: 'ship', rail: 'train', air: 'plane', road: 'truck', internal: 'factory' };
      const list = openPO.concat(S.orders.filter((o) => o.status === 'Delivered').slice(0, 6));
      for (const o of list.slice(0, 24)) {
        const carrierEnt = o.vehicle && WT.entities.has(o.vehicle.uid) ? o.vehicle : o.unit && WT.entities.has(o.unit.uid) ? o.unit : null;
        const tone = o.status === 'Delivered' ? 'green' : /Awaiting|In production/.test(o.status) ? 'amber' : 'blue';
        rows += row(carrierEnt ? carrierEnt.uid : o.to.uid, o.id, S.MAT[o.mat].name, `${ic(MI[o.mode])} ${o.qty} t → ${o.to.id}`, o.status, tone, carrierEnt ? esc(carrierEnt.id.replace('MV ', '')) : '');
      }
    } else if (tab === 'supply') {
      const S = WT.SUP;
      for (const f of facs) {
        const bars = f.recipe.in.map((m) => { const p = Math.round(WT.clamp(f.stock[m] / f.cap, 0, 1) * 100); return `<span class="sb" title="${esc(S.MAT[m].name)}"><i class="${p < 15 ? 'low' : p < 40 ? 'mid' : ''}" style="height:${p}%"></i></span>`; }).join('');
        const inb = f.recipe.in.reduce((n, m) => n + S.openCount(f, m), 0);
        const outBar = f.intermediate ? `<span class="sb out"><i style="height:${Math.round((f.outStock / f.outCap) * 100)}%"></i></span>` : '';
        rows += row(f.uid, f.id, f.lineName, `<span class="sbars">${bars}${outBar}</span><small class="muted">${f.recipe.in.map((m) => S.MAT[m].name.split(' ')[0]).join(' · ')}${f.intermediate ? ' → ' + S.MAT[f.recipe.out].name.split(' ')[0] : ''}</small>`, f.starved ? 'Starved' : f.blocked ? 'Output full' : 'Running', f.starved || f.blocked ? 'amber' : 'green', inb ? inb + ' on order' : '');
      }
      for (const t of act.filter((x) => x.type === 'Rail terminal' || x.type === 'Port terminal')) rows += row(t.uid, t.id, t.type, `${t.importCount()} imports · ${t.exportCount()} exports`, t.busy && t.busy !== 'incoming' ? 'Vessel/train in' : 'Open', 'blue', '');
      for (const d of act.filter((x) => x.type === 'Container depot')) rows += row(d.uid, d.id, 'Depot', `${d.count()} empties stored`, 'Open', 'green', '');
      const at = act.find((x) => x.type === 'Air terminal');
      if (at) rows += row(at.uid, at.id, 'Air cargo', `${at.rack.filter((r) => r.u).length} ULDs on landside rack`, 'Open', 'blue', '');
      rows += row('', 'Booked', 'Freight', `${WT.SUP.backlog.sea.length} sea · ${WT.SUP.backlog.rail.length} rail · ${WT.SUP.backlog.air.length} air`, 'Awaiting carrier', 'amber', '');
      const jam = WT.TR.jam, jq = S.dispatchQ.length + S.roadQ.length + S.internalQ.length;
      rows += row('', 'Roads', 'Dispatch', `${Math.round(jam * 100)}% of traffic queued · ${jq} loads waiting`, S.holding ? 'Holding trucks' : jam > 0.3 ? 'Metering' : 'Free flow', S.holding || jam > 0.3 ? 'amber' : 'green', '');
    } else if (tab === 'facilities') {
      for (const f of act.slice().reverse()) rows += row(f.uid, f.id, f.type, esc(f.name), 'Online', 'green', money(f.income * 60 * WT.G.INCOME_SCALE) + '/m');
    } else if (tab === 'fleet') {
      for (const tr of WT.trains) rows += row(tr.uid, tr.id, 'Train', `${dot('#2f56e0')}${tr.operator}`, tr.status, WT.toneFor(tr.status), Math.round(tr.v * 3.6) + ' km/h');
      for (const p of WT.AIR.planes) rows += row(p.uid, p.flight, 'Aircraft', `${dot('#1aa6b7')}${p.from} → ${p.dest}`, p.status, WT.toneFor(p.status), '');
      for (const s of WT.ships) rows += row(s.uid, s.name.replace('MV ', ''), 'Vessel', `${dot('#24336e')}${s.port ? s.port.id : 'At sea'}`, s.status, WT.toneFor(s.status), '');
      for (const t of WT.trucks.filter((x) => x.legs.length).slice(0, 30)) rows += row(t.uid, t.id, t.variant === 'mixer' ? 'Mixer' : 'Truck', `${dot(hex(t.carrier.cab))}${esc(t.mission)}`, t.status, WT.toneFor(t.status), '');
    } else if (tab === 'shipments') {
      for (const s of WT.shipments.slice(0, 18)) {
        const st = WT.STAGES[s.mode][s.stage];
        const uid = s.vehicle && WT.entities.has(s.vehicle.uid) ? s.vehicle.uid : '';
        rows += row(uid, '#' + s.id, s.mode, `${ic(MODE_ICON[s.mode])} ${esc(s.to)}`, st, WT.toneFor(st), s.stage === 2 ? `${s.loaded}/${s.total}` : s.stage === 3 ? 'ETA ' + WT.fmtTime(s.times[4]) : '');
      }
    } else if (tab === 'log') {
      for (const ev of WT.events.slice(0, 20)) rows += `<div class="ev"><span class="ev-dot ${ev.tone}"></span><span class="ev-msg">${esc(ev.msg)}</span><small>${WT.fmtTime(ev.t)}</small></div>`;
    }
    if (!rows) rows = '<div class="empty">Nothing here yet — the park is just getting started</div>';
    setHTML('#docks', `<div class="tabs">${tabs.map(([k, l]) => `<button data-tab="${k}" class="${k === tab ? 'on' : ''}">${l}</button>`).join('')}</div><div class="rows">${rows}</div>`);
  }

  /* ---------- search ---------- */
  function renderSearch() {
    const q = $('#searchInput').value.trim().toLowerCase();
    const box = $('#searchResults');
    const res = [];
    const icon = { pallet: 'package', truck: 'truck', car: 'truck', forklift: 'truck', train: 'train', plane: 'plane', ship: 'ship', container: 'cube', tug: 'truck', facility: 'warehouse' };
    for (const e of WT.entities.values()) {
      if (!e.mesh || !e.mesh.parent) continue;
      if (!q && e.kind !== 'facility') continue;
      const text = (e.label() + ' ' + (e.kind || '') + ' ' + (e.type || '') + ' ' + (e.product ? e.product.name + ' ' + e.product.sku : '') + ' ' + (e.shipment ? e.shipment.id + ' ' + e.shipment.to : '')).toLowerCase();
      if (text.includes(q)) res.push({ uid: e.uid, t: e.label(), k: e.type || e.kind, icon: icon[e.kind] || 'cube' });
      if (res.length > 40) break;
    }
    box.innerHTML = res.length ? res.slice(0, 10).map((r) => `<div class="sr" data-uid="${r.uid}">${ic(r.icon)}<span>${esc(r.t)}</span><small>${esc(r.k)}</small></div>`).join('') : '<div class="sr empty">No matches</div>';
    box.classList.add('open');
  }

  /* ---------- notifications + toasts ---------- */
  function renderNotif() {
    const b = $('#bellBadge');
    b.textContent = unread > 9 ? '9+' : unread || '';
    b.style.display = unread ? '' : 'none';
    if (!$('#notifMenu').classList.contains('open')) return;
    setHTML('#notifMenu', '<div class="dd-title">Activity</div>' + (WT.events.slice(0, 22).map((ev) => `
      <div class="ev"><span class="ev-dot ${ev.tone}"></span><span class="ev-msg">${esc(ev.msg)}</span><small>${WT.fmtTime(ev.t)}</small></div>`).join('') || '<div class="empty">No activity yet</div>'));
  }
  function showToast(ev) {
    const el = document.createElement('div');
    el.className = 'toast ' + ev.tone;
    el.innerHTML = `<span class="ev-dot ${ev.tone}"></span>${esc(ev.msg)}`;
    $('#toasts').prepend(el);
    while ($('#toasts').children.length > 3) $('#toasts').lastChild.remove();
    setTimeout(() => el.classList.add('out'), 3800);
    setTimeout(() => el.remove(), 4300);
  }

  UI.init = () => { shell(); UI.refresh(); };
  UI.refresh = () => {
    renderTop();
    renderExpansion();
    renderTabs();
    if (WT.selected) renderDetail();
    if ($('#notifMenu').classList.contains('open')) renderNotif();
  };
})();
