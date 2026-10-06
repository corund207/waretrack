/* WareTrack – the growth director: economy, project planning and animated construction */
(function () {
  const T = THREE, M = WT.M, W = WT.W, FX = WT.FX;
  const G = (WT.G = { money: 1200000, earned: 0, done: 0, projects: [], history: [], built: [], milestones: [] });

  G.INCOME_SCALE = 0.5;
  G.earn = (amt) => { amt *= G.INCOME_SCALE; G.money += amt; G.earned += amt; };
  G.powerUp = () => {
    const xs = Object.keys(W.av).map(Number).filter((A) => A !== 900);
    if (xs.length) W.extendPylons(Math.min(...xs) - 60, Math.max(...xs) + 60);
  };

  /* ---------- catalogue ---------- */
  const COST = { Warehouse: 380e3, Factory: 390e3, 'Rail line': 900e3, 'Rail terminal': 750e3, 'Power plant': 600e3, 'Port terminal': 1.1e6,
    Airfield: 1.4e6, 'Air terminal': 1.0e6, Stand: 500e3, Tower: 300e3, Headquarters: 900e3, 'Solar farm': 300e3, 'Tank farm': 450e3, Parking: 200e3,
    'Container depot': 650e3, 'Truck stop': 350e3, Substation: 280e3, 'Water tower': 220e3,
    'Steel Mill': 600e3, 'Copper Refinery': 520e3, 'Chemical Plant': 560e3, Sawmill: 340e3, 'Glass Works': 450e3 };
  const DUR = { Warehouse: 26, Factory: 32, 'Rail line': 30, 'Rail terminal': 28, 'Power plant': 34, 'Port terminal': 34, Airfield: 26,
    'Air terminal': 30, Stand: 14, Tower: 18, Headquarters: 40, 'Solar farm': 16, 'Tank farm': 22, Parking: 12,
    'Container depot': 24, 'Truck stop': 18, Substation: 16, 'Water tower': 20,
    'Steel Mill': 38, 'Copper Refinery': 32, 'Chemical Plant': 34, Sawmill: 24, 'Glass Works': 30 };
  const ICON = { Warehouse: '🏬', Factory: '🏭', 'Rail line': '🛤️', 'Rail terminal': '🚉', 'Power plant': '⚡', 'Port terminal': '⚓', Airfield: '🛬',
    'Air terminal': '🛫', Stand: '🛩️', Tower: '📡', Headquarters: '🏢', 'Solar farm': '☀️', 'Tank farm': '🛢️', Parking: '🅿️',
    'Container depot': '🧱', 'Truck stop': '⛽', Substation: '🔌', 'Water tower': '💧',
    'Steel Mill': '🔩', 'Copper Refinery': '🧵', 'Chemical Plant': '⚗️', Sawmill: '🪵', 'Glass Works': '🫙' };
  G.ICON = ICON;
  const costOf = (type) => Math.round((COST[type] * Math.pow(1.065, G.done)) / 1000) * 1000;

  /* ---------- planning ---------- */
  const usedOn = (A) => W.plots.filter((p) => p.A === A && p.used).length;
  const has = (type, pred = () => true) => WT.facilities.some((f) => f.type === type && pred(f));
  const count = (type) => WT.facilities.filter((f) => f.type === type).length;
  function freePair() {
    for (const A of W.AVENUES) for (let k = 0; k < W.PLOT_K - 1; k++) for (const h of [-1, 1]) for (const s of [1, -1]) {
      const a = W.plotAt(A, s, h, k), b = W.plotAt(A, s, h, k + 1);
      if (a && b && !a.used && !b.used) return [a, b];
    }
    return null;
  }
  function freePlot() {
    for (const A of W.AVENUES) for (let k = 0; k < W.PLOT_K; k++) for (const h of [-1, 1]) for (const s of [1, -1]) {
      const p = W.plotAt(A, s, h, k);
      if (p && !p.used) return p;
    }
    return null;
  }
  function project(type, make, extra = {}) {
    return Object.assign({ type, make, cost: costOf(type), label: type, icon: ICON[type] }, extra);
  }
  const queue = [];
  function plan() {
    if (queue.length) return queue[0];
    const A0 = -120, plots = (A, s, h, k) => W.plotAt(A, s, h, k);
    const script = [
      () => project('Warehouse', () => new WT.Warehouse(plots(A0, 1, -1, 0), 'dc')),
      () => project('Factory', () => new WT.Factory(plots(A0, 1, -1, 1), find('WH-01'), 'Appliances')),
      () => project('Warehouse', () => new WT.Warehouse(plots(A0, -1, -1, 0), 'bulk')),
      () => project('Factory', () => new WT.Factory(plots(A0, -1, -1, 1), find('WH-02'), 'Auto Parts')),
      () => project('Rail line', null),
      () => project('Rail terminal', () => new WT.RailTerminal(A0)),
      () => project('Steel Mill', () => new WT.Factory(plots(A0, 1, -1, 2), null, 'Steel Mill')),
      () => project('Container depot', () => new WT.Depot(plots(A0, -1, 1, 0))),
      () => project('Power plant', () => new WT.PowerPlant(plots(A0, 1, 1, 0))),
      () => project('Warehouse', () => new WT.Warehouse(plots(120, 1, -1, 0), 'fulfil')),
      () => project('Factory', () => new WT.Factory(plots(120, 1, -1, 1), find('WH-03'), 'Electronics')),
      () => project('Truck stop', () => new WT.TruckStop(plots(120, -1, 1, 0))),
      () => project('Port terminal', () => new WT.Port(A0)),
      () => project('Chemical Plant', () => new WT.Factory(plots(A0, -1, -1, 2), null, 'Chemical Plant')),
      () => project('Copper Refinery', () => new WT.Factory(plots(120, 1, -1, 2), null, 'Copper Refinery')),
      () => project('Airfield', () => new WT.Airfield()),
      () => project('Air terminal', () => new WT.AirTerminal()),
      () => project('Stand', () => new WT.Stand(1)),
      () => project('Headquarters', () => new WT.HQ(plots(120, -1, -1, 0))),
      () => project('Tower', () => new WT.Tower()),
    ];
    if (G.scriptIdx === undefined) G.scriptIdx = 0;
    if (G.scriptIdx < script.length) { queue.push(script[G.scriptIdx++]()); return queue[0]; }
    // procedural growth
    const stands = count('Stand'), plotFacs = WT.facilities.filter((f) => f.plot).length;
    if (stands < WT.AIR.standXs.length && plotFacs >= 6 + stands * 4) { queue.push(project('Stand', () => new WT.Stand(stands + 1))); return queue[0]; }
    if (W.railBuilt) for (const A of W.AVENUES) {
      if (usedOn(A) >= 3 && !has('Rail terminal', (f) => f.A === A) && !(A === 600)) { queue.push(project('Rail terminal', () => new WT.RailTerminal(A))); return queue[0]; }
    }
    for (const A of W.AVENUES) {
      if (usedOn(A) >= 4 && !has('Port terminal', (f) => f.A === A)) { queue.push(project('Port terminal', () => new WT.Port(A))); return queue[0]; }
    }
    // upstream industry: build a primary plant once enough assembly lines depend on its output
    for (const name of WT.SUP.INTERMEDIATE) {
      const out = WT.SUP.PLANTS[name].out;
      const consumers = WT.facilities.filter((f) => f.type === 'Factory' && !f.intermediate && f.recipe.in.includes(out)).length;
      const producers = WT.facilities.filter((f) => f.type === 'Factory' && f.lineName === name).length;
      if (consumers && consumers > producers * 2) {
        const p = freePlot();
        if (p) { p.used = 'planned'; queue.push(project(name, () => new WT.Factory(p, null, name), { plot: p })); return queue[0]; }
      }
    }
    G.fillTick = (G.fillTick || 0) + 1;
    if (G.fillTick % 6 === 0) {
      const p = freePlot();
      if (p) {
        const pw = count('Power plant'), fac = count('Factory');
        const deps = count('Container depot'), stops = count('Truck stop');
        const pick = pw < Math.ceil(fac / 4) ? 'Power plant' : deps < Math.ceil(fac / 8) ? 'Container depot' : stops < Math.ceil(fac / 10) ? 'Truck stop'
          : WT.pick(['Solar farm', 'Tank farm', 'Parking', 'Substation', 'Water tower', 'Solar farm']);
        const cls = { 'Power plant': WT.PowerPlant, 'Solar farm': WT.SolarFarm, 'Tank farm': WT.TankFarm, Parking: WT.Parking, 'Container depot': WT.Depot,
          'Truck stop': WT.TruckStop, Substation: WT.Substation, 'Water tower': WT.WaterTower }[pick];
        queue.push(project(pick, () => new cls(p), { plot: p }));
        p.used = 'planned';
        return queue[0];
      }
    }
    const pair = freePair();
    if (pair) {
      pair[0].used = pair[1].used = 'planned';
      let wh = null;
      queue.push(project('Warehouse', () => (wh = new WT.Warehouse(pair[0], WT.pick(['dc', 'cold', 'fulfil', 'bulk', 'dc'])))));
      const lines = WT.SUP.ASSEMBLY.slice().sort((x, y) => count2(x) - count2(y) + (Math.random() - 0.5));
      const line = lines[0];
      queue.push(project('Factory', () => new WT.Factory(pair[1], wh, line), { label: line + ' Plant' }));
      // industrial cluster: every other new assembly line also brings a supplier plant for its scarcest input
      if (Math.random() < 0.5) {
        const need = WT.SUP.INTERMEDIATE.map((name) => {
          const out = WT.SUP.PLANTS[name].out;
          const users = WT.facilities.filter((f) => f.type === 'Factory' && !f.intermediate && f.recipe.in.includes(out)).length + (WT.SUP.PLANTS[line].in.includes(out) ? 1 : 0);
          return { name, gap: users - count2(name) * 2 };
        }).sort((a, b) => b.gap - a.gap)[0];
        const p = need && need.gap > 0 && freePlot();
        if (p) { p.used = 'planned'; queue.push(project(need.name, () => new WT.Factory(p, null, need.name), { plot: p })); }
      }
      return queue[0];
    }
    const p = freePlot();
    if (p) {
      p.used = 'planned';
      queue.push(project('Warehouse', () => new WT.Warehouse(p)));
      return queue[0];
    }
    return null;
  }
  const find = (id) => WT.facilities.find((f) => f.id === id);
  const count2 = (line) => WT.facilities.filter((f) => f.type === 'Factory' && f.lineName === line).length;
  G.next = () => plan();

  /* ---------- construction ---------- */
  function reachOf(f) {
    if (f.plot) return [f.plot.A, f.plot.h, Math.abs(f.plot.zc) + 56];
    if (f.type === 'Rail terminal') return [f.A, -1, 592];
    if (f.type === 'Port terminal') return [f.A, 1, 574];
    if (f.type === 'Airfield') return [900, -1, 352];
    return null;
  }
  function scaffold(site) {
    const pts = [];
    const { w, d, h } = site, x0 = -w / 2 - 1, x1 = w / 2 + 1, z0 = -d / 2 - 1, z1 = d / 2 + 1;
    const seg = (a, b) => pts.push(new T.Vector3(...a), new T.Vector3(...b));
    for (let y = 0; y <= h + 1; y += 3) { seg([x0, y, z0], [x1, y, z0]); seg([x1, y, z0], [x1, y, z1]); seg([x1, y, z1], [x0, y, z1]); seg([x0, y, z1], [x0, y, z0]); }
    for (let x = x0; x <= x1; x += 6) { seg([x, 0, z0], [x, h + 1, z0]); seg([x, 0, z1], [x, h + 1, z1]); }
    for (let z = z0; z <= z1; z += 6) { seg([x0, 0, z], [x0, h + 1, z]); seg([x1, 0, z], [x1, h + 1, z]); }
    const g = new T.LineSegments(new T.BufferGeometry().setFromPoints(pts), new T.LineBasicMaterial({ color: 0xf08c2a, transparent: true, opacity: 0.85 }));
    g.position.set(site.x, 0, site.z);
    return g;
  }
  // a pseudo-facility so mixer trucks can visit a plot under construction
  // where construction trucks may park: the facility's own dock bays, else a strip just inside the gate
  function siteSpots(f) {
    if (f.docks && f.docks.length && f.inPath && f.plot && !f.dockPath) return f.docks.map((d) => ({ inP: () => f.inPath(d), outP: () => f.outPath(d), gi: f.gateIn, go: f.gateOut }));
    const gi = { A: f.plot.A, z: f.toWorld(0, 46)[1] }, go = { A: f.plot.A, z: f.toWorld(0, -46)[1] };
    return [{ inP: () => [[0, 46], [4, 40], [4, 12]].map(([x, z]) => f.toWorld(x, z)), outP: () => [[4, 12], [4, -40], [0, -46]].map(([x, z]) => f.toWorld(x, z)), gi, go }];
  }
  function siteStop(f, spot) {
    return {
      id: f.id, gateIn: spot.gi, gateOut: spot.go, inPath: spot.inP, outPath: spot.outP,
      reserve: () => ({}), release() { spot.busy = false; },
      *serve(t) {
        t.status = t.variant === 'dump' ? 'Loading spoil' : 'Pouring concrete'; t.where = f.id + ' site';
        const drum = t.mesh.userData.drum;
        yield* WT.tween(WT.rnd(4, 6), () => { if (drum) drum.rotation.x += WT.sim.dt * 6; });
      },
    };
  }
  function* construct(p) {
    const f = p.fac;
    p.stage = 'Surveying';
    WT.emit('event', { kind: 'construct', ent: f, weight: 3, project: p });
    WT.log(`${p.icon} Construction started: ${f.id} ${p.label}`, 'amber', true);
    const reach = reachOf(f);
    if (reach) { p.stage = 'Paving access road'; yield* W.extendAvenue(...reach); }
    p.stage = 'Clearing site';
    W.clearTrees(f.bounds());
    f.build();
    const S = f.structure, sweep = f.mode === 'sweep';
    if (sweep) S.scale.x = 0.001; else S.scale.y = 0.001;
    yield* WT.sleep(1.2);
    const site = f.site;
    let crane = null, scaff = null;
    if (!sweep && site) {
      crane = M.towerCrane(Math.max(24, site.h + 14));
      const cx = site.x - site.w / 2 - 5, cz = site.z - site.d / 2 - 5;
      crane.group.position.set(cx, 0, cz);
      crane.group.scale.y = 0.01;
      f.group.add(crane.group);
      p.craneAng = Math.atan2(-(site.z - cz), site.x - cx);
      scaff = scaffold(site);
      scaff.scale.y = 0.01;
      f.group.add(scaff);
      yield* WT.tween(1.6, (t) => (crane.group.scale.y = Math.max(0.01, WT.ease(t))));
    }
    if (f.plot) WT.spawn((function* () {
      const spots = siteSpots(f);
      for (let i = 0; i < (G.done < 12 ? 4 : 2); i++) {
      let spot;
      while (!(spot = spots.find((s) => !s.busy))) yield* WT.sleep(1);
      spot.busy = true;
      const dump = i === 0 || i === 3;
      const t = new WT.Truck({ variant: dump ? 'dump' : 'mixer', legs: [{ fac: siteStop(f, spot), op: 'build', dock: {} }], mission: (dump ? 'Spoil haul · ' : 'Concrete pour · ') + f.id,
        spawnX: f.plot.A + (Math.random() < 0.5 ? -1 : 1) * WT.rnd(160, 240),
        carrier: dump ? { name: 'Riverside Earthworks', cab: 0xf0b429, stripe: 0xf0b429 } : { name: 'Riverside Ready-Mix', cab: 0xf08c2a, stripe: 0xf08c2a } });
      t.busy = true;
      WT.spawn(WT.runTruck(t));
      yield* WT.sleep(4);
      }
    })());
    const D = (DUR[p.type] || 24) * 1.35;
    const dustSrc = new T.Object3D();
    if (site) { dustSrc.position.set(site.x, 0.5, site.z); f.group.add(dustSrc); }
    let tAcc = 0;
    p.stage = sweep ? 'Laying pavement' : 'Raising structure';
    yield* WT.tween(D, (k) => {
      p.progress = k;
      const e = sweep ? WT.ease(k) : Math.min(1, Math.floor(WT.ease(k) * 14) / 14 + 0.02);
      if (sweep) S.scale.x = Math.max(0.001, e); else S.scale.y = Math.max(0.001, e);
      if (scaff) scaff.scale.y = Math.min(1, Math.max(0.01, e + 0.08));
      if (crane) {
        const tt = WT.sim.minutes * 2;
        crane.slew.rotation.y = p.craneAng + Math.sin(tt * 1.3) * 0.5;
        crane.set(12 + 10 * (0.5 + 0.5 * Math.sin(tt * 2.1)), 6 + 8 * (0.5 + 0.5 * Math.sin(tt * 1.7)));
      }
      tAcc += WT.sim.dt;
      if (site && tAcc > 0.35) {
        tAcc = 0;
        const v = new T.Vector3();
        dustSrc.getWorldPosition(v);
        FX.puff(v.x + WT.rnd(-site.w / 2, site.w / 2), 0.5, v.z + WT.rnd(-site.d / 2, site.d / 2), { color: 0xe6d9c4, size0: 3, size1: 9, life: 3, vy: 1.5, op: 0.5 });
      }
    });
    p.stage = 'Commissioning';
    if (sweep) S.scale.x = 1; else S.scale.y = 1;
    if (scaff) f.group.remove(scaff);
    if (crane) yield* WT.tween(1.2, (t) => (crane.group.scale.y = Math.max(0.01, 1 - WT.ease(t))));
    if (crane) f.group.remove(crane.group);
    f.activate();
    if (f.type === 'Factory' || f.type === 'Warehouse') {
      for (const o of WT.facilities) if (o.type === 'Factory' && o.partner === f && o.active) o.connectPartner();
    }
    if (WT.facilities.some((x) => x.type === 'Power plant' && x.active)) G.powerUp();
    G.done++;
    G.built.push({ id: f.id, type: p.type, t: WT.sim.minutes });
    p.stage = 'Online';
    p.progress = 1;
    WT.log(`${p.icon} ${f.id} ${f.name} is online`, 'green', true);
    WT.emit('event', { kind: 'built', ent: f, weight: 4 });
    milestone(f);
  }
  function* buildRailLine(p) {
    p.stage = 'Laying track';
    WT.log('🛤️ Construction started: Northern rail line', 'amber', true);
    WT.emit('event', { kind: 'rail-build', weight: 3, project: p });
    const t0 = WT.sim.minutes;
    WT.spawn((function* () { while (p.stage !== 'Online') { p.progress = Math.min(0.99, (WT.sim.minutes - t0) / (30 * WT.sim.MIN_PER_SEC)); yield; } })());
    yield* W.buildRail();
    p.stage = 'Online';
    p.progress = 1;
    G.done++;
    G.built.push({ id: 'RAIL-LINE', type: 'Rail line', t: WT.sim.minutes });
    WT.log('🛤️ Northern rail line open to freight', 'green', true);
    WT.startRail();
  }

  /* ---------- milestones (the 5-step timeline in the UI) ---------- */
  G.PHASES = [
    { key: 'found', name: 'Founded', test: () => has('Warehouse', (f) => f.active) },
    { key: 'make', name: 'Manufacturing', test: () => has('Factory', (f) => f.active) },
    { key: 'rail', name: 'Rail freight', test: () => has('Rail terminal', (f) => f.active) },
    { key: 'sea', name: 'Seaport', test: () => has('Port terminal', (f) => f.active) },
    { key: 'air', name: 'Air cargo', test: () => has('Stand', (f) => f.active) },
    { key: 'metro', name: 'Mega hub', test: () => WT.facilities.filter((f) => f.active).length >= 40 },
  ];
  function milestone() {
    for (const ph of G.PHASES) {
      if (!G.milestones.includes(ph.key) && ph.test()) {
        G.milestones.push(ph.key);
        ph.t = WT.sim.minutes;
        WT.log(`🏆 Milestone reached: ${ph.name}`, 'green', true);
      }
    }
  }
  G.phase = () => G.milestones.length;

  /* ---------- director loop ---------- */
  G.start = function () {
    WT.spawn((function* () {
      let acc = 0, last = G.earned;
      while (true) {
        const dt = WT.sim.dt;
        let inc = 0;
        for (const f of WT.facilities) if (f.active) inc += f.income;
        inc *= G.INCOME_SCALE;
        G.money += inc * dt;
        G.earned += inc * dt;
        acc += dt;
        if (acc >= 3) {
          G.history.push((G.earned - last) / acc);
          if (G.history.length > 40) G.history.shift();
          last = G.earned;
          acc = 0;
        }
        const building = G.projects.filter((p) => p.stage !== 'Online').length;
        const maxActive = G.done < 6 ? 1 : G.done < 25 ? 2 : 3;
        if (building < maxActive) {
          const next = plan();
          if (next && G.money >= next.cost) {
            queue.shift();
            G.money -= next.cost;
            next.stage = 'Queued';
            next.progress = 0;
            next.started = WT.sim.minutes;
            G.projects.unshift(next);
            if (G.projects.length > 30) G.projects.pop();
            if (next.type === 'Rail line') WT.spawn(buildRailLine(next));
            else {
              next.fac = next.make();
              next.label = next.fac.name;
              WT.spawn(construct(next));
            }
          }
        }
        yield;
      }
    })());
  };
  G.rate = () => (G.history.length ? G.history.slice(-5).reduce((a, b) => a + b, 0) / Math.min(5, G.history.length) : 0);
})();
