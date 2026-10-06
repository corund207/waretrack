/* WareTrack – logistics infrastructure: empty-container depot (RTG), truck stop, substation, water tower */
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

  WT.Depot = Depot; WT.TruckStop = TruckStop; WT.Substation = Substation; WT.WaterTower = WaterTower;
})();
