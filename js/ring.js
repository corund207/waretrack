/* WareTrack – the Production Ring
   The park's upstream industry lives in four pods south of the highway, west of the park, set apart by forest: two
   refining pods and two component pods, each three plants and a rail depot on an avenue of its own. A loop line runs
   round the green between them and ring shuttles circulate on it, calling at every depot that has boxes for them.
   A transfer from a plant in one pod to a plant in another rides the ring: a mover loads a container at the
   producer's shipping dock and drops it at the pod's depot, the depot crane puts it on the next shuttle, the shuttle
   carries it round to the consumer's pod, and a mover takes it the last stretch to the receiving dock. The emptied
   box goes back to that depot and rides home to its own pod's pool for the next load. */
(function () {
  const T = THREE, M = WT.M, W = WT.W, CR = WT.CraneOps;
  const [AW, AE] = W.RING_AVENUES;
  // the loop: an oval with round ends in the green between the two pod avenues. Its west and east straights run
  // along the inner edge of the depot plots (plot-local x 104), clear of every road, so trains and trucks never cross.
  const X0 = AW + 8 + 104, X1 = AE - 8 - 104, Z0 = 20, Z1 = 540, RAD = 116, ZM = (Z0 + Z1) / 2;
  const R = (WT.RING = { built: false, building: false, trains: [], stats: { moved: 0, empties: 0, issued: 0, calls: 0, laps: 0 } });
  R.center = [(X0 + X1) / 2, ZM];
  R.path = WT.buildPath([[X0, ZM], [X0, Z1], [X1, Z1], [X1, Z0], [X0, Z0], [X0, ZM]], RAD);
  const L = R.path.len;
  const wrap = (s) => ((s % L) + L) % L;
  R.at = (s) => R.path.at(wrap(s));
  const hex = (c) => '#' + c.toString(16).padStart(6, '0');

  /* ---------- pods ---------- */
  R.PODS = [
    { key: 'A', name: 'Metals', tier: 1, A: AW, half: 'N', color: 0xd9622b, plants: ['Steel Mill', 'Copper Refinery', 'Aluminium Smelter'] },
    { key: 'B', name: 'Materials', tier: 1, A: AW, half: 'S', color: 0x37b26c, plants: ['Chemical Plant', 'Sawmill', 'Glass Works'] },
    { key: 'C', name: 'Drives & Circuits', tier: 2, A: AE, half: 'N', color: 0x2f56e0, plants: ['Wire Mill', 'Motor Works', 'Circuit Fab'] },
    { key: 'D', name: 'Bodies & Fittings', tier: 2, A: AE, half: 'S', color: 0x7a5cd6, plants: ['Panel Press', 'Moulding Shop', 'Frame Shop'] },
  ];
  // each pod takes two rows of its avenue (the middle row stays forest between the north and south pods): both plots
  // on the outer side and the far one on the inner side are plants, the inner plot next to the gap is the depot
  for (const pod of R.PODS) {
    const sIn = pod.A === AW ? 1 : -1, far = pod.half === 'N' ? 0 : 4, near = pod.half === 'N' ? 1 : 3;
    pod.slots = [[-sIn, far], [-sIn, near], [sIn, far]].map(([s, k], i) => Object.assign(W.makePlot(pod.A, s, 1, k), { pod, podPlant: pod.plants[i] }));
    pod.depotPlot = Object.assign(W.makePlot(pod.A, sIn, 1, near), { pod, podDepot: true });
    pod.depot = null;
  }
  R.podFor = (name) => R.PODS.find((p) => p.plants.includes(name)) || null;
  // the pod plot reserved for a plant of this kind, while it is free
  R.slotFor = (name) => {
    const pod = R.podFor(name), p = pod && pod.slots[pod.plants.indexOf(name)];
    return p && !p.used ? p : null;
  };
  // pods with a plant but no depot yet (the growth director builds one for each once the line is down)
  R.needsDepot = () => R.PODS.find((pod) => !pod.depot && pod.slots.some((p) => p.used));
  // a transfer goes by ring when both plants sit in different pods whose depots are working
  R.route = (p, q) => {
    const a = p.pod && p.pod.depot, b = q.pod && q.pod.depot;
    return a && b && a !== b && a.active && b.active && R.trains.length ? { from: a, to: b } : null;
  };

  /* ---------- the line (built by the "Production ring" project) ---------- */
  function sign(lines, w, h, bg) {
    const tex = M.canvasTex(512, Math.round((512 * h) / w), (ctx) => {
      const H = ctx.canvas.height;
      ctx.fillStyle = bg; ctx.fillRect(0, 0, 512, H);
      ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      lines.forEach(([text, size, y]) => { ctx.font = `800 ${size}px Inter, "Segoe UI", Arial`; ctx.fillText(text, 256, y * H); });
    });
    const g = new T.Group(), b = new M.MB();
    for (const s of [-1, 1]) b.box(0.5, h + 3, 0.5, 0x9aa1c4, 0, 0, (s * (w - 0.6)) / 2);
    g.add(b.mesh());
    const p = M.decal(tex, w, h);
    p.material.depthWrite = true; p.material.transparent = false;
    p.rotation.y = -Math.PI / 2; p.position.set(-0.3, 3 + h / 2, 0);
    g.add(p);
    return g;
  }
  // each pod is a precinct of its own: cleared ground with a border in the pod's colour and a hedge along its outer
  // side and its ends (open to the avenue, the highway and the loop)
  function precinct(g, pod) {
    const sIn = pod.A === AW ? 1 : -1, N = pod.half === 'N', z0 = N ? 9 : 331, z1 = N ? 229 : 553;
    W.clearTrees({ x0: pod.A - 120, x1: pod.A + 120, z0, z1 });
    const line = [], xo = pod.A - sIn * 120, xi = pod.A + sIn * 118;
    W.dashLine(line, xo, z0, xo, z1, z1 - z0, 0, 0.6);
    for (const z of [z0, z1]) {
      if (N && z === z0) continue;
      W.dashLine(line, Math.min(xo, pod.A - sIn * 10), z, Math.max(xo, pod.A - sIn * 10), z, 110, 0, 0.6);
      W.dashLine(line, Math.min(xi, pod.A + sIn * 10), z, Math.max(xi, pod.A + sIn * 10), z, 108, 0, 0.6);
    }
    W.dashes(g, line, pod.color, 0.05);
    const b = new M.MB(), shrub = (x, z, i) => b.blob(1.3, i % 3 ? 0x4f7d3a : 0x5c8a42, x, 1.1, z, 1.2, 0.85, 1.2, 1, 0.3, i + 1);
    let i = 0;
    for (let z = z0 + 3; z <= z1 - 3; z += 3.2) shrub(xo - sIn * 2.5, z, i++);
    const ends = N ? [z1] : [z0, z1];
    for (const z of ends) {
      const out = z === z1 ? 2.5 : -2.5;
      for (let x = pod.A - sIn * 14; Math.abs(x - pod.A) <= 120; x -= sIn * 3.2) shrub(x, z + out, i++);
      for (let x = pod.A + sIn * 14; Math.abs(x - pod.A) <= 104; x += sIn * 3.2) shrub(x, z + out, i++);
    }
    g.add(b.mesh());
  }
  R.build = function* () {
    R.building = true;
    const g = new T.Group();
    WT.scene.add(g);
    for (let s = 0; s < L; s += 18) { const p = R.path.at(s); W.clearTrees({ x0: p.x - 12, x1: p.x + 12, z0: p.z - 12, z1: p.z + 12 }); }
    const ballast = [], sleepers = [];
    for (let s = 0; s < L; s += 3) { const p = R.path.at(s); ballast.push({ x: p.x, z: p.z, len: 3.3, w: 4.6, rot: -p.a }); }
    for (let s = 0; s < L; s += 0.95) { const p = R.path.at(s); sleepers.push({ x: p.x, z: p.z, len: 0.45, w: 2.9, rot: -p.a }); }
    const bm = W.dashes(g, ballast, W.COL.ballast, 0.028), sm = W.dashes(g, sleepers, 0xa49c90, 0.06);
    // rails in short runs, so they appear behind the track layer
    const N = 40, runs = [];
    for (let i = 0; i < N; i++) {
      const b = new M.MB();
      for (let s = (i * L) / N; s < ((i + 1) * L) / N; s += 2) {
        const p = R.path.at(s), nx = -Math.sin(p.a), nz = Math.cos(p.a);
        for (const o of [-0.75, 0.75]) b.boxC(2.04, 0.2, 0.16, 0x6a7194, p.x + nx * o, 0.15, p.z + nz * o, 0, -p.a, 0);
      }
      const m = b.mesh(false, true);
      m.visible = false;
      g.add(m);
      runs.push(m);
    }
    bm.count = sm.count = 0;
    const layer = M.trackLayer();
    WT.scene.add(layer);
    yield* WT.tween(28, (k) => {
      bm.count = Math.floor(ballast.length * k); sm.count = Math.floor(sleepers.length * k);
      runs.forEach((m, i) => (m.visible = i < Math.floor(N * k)));
      const p = R.path.at(L * k);
      layer.position.set(p.x, 0, p.z); layer.rotation.y = -p.a;
    });
    bm.count = ballast.length; sm.count = sleepers.length;
    runs.forEach((m) => (m.visible = true));
    WT.scene.remove(layer);
    // the line's name board in the middle of the green, facing the highway
    const board = sign([['PRODUCTION RING', 62, 0.36], ['WareTrack industry pods · rail loop', 30, 0.72]], 18, 5, '#2f56e0');
    board.rotation.y = -Math.PI / 2;
    board.position.set(R.center[0], 0, Z0 + 60);
    R.PODS.forEach((pod) => precinct(g, pod));
    g.add(board);
    R.built = true; R.building = false;
  };

  /* ---------- pod rail depot ---------- */
  // Plot-local layout: entry road along z 46, a bypass lane at x 54 with two crane bays at x 62, the box yard
  // (four rows) and the loop track at x 104 under one rail-mounted gantry spanning x 48–114, travelling z −30…30.
  const BAYS = [12, -20], BAY_X = 62, BYP_X = 54, TRACK_X = 104, XC = 81, SPAN = 66, SAFE = 10.5, SPEED = 6, U_MAX = 30;
  const ROWS = [74, 80, 86, 92], COLS = [-26, -13, 0, 13, 26];
  class RingDepot extends WT.Facility {
    constructor(pod) {
      super('Ring depot', 'RD', `Pod ${pod.key} Rail Depot`, pod.depotPlot);
      this.pod = pod;
      pod.depot = this;
      this.docks = BAYS.map((z, i) => ({ n: i + 1, x: BAY_X, z, truck: null, job: null, ops: ['pick', 'drop'] }));
      this.slots = [];
      for (const x of ROWS) for (const z of COLS) this.slots.push({ x, z, items: [] });
      this.jobs = [];
      this.train = null;
      this.pendingDrop = 0; // movers booked to drop a box here
      this.incoming = 0; // boxes on their way here by shuttle (or booked to be)
      this.income = 6000;
      this.site = { x: XC, z: 0, w: 60, d: 66, h: 18 };
    }
    get gateIn() { return { A: this.plot.A, z: this.toWorld(0, 46)[1] }; }
    get gateOut() { return { A: this.plot.A, z: this.toWorld(0, -46)[1] }; }
    stagePath() { return [[0, 46], [30, 46]].map(([x, z]) => this.toWorld(x, z)); }
    get stageSkip() { return 1; }
    get stageRoom() { return 2; }
    // down the bypass, a gentle change onto the bay, out ahead and back onto the bypass to the exit
    inPath(d) { d = d || this.docks[0]; return [[0, 46], [BYP_X, 46], [BYP_X, d.z + 22], [BAY_X, d.z + 10], [BAY_X, d.z]].map(([x, z]) => this.toWorld(x, z)); }
    outPath(d) { d = d || this.docks[0]; return [[BAY_X, d.z], [BAY_X, d.z - 4], [BYP_X, d.z - 14], [BYP_X, -46], [0, -46]].map(([x, z]) => this.toWorld(x, z)); }
    radius() { return 70; }
    get yaw() { return -Math.PI / 2 + this.plot.rot; }
    local(obj) {
      const v = new T.Vector3();
      obj.getWorldPosition(v);
      this.structure.updateWorldMatrix(true, false);
      return this.structure.worldToLocal(v);
    }
    world(x, y, z) { this.structure.updateWorldMatrix(true, false); return this.structure.localToWorld(new T.Vector3(x, y, z)); }

    build() {
      this.pad();
      this.addGates();
      const g = this.group, S = this.structure, pod = this.pod;
      W.flat(g, BYP_X + 3, 6, W.COL.road, (BYP_X + 3) / 2, 46, 0.029);
      W.flat(g, BYP_X + 3, 6, W.COL.road, (BYP_X + 3) / 2, -46, 0.029);
      W.flat(g, 6, 98, W.COL.road, BYP_X, 0, 0.029);
      W.flat(g, 6, 52, W.COL.road, BAY_X, -5, 0.03);
      W.flat(g, 30, 66, W.COL.concrete, 85, 0, 0.027);
      const yel = [], white = [];
      for (const d of this.docks) W.dashRect(yel, BAY_X, d.z - 0.6, 4.4, 15.6, 1, 0.5, 0.22);
      for (const s of this.slots) W.dashRect(yel, s.x, s.z, 3.2, 12.4, 1, 0.6, 0.2);
      W.dashLine(white, 58, 30, 58, -30, 3, 2.4, 0.22);
      W.dashLine(yel, 100.6, 36, 100.6, -36, 36 * 2, 0, 0.3); // platform edge
      for (let z = 40; z > -44; z -= 14) white.push({ x: BYP_X, z, len: 2.2, w: 0.5, rot: Math.PI / 2 });
      W.dashes(g, yel, W.COL.yellow, 0.062);
      W.dashes(g, white, 0xffffff, 0.06);
      W.groundText(g, 'POD ' + pod.key, 66, 34, 10, 5, hex(pod.color), Math.PI / 2, 90);
      const b = new M.MB();
      for (const x of [XC - SPAN / 2, XC + SPAN / 2]) b.box(0.5, 0.15, 72, 0x7a81a4, x, 0.04, 0); // crane rails
      // buffer stops and a platform lamp line along the track
      for (const z of [-34, 34]) b.box(1.2, 1.1, 0.8, 0xd9434b, TRACK_X + 2.2, 0, z);
      for (const z of [-24, 0, 24]) { b.box(0.25, 6, 0.25, 0x9aa1c4, 100.9, 0, z); b.box(1.6, 0.3, 0.5, 0xeef0fa, 100.2, 6, z); }
      S.add(b.mesh());
      M.block(S, { x: 20, z: 0, w: 14, d: 12, h: 8, trim: pod.color }); // depot office
      const board = sign([['POD ' + pod.key, 120, 0.34], [pod.name.toUpperCase(), 52, 0.66], ['Tier ' + pod.tier + ' · ' + WT.SUP.TIER_NAME[pod.tier] + ' · rail depot', 26, 0.87]], 9, 6, hex(pod.color));
      board.position.set(5, 0, 20);
      S.add(board);
      // one rail-mounted gantry: its rails run along local z, so it is mounted in a frame whose x is the depot's z
      const rf = new T.Group();
      rf.rotation.y = -Math.PI / 2;
      S.add(rf);
      const c = M.gantry(SPAN, 17);
      c.group.rotation.y = Math.PI / 2;
      c.group.position.set(0, 0, -XC);
      rf.add(c.group);
      this.crane = Object.assign(c, { id: 'RMG-' + pod.key, task: 'Idle', lifts: 0, trainBox: false });
    }
    activate() {
      super.activate();
      // where on the loop the platform is: shuttles stop with their wagons centred on it
      const w = this.world(TRACK_X, 0, 0);
      let best = 0, bd = Infinity;
      for (let s = 0; s < L; s += 0.5) { const p = R.path.at(s), d = (p.x - w.x) ** 2 + (p.z - w.z) ** 2; if (d < bd) { bd = d; best = s; } }
      this.sStop = best;
      WT.spawn(this.craneWorker());
      R.startShuttles();
    }

    /* ----- the box yard ----- */
    topOf(s) { return s.items[s.items.length - 1]; }
    idle(c) { return c && !c.full && !c.ringTo && !c.reserved && !c.lifting && !c.hold; }
    freeSlots() { return this.slots.filter((s) => !s.items.length && !s.busy).length; }
    roomFor() { return this.freeSlots() - this.pendingDrop - this.incoming; }
    outbound() { return this.slots.filter((s) => { const c = this.topOf(s); return c && !s.busy && c.ringTo && c.ringTo !== this && !c.lifting; }); }
    // boxes leaving or waiting for a mover are never built on: only an idle empty goes on top of another
    slotFor(c) {
      if (this.idle(c) || (c && !c.full && !c.ringTo)) {
        const on = this.slots.find((s) => s.items.length === 1 && !s.busy && this.idle(this.topOf(s)));
        if (on) return on;
      }
      const free = this.slots.filter((s) => !s.items.length && !s.busy);
      if (!free.length) return null;
      // outbound boxes nearest the track, everything else nearest the truck bays
      const toTrack = c && c.ringTo && c.ringTo !== this;
      return free.reduce((a, b) => ((toTrack ? b.x > a.x : b.x < a.x) ? b : a));
    }
    store(s, c, m) {
      m.position.copy(this.world(s.x, s.items.length * 2.7, s.z));
      m.rotation.set(0, this.yaw, 0);
      s.items.push(c);
      c.loc = this.id + ' · Yard';
    }
    // an empty of the right kind for this material, sitting idle in this pod's pool
    findEmpty(mat) {
      const tank = WT.SUP.MAT[mat].pack === 'tanker', open = WT.SUP.openFor(mat);
      for (const s of this.slots) {
        const c = this.topOf(s);
        if (!s.busy && this.idle(c) && c.ringHome === this && (tank ? c.tank : !c.tank && c.open === open)) return c;
      }
      return null;
    }
    // a pool keeps three idle empties of a kind; more go back to the leasing pool
    trimPool(c) {
      const same = this.slots.flatMap((s) => s.items).filter((x) => this.idle(x) && x.tank === c.tank && x.open === c.open);
      if (same.length <= 3) return;
      const s = this.slots.find((q) => this.topOf(q) === c);
      if (!s) return;
      s.items.pop();
      WT.scene.remove(c.mesh);
      WT.unregister(c);
    }
    // a mover dropped a box here: a loaded one waits for a shuttle, an empty goes home (or joins this pool)
    dropped(c, t) {
      const S = WT.SUP, po = c.full && c.po;
      if (po && po.ring) {
        c.ringTo = po.ring.to; c.ringHome = c.ringHome || this;
        c.status = 'Awaiting ring shuttle';
        S.note(c, `Dropped at ${this.id} for ${c.ringTo.id}`);
        S.ev(po, `At ${this.id} · awaiting ring shuttle → ${c.ringTo.id}`);
        if (t.po === po) { t.po = null; t.cargo = null; }
        return;
      }
      if (c.ringHome && c.ringHome !== this && c.ringHome.active) {
        c.ringTo = c.ringHome; c.ringHome.incoming++;
        c.status = 'Empty · going home by ring';
      } else {
        c.ringTo = null; c.ringHome = this; c.status = 'Empty · ring pool';
        this.trimPool(c);
      }
      S.note(c, `Empty dropped at ${this.id}`);
    }
    // a box came off a shuttle here
    arrived(c) {
      this.incoming = Math.max(0, this.incoming - 1);
      c.ringTo = null;
      if (c.full) { R.stats.moved++; c.status = 'Grounded · awaiting mover'; WT.SUP.note(c, `Off the ring shuttle at ${this.id}`); }
      else { R.stats.empties++; c.ringHome = this; c.status = 'Empty · ring pool'; WT.SUP.note(c, `Home at ${this.id}`); this.trimPool(c); }
    }
    // where a box is for a crane to take it: on top of a stack, or still on the shuttle at the platform
    whereIs(c) {
      for (const s of this.slots) if (this.topOf(s) === c) return s.busy || c.lifting ? null : { slot: s, from: { x: s.x, z: s.z, top: s.items.length * 2.7 }, take: () => s.items.pop() };
      const car = this.train && this.train.cars.find((k) => k.cont === c);
      if (!car || c.lifting) return null;
      const p = this.local(c.mesh);
      return { from: { x: p.x, z: p.z, top: p.y + 2.7 }, take: () => { car.cont = null; this.arrived(c); } };
    }

    /* ----- trucks ----- */
    reserveFor(t) {
      const d = this.docks.find((x) => !x.truck);
      if (!d) return null;
      d.truck = t || 'reserved';
      return d;
    }
    reserve() { return this.reserveFor(null); }
    release(d) { if (d) { d.truck = null; d.job = null; } }
    *serve(t, leg) {
      const d = leg.dock;
      leg.parked = WT.sim.minutes;
      t.where = `${this.id} · Bay ${d.n}`;
      t.status = leg.op === 'pick' ? 'Awaiting container' : 'Dropping container';
      const job = (d.job = { truck: t, label: (leg.op === 'pick' ? 'Loading ' : 'Unloading ') + t.id, plan: () => this.truckLift(t, leg) });
      this.jobs.push(job);
      while (!job.done) yield;
      d.job = null;
      if (leg.op === 'drop') this.pendingDrop = Math.max(0, this.pendingDrop - 1);
      // the box never turned up: the order goes back in the queue for another mover, and this one heads home
      if (leg.op === 'pick' && !t.container) {
        for (const l of t.legs) if (l.lazy && !l.dock) l.fac.lazyN = Math.max(0, (l.fac.lazyN || 0) - 1);
        t.legs.length = 0;
        if (t.po) { WT.SUP.dispatchQ.push(t.po); t.po = null; t.cargo = null; }
      }
    }
    truckLift(t, leg) {
      if (!WT.trucks.includes(t)) return 'skip';
      const cargo = t.mesh.userData.cargo;
      if (leg.op === 'drop') {
        const c = t.container;
        if (!c) return 'skip';
        const s = this.slotFor(c);
        if (!s) return null;
        const p = this.local(c.mesh);
        return { cont: c, slot: s, from: { x: p.x, z: p.z, top: p.y + 2.7 }, to: { x: s.x, z: s.z, base: s.items.length * 2.7 },
          commit: (m) => { t.container = null; this.store(s, c, m); this.dropped(c, t); } };
      }
      const c = leg.cont;
      if (!c || !WT.entities.has(c.uid)) return 'skip';
      const src = this.whereIs(c);
      if (!src) return WT.sim.minutes - leg.parked > 30 ? 'skip' : null;
      const p = this.local(cargo);
      return { cont: c, slot: src.slot, from: src.from, to: { x: p.x, z: p.z, base: p.y },
        commit: (m) => {
          src.take();
          cargo.attach(m); m.position.set(0, 0, 0); m.rotation.set(0, 0, 0);
          t.container = c; c.status = 'On truck'; c.loc = t.id; c.at = null; c.hold = false; c.reserved = false;
          WT.SUP.note(c, `Picked up by ${t.id} at ${this.id}`);
        } };
    }

    /* ----- shuttles ----- */
    hasWorkFor(tr) {
      return tr.cars.some((k) => k.cont && k.cont.ringTo === this) || (tr.cars.some((k, i) => i && !k.cont) && this.outbound().length > 0);
    }
    *trainCall(tr) {
      this.train = tr; tr.at = this;
      tr.status = 'Working at ' + this.id;
      R.stats.calls++;
      WT.emit('event', { kind: 'train', ent: tr, weight: 2 });
      // pre-advice: the boxes for this pod are released to the movers as the shuttle pulls in
      for (const car of tr.cars) {
        const c = car.cont;
        if (c && c.ringTo === this && c.full && c.po && !c.advised) { c.advised = true; c.at = this; c.hold = true; c.status = 'On shuttle at ' + this.id; WT.SUP.grounded(c.po, this.id); }
      }
      const job = { train: tr, label: 'Working ' + tr.id, plan: () => this.trainLift(tr) };
      this.jobs.push(job);
      // boxes for this pod always come off (their yard room was booked with the transfer); loading gives up after a while
      const t0 = WT.sim.minutes;
      while (!job.done && (WT.sim.minutes - t0 < 30 || tr.cars.some((k) => k.cont && k.cont.ringTo === this))) yield;
      job.done = true;
      while (this.crane.trainBox) yield;
      this.train = null; tr.at = null;
    }
    trainLift(tr) {
      // everything for this pod comes off first ...
      const off = tr.cars.find((k) => k.cont && k.cont.ringTo === this && !k.cont.lifting);
      if (off) {
        const c = off.cont, s = this.slotFor(c);
        if (!s && !c.full) {
          // an empty coming home to a full yard is handed back to the leasing pool
          off.cont = null; this.incoming = Math.max(0, this.incoming - 1);
          WT.scene.remove(c.mesh); WT.unregister(c);
          return null;
        }
        if (!s) return null; // a mover will clear a slot shortly
        const p = this.local(c.mesh);
        return { train: true, cont: c, slot: s, from: { x: p.x, z: p.z, top: p.y + 2.7 }, to: { x: s.x, z: s.z, base: s.items.length * 2.7 },
          commit: (m) => { off.cont = null; this.store(s, c, m); this.arrived(c); } };
      }
      if (tr.cars.some((k) => k.cont && k.cont.ringTo === this)) return null; // one still on the move to a truck
      // ... then boxes waiting here for other pods go on, each onto the nearest free wagon
      const free = tr.cars.filter((k, i) => i && !k.cont), out = this.outbound();
      if (!free.length || !out.length) return 'skip';
      const s = out[0], c = this.topOf(s);
      const car = free.reduce((a, b) => (Math.abs(this.local(b.g).z - s.z) < Math.abs(this.local(a.g).z - s.z) ? b : a));
      const p = this.local(car.g.userData.slot);
      return { train: true, cont: c, slot: s, from: { x: s.x, z: s.z, top: s.items.length * 2.7 }, to: { x: p.x, z: p.z, base: p.y },
        commit: (m) => {
          s.items.pop();
          car.g.userData.slot.attach(m); m.position.set(0, 0, 0); m.rotation.set(0, 0, 0);
          car.cont = c; c.status = c.full ? 'On ring shuttle' : 'Empty · on ring shuttle'; c.loc = tr.id;
          WT.SUP.note(c, `Loaded on ${tr.id} at ${this.id} → ${c.ringTo.id}`);
          if (c.full && c.po) WT.SUP.ev(c.po, `On ring shuttle · ${tr.id} → ${c.ringTo.id}`);
        } };
    }

    /* ----- the gantry: truck work first, then the shuttle at the platform ----- */
    *craneWorker() {
      const c = this.crane;
      while (true) {
        let pick = null;
        const order = this.jobs.filter((j) => !j.done).sort((a, b) => (b.truck ? 1 : 0) - (a.truck ? 1 : 0));
        for (const j of order) {
          const lift = j.plan();
          if (lift === 'skip') { j.done = true; continue; }
          if (lift) { pick = { j, lift }; break; }
        }
        this.jobs = this.jobs.filter((j) => !j.done);
        if (!pick) { c.task = 'Idle'; yield* WT.sleep(0.25); continue; }
        yield* this.lift(pick.lift, pick.j.label);
        if (!pick.lift.train) pick.j.done = true;
      }
    }
    *lift(Lf, label) {
      const c = this.crane, box = Lf.cont, u = (z) => WT.clamp(z, -U_MAX, U_MAX);
      c.task = label; c.trainBox = !!Lf.train;
      box.lifting = true;
      if (Lf.slot) Lf.slot.busy = true;
      yield* CR.transfer(c, u(Lf.from.z), Lf.from.x - XC, Lf.from.top + 0.25, SAFE, SPEED);
      CR.grab(c, box.mesh);
      yield* WT.sleep(0.25);
      yield* CR.transfer(c, u(Lf.to.z), Lf.to.x - XC, Lf.to.base + 2.95, SAFE, SPEED);
      const m = CR.release(c);
      Lf.commit(m);
      if (Lf.slot) Lf.slot.busy = false;
      box.lifting = false; c.trainBox = false;
      c.lifts++; this.moves++;
      WT.G && WT.G.earn(3000, this);
      yield* WT.sleep(0.15);
    }
    card() {
      const items = this.slots.flatMap((s) => s.items);
      const pool = items.filter((c) => this.idle(c)).length, out = items.filter((c) => c.ringTo && c.ringTo !== this).length;
      const wait = items.filter((c) => c.full && !c.ringTo).length;
      return this.cardBase({
        kicker: `Facility · Ring depot · Pod ${this.pod.key}`, icon: '🚉', sub: `Pod ${this.pod.key} · ${this.pod.name} — ${this.pod.plants.join(', ')}`,
        where: this.train ? this.train.id + ' at the platform' : 'Platform clear',
        rows: [['Outbound by ring', String(out)], ['Awaiting a mover', String(wait)], ['Empties in pool', String(pool)], ['Inbound by ring', String(this.incoming)],
          ['Yard', `${items.length} boxes · ${this.freeSlots()} of ${this.slots.length} slots free`], ['Gantry', `${this.crane.carry ? 'Lifting' : this.crane.task} · ${this.crane.lifts} lifts`],
          ['Truck bays', this.docks.map((d) => (d.truck ? '■' : '□')).join(' ')], ['Revenue', '$' + WT.fmtNum(this.income * 60 * WT.G.INCOME_SCALE) + '/min']],
      });
    }
  }
  WT.RingDepot = RingDepot;

  /* ---------- ring shuttles ---------- */
  let seq = 11;
  class RingTrain extends WT.Entity {
    constructor(s0, n) {
      super();
      this.kind = 'train';
      this.id = 'RS-' + seq++;
      this.operator = 'WareTrack Ring';
      this.status = 'Running';
      this.cars = [{ g: M.loco(0x2aa198, 0xf6f7fd, 'cab') }];
      for (let i = 0; i < n; i++) this.cars.push({ g: M.wagonKind('container'), kind: 'container', cont: null });
      this.mesh = this.cars[0].g;
      this.cars.forEach((c) => WT.scene.add(c.g));
      WT.register(this);
      this.cars.forEach((c) => { c.g.userData.entityId = this.uid; WT.pickables.add(c.g); });
      this.s = s0; this.v = 0; this.served = -Infinity;
      this.place(s0);
      R.trains.push(this);
    }
    radius() { return 30; }
    place(s) {
      this.cars.forEach((c, i) => {
        const p = R.at(s - 13 * i);
        c.g.position.set(p.x, 0, p.z);
        c.g.rotation.y = -p.a;
      });
    }
    card() {
      const boxes = this.cars.filter((c) => c.cont);
      return {
        kicker: 'Ring shuttle · ' + this.operator, title: this.id, sub: 'Production Ring loop · ' + (this.at ? 'at ' + this.at.id : 'running'),
        icon: '🚆', iconBg: '#7fe0d6', status: this.status, statusTone: WT.toneFor(this.status), where: this.at ? this.at.id + ' platform' : 'Ring line',
        rows: [['Consist', `1 loco + ${this.cars.length - 1} container flats`], ['Boxes aboard', boxes.length ? boxes.map((c) => `${c.cont.id} → ${c.cont.ringTo ? c.cont.ringTo.id : '?'}`).join(' · ') : 'None'],
          ['Speed', Math.round(this.v * 3.6) + ' km/h'], ['Laps', String(Math.floor(this.s / L))]],
      };
    }
    label() { return this.id + ' · Ring shuttle'; }
  }
  function* runShuttle(tr) {
    while (true) {
      const dt = WT.sim.dt;
      if (dt <= 0) { yield; continue; }
      const n = tr.cars.length - 1;
      // the nearest depot ahead with boxes for this shuttle, or boxes for it to take
      let stop = null;
      for (const d of WT.facilities) {
        if (d.type !== 'Ring depot' || !d.active || d.sStop === undefined || !d.hasWorkFor(tr)) continue;
        let s = tr.s + wrap(d.sStop + 6.5 * (n + 1) - tr.s);
        if (s <= tr.served + 1) s += L;
        if (!stop || s < stop.s) stop = { d, s };
      }
      let target = 15;
      const k = R.path.maxK(wrap(tr.s), wrap(tr.s) + 40);
      if (k > 1e-4) target = Math.min(target, Math.sqrt(1.3 / k));
      if (stop) target = Math.min(target, Math.sqrt(2 * 0.8 * Math.max(0, stop.s - tr.s)) + 0.25);
      // block working: hold well back from the tail of the shuttle ahead
      for (const o of R.trains) {
        if (o === tr) continue;
        const gap = wrap(o.s - 13 * (o.cars.length - 1) - tr.s);
        if (gap < 240) target = Math.min(target, Math.sqrt(2 * 1.2 * Math.max(0, gap - 30)));
      }
      tr.v = Math.max(0, tr.v + WT.clamp(target - tr.v, -2.4 * dt, 1.1 * dt));
      tr.s += tr.v * dt;
      if (stop && tr.s >= stop.s - 0.05) {
        tr.s = stop.s; tr.v = 0;
        tr.place(tr.s);
        yield* stop.d.trainCall(tr);
        tr.served = stop.s;
        tr.status = 'Running';
      }
      tr.status = tr.at ? tr.status : tr.v < 0.5 ? 'Held at signal' : 'Running';
      tr.place(tr.s);
      yield;
    }
  }
  // two shuttles once two depots work, a third when all four pods are on the line
  R.startShuttles = function () {
    if (!R.built) return;
    const depots = WT.facilities.filter((f) => f.type === 'Ring depot' && f.active).length;
    const want = depots >= 4 ? 3 : depots >= 2 ? 2 : 0;
    while (R.trains.length < want) {
      // start in the biggest gap between the shuttles already running
      let s0 = 0;
      if (R.trains.length) {
        const ss = R.trains.map((t) => wrap(t.s)).sort((a, b) => a - b);
        let best = -1;
        ss.forEach((s, i) => { const nx = i + 1 < ss.length ? ss[i + 1] : ss[0] + L, gap = nx - s; if (gap > best) { best = gap; s0 = s + gap / 2; } });
      }
      const tr = new RingTrain(s0, 4);
      WT.log(`🚆 Ring shuttle ${tr.id} enters service on the Production Ring`, 'blue', true);
      WT.spawn(runShuttle(tr));
    }
  };
})();
