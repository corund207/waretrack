/* WareTrack – the growth director: economy, project planning and animated construction */
(function () {
  const T = THREE, M = WT.M, W = WT.W, FX = WT.FX;
  const G = (WT.G = { money: 3600000, earned: 0, done: 0, projects: [], history: [], built: [], milestones: [] });

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
    'Steel Mill': 600e3, 'Copper Refinery': 520e3, 'Chemical Plant': 560e3, Sawmill: 340e3, 'Glass Works': 450e3, 'Aluminium Smelter': 580e3,
    'Wire Mill': 380e3, 'Motor Works': 470e3, 'Circuit Fab': 520e3, 'Panel Press': 440e3, 'Moulding Shop': 360e3, 'Frame Shop': 320e3,
    'Iron mine': 380e3, 'Coal mine': 360e3, 'Bauxite mine': 380e3, 'Sand quarry': 300e3, 'Grain farm': 280e3,
    'Container factory': 460e3, 'Gas field': 550e3, 'Off-site empty yard': 420e3, 'Mover depot': 520e3, 'Rail trunk': 900e3, Spine: 420e3, 'Block station': 340e3 };
  const DUR = { Warehouse: 26, Factory: 32, 'Rail line': 30, 'Rail terminal': 28, 'Power plant': 34, 'Port terminal': 34, Airfield: 26,
    'Air terminal': 30, Stand: 14, Tower: 18, Headquarters: 40, 'Solar farm': 16, 'Tank farm': 22, Parking: 12,
    'Container depot': 24, 'Truck stop': 18, Substation: 16, 'Water tower': 20,
    'Steel Mill': 38, 'Copper Refinery': 32, 'Chemical Plant': 34, Sawmill: 24, 'Glass Works': 30, 'Aluminium Smelter': 40,
    'Wire Mill': 26, 'Motor Works': 30, 'Circuit Fab': 32, 'Panel Press': 28, 'Moulding Shop': 24, 'Frame Shop': 22,
    'Iron mine': 24, 'Coal mine': 24, 'Bauxite mine': 24, 'Sand quarry': 20, 'Grain farm': 20,
    'Container factory': 26, 'Gas field': 28, 'Off-site empty yard': 24, 'Mover depot': 22, 'Rail trunk': 70, Spine: 45, 'Block station': 22 };
  const ICON = { Warehouse: '🏬', Factory: '🏭', 'Rail line': '🛤️', 'Rail terminal': '🚉', 'Power plant': '⚡', 'Port terminal': '⚓', Airfield: '🛬',
    'Air terminal': '🛫', Stand: '🛩️', Tower: '📡', Headquarters: '🏢', 'Solar farm': '☀️', 'Tank farm': '🛢️', Parking: '🅿️',
    'Container depot': '🧱', 'Truck stop': '⛽', Substation: '🔌', 'Water tower': '💧',
    'Steel Mill': '🔩', 'Copper Refinery': '🟫', 'Chemical Plant': '⚗️', Sawmill: '🪵', 'Glass Works': '🫙', 'Aluminium Smelter': '🪨',
    'Wire Mill': '🧵', 'Motor Works': '⚙️', 'Circuit Fab': '💾', 'Panel Press': '🛠️', 'Moulding Shop': '🧴', 'Frame Shop': '🪚',
    'Iron mine': '⛏️', 'Coal mine': '⛏️', 'Bauxite mine': '⛏️', 'Sand quarry': '⛏️', 'Grain farm': '🌾',
    'Container factory': '🏭', 'Gas field': '🔥', 'Off-site empty yard': '📦', 'Mover depot': '🤖', 'Rail trunk': '🛤️', Spine: '🛤️', 'Block station': '🚉' };
  G.ICON = ICON;
  const costOf = (type) => Math.round((COST[type] * Math.pow(1.065, G.done)) / 1000) * 1000;

  /* ---------- planning ---------- */
  // The map is built around the rail grid (js/ring.js): the trunks go down first, then a block only opens once its
  // spine is laid, and every block gets its station and its mover depot before anything else is built in it.
  const has = (type, pred = () => true) => WT.facilities.some((f) => f.type === type && pred(f));
  const count = (type) => WT.facilities.filter((f) => f.type === type).length;
  const ring = WT.RING;
  // how many plants (any tier) use material m, and how many plants make it
  const usersOf = (m) => WT.facilities.filter((f) => f.type === 'Factory' && f.recipe.in.includes(m)).length;
  const makersOf = (name) => WT.facilities.filter((f) => f.type === 'Factory' && f.lineName === name).length;
  function project(type, make, extra = {}) {
    if (!Number.isFinite(COST[type]) || !DUR[type] || !ICON[type]) throw new Error('Incomplete project catalogue: ' + type);
    return Object.assign({ type, make, cost: costOf(type), label: type, icon: ICON[type] }, extra);
  }
  const queue = [];
  const spineQueued = new Set();
  const WAIT = 'wait';
  // what a block still needs before anything can be built in it: its spine, its station, its mover depot
  function infra(b) {
    if (!ring.spineBuilt(b.spine)) {
      if (spineQueued.has(b.spine)) return WAIT;
      spineQueued.add(b.spine);
      return project('Spine', null, { spine: b.spine, label: `Spine ${b.spine + 1} · x ${W.SPINES[b.spine]}` });
    }
    if (b.utility) return null;
    if (!b.depot) { b.depot = 'planned'; ring.precinct(b); return project('Block station', () => new WT.BlockStation(b), { label: `Block ${b.key} station` }); }
    if (!b.movers) { b.movers = 'planned'; b.moverPlot.used = 'planned'; return project('Mover depot', () => (b.movers = new WT.MoverDepot(b.moverPlot)), { label: `Block ${b.key} mover depot` }); }
    // an assembly block's export station, on the spine at its far side (laid first if need be)
    if (b.exportPlot && !b.exportDepot && b.depot && b.depot !== 'planned' && b.depot.active) {
      if (!ring.spineBuilt(b.exportSpine)) {
        if (spineQueued.has(b.exportSpine)) return null;
        spineQueued.add(b.exportSpine);
        return project('Spine', null, { spine: b.exportSpine, label: `Spine ${b.exportSpine + 1} · x ${W.SPINES[b.exportSpine]}` });
      }
      b.exportDepot = 'planned';
      return project('Block station', () => new WT.BlockStation(b, true), { label: `Block ${b.key} export station` });
    }
    return null;
  }
  const push = (p) => { queue.push(p); return queue[0]; };
  // queue what the block needs first, then the project itself; null (try something else) while its spine is laid
  function inBlock(b, make) {
    const need = infra(b);
    if (need === WAIT) return null;
    if (need) return push(need);
    return make();
  }
  const count2 = (line) => WT.facilities.filter((f) => f.type === 'Factory' && f.lineName === line).length;
  // utility plots: the free ones in blocks that are already open first, nearest the middle of the map
  function fillerPlot() {
    const open = (b) => !!b.depot || b.fenced;
    const blocks = ring.BLOCKS.filter((b) => ring.spineBuilt(b.spine)).sort((a, b) => (open(b) - open(a)) || Math.abs(a.A) - Math.abs(b.A) || a.h - b.h);
    for (const b of blocks) {
      const p = b.fillers.find((q) => !q.used);
      if (p) return { b, p };
    }
    return null;
  }
  function plan() {
    if (queue.length) return queue[0];
    // round one: the trunks
    if (!ring.built) { if (G.trunkQueued) return null; G.trunkQueued = true; return push(project('Rail trunk', null, { label: 'Rail grid · north and middle trunks' })); }
    const plants = count('Factory');
    // the hinterland once the first plants are running: container works, mines and quarry, the gas field
    if (plants >= 3) {
      if (!has('Container factory')) return push(project('Container factory', () => new WT.ContainerFactory()));
      for (const kind of Object.keys(WT.REMOTE.KINDS)) if (!has(kind)) return push(project(kind, () => new WT.RemoteSite(kind)));
      if (!has('Gas field')) return push(project('Gas field', () => new WT.GasField()));
    }
    // every working assembly block gets its export station
    for (const b of ring.BLOCKS) if (b.exportPlot && !b.exportDepot && b.depot && b.depot !== 'planned' && b.depot.active && b.movers && b.movers !== 'planned') {
      const q = infra(b);
      if (q && q !== WAIT) return push(q);
    }
        // the port's block on the coast once there is enough industry to feed
    if (plants >= 5 && !has('Port terminal')) {
      const pb = ring.BLOCKS.find((b) => b.port);
      const r = inBlock(pb, () => push(project('Port terminal', () => { const f = new WT.Port(pb.A); f.pod = pb; return f; })));
      if (r) return r;
    }
    // upstream industry, tier by tier: a component plant once a line uses its part, a refinery once a plant uses its
    // stock, each on its own plot in its block
    for (const name of WT.SUP.INTERMEDIATE) {
      const r = WT.SUP.PLANTS[name], b = ring.podFor(name);
      if (!usersOf(r.out) || makersOf(name) || !b) continue;
      const p = ring.slotFor(name);
      if (!p) continue;
      const q = inBlock(b, () => { p.used = 'planned'; return push(project(name, () => new WT.Factory(p, null, name), { plot: p, label: name })); });
      if (q) return q;
    }
    // a utility now and then
    G.fillTick = (G.fillTick || 0) + 1;
    if (G.fillTick % 5 === 0) {
      const fp = fillerPlot();
      if (fp) {
        const q = inBlock(fp.b, () => {
          const pw = count('Power plant'), fac = count('Factory');
          const pick = pw < Math.ceil(fac / 4) ? 'Power plant' : !has('Headquarters') ? 'Headquarters' : WT.pick(['Solar farm', 'Tank farm', 'Substation', 'Water tower', 'Solar farm', 'Parking']);
          const cls = { 'Power plant': WT.PowerPlant, 'Solar farm': WT.SolarFarm, 'Tank farm': WT.TankFarm, Parking: WT.Parking, Headquarters: WT.HQ, Substation: WT.Substation, 'Water tower': WT.WaterTower }[pick];
          fp.p.used = 'planned';
          ring.precinct(fp.b);
          return push(project(pick, () => new cls(fp.p), { plot: fp.p }));
        });
        if (q) return q;
      }
    }
    // the next assembly line its block has room for, with its distribution centre if that is not there yet
    for (const line of WT.SUP.ASSEMBLY) {
      if (count2(line) || !ring.slotFor(line)) continue;
      const b = ring.podFor(line);
      const q = inBlock(b, () => {
        const lp = ring.slotFor(line), dp = ring.dcSlot(line);
        if (!dp.used) { dp.used = 'planned'; queue.push(project('Warehouse', () => new WT.Warehouse(dp, WT.pick(['dc', 'cold', 'fulfil', 'bulk', 'dc'])), { plot: dp })); }
        lp.used = 'planned';
        return push(project('Factory', () => new WT.Factory(lp, ring.dcOf(line), line), { plot: lp, label: line + ' Plant' }));
      });
      if (q) return q;
      break; // (one line at a time, in order)
    }
    // the rest of the grid: the spines no block has needed yet
    for (let i = 0; i < W.SPINES.length; i++) if (!ring.spineBuilt(i) && !spineQueued.has(i) && plants >= 12) { spineQueued.add(i); return push(project('Spine', null, { spine: i, label: `Spine ${i + 1} · x ${W.SPINES[i]}` })); }
    // then utilities on every free plot
    const fp = fillerPlot();
    if (fp) {
      const q = inBlock(fp.b, () => { fp.p.used = 'planned'; ring.precinct(fp.b); return push(project('Solar farm', () => new WT.SolarFarm(fp.p), { plot: fp.p })); });
      if (q) return q;
    }
    return null;
  }
  G.next = () => plan();

  /* ---------- construction ---------- */
  function reachOf(f) {
    if (f.plot) return [f.plot.A, f.plot.h, Math.abs(f.plot.zc) + 56];
    if (f.type === 'Port terminal') return [f.A, 1, 574];
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
    // the plot plus a verge: rigs swing their tails a few metres past the gate lanes
    { const b = f.bounds(); W.clearTrees({ x0: b.x0 - 6, x1: b.x1 + 6, z0: b.z0 - 6, z1: b.z1 + 6 }); }
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
        local: { A: f.plot.A, z: f.plot.h * (f.plot.h < 0 ? W.ROAD_START.north : W.ROAD_START.south) },
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
  // track works: the trunks first of all, then a spine whenever a block on it is about to open
  function* trackWorks(p, works, secs, msgStart, msgDone) {
    p.stage = 'Laying track';
    WT.log(msgStart, 'amber', true);
    WT.emit('event', { kind: 'rail-build', weight: 3, project: p });
    const t0 = WT.sim.minutes;
    WT.spawn((function* () { while (p.stage !== 'Online') { p.progress = Math.min(0.99, (WT.sim.minutes - t0) / (secs * WT.sim.MIN_PER_SEC)); yield; } })());
    yield* works;
    p.stage = 'Online';
    p.progress = 1;
    G.done++;
    G.built.push({ id: p.type === 'Spine' ? 'SPINE-' + (p.spine + 1) : 'TRUNK', type: p.type, t: WT.sim.minutes });
    WT.log(msgDone, 'green', true);
    milestone();
  }

  /* ---------- milestones (the 5-step timeline in the UI) ---------- */
  G.PHASES = [
    { key: 'found', name: 'Rail grid', test: () => WT.RING.built },
    { key: 'make', name: 'Manufacturing', test: () => has('Factory', (f) => f.active) },
    { key: 'rail', name: 'Rail freight', test: () => WT.RING.stats.freight > 0 },
    { key: 'sea', name: 'Seaport', test: () => has('Port terminal', (f) => f.active) },
    { key: 'air', name: 'Mining', test: () => WT.RING.stats.ore > 0 },
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
            if (next.type === 'Rail trunk') WT.spawn(trackWorks(next, ring.buildTrunk(), 70, '🛤️ Construction started: the rail grid — north and middle trunks, portals at both map edges', '🛤️ Rail grid open: freight runs in from both map edges'));
            else if (next.type === 'Spine') WT.spawn(trackWorks(next, ring.buildSpine(next.spine), 45, `🛤️ Construction started: spine ${next.spine + 1}, with its junctions, viaduct and stabling yard`, `🛤️ Spine ${next.spine + 1} open`));
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
