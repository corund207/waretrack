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
          cont = WT.SUP.newContainer(11, po.mat);
          WT.SUP.fillPO(cont, po);
          WT.SUP.note(cont, `Loaded at ${origin} ramp for ${po.to.id} (${po.id})`);
          WT.SUP.ev(po, `On train · ${this.id} from ${origin}`);
          po.vehicle = this;
        } else if (!o.terminal && kind === 'container' && Math.random() < (o.fill === undefined ? 0.75 : o.fill)) {
          // through traffic: mostly boxes, some open frames of raw material
          const om = Math.random() < 0.3 ? WT.pick(['iron', 'ore', 'sand', 'fabric', 'glass']) : null;
          cont = WT.SUP.newContainer(11, om);
          if (om) cont.load.set(WT.rnd(0.6, 1));
        }
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
  // gantry claim half-width (sill 12 m long + margin) and parking spots: the truck lanes cross the rails at A ± 82
  const CPAD = 7, CHOME = 73.5;
  class RailTerminal extends WT.Facility {
    constructor(A) {
      super('Rail terminal', 'RAIL', 'Intermodal Yard', null);
      this.A = A;
      this.name = 'Intermodal Yard';
      this.cz = -620;
      // two truck spots on the crane lane, one under each gantry's half of the stack; trucks run west → east,
      // so the far (east) spot is filled first and the near one never blocks a truck heading past it
      this.docks = [{ n: 1, x: A + 30, z: -604, truck: null, ops: ['pick', 'drop'] }, { n: 2, x: A - 30, z: -604, truck: null, ops: ['pick', 'drop'] }];
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
    // queue head waits here: its nose (7 m ahead) must stay clear of the exit lane crossing at z −588
    get gateIn() { return { A: this.A, z: -573 }; }
    get gateIdx() { return 0; }
    get gateOut() { return { A: this.A, z: -588 }; }
    inPath(d) { const A = this.A; return [[A + 3, -587], [A + 3, -592], [A - 82, -592], [A - 82, -604], [(d || this.docks[0]).x, -604]]; }
    outPath(d) { const A = this.A; return [[(d || this.docks[0]).x, -604], [A + 82, -604], [A + 82, -588], [A + 10, -588]]; }
    // east spot only while nobody is on (or heading for) the west spot, since that truck would have to pass it
    reserve(op) {
      const [east, west] = this.docks;
      const d = !east.truck && !west.truck ? east : !west.truck ? west : null;
      if (d) d.truck = 'reserved';
      return d;
    }
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
      // two rail-mounted gantries on the same rails, parked at either end of the stack
      this.cranes = [-1, 1].map((side, i) => {
        const c = M.gantry(44, 17);
        c.group.rotation.y = Math.PI / 2;
        c.id = 'RMG-' + (i + 1); c.side = side; c.home = A + side * CHOME; c.task = 'Idle'; c.lifts = 0;
        c.group.position.set(c.home, 0, this.cz);
        c.lo = c.home - CPAD; c.hi = c.home + CPAD; c.want = null; c.prio = 0; c.waited = 0;
        S.add(c.group);
        return c;
      });
      this.cranes[0].other = this.cranes[1];
      this.cranes[1].other = this.cranes[0];
      this.crane = this.cranes[0];
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
      this.cranes.forEach((c) => WT.spawn(this.craneWorker(c)));
    }
    ct(z) { return this.cz - z; }
    /* ----- two rail-mounted gantries sharing one pair of rails -----
       Each crane holds a claim on a stretch of rail [lo, hi] that always contains its own position; claims never
       overlap, so the cranes can't collide or pass each other. Before a lift a crane claims the whole stretch it
       will travel; if the other crane is in the way it backs off toward its own end and tries again. */
    reach(c, x) { return c.side < 0 ? x <= c.other.home - 2 * CPAD : x >= c.other.home + 2 * CPAD; }
    shrink(c) { const x = c.group.position.x; c.lo = x - CPAD; c.hi = x + CPAD; }
    // move just far enough toward our own end to clear the stretch the other crane is asking for
    *makeWay(c, want) {
      const x = c.group.position.x;
      const target = c.side < 0 ? Math.max(c.home, Math.min(x, want[0] - CPAD - 0.5)) : Math.min(c.home, Math.max(x, want[1] + CPAD + 0.5));
      if (Math.abs(target - x) < 0.3) { yield* WT.sleep(0.2); return; }
      c.lo = Math.min(x, target) - CPAD; c.hi = Math.max(x, target) + CPAD;
      c.task = 'Making way for ' + c.other.id;
      yield* CR.hoist(c, 12.5);
      yield* CR.travel(c, target, c.tx);
      this.shrink(c);
    }
    *acquire(c, xs, prio) {
      while (true) {
        const x = c.group.position.x, lo = Math.min(x, ...xs) - CPAD, hi = Math.max(x, ...xs) + CPAD, o = c.other;
        if (hi <= o.lo || lo >= o.hi) { c.lo = lo; c.hi = hi; c.want = null; c.waited = 0; return; }
        if (!c.want) c.waited = 0;
        c.want = [lo, hi]; c.prio = prio;
        c.task = 'Waiting for ' + o.id;
        // both waiting on each other: the one serving a truck goes first (ties: the west crane), the other steps aside
        const mutual = o.want && o.want[1] > c.lo && o.want[0] < c.hi;
        if (mutual && (o.prio > prio || (o.prio === prio && c.side > 0))) yield* this.makeWay(c, o.want);
        else { yield* WT.sleep(0.1); c.waited += 0.1; }
      }
    }
    // a job's plan(crane) returns a lift {mesh, from, to, slot, lock, commit}, null (not for this crane / not yet)
    // or 'skip' (nothing left to lift)
    addJob(j) { j.done = false; this.jobs.push(j); return j; }
    *waitJobs(list) { while (list.some((j) => !j.done)) yield; }
    *craneWorker(c) {
      while (true) {
        // the other crane has been waiting on the rail we hold: step aside before taking more work
        const oc = c.other;
        if (oc.want && oc.waited > 2 && oc.want[1] > c.lo && oc.want[0] < c.hi) { yield* this.makeWay(c, oc.want); continue; }
        // nearest job to this crane first, trucks ahead of the train so the lane keeps moving
        let job = null, lift = null, best = Infinity;
        const x = c.group.position.x;
        for (const j of this.jobs) {
          const p = j.plan(c);
          if (p === 'skip') { j.done = true; continue; }
          if (!p) continue;
          const score = Math.abs(p.from.x - x) + Math.abs(p.to.x - p.from.x) * 0.5 - (j.truck ? 40 : 0);
          if (score < best) { best = score; job = j; lift = p; }
        }
        this.jobs = this.jobs.filter((j) => !j.done && j !== job);
        if (!job) {
          // idle: stay put unless the other crane needs the rail we're standing on
          const o = c.other;
          if (o.want && o.want[1] > c.lo && o.want[0] < c.hi) yield* this.makeWay(c, o.want);
          else { c.task = 'Idle'; yield* WT.sleep(0.2); }
          continue;
        }
        if (lift.slot) lift.slot.busy = c;
        if (lift.lock) lift.lock.lifting = true;
        yield* this.acquire(c, [lift.from.x, lift.to.x], job.truck ? 1 : 0);
        c.task = job.label;
        const m = yield* CR.move(c, lift.mesh, lift.from, lift.to, 12.5);
        lift.commit(m);
        if (lift.slot) lift.slot.busy = null;
        if (lift.lock) lift.lock.lifting = false;
        this.shrink(c);
        c.task = 'Idle';
        c.lifts++;
        job.done = true;
        this.moves++;
        WT.G && WT.G.earn(6000, this);
      }
    }
    *queue(run) { yield* run(); } // (kept for compatibility)
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
    // lift a box from (wx, wz, top) into the stack: lowest free slot this crane can reach, near the source,
    // away from the other crane
    stackLift(c, mesh, wx, wz, top, commit) {
      if (!this.reach(c, wx)) return null;
      const o = c.other;
      const cands = this.slots.filter((s) => !s.busy && s.items.length < 2 && !(s.items.length && this.topOf(s).reserved) && this.reach(c, s.x));
      if (!cands.length) return null;
      const score = (s) => s.items.length * 40 + Math.abs(s.x - wx) + (s.x > o.lo - CPAD && s.x < o.hi + CPAD ? 60 : 0);
      const s = cands.reduce((a, b) => (score(b) < score(a) ? b : a));
      return {
        slot: s, mesh, from: { x: wx, t: this.ct(wz), top }, to: { x: s.x, t: this.ct(s.z), base: s.items.length * 2.7 },
        commit: (m) => {
          m.position.set(s.x, s.items.length * 2.7, s.z);
          m.rotation.set(0, 0, 0);
          s.items.push(commit());
        },
      };
    }
    // lift the top box of a matching stack onto (wx, wz) at deck height `base`
    unstackLift(c, filter, wx, wz, base, commit) {
      const any = this.slots.some((s) => s.items.length && filter(this.topOf(s)));
      if (!any) return 'skip';
      if (!this.reach(c, wx)) return null;
      const cands = this.slots.filter((s) => s.items.length && !s.busy && filter(this.topOf(s)) && !this.topOf(s).lifting && this.reach(c, s.x));
      if (!cands.length) return null;
      const s = cands.reduce((a, b) => (b.items.length > a.items.length ? b : a));
      const cont = this.topOf(s);
      return {
        slot: s, lock: cont, mesh: cont.mesh, from: { x: s.x, t: this.ct(s.z), top: s.items.length * 2.7 }, to: { x: wx, t: this.ct(wz), base },
        commit: (m) => { s.items.pop(); commit(cont, m); },
      };
    }
    *trainCall(tr) {
      this.busy = tr;
      tr.status = 'Unloading';
      WT.log(`Train ${tr.id} arrived at ${this.id}`, 'blue', true);
      WT.emit('event', { kind: 'train', ent: tr, weight: 3 });
      const sh = WT.createShipment({ mode: 'rail', to: WT.pick(WT.RAIL_DEST), carrier: tr.operator, vehicle: tr, total: 3, transit: WT.rint(240, 600) });
      tr.shipment = sh;
      // both cranes discharge the train at once, each taking the wagons on its side first
      const p = new T.Vector3();
      const discharge = tr.cars.slice(1).filter((car) => car.cont).map((car) => this.addJob({
        label: 'Discharging ' + tr.id,
        plan: (c) => {
          if (!car.cont) return 'skip';
          car.cont.mesh.getWorldPosition(p);
          const cont = car.cont;
          return this.stackLift(c, cont.mesh, p.x, p.z, p.y + 2.7, () => {
            car.cont = null;
            cont.status = 'Stored'; cont.loc = this.id + ' · Stack';
            WT.SUP.note(cont, `Discharged at ${this.id} from ${tr.id}`);
            if (cont.po) { cont.at = this; cont.status = 'Grounded · awaiting truck'; WT.SUP.grounded(cont.po, this.id); }
            return cont;
          });
        },
      }));
      yield* this.waitJobs(discharge);
      tr.status = 'Loading';
      WT.advanceShipment(sh, 2);
      let loaded = 0;
      const empties = tr.cars.slice(1).filter((car) => !car.cont).slice(0, 4);
      const load = (this.exportCount() ? empties : []).map((car) => this.addJob({
        label: 'Loading ' + tr.id,
        plan: (c) => {
          const full = this.slots.some((s) => s.items.length && !this.isImport(this.topOf(s)) && this.topOf(s).full && !this.topOf(s).reserved);
          const filt = full ? (x) => !this.isImport(x) && x.full && !x.reserved : (x) => !this.isImport(x) && !x.reserved;
          car.g.getWorldPosition(p);
          return this.unstackLift(c, filt, p.x, p.z, 1.45, (cont, m) => {
            car.g.userData.slot.attach(m); m.position.set(0, 0, 0); m.rotation.set(0, 0, 0);
            car.cont = cont; cont.status = 'On rail'; cont.loc = tr.id;
            loaded++; sh.loaded = loaded;
            WT.SUP.note(cont, `Loaded on ${tr.id} → ${sh.to}`);
            WT.updateShipment(sh, Math.round(WT.secToMin((3 - loaded) * 12)));
          });
        },
      }));
      yield* this.waitJobs(load);
      sh.total = Math.max(1, loaded);
      WT.advanceShipment(sh, 3);
      this.busy = null;
      yield* WT.sleep(1);
    }
    *serve(t, leg) {
      yield* this.serveLift(t, leg);
      if (leg.dock === this.docks[1]) {
        t.status = 'Waiting for lane';
        yield* WT.waitFor(() => !this.docks[0].truck);
      }
    }
    *serveLift(t, leg) {
      t.where = this.id + ' · Crane lane · spot ' + leg.dock.n;
      const spot = { x: leg.dock.x, z: leg.dock.z };
      if (leg.op === 'pick') {
        t.status = 'Awaiting container';
        let waited = 0;
        const want = leg.cont;
        const filt = want ? (c) => c === want : (c) => this.isImport(c) && !c.reserved;
        while (!this.pickSlot(filt) && waited < 40) { waited += WT.sim.dt; yield; }
        this.pendingPick = Math.max(0, this.pendingPick - 1);
        const cargo = t.mesh.userData.cargo;
        yield* this.waitJobs([this.addJob({
          truck: t, label: 'Loading ' + t.id,
          plan: (c) => this.unstackLift(c, filt, spot.x, spot.z, 1.35, (cont, m) => {
            cargo.attach(m); m.position.set(0, 0, 0); m.rotation.set(0, 0, 0);
            cont.reserved = false; cont.at = null; t.container = cont; cont.status = 'On truck'; cont.loc = t.id;
            WT.SUP.note(cont, `Picked up by ${t.id} at ${this.id}`);
          }),
        })]);
        if (!t.container && t.cargo) t.cargo = null;
      } else {
        t.status = 'Dropping container';
        this.pendingDrop = Math.max(0, this.pendingDrop - 1);
        while (this.stackRoom() < 1) yield;
        const c = t.container, p = new T.Vector3();
        if (c) yield* this.waitJobs([this.addJob({
          truck: t, label: 'Unloading ' + t.id,
          plan: (cr) => {
            if (t.container !== c) return 'skip';
            c.mesh.getWorldPosition(p);
            return this.stackLift(cr, c.mesh, p.x, p.z, p.y + 2.7, () => {
              t.container = null;
              c.status = 'Stored'; c.loc = this.id + ' · Stack';
              WT.SUP.note(c, `Dropped at ${this.id} for export`);
              return c;
            });
          },
        })]);
      }
    }
    card() {
      const cr = this.cranes.map((c) => `${c.id}: ${c.carry ? 'Lifting' : c.task}`).join(' · ');
      return this.cardBase({
        kicker: 'Facility · Rail terminal', icon: '🚉', sub: 'Siding + 2 RMG gantries · Avenue ' + this.A, where: this.busy && this.busy.id ? this.busy.id + ' on siding' : this.busy ? 'Train inbound' : 'Siding free',
        rows: [['Imports waiting', String(this.importCount())], ['Exports staged', String(this.exportCount())], ['Containers stacked', this.stackCount() + ' / ' + this.slots.length * 2], ['Crane lifts', `${WT.fmtNum(this.moves)} (${this.cranes.map((c) => c.lifts).join(' + ')})`], ['Cranes', cr],
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
