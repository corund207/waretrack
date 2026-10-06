/* WareTrack – rail: crane helpers, articulated trains, intermodal rail terminals */
(function () {
  const T = THREE, M = WT.M, W = WT.W;

  /* ================= crane helpers (shared with the port) ================= */
  const CR = (WT.CraneOps = {});
  CR.setC = (c, tx, hy) => { c.tx = tx; c.hy = hy; c.set(tx, hy); };
  CR.hoist = function* (c, hy, v = 6) {
    const h0 = c.hy, dur = Math.abs(hy - h0) / v;
    if (dur > 0.01) yield* WT.tween(dur, (t) => CR.setC(c, c.tx, WT.lerp(h0, hy, WT.ease(t))));
  };
  CR.travel = function* (c, gx, tx, v = 6) {
    const g0 = c.group.position.x, t0 = c.tx;
    const dur = Math.max(Math.abs(gx - g0) / v, Math.abs(tx - t0) / (v * 1.3), 0.2);
    yield* WT.tween(dur, (t) => {
      const e = WT.ease(t);
      c.group.position.x = WT.lerp(g0, gx, e);
      CR.setC(c, WT.lerp(t0, tx, e), c.hy);
    });
  };
  CR.grab = (c, mesh) => {
    c.spreader.add(mesh);
    mesh.position.set(0, -2.95, 0);
    mesh.rotation.set(0, c.carryRot, 0);
    mesh.scale.set(1, 1, 1);
    c.carry = mesh;
  };
  CR.release = (c) => {
    const m = c.carry;
    WT.scene.attach(m);
    c.carry = null;
    return m;
  };
  // from/to: {x (world gantry pos), t (trolley coord), top|base}
  CR.move = function* (c, mesh, from, to, safe, v = 6) {
    yield* CR.hoist(c, safe, v);
    yield* CR.travel(c, from.x, from.t, v);
    yield* CR.hoist(c, from.top + 0.25, v);
    CR.grab(c, mesh);
    yield* WT.sleep(0.3);
    yield* CR.hoist(c, safe, v);
    yield* CR.travel(c, to.x, to.t, v);
    yield* CR.hoist(c, to.base + 2.95, v);
    const m = CR.release(c);
    yield* WT.sleep(0.2);
    return m;
  };

  /* ================= trains ================= */
  WT.trains = [];
  let trainSeq = 310;
  class Train extends WT.Entity {
    constructor(o) {
      super();
      this.kind = 'train';
      this.id = 'RT-' + trainSeq++;
      this.operator = WT.pick(['NorthRail', 'Keystone Freight', 'Great Lakes RR', 'Coastline Rail']);
      this.dest = o.terminal ? o.terminal.id : WT.pick(WT.RAIL_DEST);
      this.terminal = o.terminal || null;
      this.track = o.track || 'E';
      this.status = 'Approaching';
      this.cars = [];
      const loco = M.loco(WT.pick([0x2f56e0, 0xd9434b, 0x1aa6b7, 0xf08c2a]));
      this.cars.push({ g: loco });
      const n = o.wagons || 6;
      this.manifest = o.manifest || [];
      const origin = WT.pick(WT.RAIL_DEST);
      for (let i = 0; i < n; i++) {
        const kind = o.terminal ? 'container' : WT.pick(['container', 'container', 'tank', 'hopper', 'box']);
        const w = M.wagonKind(kind);
        let cont = null;
        const po = o.terminal ? this.manifest[i] : null;
        if (po) {
          cont = WT.SUP.newContainer(11);
          WT.SUP.fillPO(cont, po);
          WT.SUP.note(cont, `Loaded at ${origin} ramp for ${po.to.id} (${po.id})`);
          WT.SUP.ev(po, `On train · ${this.id} from ${origin}`);
          po.vehicle = this;
        } else if (!o.terminal && kind === 'container' && Math.random() < (o.fill === undefined ? 0.75 : o.fill)) cont = WT.SUP.newContainer(11);
        if (cont) { cont.status = 'On rail'; w.userData.slot.add(cont.mesh); }
        this.cars.push({ g: w, cont });
      }
      this.cars.forEach((c) => WT.scene.add(c.g));
      this.mesh = loco;
      WT.register(this);
      this.cars.forEach((c) => { c.g.userData.entityId = this.uid; WT.pickables.add(c.g); });
      WT.trains.push(this);
      this.s = 0; this.v = 0;
    }
    radius() { return 30; }
    place(s) {
      this.s = s;
      this.cars.forEach((c, i) => {
        const p = this.path.at(s - 13 * i);
        c.g.position.set(p.x, 0, p.z);
        c.g.rotation.y = -p.a;
      });
    }
    headX() { return this.cars[0].g.position.x; }
    tailX() { return this.cars[this.cars.length - 1].g.position.x; }
    remove() {
      this.cars.forEach((c) => { WT.scene.remove(c.g); WT.pickables.delete(c.g); if (c.cont) WT.unregister(c.cont); });
      WT.unregister(this);
      WT.trains.splice(WT.trains.indexOf(this), 1);
    }
    card() {
      const n = this.cars.filter((c) => c.cont).length;
      return {
        kicker: 'Freight train · ' + this.operator, title: this.id, sub: this.terminal ? 'Calling at ' + this.terminal.id : 'Through freight → ' + this.dest,
        icon: '🚆', iconBg: '#9fb4ff', status: this.status, statusTone: WT.toneFor(this.status), where: this.track === 'E' ? 'Eastbound main' : 'Westbound main',
        rows: [['Operator', this.operator], ['Booked orders', this.manifest.length ? this.manifest.map((p) => p.id).join(', ') : 'None'], ['Consist', `1 loco + ${this.cars.length - 1} wagons`], ['Containers', n + ' / ' + (this.cars.length - 1)],
          ['Speed', Math.round(this.v * 3.6) + ' km/h'], ['Shipment', this.shipment ? '#' + this.shipment.id : '—'], ['Destination', this.dest]],
      };
    }
    label() { return this.id + ' · ' + this.operator; }
  }
  WT.Train = Train;

  function* runTrain(tr) {
    const R = W.RAIL, X = W.EDGE + 250;
    const term = tr.terminal;
    let pts;
    if (tr.track === 'W') pts = [[X, R.zW], [-X, R.zW]];
    else if (term) pts = [[term.A - 800, R.zE], [term.A - 150, R.zE], [term.A - 110, -636], [term.A + 110, -636], [term.A + 150, R.zE], [X, R.zE]];
    else pts = [[-X, R.zE], [X, R.zE]];
    tr.path = WT.buildPath(pts, 30);
    let stopS = null;
    if (term) {
      for (let s = 0; s < tr.path.len; s += 1) if (tr.path.at(s).x >= term.A + 45 && Math.abs(tr.path.at(s).z + 636) < 0.5) { stopS = s; break; }
      if (stopS === null) term.busy = null;
    }
    let s = 0, v = 16, stopped = false;
    tr.place(0);
    while (s - 13 * tr.cars.length < tr.path.len) {
      const dt = WT.sim.dt;
      let target = 22;
      if (stopS !== null && !stopped) target = Math.min(target, Math.sqrt(2 * 1.0 * Math.max(0, stopS - s)) + 0.2);
      // keep distance from the train ahead on the same track
      const hx = tr.headX(), dir = tr.track === 'W' ? -1 : 1;
      for (const o of WT.trains) {
        if (o === tr || o.track !== tr.track || Math.abs(o.cars[0].g.position.z - tr.cars[0].g.position.z) > 3) continue;
        const gap = (o.tailX() - hx) * dir;
        if (o.headX() * dir > hx * dir && gap < 160) target = Math.min(target, Math.sqrt(2 * 2 * Math.max(0, gap - 30)));
      }
      v += WT.clamp(target - v, -3 * dt, 2.2 * dt);
      tr.v = v;
      s += v * dt;
      if (stopS !== null && !stopped && s >= stopS - 0.05) {
        s = stopS; v = 0; tr.v = 0;
        tr.place(s);
        stopped = true;
        yield* term.trainCall(tr);
        tr.status = 'Departing';
      }
      tr.place(s);
      yield;
    }
    tr.remove();
  }

  /* ================= rail terminal ================= */
  class RailTerminal extends WT.Facility {
    constructor(A) {
      super('Rail terminal', 'RAIL', 'Intermodal Yard', null);
      this.A = A;
      this.name = 'Intermodal Yard';
      this.cz = -620;
      this.docks = [{ n: 1, x: A + 24, z: -604, truck: null, ops: ['pick', 'drop'] }];
      this.jobs = [];
      this.income = 22000;
      this.busy = null;
      this.pendingPick = 0;
      this.pendingDrop = 0;
      this.site = null;
      this.slots = [];
      for (const z of [-624, -613]) for (let x = A - 63; x <= A + 63.1; x += 12.6) this.slots.push({ x, z, items: [] });
    }
    center() { return [this.A, -615]; }
    bounds() { return { x0: this.A - 160, x1: this.A + 160, z0: -646, z1: -575 }; }
    radius() { return 90; }
    get gateIn() { return { A: this.A, z: -580 }; }
    get gateIdx() { return 0; }
    get gateOut() { return { A: this.A, z: -588 }; }
    inPath() { const A = this.A; return [[A + 3, -587], [A + 3, -592], [A - 82, -592], [A - 82, -604], [A + 24, -604]]; }
    outPath() { const A = this.A; return [[A + 24, -604], [A + 82, -604], [A + 82, -588], [A + 10, -588]]; }
    stackCount() { return this.slots.reduce((n, s) => n + s.items.length, 0); }
    stackRoom() { return this.slots.length * 2 - this.stackCount(); }

    build() {
      const A = this.A, g = this.group, S = this.structure;
      W.flat(g, 330, 54, W.COL.concrete, A, -612, 0.027);
      W.flat(g, 300, 10, W.COL.ballast, A, -636, 0.03);
      W.flat(g, 170, 6, W.COL.road, A, -604, 0.032);
      W.flat(g, 88, 6, W.COL.road, A - 40, -592, 0.032);
      W.flat(g, 6, 16, W.COL.road, A - 82, -598, 0.032);
      W.flat(g, 6, 20, W.COL.road, A + 82, -596, 0.032);
      W.flat(g, 76, 6, W.COL.road, A + 46, -588, 0.032);
      const b = new M.MB();
      for (const o of [-0.75, 0.75]) b.box(220, 0.25, 0.22, 0x6a7194, A, 0.05, -636 + o);
      for (const sx of [-1, 1]) {
        const L = Math.hypot(40, 14), ang = Math.atan2(14, 40) * sx;
        for (const o of [-0.75, 0.75]) b.boxC(L, 0.25, 0.22, 0x6a7194, A + sx * 130, 0.18, -643 + o, 0, ang, 0);
      }
      for (const gx of [-642, -598]) b.box(190, 0.15, 0.5, 0x7a81a4, A, 0.04, gx);
      S.add(b.mesh(false, true));
      const sl = [];
      for (let x = A - 110; x < A + 110; x += 1.7) sl.push({ x, z: -636, len: 0.5, w: 3.4 });
      W.dashes(g, sl, 0xa49c90, 0.06);
      const yel = [];
      for (const s of this.slots) W.dashRect(yel, s.x, s.z, 12, 3.4, 1, 0.6, 0.2);
      W.dashes(g, yel, W.COL.yellow, 0.065);
      M.block(S, { x: A - 100, z: -592, w: 18, d: 14, h: 8 });
      W.groundText(g, this.id, A - 100, -580, 14, 3, '#9aa3c9', 0, 50);

      // OCR gate portal + booth
      const pb = new M.MB();
      const gx = A + 3, gz = -583;
      for (const s of [-1, 1]) pb.box(0.6, 6.2, 0.6, 0x9aa1c4, gx + s * 4.2, 0, gz);
      pb.box(9, 0.8, 1.2, 0x2f56e0, gx, 6.2, gz);
      for (const s of [-1, 1]) pb.box(0.8, 0.6, 0.8, 0x3a4166, gx + s * 2, 5.6, gz);
      pb.box(2.4, 2.6, 2.4, 0xf3f5fd, gx + 6.4, 0, gz);
      pb.box(2.6, 0.3, 2.6, 0x2f56e0, gx + 6.4, 2.6, gz);
      S.add(pb.mesh());
      this.crane = M.gantry(44, 17);
      this.crane.group.rotation.y = Math.PI / 2;
      this.crane.group.position.set(A, 0, this.cz);
      S.add(this.crane.group);
      this.site = { x: A, z: -620, w: 60, d: 48, h: 18, world: true };
    }
    activate() {
      super.activate();
      for (let i = 0; i < 3; i++) {
        const s = WT.pick(this.slots.filter((q) => q.items.length < 2));
        const c = WT.SUP.newContainer(11);
        WT.SUP.note(c, 'Empty staged for export');
        c.mesh.position.set(s.x, s.items.length * 2.7, s.z);
        c.loc = this.id + ' · Stack';
        WT.scene.add(c.mesh);
        s.items.push(c);
      }
      WT.spawn(this.craneWorker());
    }
    ct(z) { return this.cz - z; }
    *craneWorker() {
      while (true) {
        const job = this.jobs.shift();
        if (!job) { yield* WT.sleep(0.25); continue; }
        yield* job.run();
        job.done = true;
        this.moves++;
        WT.G && WT.G.earn(6000, this);
      }
    }
    *queue(run) {
      const job = { run, done: false };
      this.jobs.push(job);
      while (!job.done) yield;
    }
    // ----- container yard helpers (imports = material boxes, exports = sealed product boxes + empties) -----
    topOf(s) { return s.items[s.items.length - 1]; }
    isImport(c) { return c && c.contents && c.contents.kind === 'mat'; }
    findImport(m) {
      for (const s of this.slots) { const c = this.topOf(s); if (c && !c.reserved && this.isImport(c) && c.contents.mat === m) return c; }
      return null;
    }
    exportCount() { return this.slots.reduce((n, s) => n + s.items.filter((c) => !this.isImport(c)).length, 0); }
    importCount() { return this.slots.reduce((n, s) => n + s.items.filter((c) => this.isImport(c)).length, 0); }
    pickSlot(filter) {
      const c = this.slots.filter((s) => s.items.length && (filter ? filter(this.topOf(s)) : !this.topOf(s).reserved));
      return c.length ? c.reduce((a, b) => (b.items.length > a.items.length ? b : a)) : null;
    }
    dropSlot() {
      const c = this.slots.filter((s) => s.items.length < 2 && !(s.items.length && this.topOf(s).reserved));
      return c.length ? c.reduce((a, b) => (b.items.length < a.items.length ? b : a)) : null;
    }
    *toStack(cont) {
      const s = this.dropSlot();
      if (!s) return false;
      const p = new T.Vector3();
      cont.mesh.getWorldPosition(p);
      const m = yield* CR.move(this.crane, cont.mesh, { x: p.x, t: this.ct(p.z), top: p.y + 2.7 }, { x: s.x, t: this.ct(s.z), base: s.items.length * 2.7 }, 12.5);
      m.position.set(s.x, s.items.length * 2.7, s.z);
      m.rotation.set(0, 0, 0);
      cont.status = 'Stored'; cont.loc = this.id + ' · Stack';
      s.items.push(cont);
      return true;
    }
    *fromStack(target, base, place, filter) {
      const s = this.pickSlot(filter);
      if (!s) return null;
      const cont = s.items[s.items.length - 1];
      const m = yield* CR.move(this.crane, cont.mesh, { x: s.x, t: this.ct(s.z), top: s.items.length * 2.7 }, { x: target.x, t: this.ct(target.z), base }, 12.5);
      s.items.pop();
      place(m);
      return cont;
    }
    *trainCall(tr) {
      this.busy = tr;
      tr.status = 'Unloading';
      WT.log(`Train ${tr.id} arrived at ${this.id}`, 'blue', true);
      WT.emit('event', { kind: 'train', ent: tr, weight: 3 });
      const sh = WT.createShipment({ mode: 'rail', to: WT.pick(WT.RAIL_DEST), carrier: tr.operator, vehicle: tr, total: 3, transit: WT.rint(240, 600) });
      tr.shipment = sh;
      for (const car of tr.cars.slice(1)) {
        if (!car.cont) continue;
        while (this.stackRoom() < 1) yield* WT.sleep(1);
        const c = car.cont;
        yield* this.queue(function* () {
          if (yield* this.toStack(c)) {
            car.cont = null;
            WT.SUP.note(c, `Discharged at ${this.id} from ${tr.id}`);
            if (c.po) { c.at = this; c.status = 'Grounded · awaiting truck'; WT.SUP.grounded(c.po, this.id); }
          }
        }.bind(this));
      }
      tr.status = 'Loading';
      WT.advanceShipment(sh, 2);
      let loaded = 0;
      for (const car of tr.cars.slice(1)) {
        if (car.cont || loaded >= 4 || this.exportCount() < 1) continue;
        const p = new T.Vector3();
        car.g.getWorldPosition(p);
        yield* this.queue(function* () {
          const full = this.pickSlot((c) => !this.isImport(c) && c.full);
          const c = yield* this.fromStack({ x: p.x, z: p.z }, 1.45, (m) => { car.g.userData.slot.attach(m); m.position.set(0, 0, 0); m.rotation.set(0, 0, 0); }, full ? (c) => !this.isImport(c) && c.full && !c.reserved : (c) => !this.isImport(c) && !c.reserved);
          if (c) { car.cont = c; c.status = 'On rail'; c.loc = tr.id; loaded++; sh.loaded = loaded; WT.SUP.note(c, `Loaded on ${tr.id} → ${sh.to}`); }
        }.bind(this));
        WT.updateShipment(sh, Math.round(WT.secToMin((3 - loaded) * 12)));
      }
      sh.total = Math.max(1, loaded);
      WT.advanceShipment(sh, 3);
      this.busy = null;
      yield* WT.sleep(1);
    }
    *serve(t, leg) {
      t.where = this.id + ' · Crane lane';
      const spot = { x: leg.dock.x, z: leg.dock.z };
      if (leg.op === 'pick') {
        t.status = 'Awaiting container';
        let waited = 0;
        const want = leg.cont;
        const filt = want ? (c) => c === want : (c) => this.isImport(c) && !c.reserved;
        while (!this.pickSlot(filt) && waited < 40) { waited += WT.sim.dt; yield; }
        this.pendingPick = Math.max(0, this.pendingPick - 1);
        yield* this.queue(function* () {
          const cargo = t.mesh.userData.cargo;
          const c = yield* this.fromStack(spot, 1.35, (m) => { cargo.attach(m); m.position.set(0, 0, 0); m.rotation.set(0, 0, 0); }, filt);
          if (c) { c.reserved = false; c.at = null; t.container = c; c.status = 'On truck'; c.loc = t.id; WT.SUP.note(c, `Picked up by ${t.id} at ${this.id}`); }
        }.bind(this));
        if (!t.container && t.cargo) t.cargo = null;
      } else {
        t.status = 'Dropping container';
        this.pendingDrop = Math.max(0, this.pendingDrop - 1);
        while (this.stackRoom() < 1) yield;
        yield* this.queue(function* () {
          const c = t.container;
          if (c && (yield* this.toStack(c))) { t.container = null; WT.SUP.note(c, `Dropped at ${this.id} for export`); }
        }.bind(this));
      }
    }
    card() {
      return this.cardBase({
        kicker: 'Facility · Rail terminal', icon: '🚉', sub: 'Siding + RMG gantry · Avenue ' + this.A, where: this.busy && this.busy.id ? this.busy.id + ' on siding' : this.busy ? 'Train inbound' : 'Siding free',
        rows: [['Imports waiting', String(this.importCount())], ['Exports staged', String(this.exportCount())], ['Containers stacked', this.stackCount() + ' / ' + this.slots.length * 2], ['Crane lifts', WT.fmtNum(this.moves)], ['Crane', this.crane && this.crane.carry ? 'Lifting' : 'Ready'],
          ['Queued jobs', String(this.jobs.length)], ['Trains', this.busy ? '1 at siding' : 'None'], ['Revenue', '$' + WT.fmtNum(this.income * 60 * WT.G.INCOME_SCALE) + '/min']],
      });
    }
  }
  WT.RailTerminal = RailTerminal;

  /* ================= rail scheduler ================= */
  WT.startRail = function () {
    WT.spawn((function* () {
      yield* WT.waitFor(() => W.railBuilt);
      while (true) {
        const terms = WT.facilities.filter((f) => f.type === 'Rail terminal' && f.active && !f.busy && f.stackRoom() > 4);
        const S = WT.SUP;
        // a train is only routed into a terminal when there is booked freight or exports to lift
        if (terms.length && (S.backlog.rail.length || terms.some((t) => t.exportCount() >= 2))) {
          const term = terms.sort((a, b) => b.exportCount() - a.exportCount())[0];
          term.busy = 'incoming';
          const manifest = S.takeManifest('rail', 6);
          const tr = new Train({ terminal: term, wagons: 6, manifest });
          WT.spawn(runTrain(tr));
        } else {
          const tr = new Train({ track: Math.random() < 0.5 ? 'E' : 'W', wagons: WT.rint(6, 10), fill: 0.9 });
          tr.status = 'Through freight';
          WT.spawn(runTrain(tr));
        }
        yield* WT.sleep(WT.rnd(12, 24));
      }
    })());
  };
})();
