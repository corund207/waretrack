/* WareTrack – rail: crane helpers, articulated trains, intermodal rail terminals */
(function () {
  const T = THREE, M = WT.M, W = WT.W;

  const CR = WT.CraneOps; // crane motion lives in terminal.js

  /* ================= trains ================= */
  WT.trains = [];
  WT.RAIL_STATS = { dispatched: 0, maxWagons: 0, freightCalls: 0 };
  // each railroad runs its own livery: body, stripe, locomotive style
  const LIVERY = {
    NorthRail: [0x2f56e0, 0xf6f7fd, 'hood'], 'Keystone Freight': [0xd9434b, 0x2b2f3d, 'hood'], 'Great Lakes RR': [0x1aa6b7, 0xf0b429, 'cab'],
    'Coastline Rail': [0xf08c2a, 0x2b2f3d, 'hood'], 'Summit Pacific': [0x2b2f3d, 0xf0b429, 'cab'], 'Lakeshore Freight': [0x37b26c, 0xf6f7fd, 'hood'],
    'Ridgeline Mining': [0x4a5578, 0xf0b429, 'hood'], 'Prairie Grain Rail': [0xc9a227, 0x37b26c, 'cab'], 'Silverbank Aggregates': [0xb9bfd8, 0x7a5cd6, 'hood'],
    'Boxline Repositioning': [0x7a5cd6, 0xf6f7fd, 'cab'],
  };
  let trainSeq = 310;
  class Train extends WT.Entity {
    constructor(o) {
      super();
      this.kind = 'train';
      this.id = 'RT-' + trainSeq++;
      this.operator = o.operator || WT.pick(['NorthRail', 'Keystone Freight', 'Great Lakes RR', 'Coastline Rail', 'Summit Pacific', 'Lakeshore Freight']);
      this.dest = o.terminal ? o.terminal.id : WT.pick(WT.RAIL_DEST);
      this.terminal = o.terminal || null;
      this.track = o.track || 'E';
      this.status = 'Approaching';
      this.cars = [];
      const lv = LIVERY[this.operator] || [WT.pick([0x2f56e0, 0xd9434b, 0x1aa6b7, 0xf08c2a]), 0xf6f7fd, 'hood'];
      const loco = M.loco(lv[0], lv[1], lv[2]);
      this.cars.push({ g: loco });
      const n = o.wagons ?? Math.max(1, (o.manifest || []).length);
      this.bookedCapacity = n;
      WT.RAIL_STATS.dispatched++; WT.RAIL_STATS.maxWagons = Math.max(WT.RAIL_STATS.maxWagons, n);
      if (o.terminal) WT.RAIL_STATS.freightCalls++;
      this.manifest = o.manifest || [];
      const origin = WT.pick(WT.RAIL_DEST);
      for (let i = 0; i < n; i++) {
        const po = o.terminal ? this.manifest[i] : null;
        // trains calling at a yard (and mine / repositioning trains) are all intermodal flats, one 40' box each;
        // through freight is a mixed manifest of boxes, tank cars, hoppers and boxcars
        const kind = o.terminal ? 'container' : WT.pick(['container', 'container', 'container', 'tank', 'hopper', 'box']);
        const w = M.wagonKind(kind);
        let cont = null;
        if (po) {
          cont = WT.SUP.newContainer(11, po.mat);
          WT.SUP.fillPO(cont, po);
          WT.SUP.note(cont, `Loaded at ${origin} ramp for ${po.to.id} (${po.id})`);
          WT.SUP.ev(po, `On train · ${this.id} from ${origin}`);
          po.vehicle = this;
        } else if (!o.terminal && kind === 'container') {
          // through traffic: mostly sealed boxes, some open boxes of raw material
          const om = Math.random() < 0.3 ? WT.pick(['iron', 'ore', 'coal', 'sand', 'glass']) : null;
          cont = WT.SUP.newContainer(11, om);
          if (om) cont.load.set(WT.rnd(0.6, 1));
        }
        if (cont) { cont.status = 'On rail'; w.userData.slot.add(cont.mesh); }
        this.cars.push({ g: w, cont, kind });
      }
      this.cars.forEach((c, i) => {
        const dir = this.track === 'W' ? -1 : 1;
        c.g.position.set(-dir * (W.EDGE + 250) - dir * 13 * i, 0, this.track === 'W' ? W.RAIL.zW : W.RAIL.zE);
        c.g.rotation.y = this.track === 'W' ? -Math.PI : 0;
        WT.scene.add(c.g);
      });
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
        const d = s - 13 * i, p = this.path.at(d);
        // Extend the first/last tangent so cars do not collapse together at path endpoints.
        const extra = d < 0 ? d : d > this.path.len ? d - this.path.len : 0;
        c.g.position.set(p.x + Math.cos(p.a) * extra, 0, p.z + Math.sin(p.a) * extra);
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
      const n = this.cars.filter((c) => c.cont).length, flats = this.cars.filter((c) => c.kind === 'container').length;
      const other = ['tank', 'hopper', 'box'].map((k) => [k, this.cars.filter((c) => c.kind === k).length]).filter(([, c]) => c).map(([k, c]) => `${c} ${k}`);
      return {
        kicker: 'Freight train · ' + this.operator, title: this.id, sub: this.terminal ? 'Calling at ' + this.terminal.id : 'Through freight → ' + this.dest,
        icon: '🚆', iconBg: '#9fb4ff', status: this.status, statusTone: WT.toneFor(this.status), where: this.track === 'E' ? 'Eastbound main' : 'Westbound main',
        rows: [['Operator', this.operator], ['Booked orders', this.manifest.length ? this.manifest.map((p) => p.id).join(', ') : 'None'], ['Consist', `1 loco + ${this.cars.length - 1} wagons` + (other.length ? ` (${other.join(' · ')})` : '')], ['Containers', n + ' / ' + flats + ' flats'],
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
    else if (term) pts = [[term.A - 800, R.zE], ...term.sidingLeg(tr.siding), [X, R.zE]];
    else pts = [[-X, R.zE], [X, R.zE]];
    tr.path = WT.buildPath(pts, 30);
    let stopS = null;
    if (term) {
      for (let s = 0; s < tr.path.len; s += 1) if (tr.path.at(s).x >= term.A + 6.5 * tr.cars.length && Math.abs(tr.path.at(s).z - term.sidingZ(tr.siding)) < 0.5) { stopS = s; break; }
      if (stopS === null) term.releaseSiding(tr);
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
  // gantry claim half-width (sill 12 m long + margin) and parking spots of the three gantries (the end ones clear of
  // the truck lanes, which cross the rails at A ± XING)
  const CPAD = 7, CHOME = 100, XING = 112; // avenues are 240 m apart: a yard keeps inside A ± 120
  // inside the gantry span: a service lane with five truck spots, and a bypass lane beside it toward the stack
  const SRV = -603.2, BYP = -607.9;
  // two sidings under the gantries, so two trains are worked at once
  const SIDINGS = [-636, -630.5];
  class RailTerminal extends WT.CraneTerminal {
    constructor(A) {
      super('Rail terminal', 'RAIL', 'Intermodal Yard', null);
      this.A = A;
      this.name = 'Intermodal Yard';
      this.cz = -620;
      this.craneTag = 'RMG';
      this.initYard({ srv: SRV, byp: BYP, merge: 22, spots: [A - 76, A - 36, A + 4, A + 44, A + 84] });
      this.income = 22000;
      this.sidings = SIDINGS.map(() => null); // null (free), 'incoming' (booked) or the train at it
      this.inbound = 0; // boxes booked onto trains not yet discharged
      this.site = null;
      this.slots = [];
      for (const z of [-624, -613]) for (let x = A - 100.8; x <= A + 100.9; x += 12.6) this.slots.push({ x, z, items: [] });
    }
    center() { return [this.A, -615]; }
    bounds() { return { x0: this.A - 160, x1: this.A + 160, z0: -646, z1: -575 }; }
    radius() { return 90; }
    // queue head waits here: its nose (7 m ahead) must stay clear of the exit lane crossing at z −588
    get gateIn() { return { A: this.A, z: -573 }; }
    get gateIdx() { return 0; }
    get gateOut() { return { A: this.A, z: -588 }; }
    laneIn() { const A = this.A; return [[A + 3, -587], [A + 3, -592], [A - XING, -592], [A - XING, BYP]]; }
    laneOut() { const A = this.A; return [[A + XING, BYP], [A + XING, -588], [A + 10, -588]]; }
    ct(z) { return this.cz - z; }
    // a train is booked onto a free siding when it is dispatched, with the boxes it will set down in the stack
    get busy() { return this.sidings.includes(null) ? null : this.sidings.find((s) => s && s.id) || 'incoming'; }
    trainsIn() { return this.sidings.filter((s) => s && s.id); }
    bookSiding(tr, boxes) {
      const i = this.sidings.indexOf(null);
      if (i < 0) throw new Error('No free siding at ' + this.id);
      this.sidings[i] = 'incoming'; tr.siding = i; tr.booked = boxes || 0; this.inbound += tr.booked;
      return i;
    }
    releaseSiding(tr) {
      if (tr.siding === undefined) return;
      this.sidings[tr.siding] = null;
      this.inbound = Math.max(0, this.inbound - (tr.booked || 0)); tr.booked = 0;
    }
    roomFor() { return this.stackRoom() - this.inbound; }
    sidingZ(i) { return SIDINGS[i || 0]; }
    // off the eastbound main, through siding i and back on
    sidingLeg(i) { const A = this.A, z = SIDINGS[i || 0], zE = W.RAIL.zE; return [[A - 150, zE], [A - 110, z], [A + 110, z], [A + 150, zE]]; }

    build() {
      const A = this.A, g = this.group, S = this.structure;
      W.flat(g, 330, 54, W.COL.concrete, A, -612, 0.027);
      W.flat(g, 300, 10, W.COL.ballast, A, -636, 0.03);
      W.flat(g, 236, 6, W.COL.ballast, A, SIDINGS[1], 0.031);
      W.flat(g, 2 * XING + 6, 11, W.COL.road, A, (SRV + BYP) / 2, 0.032);
      W.flat(g, XING + 8, 6, W.COL.road, A - (XING - 8) / 2, -592, 0.032);
      W.flat(g, 6, 22, W.COL.road, A - XING, -600, 0.032);
      W.flat(g, 6, 26, W.COL.road, A + XING, -598, 0.032);
      W.flat(g, XING - 6, 6, W.COL.road, A + (XING + 14) / 2, -588, 0.032);
      // lane markings: dashed divider between service and bypass lanes, numbered spot boxes
      const lm = [], spotM = [];
      W.dashLine(lm, A - XING + 2, (SRV + BYP) / 2, A + XING - 2, (SRV + BYP) / 2, 3, 2.4, 0.22);
      for (const d of this.docks) W.dashRect(spotM, d.x - 1, SRV, 17, 4.2, 1, 0.5, 0.22);
      W.dashes(g, lm, 0xffffff, 0.06);
      W.dashes(g, spotM, W.COL.yellow, 0.061);
      for (const d of this.docks) W.groundText(g, 'T' + d.n, d.x + 9.5, SRV, 2.6, 1.6, '#e0b75a', 0, 40);
      const b = new M.MB();
      for (const z of SIDINGS) {
        for (const o of [-0.75, 0.75]) b.box(220, 0.25, 0.22, 0x6a7194, A, 0.05, z + o);
        // turnouts down to the eastbound main at either end
        const dz = z - W.RAIL.zE;
        for (const sx of [-1, 1]) {
          const L = Math.hypot(40, dz), ang = Math.atan2(dz, 40) * sx;
          for (const o of [-0.75, 0.75]) b.boxC(L, 0.25, 0.22, 0x6a7194, A + sx * 130, 0.18, (z + W.RAIL.zE) / 2 + o, 0, ang, 0);
        }
      }
      for (const gx of [-642, -598]) b.box(2 * XING - 4, 0.15, 0.5, 0x7a81a4, A, 0.04, gx); // crane rails, ending short of the truck crossings
      S.add(b.mesh(false, true));
      const sl = [];
      for (const z of SIDINGS) for (let x = A - 110; x < A + 110; x += 1.7) sl.push({ x, z, len: 0.5, w: 3.4 });
      W.dashes(g, sl, 0xa49c90, 0.06);
      const yel = [];
      for (const s of this.slots) W.dashRect(yel, s.x, s.z, 12, 3.4, 1, 0.6, 0.2);
      W.dashes(g, yel, W.COL.yellow, 0.065);
      // yard office between the inbound road and the street
      M.block(S, { x: A - 62, z: -581.5, w: 18, d: 10, h: 8 });
      W.groundText(g, this.id, A - 30, -581, 14, 3, '#9aa3c9', 0, 50);

      // OCR gate portal + booth
      const pb = new M.MB();
      const gx = A + 3, gz = -583;
      for (const s of [-1, 1]) pb.box(0.6, 6.2, 0.6, 0x9aa1c4, gx + s * 4.2, 0, gz);
      pb.box(9, 0.8, 1.2, 0x2f56e0, gx, 6.2, gz);
      for (const s of [-1, 1]) pb.box(0.8, 0.6, 0.8, 0x3a4166, gx + s * 2, 5.6, gz);
      pb.box(2.4, 2.6, 2.4, 0xf3f5fd, gx + 6.4, 0, gz);
      pb.box(2.6, 0.3, 2.6, 0x2f56e0, gx + 6.4, 2.6, gz);
      S.add(pb.mesh());
      // three rail-mounted gantries on the same rails, parked at either end of the stack and in the middle
      const cranes = [0, 1, 2].map(() => {
        const c = M.gantry(44, 17);
        c.group.rotation.y = Math.PI / 2;
        c.group.position.set(A, 0, this.cz);
        S.add(c.group);
        return c;
      });
      this.setupCranes(cranes, [A - CHOME, A, A + CHOME], CPAD, 12.5, 6.5);
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
      if (!car || car.cont !== c || !this.trainsIn().some((tr) => tr.cars.includes(car))) return null;
      const p = new T.Vector3();
      c.mesh.getWorldPosition(p);
      return { x: p.x, z: p.z, top: p.y + 2.7, take: () => { car.cont = null; } };
    }
    *trainCall(tr) {
      this.sidings[tr.siding || 0] = tr;
      tr.status = 'Unloading';
      WT.log(`Train ${tr.id} arrived at ${this.id}`, 'blue', true);
      WT.emit('event', { kind: 'train', ent: tr, weight: 3 });
      const sh = WT.createShipment({ mode: 'rail', to: WT.pick(WT.RAIL_DEST), carrier: tr.operator, vehicle: tr, total: 3, transit: WT.rint(240, 600) });
      tr.shipment = sh;
      if (tr.empties) { yield* this.loadEmpties(tr, sh); return; }
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
      this.inbound = Math.max(0, this.inbound - (tr.booked || 0)); tr.booked = 0;
      tr.status = 'Loading';
      WT.advanceShipment(sh, 2);
      // a freight call takes only sealed export boxes; empties leave on a repositioning train or by truck to the depot
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
          // Both wagon types carry one removable 40-foot box on the same flat deck.
          const containerFilter = (x) => this.isFullExport(x) && !x.reserved;
          car.g.getWorldPosition(p);
          const r = this.unstackLift(c, containerFilter, p.x, p.z, 1.45, (cont, m) => {
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
      this.releaseSiding(tr);
      yield* WT.sleep(1);
    }
    // repositioning train: both cranes load every empty in the yard (up to the wagons) for the off-site empty yard
    *loadEmpties(tr, sh) {
      tr.status = 'Loading empties';
      const p = new T.Vector3();
      const cars = tr.cars.slice(1);
      const n = Math.min(cars.length, this.emptyCount());
      const jobs = Array.from({ length: n }, () => this.addJob({
        label: 'Loading empties ' + tr.id,
        plan: (c) => {
          const open = cars.filter((k) => !k.cont && !k.claimed);
          if (!open.length) return 'skip';
          let car = null, bd = Infinity;
          for (const k of open) { const kx = k.g.position.x; if (this.allowed(c, kx) && Math.abs(kx - c.group.position.x) < bd) { bd = Math.abs(kx - c.group.position.x); car = k; } }
          if (!car) return null;
          const emptyFilter = (x) => this.isEmpty(x) && !x.reserved;
          car.g.getWorldPosition(p);
          const r = this.unstackLift(c, emptyFilter, p.x, p.z, 1.45, (cont, m) => {
            car.g.userData.slot.attach(m); m.position.set(0, 0, 0); m.rotation.set(0, 0, 0);
            car.cont = cont; cont.status = 'Empty · on rail'; cont.loc = tr.id;
            WT.SUP.note(cont, `Loaded on ${tr.id} for off-site repositioning`);
            sh.loaded++;
          });
          if (r && r !== 'skip') r.onTake = () => { car.claimed = true; };
          return r;
        },
      }));
      yield* this.waitJobs(jobs);
      sh.total = Math.max(1, sh.loaded);
      WT.advanceShipment(sh, 3);
      this.releaseSiding(tr);
      yield* WT.sleep(1);
    }
    card() {
      return this.cardBase({
        kicker: 'Facility · Rail terminal', icon: '🚉', sub: '2 sidings + 3 RMG gantries · Avenue ' + this.A, where: this.trainsIn().length ? this.trainsIn().map((t) => t.id).join(' + ') + ' at the sidings' : this.sidings.some(Boolean) ? 'Train inbound' : 'Sidings free',
        rows: [['Imports waiting', String(this.importCount())], ['Exports staged', String(this.exportCount())],
          ['Empties', String(this.emptyCount()) + (WT.facilities.some((f) => f.type === 'Off-site empty yard' && f.active) ? ' → off-site yard by rail' : ' → depot')], ['Containers stacked', this.stackCount() + ' / ' + this.slots.length * 2],
          ...this.craneRows(), ['Trains', `${this.trainsIn().length} at the sidings · ${this.sidings.filter((s) => s === 'incoming').length} inbound`], ['Revenue', '$' + WT.fmtNum(this.income * 60 * WT.G.INCOME_SCALE) + '/min']],
      });
    }
  }
  WT.RailTerminal = RailTerminal;

  /* ================= rail scheduler ================= */
  // through freight keeps to the westbound main, clear of the park's eastbound freight calls
  function through(status) {
    const tr = new Train({ track: 'W', wagons: WT.rint(4, 9) });
    tr.status = status;
    WT.spawn(runTrain(tr));
  }
  // a freight call appears 800 m short of its yard: only when no other train is there
  const clearAt = (x) => WT.trains.every((o) => o.cars.every((c) => Math.abs(c.g.position.z - W.RAIL.zE) > 3 || Math.abs(c.g.position.x - x) > 220));
  // every few seconds: a mine train whenever the container works is free to load one, an empties train when a yard has
  // a cut ready, and a freight call for every free siding with booked cargo or exports waiting
  function dispatch() {
    const S = WT.SUP, R = WT.REMOTE;
    const open = () => WT.facilities.filter((f) => f.type === 'Rail terminal' && f.active && f.sidings.includes(null) && f.roomFor() > 4);
    let sent = 0;
    if (R) {
      const yard = WT.facilities.find((f) => f.type === 'Off-site empty yard' && f.active && !f.trainBusy);
      // (empties leave east for the off-site spur, so not from a yard beyond its junction)
      const et = yard && open().find((t) => t.emptyCount() >= 3 && clearAt(t.A - 800) && t.A + 150 < R.divergeE[0]);
      if (et) { R.emptyTrain(et, yard); sent++; }
      const factory = R.containerFactory && R.containerFactory();
      const site = factory && !factory.trainBusy && WT.facilities.find((f) => f.remote && f.active && !f.trainBusy && factory.available(f.mat) > 0 && S.backlog.rail.some((po) => po.mat === f.mat));
      // mine trains join the main at the west merge, so they run to the yards east of it
      const terms = open().filter((t) => t.A - 150 > R.mergeW[1]);
      if (site && terms.length) {
        const term = terms.reduce((a, b) => (b.roomFor() > a.roomFor() ? b : a));
        const manifest = S.takeManifest('rail', Math.min(10, factory.available(site.mat), term.roomFor() - 2), (po) => po.mat === site.mat);
        if (manifest.length) { R.mineTrain(site, term, manifest); sent++; }
      }
    }
    const general = (po) => !(R && R.siteFor && R.siteFor(po.mat));
    for (const term of open().sort((a, b) => b.exportCount() - a.exportCount())) {
      if (!clearAt(term.A - 800)) continue;
      const cargo = S.backlog.rail.some(general);
      // an exports-only call when the yard has no other train coming
      if (!cargo && (term.exportCount() < 2 || term.sidings.some(Boolean))) continue;
      const manifest = S.takeManifest('rail', Math.min(10, term.roomFor() - 2), general);
      const wagons = Math.max(manifest.length, Math.min(4, term.exportCount()));
      if (!wagons) continue;
      const tr = new Train({ terminal: term, wagons, manifest });
      term.bookSiding(tr, manifest.length);
      WT.spawn(runTrain(tr));
      sent++;
    }
    if (!sent && WT.trains.length < 8) through('Through freight');
  }
  WT.startRail = function () {
    WT.spawn((function* () {
      yield* WT.waitFor(() => W.railBuilt);
      while (true) {
        try { if (WT.trains.length < 18) dispatch(); }
        catch (e) { console.error('[Rail] Dispatch error:', e); }
        yield* WT.sleep(WT.rnd(2.5, 4));
      }
    })());
  };
})();
