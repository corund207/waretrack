/* WareTrack – the hinterland: decentralised production outside the park.
   West of the park a branch line serves remote sites — iron, coal and bauxite mines, a sand quarry and a grain
   farm — whose output is loaded into open-top boxes and railed to the park's intermodal yards. East of the park a
   gas field feeds a pipeline (the park's newest way of moving freight), and an off-site empty-container yard takes
   the park's surplus empties away on repositioning trains. */
(function () {
  const T = THREE, M = WT.M, W = WT.W, FX = WT.FX, CR = WT.CraneOps;
  const BR = -688;            // branch / spur track line, north of the mainline
  const SITE_Z = -758;        // remote sites sit north of the branch line
  const PIPE_Z = -700, PIPE_Y = 6.5;
  const R = (WT.REMOTE = { branch: false, spur: false, trunk: false, mergeW: [-950, -830], divergeE: [1330, 1450] });
  const X_OUT = () => W.EDGE + 400;
  const RAIL = () => W.RAIL;

  /* ================= track: west mine branch, east off-site spur ================= */
  function trackSeg(g, b, sl, x0, z0, x1, z1) {
    const L = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(z1 - z0, x1 - x0), nx = -Math.sin(ang), nz = Math.cos(ang);
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    const bal = new T.Mesh(new T.PlaneGeometry(L + 4, 6).rotateX(-Math.PI / 2), M.mat(W.COL.ballast));
    bal.position.set(mx, 0.026, mz); bal.rotation.y = -ang; bal.receiveShadow = true;
    g.add(bal);
    for (const o of [-0.75, 0.75]) b.boxC(L, 0.25, 0.22, 0x6a7194, mx + nx * o, 0.17, mz + nz * o, 0, -ang, 0);
    W.dashLine(sl, x0, z0, x1, z1, 0.5, 1.2, 3.4);
  }
  R.buildBranch = () => {
    if (R.branch) return;
    R.branch = true;
    const g = new T.Group(), b = new M.MB(), sl = [];
    const [mx0, mx1] = R.mergeW;
    trackSeg(g, b, sl, -W.EDGE - 400, BR, mx0, BR);
    trackSeg(g, b, sl, mx0, BR, mx1, RAIL().zE);
    W.dashes(g, sl, 0xa49c90, 0.06);
    g.add(b.mesh(false, true));
    WT.scene.add(g);
    W.clearTrees({ x0: -W.EDGE - 420, x1: mx1 + 10, z0: BR - 8, z1: BR + 8 });
  };
  R.buildSpur = () => {
    if (R.spur) return;
    R.spur = true;
    const g = new T.Group(), b = new M.MB(), sl = [];
    const [dx0, dx1] = R.divergeE;
    trackSeg(g, b, sl, dx0, RAIL().zE, dx1, BR);
    trackSeg(g, b, sl, dx1, BR, X_OUT(), BR);
    W.dashes(g, sl, 0xa49c90, 0.06);
    g.add(b.mesh(false, true));
    WT.scene.add(g);
    W.clearTrees({ x0: dx0 - 10, x1: X_OUT() + 20, z0: BR - 8, z1: BR + 8 });
  };

  /* ================= remote trains (mine trains, empty repositioning trains) ================= */
  // any train car within 3 m of this z, ahead of x (eastbound) and closer than `gap`
  function gapAhead(tr, hx, hz) {
    let best = Infinity;
    for (const o of WT.trains) {
      if (o === tr) continue;
      for (const c of o.cars) {
        const p = c.g.position;
        if (Math.abs(p.z - hz) < 3 && p.x > hx) best = Math.min(best, p.x - hx);
      }
    }
    return best;
  }
  const mainClear = (x0, x1) => WT.trains.every((o) => o.cars.every((c) => Math.abs(c.g.position.z - RAIL().zE) > 3 || c.g.position.x < x0 || c.g.position.x > x1));
  // drive a train along pts, stopping at each stop ({ at(p): bool, fn: generator }) in order
  function* runOn(tr, pts, stops) {
    tr.path = WT.buildPath(pts, 30);
    for (const st of stops) {
      st.s = null;
      for (let s = 0; s < tr.path.len; s += 1) if (st.at(tr.path.at(s))) { st.s = s; break; }
    }
    let s = 0, v = 14, k = 0;
    tr.place(0);
    while (s - 13 * tr.cars.length < tr.path.len) {
      const dt = WT.sim.dt;
      let target = 22;
      const st = stops[k];
      if (st && st.s !== null) target = Math.min(target, Math.sqrt(2 * 1.0 * Math.max(0, st.s - s)) + 0.2);
      const h = tr.cars[0].g.position, gap = gapAhead(tr, h.x, h.z);
      if (gap < 160) target = Math.min(target, Math.sqrt(2 * 2 * Math.max(0, gap - 30)));
      v += WT.clamp(target - v, -3 * dt, 2.2 * dt);
      tr.v = v;
      s += v * dt;
      if (st && st.s !== null && s >= st.s - 0.05) {
        s = st.s; v = 0; tr.v = 0;
        tr.place(s);
        yield* st.fn(tr);
        k++;
      }
      tr.place(s);
      yield;
    }
    tr.remove();
  }
  const terminalStop = (term, tr) => ({
    at: (p) => p.x >= term.A + 6.5 * tr.cars.length && Math.abs(p.z - term.sidingZ(tr.siding)) < 0.5,
    fn: function* (t) { yield* term.trainCall(t); t.status = t.empties ? 'Empties bound for the off-site yard' : 'Departing'; },
  });

  // Collect manufactured empty boxes first, carry them to the site, then rail those same boxes to the park.
  R.mineTrain = function (site, term, manifest) {
    const factory = R.containerFactory();
    if (!factory || factory.trainBusy || !manifest.length || factory.available(site.mat) < manifest.length) throw new Error('Mine train requires manufactured empty containers');
    const boxes = factory.reserve(site.mat, manifest.length);
    factory.trainBusy = true;
    site.trainBusy = true;
    const tr = new WT.Train({ terminal: term, wagons: manifest.length, manifest: [], operator: site.k.operator });
    term.bookSiding(tr, manifest.length);
    tr.track = 'E';
    tr.origin = site;
    tr.status = 'Collecting manufactured empties for ' + site.id;
    const X = X_OUT();
    const [mx0, mx1] = R.mergeW;
    const pts = [[-X, BR], [mx0, BR], [mx1, RAIL().zE], ...term.sidingLeg(tr.siding), [X, RAIL().zE]];
    const stops = [
      { at: (p) => p.x >= factory.x + 6.5 * tr.cars.length && Math.abs(p.z - BR) < 0.5, fn: function* (t) { yield* factory.loadEmpties(t, boxes, site); } },
      { at: (p) => p.x >= site.x + 6.5 * tr.cars.length && Math.abs(p.z - BR) < 0.5, fn: function* (t) { yield* site.loadTrain(t, manifest); site.trainBusy = false; t.status = 'Loaded · bound for ' + term.id; } },
      { at: (p) => p.x >= mx0 - 70 && Math.abs(p.z - BR) < 0.5, fn: function* (t) { t.status = 'Waiting to join mainline'; yield* WT.waitFor(() => mainClear(mx0 - 450, mx1 + 140)); t.status = 'Bound for ' + term.id; } },
      terminalStop(term, tr),
    ];
    WT.spawn(runOn(tr, pts, stops));
    return tr;
  };
  // an empty-repositioning train: collects empties at a park yard and takes them to the off-site empty yard
  R.emptyTrain = function (term, yard) {
    yard.trainBusy = true;
    const tr = new WT.Train({ terminal: term, wagons: Math.min(10, term.emptyCount()), manifest: [], operator: 'Boxline Repositioning' });
    term.bookSiding(tr, 0);
    tr.track = 'E';
    tr.empties = true;
    const X = X_OUT();
    const [dx0, dx1] = R.divergeE;
    const pts = [[term.A - 800, RAIL().zE], ...term.sidingLeg(tr.siding), [dx0, RAIL().zE], [dx1, BR], [X, BR]];
    const stops = [terminalStop(term, tr), { at: (p) => p.x >= yard.x + 6.5 * tr.cars.length && Math.abs(p.z - BR) < 0.5, fn: function* (t) { yield* yard.unloadTrain(t); yard.trainBusy = false; } }];
    WT.spawn(runOn(tr, pts, stops));
    return tr;
  };

  /* ================= off-site material-specific container manufacture ================= */
  R.containerFactory = () => WT.facilities.find((f) => f.type === 'Container factory' && f.active);
  class ContainerFactory extends WT.Facility {
    constructor() {
      super('Container factory', 'BOX', 'Westbranch Container Works', null);
      this.x = -1990; this.cz = -708;
      this.income = 9000; this.trainBusy = false;
      this.made = 0; this.sent = 0;
      this.site = { x: -2020, z: -760, w: 60, d: 42, h: 12, world: true };
      this.docks = [];
      this.slots = [];
      Object.values(R.KINDS).forEach((k, i) => {
        for (let j = 0; j < 5; j++) this.slots.push({ mat: k.mat, x: -2012 + j * 12.6, z: -706 - i * 4, items: [] });
      });
    }
    center() { return [this.x, -746]; }
    bounds() { return { x0: -2070, x1: -1890, z0: -800, z1: BR + 4 }; }
    radius() { return 100; }
    available(mat) { return this.slots.filter((s) => s.mat === mat).reduce((n, s) => n + s.items.filter((c) => !c.reserved).length, 0); }
    build() {
      R.buildBranch();
      W.flat(this.group, 180, 110, W.COL.concrete, this.x, -744, 0.024);
      M.block(this.structure, { x: -2020, z: -760, w: 60, d: 42, h: 12 });
      this.crane = M.gantry(44, 17);
      this.crane.group.rotation.y = Math.PI / 2;
      this.crane.group.position.set(this.x, 0, this.cz);
      this.structure.add(this.crane.group);
      W.groundText(this.group, 'CONTAINER WORKS', this.x, -790, 70, 6, '#6a7194', 0, 50);
    }
    activate() { super.activate(); WT.spawn(this.manufacture()); }
    *manufacture() {
      let next = 0;
      const mats = Object.values(R.KINDS).map((k) => k.mat);
      while (true) {
        yield* WT.sleep(0.5);
        const mat = mats[next++ % mats.length];
        const s = this.slots.find((q) => q.mat === mat && q.items.length < 3 && !q.loading && !q.items.some((c) => c.reserved));
        if (!s) continue;
        const c = WT.SUP.newContainer(11, mat);
        WT.SUP.empty(c);
        c.manufacturer = this.id;
        c.status = 'Empty · manufactured'; c.loc = this.id;
        c.mesh.position.set(s.x, s.items.length * 2.7, s.z);
        WT.scene.add(c.mesh); s.items.push(c);
        WT.SUP.note(c, `Manufactured at ${this.id} for ${WT.SUP.MAT[mat].name}`);
        this.made++;
      }
    }
    reserve(mat, n) {
      const boxes = [];
      for (const s of this.slots.filter((q) => q.mat === mat)) {
        for (const c of [...s.items].reverse()) if (!c.reserved && boxes.length < n) { c.reserved = true; boxes.push(c); }
      }
      return boxes;
    }
    *loadEmpties(tr, boxes, site) {
      tr.status = 'Collecting ' + WT.SUP.MAT[site.mat].name + ' empties at ' + this.id;
      const p = new T.Vector3();
      for (let i = 0; i < boxes.length; i++) {
        const c = boxes[i], car = tr.cars[i + 1];
        const s = this.slots.find((q) => q.items.includes(c));
        if (!s || s.items[s.items.length - 1] !== c) throw new Error('Container factory stack order violated');
        s.loading = true;
        car.g.getWorldPosition(p);
        const m = yield* CR.move(this.crane, c.mesh, { x: s.x, t: this.cz - s.z, top: s.items.length * 2.7 }, { x: p.x, t: this.cz - p.z, base: 1.45 }, 12.5, 11);
        s.items.pop(); s.loading = false;
        car.g.userData.slot.attach(m);
        m.position.set(0, 0, 0); m.rotation.set(0, 0, 0);
        car.cont = c; c.reserved = false;
        c.status = 'Empty · on rail'; c.loc = tr.id;
        WT.SUP.note(c, `Shipped empty on ${tr.id} to ${site.id}`);
        this.sent++;
      }
      this.trainBusy = false;
      tr.status = 'Empty containers bound for ' + site.id;
    }
    card() {
      return this.cardBase({
        kicker: 'Remote site · Container factory', icon: '🏭', sub: 'Material-specific open-top boxes · supplied by rail', where: this.trainBusy ? 'Loading empty containers' : 'Manufacturing empties',
        rows: [['Manufactured', String(this.made)], ['Shipped empty', String(this.sent)], ...Object.values(R.KINDS).map((k) => [WT.SUP.MAT[k.mat].name + ' empties', String(this.available(k.mat))])],
      });
    }
  }
  WT.ContainerFactory = ContainerFactory;

  /* ================= remote production sites ================= */

  const KINDS = {
    'Grain farm': { prefix: 'FARM', mat: 'grain', x: -1750, rate: 2.0, name: 'Prairie Grain Co-op', operator: 'Prairie Grain Rail', ground: 0xe8dcb4 },
    'Iron mine': { prefix: 'MINE', mat: 'iron', x: -1560, rate: 2.2, name: 'Red Ridge Iron Mine', operator: 'Ridgeline Mining', ground: 0xd9b9a6 },
    'Coal mine': { prefix: 'MINE', mat: 'coal', x: -1380, rate: 2.2, name: 'Blackwater Colliery', operator: 'Ridgeline Mining', ground: 0xc9c6d2 },
    'Bauxite mine': { prefix: 'MINE', mat: 'bauxite', x: -1210, rate: 2.0, name: 'Sienna Bauxite Pit', operator: 'Ridgeline Mining', ground: 0xe2b9a2 },
    'Sand quarry': { prefix: 'QRY', mat: 'sand', x: -1050, rate: 2.0, name: 'Silverbank Sand Quarry', operator: 'Silverbank Aggregates', ground: 0xeee2c4 },
  };
  R.KINDS = KINDS;
  R.siteFor = (mat) => WT.facilities.find((f) => f.remote && f.active && f.mat === mat);

  class RemoteSite extends WT.Facility {
    constructor(kind) {
      const k = KINDS[kind];
      super(kind, k.prefix, k.name, null);
      this.k = k;
      this.remote = true;
      this.mat = k.mat;
      this.x = k.x;
      this.stock = 120; this.cap = 400;
      this.shipped = 0; this.trainsLoaded = 0; this.emptiesReceived = 0;
      this.trainBusy = false;
      this.income = 11000;
      this.site = { x: k.x - 20, z: SITE_Z, w: 70, d: 56, h: 14, world: true };
      this.docks = [];
    }
    center() { return [this.x - 20, -748]; }
    bounds() { return { x0: this.x - 110, x1: this.x + 80, z0: -830, z1: BR - 4 }; }
    radius() { return 100; }
    build() {
      R.buildBranch();
      const S = this.structure, g = this.group, x = this.x, k = this.k, mat = WT.SUP.MAT[this.mat];
      const col = (mat.colors && mat.colors[0]) || 0x9aa1c4;
      W.flat(g, 190, 128, k.ground, x - 15, -760, 0.024);
      const b = new M.MB();
      // loadout over the branch: a bin on four legs with a chute down to the wagons
      for (const dx of [-3.5, 3.5]) for (const dz of [-3.6, 3.6]) b.box(0.6, 9, 0.6, 0x6a7194, x + dx, 0, BR + dz);
      b.box(8.6, 4.2, 8.4, 0xd6dbef, x, 9, BR);
      b.box(8.8, 0.5, 8.6, col, x, 13.2, BR);
      b.cyl(0.7, 1.2, 2.4, 0x6a7194, x, 7.8, BR, 10);
      M.block(S, { x: x + 52, z: -712, w: 14, d: 10, h: 6 });
      const kind = this.type;
      if (kind === 'Grain farm') {
        // strip fields, a row of grain silos at the railhead, a combine working the crop
        const strips = [];
        for (let i = 0; i < 9; i++) W.flat(g, 16, 92, i % 2 ? 0xe2c46b : 0xc7d17a, x - 100 + i * 17, -778, 0.03);
        for (const sx of [x - 26, x - 16, x - 6]) { b.cyl(4, 4, 16, 0xe9ecf7, sx, 8, -712, 18); b.sphere(4, 0xe9ecf7, sx, 16, -712, 1, 0.5, 1, 14); }
        b.box(26, 1.2, 1.6, 0x9aa1c4, x - 13, 15, -707);
        this.mover = new T.Group();
        const cb = new M.MB();
        cb.box(7, 3, 4, 0x37b26c, 0, 1, 0); cb.box(3, 2, 3.4, 0x2aa198, 1.4, 4, 0); cb.box(1.6, 1.2, 7.2, 0xf0b429, 4.4, 0.6, 0);
        this.mover.add(cb.mesh());
        S.add(this.mover);
        this.moveFn = (t) => { const u = (Math.sin(t * 0.18) + 1) / 2; this.mover.position.set(x - 92 + (Math.floor(t * 0.18 / Math.PI) % 9) * 17, 0, -820 + u * 84); this.mover.rotation.y = Math.cos(t * 0.18) > 0 ? -Math.PI / 2 : Math.PI / 2; };
      } else {
        // open pit: terraces stepping down toward the floor, spoil heaps, a crusher, haul trucks on the ramp
        const pitX = x - 40, pitZ = -786;
        const shades = kind === 'Sand quarry' ? [0xe9dcb8, 0xe0cfa2, 0xd6c08c, 0xcbb279] : kind === 'Coal mine' ? [0xb9b6c4, 0x8f8ca0, 0x6a677c, 0x3f3d4f] : kind === 'Bauxite mine' ? [0xd9a68e, 0xc98b70, 0xb5735a, 0x9c5d47] : [0xcfa592, 0xb88a76, 0x9f705d, 0x845847];
        shades.forEach((c, i) => W.flat(g, 96 - i * 20, 56 - i * 12, c, pitX, pitZ, 0.026 + i * 0.004));
        const tl = [];
        for (let i = 0; i < 4; i++) W.dashRect(tl, pitX, pitZ, 96 - i * 20, 56 - i * 12, 3, 1.5, 0.3);
        W.dashes(g, tl, 0xffffff, 0.046);
        for (const [sx, sz, r, h] of [[x - 102, -748, 9, 7], [x - 92, -726, 7, 5], [x + 18, -820, 8, 6]]) b.cyl(0.3, r, h, shades[2], sx, h / 2, sz, 10);
        b.box(16, 9, 12, 0xb9bfd8, x - 2, 0, -742); b.box(16.4, 0.6, 12.4, col, x - 2, 9, -742);
        if (kind === 'Coal mine') {
          // headframe over the shaft
          for (const dz of [-3, 3]) { b.boxC(0.8, 26, 0.8, 0x4a5578, x - 74, 13, -738 + dz, 0, 0, 0.18); b.box(0.8, 24, 0.8, 0x4a5578, x - 70, 0, -738 + dz); }
          b.cyl(2.6, 2.6, 0.6, 0x2b2f3d, x - 71, 24.5, -738, 16, Math.PI / 2);
          b.box(12, 6, 10, 0xd6dbef, x - 86, 0, -738);
        }
        this.haul = [0, 1].map((i) => { const m = M.rig({ cab: 0xf0b429, trailer: 'dump', style: 'conv' }); m.scale.setScalar(1.15); S.add(m); return { m, ph: i * Math.PI }; });
        this.moveFn = (t) => {
          for (const h of this.haul) {
            const a = t * 0.12 + h.ph, ex = pitX + Math.cos(a) * 34, ez = pitZ + Math.sin(a) * 18;
            h.m.position.set(ex, 0, ez);
            h.m.rotation.y = -Math.atan2(Math.cos(a) * 18, -Math.sin(a) * 34);
          }
        };
      }
      S.add(b.mesh());
      // production belt: from the pit / silos up to the loadout bin
      const from = kind === 'Grain farm' ? [x - 6, 4, -712] : [x - 2, 4, -742];
      this.belt = new FX.Conveyor(g, [from, [x - 2, 9, BR - 10], [x, 12, BR - 3.4]], { item: mat.item || 'ore', speed: 4, spacing: 1.4, colors: mat.colors });
      // run-of-mine stockpile next to the loadout
      this.pile = new T.Mesh(new T.ConeGeometry(13, 9, 14), new T.MeshStandardMaterial({ color: col, flatShading: true }));
      this.pile.position.set(x + 30, 0, -734);
      this.pile.castShadow = this.pile.receiveShadow = true;
      S.add(this.pile);
      this.chute = new T.Object3D();
      this.chute.position.set(x, 6, BR);
      S.add(this.chute);
    }
    activate() {
      super.activate();
      let pushT = 0;
      WT.on('frame', () => {
        const dt = WT.sim.dt;
        if (dt <= 0) return;
        if (this.stock < this.cap) {
          this.stock = Math.min(this.cap, this.stock + this.k.rate * dt);
          pushT += dt;
          if (pushT > 0.9) { pushT = 0; this.belt.push(); }
        }
        const f = this.stock / this.cap;
        this.pile.scale.set(0.35 + f * 0.65, Math.max(0.05, f), 0.35 + f * 0.65);
        this.pile.position.y = 4.5 * Math.max(0.05, f);
        if (this.moveFn) this.moveFn(WT.sim.minutes * 2);
      });
    }
    // fill one open-top box per booked order, wagon by wagon, under the loadout chute
    *loadTrain(tr, manifest) {
      const S = WT.SUP, p = new T.Vector3();
      tr.status = 'Loading at ' + this.id;
      const cars = tr.cars.slice(1);
      const loaded = [];
      for (let i = 0; i < manifest.length && i < cars.length; i++) {
        const po = manifest[i], car = cars[i], c = car.cont;
        // No local container creation: only a delivered, compatible empty manufactured off-site may be filled.
        if (!c || c.full || c.contents || c.open !== this.mat || po.mat !== this.mat || !c.manufacturer) continue;
        c.deliveredToSite = this.id;
        c.emptyDeliveryTrain = tr.id;
        this.emptiesReceived++;
        S.note(c, `Empty delivered to ${this.id} on ${tr.id}`);
        while (this.stock < po.qty) { tr.status = 'Waiting for ' + S.MAT[this.mat].name.toLowerCase(); yield* WT.sleep(0.5); }
        tr.status = 'Loading at ' + this.id;
        this.stock -= po.qty;
        S.fillPO(c, po);
        c.load.set(0);
        if (c.mesh.userData.setHatches) c.mesh.userData.setHatches(1);
        car.cont = c;
        c.status = 'On rail'; c.loc = tr.id;
        car.g.getWorldPosition(p);
        yield* WT.tween(1.6, (k) => {
          c.load.set(k);
          if (Math.random() < 0.5) FX.puff(p.x + WT.rnd(-4, 4), 4.5, p.z + WT.rnd(-1, 1), { size0: 1.5, size1: 6, life: 1.4, vy: 0.6, op: 0.45, color: (S.MAT[this.mat].colors || [0xdddddd])[0] });
        });
        if (c.mesh.userData.setHatches) c.mesh.userData.setHatches(0);
        S.note(c, `Loaded at ${this.id} (${this.name}) for ${po.to.id} (${po.id})`);
        S.ev(po, `On train · ${tr.id} from ${this.id}`);
        po.vehicle = tr;
        po.remoteSource = this.id;
        loaded.push(po);
        this.shipped += po.qty;
        WT.G && WT.G.earn(po.qty * 600, this);
      }
      for (const po of manifest) if (!loaded.includes(po)) {
        S.ev(po, 'Awaiting train · compatible manufactured empty required');
        if (!S.backlog.rail.includes(po)) S.backlog.rail.push(po);
      }
      tr.manifest = loaded;
      if (loaded.length) this.trainsLoaded++;
      yield* WT.sleep(0.8);
    }
    card() {
      const mat = WT.SUP.MAT[this.mat];
      return this.cardBase({
        kicker: 'Remote site · ' + this.type, icon: this.type === 'Grain farm' ? '🌾' : '⛏️', sub: mat.name + ' by rail to the park', where: this.trainBusy ? 'Empty delivery / cargo loading' : 'Awaiting manufactured empties',
        bars: [{ label: mat.name + ' stockpile', val: this.stock, max: this.cap }],
        rows: [['Output', mat.name], ['Stockpile', Math.round(this.stock) + ' t'], ['Shipped', WT.fmtNum(Math.round(this.shipped)) + ' t'], ['Empty boxes received', String(this.emptiesReceived)], ['Container source', R.containerFactory()?.id || 'Awaiting container factory'], ['Trains loaded', String(this.trainsLoaded)], ['Rail operator', this.k.operator]],
      });
    }
  }
  WT.RemoteSite = RemoteSite;

  /* ================= gas field + pipeline (a new way to move freight) ================= */
  // flowing product: little slugs travelling along the pipe
  class PipeFlow {
    constructor() {
      this.items = [];
      this.im = new T.InstancedMesh(new T.SphereGeometry(0.42, 8, 6), new T.MeshBasicMaterial({ color: 0xffffff }), 400);
      this.im.count = 0;
      this.im.frustumCulled = false;
      WT.scene.add(this.im);
      this._m = new T.Matrix4(); this._c = new T.Color();
      WT.on('frame', () => this.update(WT.sim.dt));
    }
    send(path, color, onArrive) { this.items.push({ path, s: 0, color, onArrive }); }
    update(dt) {
      if (dt <= 0 && this.im.count === this.items.length) return;
      let n = 0;
      for (let i = this.items.length - 1; i >= 0; i--) {
        const it = this.items[i];
        it.s += 55 * dt;
        if (it.s >= it.path.len) { this.items.splice(i, 1); if (it.onArrive) it.onArrive(); continue; }
      }
      for (const it of this.items) {
        if (n >= 400) break;
        const p = it.path.at(it.s);
        this._m.makeTranslation(p.x, PIPE_Y + 0.05, p.z);
        this.im.setMatrixAt(n, this._m);
        this.im.setColorAt(n, this._c.setHex(it.color));
        n++;
      }
      this.im.count = n;
      this.im.instanceMatrix.needsUpdate = true;
      if (this.im.instanceColor) this.im.instanceColor.needsUpdate = true;
    }
  }
  // elevated pipe rack between points (polyline), posts every ~22 m except where `skip(x, z)` says a road crosses
  function pipeRack(g, pts, skip) {
    const b = new M.MB();
    for (let i = 1; i < pts.length; i++) {
      const [ax, az] = pts[i - 1], [bx, bz] = pts[i], L = Math.hypot(bx - ax, bz - az), ang = Math.atan2(bz - az, bx - ax);
      b.boxC(L + 0.6, 0.9, 0.9, 0xd9dde8, (ax + bx) / 2, PIPE_Y, (az + bz) / 2, 0, -ang, 0);
      b.boxC(L + 0.6, 0.18, 0.95, 0xf0b429, (ax + bx) / 2, PIPE_Y, (az + bz) / 2, 0, -ang, 0);
      const n = Math.max(1, Math.floor(L / 22));
      for (let k = 0; k <= n; k++) {
        const x = ax + ((bx - ax) * k) / n, z = az + ((bz - az) * k) / n;
        if (skip && skip(x, z)) continue;
        b.box(0.45, PIPE_Y - 0.45, 0.45, 0x9aa1c4, x, 0, z);
        b.box(1.6, 0.3, 1.6, 0x9aa1c4, x, PIPE_Y - 0.75, z);
      }
    }
    const m = b.mesh();
    g.add(m);
    return m;
  }

  class GasField extends WT.Facility {
    constructor() {
      super('Gas field', 'GAS', 'Eastgate Gas Field', null);
      this.x = 1270;
      this.income = 16000;
      this.site = { x: 1250, z: -770, w: 60, d: 50, h: 22, world: true };
      this.docks = [];
      this.branches = new Map(); // plant → polyline from the trunk end to its tank
      this.sent = 0;
      this.batches = 0;
    }
    center() { return [1260, -760]; }
    bounds() { return { x0: 1170, x1: 1340, z0: -840, z1: PIPE_Z - 4 }; }
    radius() { return 90; }
    build() {
      const S = this.structure, g = this.group, x = this.x;
      W.flat(g, 170, 120, 0xdcd8e6, x - 10, -775, 0.024);
      const b = new M.MB();
      // gas plant: storage spheres, process columns, compressor house, flare
      for (const [sx, sz] of [[x - 50, -760], [x - 34, -760]]) { b.sphere(6, 0xf3f5fd, sx, 7, sz, 1, 1, 1, 18); for (let i = 0; i < 6; i++) b.box(0.5, 6, 0.5, 0x9aa1c4, sx + Math.cos(i) * 5, 0, sz + Math.sin(i) * 5); }
      for (const [cx, h] of [[x - 14, 22], [x - 8, 16]]) { b.cyl(1.6, 1.6, h, 0xe9ecf7, cx, h / 2, -748, 12); for (let y = 4; y < h; y += 4) b.cyl(2.2, 2.2, 0.3, 0x9aa1c4, cx, y, -748, 12); }
      b.box(16, 7, 10, 0xd6dbef, x + 8, 0, -742); b.box(16.4, 0.5, 10.4, 0x37b26c, x + 8, 7, -742);
      b.cyl(0.5, 0.7, 30, 0x9aa1c4, x + 40, 15, -800, 8);
      // pig launcher at the head of the pipeline
      b.box(6, 2.4, 2.4, 0xf0b429, x - 70, 0, PIPE_Z - 3);
      S.add(b.mesh());
      this.flare = new T.Object3D(); this.flare.position.set(x + 40, 31, -800); S.add(this.flare);
      FX.emitter(this.flare, { rate: 3, color: 0xffb347, size0: 2, size1: 6, life: 1.2, vy: 3, op: 0.8, jitter: 0.3 });
      // pump jacks nodding across the field
      this.jacks = [];
      for (const [jx, jz] of [[x - 60, -812], [x - 30, -820], [x, -812], [x + 24, -824], [x - 90, -800]]) {
        const base = new M.MB();
        base.box(5, 0.6, 2, 0x4a5578, jx, 0, jz);
        base.boxC(0.4, 5, 0.4, 0x6a7194, jx, 2.6, jz - 0.6, 0.15, 0, 0); base.boxC(0.4, 5, 0.4, 0x6a7194, jx, 2.6, jz + 0.6, -0.15, 0, 0);
        S.add(base.mesh());
        const beam = new T.Group(); beam.position.set(jx, 5, jz);
        const bb = new M.MB(); bb.box(8, 0.6, 0.6, 0xf08c2a, 0, -0.3, 0); bb.box(1.2, 2.2, 0.8, 0xf08c2a, 4.2, -1.6, 0);
        beam.add(bb.mesh()); S.add(beam);
        this.jacks.push(beam);
      }
      // the trunk pipeline: from the gas plant west along the rail corridor, past the whole park
      this.trunkPts = [[x - 70, PIPE_Z], [-760, PIPE_Z]];
      if (!R.trunk) { R.trunk = true; pipeRack(WT.scene, this.trunkPts); W.clearTrees({ x0: -770, x1: x - 60, z0: PIPE_Z - 4, z1: PIPE_Z + 4 }); }
    }
    activate() {
      super.activate();
      this.flow = new PipeFlow();
      WT.on('frame', () => { const t = WT.sim.minutes * 2; this.jacks.forEach((j, i) => (j.rotation.z = Math.sin(t * 1.4 + i) * 0.28)); });
      WT.spawn(this.dispatch());
    }
    // a spur off the trunk to a plant's tank: down the avenue verge on the plant's side, then into the yard
    branchTo(f) {
      if (this.branches.has(f)) return this.branches.get(f);
      const pile = f.piles && (f.piles.lpg || f.piles.chem);
      if (!pile || !f.plot) return null;
      const p = new T.Vector3();
      pile.g.getWorldPosition(p);
      const A = f.plot.A, s = f.plot.s, vx = A + s * 9.2;
      const pts = [[vx, PIPE_Z], [vx, p.z], [p.x - s * 3.6, p.z]];
      // no rack posts across roads, the rail corridor, junctions or plot gates
      const gates = W.plots.filter((q) => q.A === A && q.s === s).flatMap((q) => [q.zc + 46 * q.s, q.zc - 46 * q.s]);
      const skip = (x, z) => Math.abs(z) < 13 || Math.abs(z + 656) < 16 || gates.some((gz) => Math.abs(z - gz) < 7) || (Math.abs(x - vx) > 1 && Math.abs(z - p.z) < 1 && Math.abs(x - vx) < 4);
      pipeRack(WT.scene, pts, skip);
      // riser down into the tank
      const rb = new M.MB(); rb.box(0.8, PIPE_Y, 0.8, 0xd9dde8, pts[2][0], 0, pts[2][1]); WT.scene.add(rb.mesh());
      const path = WT.buildPath([[this.x - 70, PIPE_Z], [vx, PIPE_Z], ...pts.slice(1)], 2);
      this.branches.set(f, path);
      WT.log(`🛢️ Pipeline spur to ${f.id} commissioned`, 'green', true);
      return path;
    }
    // pipeline batches: each booked order is pumped down the line as a train of product slugs
    *dispatch() {
      const S = WT.SUP;
      while (true) {
        const po = S.pipeQ.shift();
        if (!po) { yield* WT.sleep(0.5); continue; }
        if (!/Delivered|Cancelled/.test(po.status) && po.to.active) {
          const path = this.branchTo(po.to);
          if (!path) { S.cancel(po, 'no pipeline spur to this plant'); continue; }
          S.ev(po, `In pipeline · batch from ${this.id}`);
          const color = po.mat === 'lpg' ? 0xff9a3c : 0x6fdc8c, slugs = 8;
          let arrived = 0;
          for (let i = 0; i < slugs; i++) {
            this.flow.send(path, color, () => { arrived++; if (arrived === slugs) { S.delivered(po); this.sent += po.qty; } });
            yield* WT.sleep(0.35);
          }
          this.batches++;
          WT.G && WT.G.earn(po.qty * 900, this);
        }
        yield* WT.sleep(1.2);
      }
    }
    card() {
      return this.cardBase({
        kicker: 'Remote site · Gas field', icon: '🔥', sub: 'Propane + chemicals by pipeline', where: (this.flow && this.flow.items.length ? 'Pumping' : 'Pipeline idle'),
        rows: [['Products', 'Propane (LPG) · Chemicals'], ['Pipeline spurs', String(this.branches.size)], ['Batches pumped', String(this.batches)], ['Delivered', WT.fmtNum(Math.round(this.sent)) + ' t'], ['Queued batches', String(WT.SUP.pipeQ.length)]],
      });
    }
  }
  WT.GasField = GasField;

  /* ================= off-site empty-container yard ================= */
  class OffsiteYard extends WT.Facility {
    constructor() {
      super('Off-site empty yard', 'XYD', 'Linehaul Empty Yard', null);
      this.x = 1620;
      this.cz = -697;
      this.income = 9000;
      this.site = { x: 1640, z: -705, w: 60, d: 30, h: 14, world: true };
      this.docks = [];
      this.received = 0;
      this.slots = [];
      for (const z of [-702, -708]) for (let x = 1540; x <= 1720; x += 12.6) this.slots.push({ x, z, items: [] });
    }
    center() { return [1630, -705]; }
    bounds() { return { x0: 1520, x1: 1740, z0: -740, z1: BR + 4 }; }
    radius() { return 100; }
    build() {
      R.buildSpur();
      const S = this.structure, g = this.group;
      W.flat(g, 230, 40, W.COL.concrete, 1630, -705, 0.024);
      const yel = [];
      for (const s of this.slots) W.dashRect(yel, s.x, s.z, 12, 3.4, 1, 0.6, 0.2);
      W.dashes(g, yel, W.COL.yellow, 0.06);
      M.block(S, { x: 1560, z: -728, w: 14, d: 10, h: 6 });
      this.crane = M.gantry(26, 13);
      this.crane.group.rotation.y = Math.PI / 2;
      this.crane.group.position.set(1600, 0, this.cz);
      S.add(this.crane.group);
    }
    activate() { super.activate(); }
    ct(z) { return this.cz - z; }
    // lift every empty off the train into the yard stacks; the oldest boxes go back to the lines
    *unloadTrain(tr) {
      tr.status = 'Unloading empties at ' + this.id;
      const p = new T.Vector3();
      for (const car of tr.cars.slice(1)) {
        const c = car.cont;
        if (!c) continue;
        let s = this.slots.filter((q) => q.items.length < 2).sort((a, b) => a.items.length - b.items.length || Math.abs(a.x - 1600) - Math.abs(b.x - 1600))[0];
        if (!s) { const old = this.slots.find((q) => q.items.length); const o = old.items.shift(); WT.scene.remove(o.mesh); WT.unregister(o); old.items.forEach((it, i) => it.mesh.position.setY(i * 2.7)); s = old; }
        c.lifting = true;
        c.mesh.getWorldPosition(p);
        const m = yield* CR.move(this.crane, c.mesh, { x: p.x, t: this.ct(p.z), top: p.y + 2.7 }, { x: s.x, t: this.ct(s.z), base: s.items.length * 2.7 }, 9, 7);
        m.position.set(s.x, s.items.length * 2.7, s.z); m.rotation.set(0, 0, 0);
        s.items.push(c);
        car.cont = null; c.lifting = false;
        c.status = 'Empty · off-site yard'; c.loc = this.id;
        WT.SUP.note(c, `Repositioned off-site to ${this.id} on ${tr.id}`);
        this.received++;
        WT.G && WT.G.earn(3000, this);
      }
      tr.status = 'Returning to the lines';
    }
    card() {
      return this.cardBase({
        kicker: 'Remote site · Empty yard', icon: '📦', sub: 'Empties repositioned off-site by rail', where: this.received + ' boxes received',
        rows: [['Received', String(this.received)], ['Stacked', String(this.slots.reduce((n, s) => n + s.items.length, 0))], ['Served by', 'Boxline Repositioning trains']],
      });
    }
  }
  WT.OffsiteYard = OffsiteYard;
})();
