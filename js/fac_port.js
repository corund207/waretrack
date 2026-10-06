/* WareTrack – port: container berths with STS cranes, feeder vessels, passing traffic at sea */
(function () {
  const T = THREE, M = WT.M, W = WT.W, CR = WT.CraneOps;

  WT.ships = [];
  let shipSeq = 0;
  class Ship extends WT.Entity {
    constructor(o = {}) {
      super();
      this.kind = 'ship';
      this.name = o.name || WT.VESSELS[shipSeq++ % WT.VESSELS.length] + (shipSeq > WT.VESSELS.length ? ' ' + 'II III IV V VI'.split(' ')[Math.floor(shipSeq / WT.VESSELS.length) % 5] : '');
      this.id = this.name;
      this.imo = 'IMO ' + WT.rint(9100000, 9899999);
      this.voyage = 'V' + WT.rint(110, 480) + 'E';
      this.dest = WT.pick(WT.SEA_DEST);
      this.status = 'Inbound';
      this.mesh = o.kind && o.kind !== 'container' ? M.cargoShip(o.kind) : M.ship(WT.pick([0x24336e, 0x1f4f6b, 0x3a2f6e, 0x7a2b3a]));
      if (!this.mesh.userData.stacks) this.mesh.userData.stacks = [];
      this.shipKind = o.kind || 'container';
      if (o.scale) this.mesh.scale.setScalar(o.scale);
      this.actor = new WT.Actor('ship', this.mesh, 'sea');
      this.actor.entity = this;
      WT.scene.add(this.mesh);
      WT.register(this);
      WT.ships.push(this);
      this.moves = 0;
    }
    radius() { return 40; }
    teu() { return this.mesh.userData.stacks.reduce((n, s) => n + s.items.length, 0); }
    remove() { this.actor.remove(); WT.unregister(this); WT.ships.splice(WT.ships.indexOf(this), 1); }
    card() {
      return {
        kicker: 'Vessel · Feeder', title: this.name, sub: this.imo + ' · Voy ' + this.voyage,
        icon: '🚢', iconBg: '#8ec5ff', status: this.status, statusTone: WT.toneFor(this.status), where: this.port ? this.port.id : 'At sea',
        rows: [['Voyage', this.voyage], ['Booked orders', this.manifest && this.manifest.length ? this.manifest.map((m) => m.po.id).join(', ') : 'None'], ['On board', this.teu() + ' TEU'], ['Berth', this.port ? this.port.id : '—'], ['Crane moves', String(this.moves)],
          ['Shipment', this.shipment ? '#' + this.shipment.id : '—'], ['Next port', this.dest]],
      };
    }
    label() { return this.name; }
  }
  WT.Ship = Ship;

  class Port extends WT.Facility {
    constructor(A) {
      super('Port terminal', 'PORT', 'Container Berth', null);
      this.A = A;
      this.cz = 588;
      this.berth = { x: A + 20, z: 616 };
      this.docks = [{ n: 1, x: A + 16, z: 589, truck: null, ops: ['pick', 'drop'] }];
      this.jobs = [];
      this.income = 28000;
      this.busy = null;
      this.pendingPick = 0;
      this.pendingDrop = 0;
      this.slots = [];
      for (let x = A + 14; x <= A + 70; x += 6.2) this.slots.push({ x, z: 576, items: [] });
    }
    center() { return [this.A + 10, 590]; }
    bounds() { return { x0: this.A - 120, x1: this.A + 120, z0: 560, z1: 602 }; }
    radius() { return 90; }
    get gateIn() { return { A: this.A, z: 562 }; }
    get gateIdx() { return 0; }
    get gateOut() { return { A: this.A, z: 569 }; }
    inPath() { const A = this.A; return [[A - 3, 568], [A - 3, 571], [A - 38, 571], [A - 38, 589], [A + 16, 589]]; }
    outPath() { const A = this.A; return [[A + 16, 589], [A + 80, 589], [A + 88, 581], [A + 80, 569], [A + 10, 569]]; }
    stackCount() { return this.slots.reduce((n, s) => n + s.items.length, 0); }
    stackRoom() { return this.slots.length * 2 - this.stackCount(); }
    build() {
      const A = this.A, g = this.group, S = this.structure;
      W.flat(g, 240, 42, W.COL.concrete, A + 10, 581, 0.028);
      W.flat(g, 132, 6, W.COL.road, A + 25, 589, 0.032);
      W.flat(g, 38, 6, W.COL.road, A - 20, 571, 0.032);
      W.flat(g, 6, 20, W.COL.road, A - 38, 580, 0.032);
      W.flat(g, 84, 6, W.COL.road, A + 46, 569, 0.032);
      W.flat(g, 6, 22, W.COL.road, A + 88, 580, 0.032);
      W.flat(g, 6, 12, W.COL.road, A - 3, 566, 0.032);
      const b = new M.MB();
      b.box(240, 1.0, 1.2, 0xc9cfe8, A + 10, 0, 599.6);
      for (let x = A - 105; x < A + 125; x += 10) b.box(0.6, 1.4, 0.8, 0x262a3d, x, 0, 600.3);
      for (const z of [584, 594]) b.box(220, 0.15, 0.5, 0x7a81a4, A + 10, 0.04, z);
      S.add(b.mesh(false, true));
      const yel = [];
      for (const s of this.slots) W.dashRect(yel, s.x, s.z, 6, 3.2, 0.8, 0.5, 0.2);
      W.dashes(g, yel, W.COL.yellow, 0.066);
      M.block(S, { x: A - 90, z: 576, w: 16, d: 14, h: 7 });

      // OCR gate portal + booth
      const pb = new M.MB();
      const gx = A - 3, gz = 566;
      for (const s of [-1, 1]) pb.box(0.6, 6.2, 0.6, 0x9aa1c4, gx + s * 4.2, 0, gz);
      pb.box(9, 0.8, 1.2, 0x2f56e0, gx, 6.2, gz);
      for (const s of [-1, 1]) pb.box(0.8, 0.6, 0.8, 0x3a4166, gx + s * 2, 5.6, gz);
      pb.box(2.4, 2.6, 2.4, 0xf3f5fd, gx - 6.4, 0, gz);
      pb.box(2.6, 0.3, 2.6, 0x2f56e0, gx - 6.4, 2.6, gz);
      S.add(pb.mesh());
      this.crane = M.quayCrane();
      this.crane.group.position.set(A + 20, 0, this.cz);
      S.add(this.crane.group);
      this.site = { x: A + 20, z: 590, w: 40, d: 30, h: 28, world: true };
    }
    activate() {
      super.activate();
      for (let i = 0; i < 3; i++) {
        const s = WT.pick(this.slots.filter((q) => q.items.length < 2));
        const c = WT.SUP.newContainer(5.8);
        WT.SUP.note(c, 'Empty staged for export');
        c.mesh.position.set(s.x, s.items.length * 2.7, s.z);
        c.loc = this.id + ' · Quay stack';
        WT.scene.add(c.mesh);
        s.items.push(c);
      }
      WT.spawn(this.craneWorker());
      WT.spawn(this.berthLoop());
    }
    ct(z) { return z - this.cz; }
    *craneWorker() {
      while (true) {
        const job = this.jobs.shift();
        if (!job) { yield* WT.sleep(0.25); continue; }
        yield* job.run();
        job.done = true;
        this.moves++;
        WT.G && WT.G.earn(9000, this);
      }
    }
    *queue(run) { const job = { run, done: false }; this.jobs.push(job); while (!job.done) yield; }
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
    dropSlot(x) {
      const c = this.slots.filter((s) => s.items.length < 2 && !(s.items.length && this.topOf(s).reserved));
      if (!c.length) return null;
      return x === undefined ? c.reduce((a, b) => (b.items.length < a.items.length ? b : a)) : c.reduce((a, b) => (Math.abs(b.x - x) < Math.abs(a.x - x) ? b : a));
    }
    *toStack(mesh, cont, nearX) {
      const s = this.dropSlot(nearX);
      if (!s) return false;
      const p = new T.Vector3();
      mesh.getWorldPosition(p);
      const m = yield* CR.move(this.crane, mesh, { x: p.x, t: this.ct(p.z), top: p.y + 2.7 }, { x: s.x, t: this.ct(s.z), base: s.items.length * 2.7 }, 21, 7);
      m.position.set(s.x, s.items.length * 2.7, s.z);
      m.rotation.set(0, 0, 0);
      cont.status = 'Discharged'; cont.loc = this.id + ' · Quay stack';
      s.items.push(cont);
      return true;
    }
    *fromStack(target, base, place, filter) {
      const s = this.pickSlot(filter);
      if (!s) return null;
      const cont = s.items[s.items.length - 1];
      const m = yield* CR.move(this.crane, cont.mesh, { x: s.x, t: this.ct(s.z), top: s.items.length * 2.7 }, { x: target.x, t: this.ct(target.z), base }, 21, 7);
      s.items.pop();
      place(m);
      return cont;
    }
    stackWorld(ship, st, extra = 0) {
      const v = new T.Vector3(st.x, 3.8 + (st.items.length + extra) * 2.75, st.z);
      ship.mesh.localToWorld(v);
      return v;
    }
    *berthLoop() {
      yield* WT.sleep(WT.rnd(4, 12));
      const S = WT.SUP;
      while (true) {
        // a vessel is booked once there is sea freight on order or exports waiting
        yield* WT.waitFor(() => S.backlog.sea.length || this.exportCount() >= 2);
        const ship = new Ship();
        ship.port = this;
        ship.manifest = S.takeManifest('sea', Math.min(10, this.stackRoom()));
        yield* this.shipCall(ship);
        yield* WT.sleep(WT.rnd(14, 26));
      }
    }
    *shipCall(ship) {
      const a = ship.actor, B = this.berth, A = this.A, S = WT.SUP;
      const stacks = ship.mesh.userData.stacks;
      const origin = WT.pick(['Rotterdam', 'Shanghai', 'Santos', 'Busan', 'Antwerp', 'Singapore']);
      ship.manifest = (ship.manifest || []).map((po) => {
        const st = stacks.filter((q) => q.items.length < 3).sort((p, q) => p.items.length - q.items.length || Math.abs(p.x) - Math.abs(q.x))[0];
        const c = S.newContainer(5.8, po.mat);
        S.fillPO(c, po);
        ship.mesh.add(c.mesh);
        c.mesh.position.set(st.x, 3.8 + st.items.length * 2.75, st.z);
        st.items.push(c.mesh);
        c.status = 'On vessel'; c.loc = ship.name;
        S.note(c, `Loaded at ${origin} on ${ship.name} for ${po.to.id} (${po.id})`);
        S.ev(po, `On vessel · ${ship.name} from ${origin}`);
        po.vehicle = ship;
        return { po, c, st };
      });
      const sx0 = A + 900;
      a.place(sx0, 690, Math.PI);
      WT.log(`${ship.name} inbound to ${this.id}`, 'blue');
      WT.emit('event', { kind: 'ship', ent: ship, weight: 2 });
      yield* WT.drive(a, [[sx0, 690], [A + 230, 690], [A + 110, 630], [B.x, B.z]], { speed: 16, accel: 1, decel: 0.6, radius: 40, latAccel: 2, avoid: true, avoidGap: 160, avoidLat: 18, avoidMin: 110 });
      this.busy = ship;
      ship.status = 'Discharging';
      WT.log(`${ship.name} all fast at ${this.id}`, 'blue', true);
      const sh = WT.createShipment({ mode: 'sea', to: ship.dest, carrier: ship.name, vehicle: ship, total: 4, transit: WT.rint(600, 1400) });
      ship.shipment = sh;
      // discharge exactly the booked containers, top of stack first
      for (const m of ship.manifest.slice().reverse()) {
        while (this.stackRoom() < 1) yield* WT.sleep(1);
        yield* this.queue(function* () {
          const top = new T.Vector3();
          m.c.mesh.getWorldPosition(top);
          if (yield* this.toStack(m.c.mesh, m.c, top.x)) {
            m.st.items.splice(m.st.items.indexOf(m.c.mesh), 1);
            ship.moves++;
            S.note(m.c, `Discharged at ${this.id}`);
            m.c.at = this; m.c.status = 'Grounded · awaiting truck';
            S.grounded(m.po, this.id);
          }
        }.bind(this));
      }
      ship.status = 'Loading';
      WT.advanceShipment(sh, 2);
      for (let i = 0; i < 4; i++) {
        if (this.exportCount() < 1) break;
        let best = null, bd = 1e9;
        for (const s of stacks) {
          if (s.items.length >= 3) continue;
          const w = this.stackWorld(ship, s), d = Math.abs(w.x - (this.A + 5)) + s.items.length * 2;
          if (d < bd) { bd = d; best = s; }
        }
        if (!best) break;
        yield* this.queue(function* () {
          const target = this.stackWorld(ship, best);
          const c = yield* this.fromStack({ x: target.x, z: target.z }, target.y, (m) => {
            ship.mesh.attach(m);
            m.position.set(best.x, 3.8 + best.items.length * 2.75, best.z);
            m.rotation.set(0, 0, 0);
            best.items.push(m);
          }, (c) => !this.isImport(c) && !c.reserved);
          if (c) { WT.SUP.note(c, `Loaded on ${ship.name} → ${ship.dest}`); WT.unregister(c); sh.loaded++; ship.moves++; }
        }.bind(this));
        WT.updateShipment(sh, Math.round(WT.secToMin((4 - i) * 14)));
      }
      ship.status = 'Sailing';
      WT.advanceShipment(sh, 3);
      this.busy = null;
      WT.log(`${ship.name} sailed from ${this.id} → ${ship.dest}`, 'green', true);
      WT.emit('event', { kind: 'ship', ent: ship, weight: 1 });
      yield* WT.drive(a, [[B.x, B.z], [A - 70, 630], [A - 200, 690], [-W.EDGE - 300, 690]], { speed: 12, accel: 0.8, radius: 40, latAccel: 2, avoid: true, avoidGap: 160, avoidLat: 18, avoidMin: 110 });
      ship.remove();
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
          if (c && (yield* this.toStack(c.mesh, c))) { t.container = null; c.status = 'Export · stacked'; WT.SUP.note(c, `Dropped at ${this.id} for export`); }
        }.bind(this));
      }
    }
    card() {
      return this.cardBase({
        kicker: 'Facility · Port terminal', icon: '⚓', sub: 'STS crane berth · Avenue ' + this.A, where: this.busy ? this.busy.name + ' alongside' : 'Berth free',
        rows: [['Imports waiting', String(this.importCount())], ['Exports staged', String(this.exportCount())], ['Quay stack', this.stackCount() + ' / ' + this.slots.length * 2 + ' TEU'], ['Crane moves', WT.fmtNum(this.moves)], ['Crane', this.crane && this.crane.carry ? 'Lifting' : 'Ready'],
          ['Queued jobs', String(this.jobs.length)], ['Vessel', this.busy ? this.busy.name : '—'], ['Revenue', '$' + WT.fmtNum(this.income * 60 * WT.G.INCOME_SCALE) + '/min']],
      });
    }
  }
  WT.Port = Port;

  // ambient traffic far offshore
  WT.startSeaTraffic = function () {
    WT.spawn((function* () {
      while (true) {
        const east = Math.random() < 0.5;
        const s = new Ship({ scale: WT.rnd(0.9, 1.3), kind: WT.pick(['container', 'tanker', 'bulk']) });
        s.status = 'Passing';
        const z = east ? 790 : 860;
        const x0 = east ? -W.EDGE - 400 : W.EDGE + 400;
        s.actor.place(x0, z, east ? 0 : Math.PI);
        WT.spawn((function* () {
          yield* WT.drive(s.actor, [[x0, z], [-x0, z]], { speed: 10, radius: 0, accel: 1 });
          s.remove();
        })());
        yield* WT.sleep(WT.rnd(30, 60));
      }
    })());
  };
})();
