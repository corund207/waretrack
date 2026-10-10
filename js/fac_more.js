/* WareTrack – logistics infrastructure: empty-container depot (RTG), truck stop, substation, water tower, mover depot */
(function () {
  const T = THREE, M = WT.M, W = WT.W, CR = WT.CraneOps;

  /* ================= container depot ================= */
  const ROWS = [58, 64, 70, 76, 82, 88, 94], COLS = [-33, -20, -7, 6, 19, 32], MAXH = 3;
  class Depot extends WT.Facility {
    constructor(plot) {
      super('Container depot', 'DEP', 'Empty Container Depot', plot);
      this.docks = [{ n: 1, z: 0, truck: null, ops: ['drop-empty', 'pick-empty'] }];
      this.income = 9000;
      this.site = { x: 76, z: 0, w: 46, d: 80, h: 10 };
      this.slots = [];
      for (const x of ROWS) for (const z of COLS) this.slots.push({ x, z, items: [] });
      this.jobs = [];
    }
    get gateIn() { return { A: this.plot.A, z: this.toWorld(0, 46)[1] }; }
    get gateOut() { return { A: this.plot.A, z: this.toWorld(0, -46)[1] }; }
    inPath() { return [[0, 46], [47, 46], [47, 0]].map(([x, z]) => this.toWorld(x, z)); }
    outPath() { return [[47, 0], [47, -46], [0, -46]].map(([x, z]) => this.toWorld(x, z)); }
    // appointment trucks wait for the RTG lane on the entry road inside the gate, not out on the avenue
    stagePath() { return [[0, 46], [30, 46]].map(([x, z]) => this.toWorld(x, z)); }
    get stageSkip() { return 1; }
    count() { return this.slots.reduce((n, s) => n + s.items.length, 0); }
    room() { return this.slots.length * MAXH - this.count(); }
    build() {
      this.pad();
      this.addGates();
      const g = this.group, S = this.structure;
      W.flat(g, 6, 98, W.COL.road, 47, 0, 0.028);
      W.flat(g, 48, 6, W.COL.road, 24, 46, 0.028);
      W.flat(g, 48, 6, W.COL.road, 24, -46, 0.028);
      const yel = [];
      for (const s of this.slots) W.dashRect(yel, s.x, s.z, 3.2, 11.6, 1, 0.6, 0.18);
      W.dashes(g, yel, W.COL.yellow, 0.06);
      for (const x of [42, 102]) W.flat(g, 1.2, 90, 0x9aa1c4, x, 0, 0.04);
      M.block(S, { x: 20, z: -30, w: 12, d: 10, h: 5, trim: 0xf0b429 });
      const b = new M.MB();
      for (const [x, z] of [[106, -45], [106, 45], [30, 30]]) { b.cyl(0.3, 0.4, 16, 0x9aa1c4, x, 8, z, 6); b.box(3, 1, 1.6, 0xfff6d0, x, 16, z); }
      S.add(b.mesh());
      this.crane = M.gantry(60, 15);
      this.crane.group.position.set(72, 0, 0);
      S.add(this.crane.group);
    }
    activate() {
      super.activate();
      for (let i = 0; i < 46; i++) {
        const s = WT.pick(this.slots.filter((q) => q.items.length < MAXH));
        const c = WT.SUP.newContainer(11);
        WT.SUP.note(c, 'Stored empty at ' + this.id);
        c.status = 'Empty · depot'; c.loc = this.id;
        this.group.add(c.mesh);
        c.mesh.position.set(s.x, s.items.length * 2.7, s.z);
        c.mesh.rotation.y = Math.PI / 2;
        s.items.push(c);
      }
      WT.spawn(this.worker());
    }
    *travel(z, tx, v = 6) {
      const c = this.crane, z0 = c.group.position.z, t0 = c.tx;
      const dur = Math.max(Math.abs(z - z0) / v, Math.abs(tx - t0) / (v * 1.3), 0.2);
      yield* WT.tween(dur, (k) => { const e = WT.ease(k); c.group.position.z = WT.lerp(z0, z, e); CR.setC(c, WT.lerp(t0, tx, e), c.hy); });
    }
    *lift(mesh, from, to, place) {
      const c = this.crane, safe = 12;
      yield* CR.hoist(c, safe);
      yield* this.travel(from.z, from.x - 72);
      yield* CR.hoist(c, from.top + 0.25);
      CR.grab(c, mesh);
      yield* WT.sleep(0.3);
      yield* CR.hoist(c, safe);
      yield* this.travel(to.z, to.x - 72);
      yield* CR.hoist(c, to.base + 2.95);
      c.carry = null;
      place(mesh);
      yield* WT.sleep(0.2);
    }
    *worker() {
      while (true) {
        const j = this.jobs.shift();
        if (!j) { yield* WT.sleep(0.25); continue; }
        yield* j.run();
        j.done = true;
        this.moves++;
        WT.G && WT.G.earn(4000, this);
      }
    }
    *queue(run) { const j = { run, done: false }; this.jobs.push(j); while (!j.done) yield; }
    *serve(t, leg) {
      t.where = this.id + ' · RTG lane';
      const truckLocal = () => { const p = new T.Vector3(); t.mesh.userData.cargo.getWorldPosition(p); return this.group.worldToLocal(p); };
      if (leg.op === 'drop-empty') {
        t.status = 'Returning empty';
        yield* this.queue(function* () {
          const c = t.container;
          if (!c) return;
          const s = this.slots.filter((q) => q.items.length < MAXH).sort((a, b) => b.items.length - a.items.length || Math.abs(a.z) - Math.abs(b.z))[0];
          if (!s) return;
          const p = truckLocal();
          yield* this.lift(c.mesh, { x: p.x, z: p.z, top: p.y + 2.7 }, { x: s.x, z: s.z, base: s.items.length * 2.7 }, (m) => {
            this.group.attach(m);
            m.position.set(s.x, s.items.length * 2.7, s.z);
            m.rotation.set(0, Math.PI / 2, 0);
          });
          s.items.push(c);
          t.container = null;
          c.status = 'Empty · depot'; c.loc = this.id;
          WT.SUP.note(c, 'Returned empty to ' + this.id);
        }.bind(this));
      } else {
        t.status = 'Collecting empty';
        yield* this.queue(function* () {
          const top = (q) => q.items[q.items.length - 1];
          const s = this.slots.filter((q) => q.items.length && !top(q).open).sort((a, b) => b.items.length - a.items.length)[0] || this.slots.filter((q) => q.items.length)[0];
          if (!s) return;
          const c = s.items[s.items.length - 1];
          const p = truckLocal();
          yield* this.lift(c.mesh, { x: s.x, z: s.z, top: s.items.length * 2.7 }, { x: p.x, z: p.z, base: p.y }, (m) => {
            const cargo = t.mesh.userData.cargo;
            cargo.attach(m);
            m.position.set(0, 0, 0); m.rotation.set(0, 0, 0);
          });
          s.items.pop();
          t.container = c;
          c.status = 'On truck'; c.loc = t.id;
          WT.SUP.note(c, `Released empty to ${t.id}`);
        }.bind(this));
      }
    }
    card() {
      return this.cardBase({ kicker: 'Facility · Container depot', icon: '🧱', sub: 'Empty boxes, RTG-served', where: this.count() + ' TEU stored',
        bars: [{ label: 'Yard occupancy', val: this.count(), max: this.slots.length * MAXH }],
        rows: [['Empties stored', String(this.count())], ['Capacity', String(this.slots.length * MAXH)], ['Crane moves', WT.fmtNum(this.moves)], ['Queued jobs', String(this.jobs.length)]] });
    }
  }

  /* ================= truck stop ================= */
  class TruckStop extends WT.Facility {
    constructor(plot) {
      super('Truck stop', 'TS', 'Highway Truck Stop', plot);
      this.docks = [52, 64].map((x, i) => ({ n: i + 1, x, truck: null, ops: ['rest'] }));
      this.income = 6000;
      this.site = { x: 70, z: 0, w: 60, d: 80, h: 8 };
      this.served = 0;
    }
    get gateIn() { return { A: this.plot.A, z: this.toWorld(0, 46)[1] }; }
    get gateOut() { return { A: this.plot.A, z: this.toWorld(0, -46)[1] }; }
    inPath(d) { return [[0, 46], [40, 46], [40, 18], [d.x, 9], [d.x, 0]].map(([x, z]) => this.toWorld(x, z)); }
    outPath(d) { return [[d.x, 0], [d.x, -12], [40, -26], [40, -46], [0, -46]].map(([x, z]) => this.toWorld(x, z)); }
    build() {
      this.pad();
      const g = this.group, S = this.structure;
      W.flat(g, 6, 92, W.COL.road, 40, 0, 0.028);
      W.flat(g, 40, 6, W.COL.road, 20, 46, 0.028);
      W.flat(g, 40, 6, W.COL.road, 20, -46, 0.028);
      W.flat(g, 30, 40, W.COL.road, 58, 0, 0.029);
      const b = new M.MB();
      for (const x of [46, 58, 70]) for (const z of [-10, 10]) b.box(0.6, 7, 0.6, 0xe9ecf7, x, 0, z);
      b.box(28, 0.8, 24, 0xf6f7fd, 58, 7, 0);
      b.box(28.4, 1.4, 24.4, 0x2f56e0, 58, 6.4, 0);
      for (const x of [58]) for (const z of [-6, 0, 6]) { b.box(1.2, 2, 0.8, 0xe9ecf7, x, 0, z); b.box(1.25, 0.5, 0.85, 0xd9434b, x, 1.6, z); }
      // diner
      b.box(22, 6, 16, 0xf3f5fd, 88, 0, 32);
      b.box(22.4, 0.6, 16.4, 0xd9434b, 88, 6, 32);
      b.box(22.1, 2, 12, 0x3a4a86, 88, 2, 32);
      b.box(0.4, 12, 0.4, 0x9aa1c4, 96, 0, 20);
      b.box(6, 3, 0.4, 0xf0b429, 96, 12, 20);
      // parked rigs bay markings
      const marks = [];
      for (let i = 0; i < 5; i++) W.dashLine(marks, 76 + i * 6, -44, 76 + i * 6, -14, 30, 0, 0.2);
      W.dashes(g, marks, 0xf8f9ff, 0.05);
      S.add(b.mesh());
      for (let i = 0; i < 3; i++) {
        const r = M.rig({ cab: WT.pick(WT.CARRIERS).cab, trailer: WT.pick(['box', 'reefer', 'tanker', 'curtain']), label: '', style: WT.pick(['conv', 'cabover']) });
        r.position.set(79 + i * 6, 0, -29);
        r.rotation.y = -Math.PI / 2;
        S.add(r);
      }
      const tex = M.canvasTex(256, 64, (ctx) => { ctx.fillStyle = '#ffffff'; ctx.font = '800 44px Inter, Arial'; ctx.fillText('FUEL · DIESEL', 8, 46); });
      const d = M.decal(tex, 12, 3);
      d.position.set(58, 7.1, 12.25);
      S.add(d);
    }
    *serve(t) {
      t.status = 'Refuelling';
      t.where = this.id;
      yield* WT.sleep(WT.rnd(5, 9));
      this.served++;
      WT.G && WT.G.earn(2500, this);
    }
    card() { return this.cardBase({ kicker: 'Facility · Truck stop', icon: '⛽', sub: 'Diesel, rest area, diner', where: this.served + ' trucks served', rows: [['Fuel bays', '2'], ['Trucks served', String(this.served)], ['Diesel', '$3.89/gal']] }); }
  }

  /* ================= substation + water tower ================= */
  class Substation extends WT.Facility {
    constructor(plot) { super('Substation', 'SUB', 'Grid Substation', plot); this.income = 5000; this.site = { x: 56, z: 0, w: 70, d: 70, h: 12 }; }
    build() {
      this.pad();
      const b = new M.MB();
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        const x = 30 + i * 22, z = -24 + j * 24;
        b.box(6, 5, 4.5, 0x9aa1c4, x, 0, z);
        for (const dx of [-2, 0, 2]) b.cyl(0.25, 0.4, 3, 0xe9ecf7, x + dx, 6.5, z, 8);
        b.box(0.4, 12, 0.4, 0x6a7194, x - 4, 0, z - 4);
        b.box(0.4, 12, 0.4, 0x6a7194, x + 4, 0, z - 4);
        b.box(8.4, 0.4, 0.4, 0x6a7194, x, 11.6, z - 4);
      }
      b.box(80, 2.2, 0.15, 0xb7bdd9, 56, 0, -46); b.box(80, 2.2, 0.15, 0xb7bdd9, 56, 0, 46);
      b.box(0.15, 2.2, 92, 0xb7bdd9, 16, 0, 0); b.box(0.15, 2.2, 92, 0xb7bdd9, 96, 0, 0);
      this.structure.add(b.mesh());
    }
    card() { return this.cardBase({ kicker: 'Facility · Substation', icon: '🔌', sub: '132 / 33 kV', where: '9 transformers', rows: [['Transformers', '9'], ['Voltage', '132 / 33 kV']] }); }
  }
  class WaterTower extends WT.Facility {
    constructor(plot) { super('Water tower', 'WTR', 'Water Tower', plot); this.income = 3000; this.site = { x: 50, z: 0, w: 20, d: 20, h: 36 }; }
    build() {
      this.pad();
      const b = new M.MB();
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; b.boxC(0.6, 26, 0.6, 0x9aa1c4, 50 + Math.cos(a) * 5, 13, Math.sin(a) * 5, Math.sin(a) * 0.14, 0, -Math.cos(a) * 0.14); }
      b.cyl(1, 1, 26, 0xdfe3f2, 50, 13, 0, 10);
      b.sphere(8, 0xf3f5fd, 50, 30, 0, 1, 0.75, 1, 20);
      b.cyl(8.05, 8.05, 1.2, 0x2f56e0, 50, 30, 0, 20);
      b.box(12, 5, 10, 0xe9ecf7, 80, 0, 20);
      this.structure.add(b.mesh());
      const tex = M.canvasTex(256, 256, (ctx) => {
        ctx.fillStyle = '#2f56e0'; M.hexPath(ctx, 128, 128, 100); ctx.fill();
        ctx.fillStyle = '#ffffff'; M.hexPath(ctx, 128, 128, 44); ctx.fill();
      });
      for (const [x, z, r] of [[50, 8.1, 0], [50, -8.1, Math.PI], [58.1, 0, Math.PI / 2], [41.9, 0, -Math.PI / 2]]) {
        const d = new T.Mesh(new T.PlaneGeometry(6, 6), new T.MeshLambertMaterial({ map: tex, transparent: true }));
        d.position.set(x, 31, z); d.rotation.y = r;
        this.structure.add(d);
      }
    }
    card() { return this.cardBase({ kicker: 'Utility · Water', icon: '💧', sub: 'Park water supply', where: '2.4 ML', rows: [['Capacity', '2.4 ML'], ['Pressure', '5.2 bar']] }); }
  }

  /* ================= mover depot ================= */
  // Home of the autonomous container mover fleet. Each mover owns a drive-through charging bay: it rolls out forward
  // when a job comes in, does the job and comes back to the same bay. Bank N bays are entered off the north road and
  // left via the middle road; bank S bays are entered off the middle road and left via the south road. New movers
  // arrive on heavy-haul lowloaders that drive down the empty bay's lane and let the mover reverse straight off.
  const MV_X = [26, 33, 40, 47, 54, 61, 68, 75, 82, 89], MV_N = 26, MV_S = -20, FEED_X = 14, EAST_X = 102;
  const HAUL = 14.2; // the lowloader stops this far short of the bay, so the mover rolls off right onto its spot
  let moverSeq = 100;
  WT.nextMoverId = () => 'AGV-' + ++moverSeq;
  class MoverDepot extends WT.Facility {
    constructor(plot) {
      super('Mover depot', 'MVD', 'Autonomous Mover Depot', plot);
      this.income = 8000;
      this.site = { x: 56, z: 0, w: 76, d: 70, h: 8 };
      this.bays = [];
      for (const [bank, z] of [['N', MV_N], ['S', MV_S]]) for (const x of MV_X) {
        const b = { n: this.bays.length + 1, bank, x, z, depot: this, state: 'empty', unit: null, mesh: null, truck: null, ops: ['depart', 'park'] };
        b.del = { n: b.n + 'H', bay: b, deliver: true, truck: null, ops: ['deliver'] };
        this.bays.push(b);
      }
      this.docks = [...this.bays, ...this.bays.map((b) => b.del)]; // every bay is a fixed appointment: nothing is handed out
      this.delivered = 0;
    }
    get gateIn() { return { A: this.plot.A, z: this.toWorld(0, 46)[1] }; }
    get gateOut() { return { A: this.plot.A, z: this.toWorld(0, -46)[1] }; }
    inPath(d) {
      const b = d.bay || d, stop = d.deliver ? b.z - HAUL : b.z;
      const pts = b.bank === 'N' ? [[0, 46], [b.x, 46], [b.x, stop]] : [[0, 46], [FEED_X, 46], [FEED_X, 0], [b.x, 0], [b.x, stop]];
      return pts.map(([x, z]) => this.toWorld(x, z));
    }
    outPath(d) {
      const b = d.bay || d, stop = d.deliver ? b.z - HAUL : b.z;
      const pts = b.bank === 'N' ? [[b.x, stop], [b.x, 0], [EAST_X, 0], [EAST_X, -46], [0, -46]] : [[b.x, stop], [b.x, -46], [0, -46]];
      return pts.map(([x, z]) => this.toWorld(x, z));
    }
    reserve() { return null; }
    freeDocks() { return 0; }
    release() {}
    worldOf(b) { return this.toWorld(b.x, b.z); }
    fleet() { return this.bays.filter((b) => b.state === 'home' || b.state === 'out').length; }
    build() {
      this.pad();
      this.addGates();
      const g = this.group, S = this.structure, road = W.COL.road;
      W.flat(g, 95, 6, road, 47.5, 46, 0.028);           // north road
      W.flat(g, 6, 49, road, FEED_X, 23, 0.028);         // feeder to the middle road
      W.flat(g, 94, 6, road, 58, 0, 0.028);              // middle road
      W.flat(g, 6, 52, road, EAST_X, -23, 0.028);        // east road
      W.flat(g, 105, 6, road, 52.5, -46, 0.028);         // south road
      for (const x of MV_X) for (const zc of [23, -23]) W.flat(g, 4.4, 46, 0x8e95b8, x, zc, 0.026); // bay lanes
      const yel = [], arrows = [];
      for (const b of this.bays) W.dashRect(yel, b.x, b.z + 1.2, 3.8, 14, 1.1, 0.6, 0.2);
      W.dashes(g, yel, W.COL.yellow, 0.06);
      for (const x of MV_X) arrows.push({ x, z: MV_N + 12, len: 1.8, w: 0.45, rot: Math.PI / 2 }, { x, z: MV_S - 12, len: 1.8, w: 0.45, rot: Math.PI / 2 });
      for (const x of [30, 60, 90]) arrows.push({ x, z: 46, len: 2.2, w: 0.5, rot: 0 }, { x, z: 0, len: 2.2, w: 0.5, rot: 0 }, { x, z: -46, len: 2.2, w: 0.5, rot: Math.PI });
      W.dashes(g, arrows, 0xffffff, 0.06);
      const b = new M.MB();
      // a charging mast between each pair of lanes: a pedestal at the bay, an arm reaching over the parked mover with
      // a roof-contact pantograph (high enough to clear a mover with a box or tank on its deck)
      for (const bay of this.bays) {
        const x = bay.x + 3.5, z = bay.z + 1.2;
        b.box(0.6, 1.8, 0.9, 0xe9ecf7, x, 0, z);                 // charger cabinet
        b.box(0.62, 0.3, 0.92, 0x2aa198, x, 1.5, z);
        b.box(0.1, 0.25, 0.25, 0x6bd16b, x - 0.32, 1.2, z);      // ready lamp
        b.box(0.35, 5.6, 0.35, 0x9aa1c4, x, 0, z + 1.2);          // mast
        b.box(3.9, 0.3, 0.4, 0x9aa1c4, x - 1.8, 5.4, z + 1.2);    // arm over the bay
        b.box(1.6, 0.18, 1.2, 0x3a4166, bay.x, 5.15, z + 1.2);    // pantograph head
        b.box(0.12, 0.6, 0.12, 0x3a4166, bay.x, 5.0, z + 1.2);
      }
      // fleet control centre, battery store and substation on the west strip
      b.box(6, 3, 12, 0x3a4166, 5, 0, 22); b.box(6.2, 0.4, 12.2, 0x2aa198, 5, 3, 22);
      for (const z of [-8, -4]) b.box(5, 2.4, 2.6, 0xc6cbe3, 5, 0, z);
      for (const z of [-30, -20]) b.box(0.25, 9, 0.25, 0x9aa1c4, 21, 0, z);
      S.add(b.mesh());
      M.block(S, { x: 10, z: -27, w: 12, d: 14, h: 7, trim: 0x2aa198,
        extra: (q) => { q.cyl(0.15, 0.15, 3, 0x9aa1c4, 13, 8.5, -24, 6); q.sphere(1.4, 0xf3f5fd, 13, 10.4, -24, 1, 0.4, 1, 10); } });
    }
    activate() {
      super.activate();
      // the first depot is commissioned with a full fleet, a mover on every charger; later ones open with a starter
      // fleet and the supply planner fills their bays by lowloader as the work grows
      const first = !WT.facilities.some((f) => f !== this && f.type === 'Mover depot' && f.active);
      for (const b of this.bays.slice(0, first ? this.bays.length : 8)) this.park(b, { id: WT.nextMoverId(), jobs: 0 }, this.parkedMesh());
    }
    parkedMesh() { return M.mover({ deck: 'flat', color: WT.SUP.MOVERS.cab }); }
    park(b, unit, mesh) {
      this.group.add(mesh);
      mesh.position.set(b.x, 0, b.z); mesh.rotation.set(0, Math.PI / 2, 0);
      b.mesh = mesh; b.unit = unit; b.state = 'home';
    }
    // a lowloader is booked for an empty bay: the new mover rides on its deck
    loadHauler(t, b) {
      const m = this.parkedMesh();
      t.mesh.userData.cargo.add(m);
      m.position.set(-0.2, 0, 0);
      t.newMover = m; t.newUnit = { id: WT.nextMoverId(), jobs: 0 };
      t.circ = [-8.8, -6.0, -3.0, 0, 2.8, 5.4]; t.rear = 10; // the mover overhangs the deck at the back
      b.state = 'incoming';
      t.mission = `Fleet delivery: ${t.newUnit.id} → ${this.id} bay ${b.n}`;
    }
    *serve(t, leg) {
      t.where = this.id;
      if (leg.op === 'depart') {
        leg.dock.mesh.visible = false;
        t.status = 'Unplugging from charger';
        yield* WT.sleep(0.5);
      } else if (leg.op === 'park') {
        t.status = 'Plugging in to charge';
        yield* WT.sleep(0.4);
        const b = leg.dock;
        b.mesh.visible = true; t.mesh.visible = false;
        b.state = 'home'; b.unit.jobs++;
        this.moves++;
        t.parked = true;
      } else if (leg.op === 'deliver') {
        const b = leg.dock.bay, m = t.newMover;
        t.status = 'Lowering ramps';
        yield* WT.sleep(1.2);
        t.status = 'Unloading new mover';
        this.group.attach(m);
        const from = m.position.clone(), r0 = m.rotation.y;
        // reverses down the deck and the ramps straight onto its charging spot
        yield* WT.tween(4, (k) => {
          const e = WT.ease(k);
          m.position.set(WT.lerp(from.x, b.x, e), from.y * WT.clamp((1 - k) / 0.4, 0, 1), WT.lerp(from.z, b.z, e));
          m.rotation.y = WT.lerp(r0, Math.PI / 2, e);
        });
        this.park(b, t.newUnit, m);
        t.newMover = null;
        this.delivered++;
        WT.log(`🤖 ${b.unit.id} delivered to ${this.id} · fleet now ${WT.SUP.fleet().size} movers`, 'green');
        yield* WT.sleep(0.6);
      }
    }
    card() {
      const n = (s) => this.bays.filter((b) => b.state === s).length;
      return this.cardBase({ kicker: 'Facility · Mover depot', icon: '🤖', sub: 'Autonomous container mover fleet', where: this.fleet() + ' movers based here',
        bars: [{ label: 'Bays in use', val: this.bays.length - n('empty'), max: this.bays.length }],
        rows: [['Charging', String(n('home'))], ['On jobs', String(n('out'))], ['Arriving by lowloader', String(n('incoming'))], ['Free bays', String(n('empty'))],
          ['Movers delivered', String(this.delivered)], ['Jobs completed', WT.fmtNum(this.moves)]] });
    }
  }

  WT.Depot = Depot; WT.TruckStop = TruckStop; WT.Substation = Substation; WT.WaterTower = WaterTower; WT.MoverDepot = MoverDepot;
})();
