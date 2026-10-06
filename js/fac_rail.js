/* WareTrack – rail: crane helpers, articulated trains, intermodal rail terminals */
(function () {
  const T = THREE, M = WT.M, W = WT.W;

  const CR = WT.CraneOps; // crane motion lives in terminal.js

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
  // inside the gantry span: a service lane with four truck spots, and a bypass lane beside it toward the stack
  const SRV = -603.2, BYP = -607.9;
  class RailTerminal extends WT.CraneTerminal {
    constructor(A) {
      super('Rail terminal', 'RAIL', 'Intermodal Yard', null);
      this.A = A;
      this.name = 'Intermodal Yard';
      this.cz = -620;
      this.craneTag = 'RMG';
      this.initYard({ srv: SRV, byp: BYP, merge: 22, spots: [A - 36, A + 5, A + 46] });
      this.income = 22000;
      this.busy = null;
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
    laneIn() { const A = this.A; return [[A + 3, -587], [A + 3, -592], [A - 82, -592], [A - 82, BYP]]; }
    laneOut() { const A = this.A; return [[A + 82, BYP], [A + 82, -588], [A + 10, -588]]; }
    ct(z) { return this.cz - z; }

    build() {
      const A = this.A, g = this.group, S = this.structure;
      W.flat(g, 330, 54, W.COL.concrete, A, -612, 0.027);
      W.flat(g, 300, 10, W.COL.ballast, A, -636, 0.03);
      W.flat(g, 170, 11, W.COL.road, A, (SRV + BYP) / 2, 0.032);
      W.flat(g, 88, 6, W.COL.road, A - 40, -592, 0.032);
      W.flat(g, 6, 22, W.COL.road, A - 82, -600, 0.032);
      W.flat(g, 6, 26, W.COL.road, A + 82, -598, 0.032);
      W.flat(g, 76, 6, W.COL.road, A + 46, -588, 0.032);
      // lane markings: dashed divider between service and bypass lanes, numbered spot boxes
      const lm = [], spotM = [];
      W.dashLine(lm, A - 80, (SRV + BYP) / 2, A + 80, (SRV + BYP) / 2, 3, 2.4, 0.22);
      for (const d of this.docks) W.dashRect(spotM, d.x - 1, SRV, 17, 4.2, 1, 0.5, 0.22);
      W.dashes(g, lm, 0xffffff, 0.06);
      W.dashes(g, spotM, W.COL.yellow, 0.061);
      for (const d of this.docks) W.groundText(g, 'T' + d.n, d.x + 9.5, SRV, 2.6, 1.6, '#e0b75a', 0, 40);
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
      const cranes = [0, 1].map(() => {
        const c = M.gantry(44, 17);
        c.group.rotation.y = Math.PI / 2;
        c.group.position.set(A, 0, this.cz);
        S.add(c.group);
        return c;
      });
      this.setupCranes(cranes, [A - CHOME, A + CHOME], CPAD, 12.5, 6.5);
      this.site = { x: A, z: -620, w: 60, d: 48, h: 18, world: true };
    }
    activate() {
      super.activate();
      for (let i = 0; i < 3; i++) {
        const s = WT.pick(this.slots.filter((q) => q.items.length < 2));
        const c = WT.SUP.newContainer(11);
        WT.SUP.note(c, 'Empty off an earlier train');
        c.mesh.position.set(s.x, s.items.length * 2.7, s.z);
        c.loc = this.id + ' · Stack';
        c.status = 'Empty · stacked';
        WT.scene.add(c.mesh);
        s.items.push(c);
      }
      this.startCranes();
    }
    // a booked box still on the train at the siding: the crane can lift it straight onto a waiting truck
    aboard(c) {
      const car = c.wagon;
      if (!car || car.cont !== c || !this.busy || !this.busy.id) return null;
      const p = new T.Vector3();
      c.mesh.getWorldPosition(p);
      return { x: p.x, z: p.z, top: p.y + 2.7, take: () => { car.cont = null; } };
    }
    *trainCall(tr) {
      this.busy = tr;
      tr.status = 'Unloading';
      WT.log(`Train ${tr.id} arrived at ${this.id}`, 'blue', true);
      WT.emit('event', { kind: 'train', ent: tr, weight: 3 });
      const sh = WT.createShipment({ mode: 'rail', to: WT.pick(WT.RAIL_DEST), carrier: tr.operator, vehicle: tr, total: 3, transit: WT.rint(240, 600) });
      tr.shipment = sh;
      // pre-advice: the moment the train is in, every booked box is released to drayage, so trucks are already
      // rolling while the cranes work; a truck that beats the discharge gets its box straight off the wagon
      for (const car of tr.cars.slice(1)) {
        const c = car.cont;
        if (c && c.po) { c.wagon = car; c.at = this; c.status = 'On train at ' + this.id; WT.SUP.grounded(c.po, this.id); }
      }
      const p = new T.Vector3();
      const discharge = tr.cars.slice(1).filter((car) => car.cont).map((car) => {
        const cont = car.cont;
        return this.addJob({
          label: 'Discharging ' + tr.id,
          where: () => car.g.position.x,
          plan: (c) => {
            if (car.cont !== cont) return 'skip'; // already went straight onto a truck
            if (cont.lifting) return null;
            cont.mesh.getWorldPosition(p);
            const r = this.stackLift(c, cont.mesh, p.x, p.z, p.y + 2.7, () => {
              car.cont = null; cont.wagon = null;
              cont.status = cont.po ? 'Grounded · awaiting truck' : 'Stored';
              cont.loc = this.id + ' · Stack';
              WT.SUP.note(cont, `Discharged at ${this.id} from ${tr.id}`);
              return cont;
            });
            if (r) r.lock = cont;
            return r;
          },
        });
      });
      yield* this.waitJobs(discharge);
      tr.status = 'Loading';
      WT.advanceShipment(sh, 2);
      // only sealed export boxes go out by rail — empties are trucked to the depot instead
      let loaded = 0;
      // each crane loads the nearest open wagon on its side from export boxes on its side
      const empties = tr.cars.slice(1).filter((car) => !car.cont);
      const n = Math.min(4, empties.length, this.exportCount());
      const load = Array.from({ length: n }, () => this.addJob({
        label: 'Loading ' + tr.id,
        plan: (c) => {
          const open = empties.filter((k) => !k.cont && !k.claimed);
          if (!open.length) return 'skip';
          let car = null, bd = Infinity;
          for (const k of open) { const kx = k.g.position.x; if (this.allowed(c, kx) && Math.abs(kx - c.group.position.x) < bd) { bd = Math.abs(kx - c.group.position.x); car = k; } }
          if (!car) return null;
          car.g.getWorldPosition(p);
          const r = this.unstackLift(c, (x) => this.isFullExport(x) && !x.reserved, p.x, p.z, 1.45, (cont, m) => {
            car.g.userData.slot.attach(m); m.position.set(0, 0, 0); m.rotation.set(0, 0, 0);
            car.cont = cont; cont.status = 'On rail'; cont.loc = tr.id;
            loaded++; sh.loaded = loaded;
            WT.SUP.note(cont, `Loaded on ${tr.id} → ${sh.to}`);
            WT.updateShipment(sh, Math.round(WT.secToMin((3 - loaded) * 12)));
          });
          if (r && r !== 'skip') { r.onTake = () => { car.claimed = true; }; }
          return r;
        },
      }));
      yield* this.waitJobs(load);
      sh.total = Math.max(1, loaded);
      WT.advanceShipment(sh, 3);
      this.busy = null;
      yield* WT.sleep(1);
    }
    card() {
      return this.cardBase({
        kicker: 'Facility · Rail terminal', icon: '🚉', sub: 'Siding + 2 RMG gantries · Avenue ' + this.A, where: this.busy && this.busy.id ? this.busy.id + ' on siding' : this.busy ? 'Train inbound' : 'Siding free',
        rows: [['Imports waiting', String(this.importCount())], ['Exports staged', String(this.exportCount())], ['Empties', String(this.emptyCount()) + ' → depot'], ['Containers stacked', this.stackCount() + ' / ' + this.slots.length * 2],
          ...this.craneRows(), ['Trains', this.busy ? '1 at siding' : 'None'], ['Revenue', '$' + WT.fmtNum(this.income * 60 * WT.G.INCOME_SCALE) + '/min']],
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
