/* WareTrack – warehouse facility: back-in dock doors, dock and yard forklifts, forklift doors, yard slots.
   All internal logic runs in the warehouse "dock frame" (X along the dock wall, Z away from it; the wall is at Z = −6). */
(function () {
  const T = THREE, M = WT.M, W = WT.W;
  // trucks: drive along the yard road, pull past the bay, reverse square onto the dock door, pull straight out
  const ROAD_Z = 12, PULL = 12, TRUCK_Z = 2.0; // docked rig origin: trailer doors against the door seals
  const WALL_Z = -6, FORK_REACH = 2.85;
  // dock forklifts work from inside the building: forks into the trailer through the open roller door
  const DOCK_HOME = -12.5, DOCK_STAND = -6.7, TRAILER_PAL_Z = DOCK_STAND + FORK_REACH;
  // yard forklifts carry pallets between the outdoor yard and the building through their own doors
  const FDOOR_IN = -11.5, LANE_Z = 12.5;
  const BAYS = [26, 0, -26], FDOORS = [13, -13];

  /* ---------- forklift ---------- */
  class Forklift extends WT.Entity {
    constructor(wh, n, role, home) {
      super();
      this.kind = 'forklift';
      this.wh = wh;
      this.id = wh.id + '/F' + n;
      this.role = role;
      this.operator = WT.pick(WT.OPERATORS);
      this.battery = WT.rint(58, 96);
      this.distance = WT.rnd(1, 4);
      this.task = 'Idle';
      this.carry = null;
      this.home = home;
      this.mesh = M.forklift(role === 'dock' ? 0xf5a524 : 0xf2c12e);
      this.lift = this.mesh.userData.lift;
      this.actor = new WT.Actor('forklift', this.mesh, 'fork');
      this.actor.scope = wh.id;
      this.actor.entity = this;
      wh.fr.add(this.mesh);
      this.actor.place(home[0], home[1], home[2]);
      WT.register(this);
      WT.TR.addProxy(this);
      wh.forklifts.push(this);
    }
    radius() { return 2.5; }
    card() {
      return {
        kicker: 'Forklift · ' + (this.role === 'dock' ? 'Dock door ' + this.bay.n : 'Yard · forklift door ' + this.door.n), title: this.id, sub: 'Operator ' + this.operator,
        icon: '🏗️', iconBg: '#ffc94d', status: this.task === 'Idle' ? 'Idle' : 'Moving', statusTone: this.task === 'Idle' ? 'grey' : 'blue', where: this.task,
        rows: [['Operator', this.operator], ['Battery', Math.round(this.battery) + '%'], ['Task', this.task],
          ['Carrying', this.carry ? this.carry.id : '—'], ['Capacity', '2,500 kg'], ['Distance today', this.distance.toFixed(1) + ' km']],
      };
    }
    label() { return this.id; }
  }

  /* ---------- warehouse ---------- */
  class Warehouse extends WT.Facility {
    constructor(plot, style) {
      super('Warehouse', 'WH', 'Distribution Center', plot);
      this.style = style || WT.pick(['dc', 'dc', 'fulfil', 'bulk']);
      this.name = { dc: 'Distribution Center', cold: 'Cold Storage', fulfil: 'Fulfilment Center', bulk: 'Bulk Warehouse' }[this.style];
      this.product = null;
      this.stock = WT.rint(600, 1100);
      this.capacity = 1800;
      this.fr = new T.Group();
      this.fr.rotation.y = -Math.PI / 2;
      this.fr.position.x = 64;
      this.group.add(this.fr);
      this.bays = BAYS.map((x, i) => ({ n: i + 1, x, truck: null, jobs: [], docked: false, busy: null }));
      this.docks = this.bays;
      this.fdoors = FDOORS.map((x, i) => ({ n: i + 1, x }));
      this.slots = [];
      this.forklifts = [];
      this.income = 9000;
      this.site = { x: 86, z: 0, w: 34, d: 96, h: 11 };
      this.belts = [];
      this.moved = 0;
    }
    P(X, Z) { return this.toWorld(64 - Z, X); }
    get gateIn() { return { A: this.plot.A, z: this.P(46, 64)[1] }; }
    get gateOut() { return { A: this.plot.A, z: this.P(-46, 64)[1] }; }
    inPath(bay) { return [[46, 64], [46, ROAD_Z], [bay.x - PULL, ROAD_Z]].map(([x, z]) => this.P(x, z)); }
    dockPath(bay) { return [[bay.x - PULL, ROAD_Z], [bay.x, ROAD_Z], [bay.x, TRUCK_Z]].map(([x, z]) => this.P(x, z)); }
    outPath(bay) { return [[bay.x, TRUCK_Z], [bay.x, ROAD_Z], [-46, ROAD_Z], [-46, 64]].map(([x, z]) => this.P(x, z)); }

    build() {
      this.pad();
      const fr = this.fr;
      W.flat(fr, 96, 15, W.COL.apron, 0, 1.5, 0.026);
      W.flat(fr, 98, 6, W.COL.road, 0, ROAD_Z, 0.028);
      W.flat(fr, 6, 52, W.COL.road, 46, 38, 0.028);
      W.flat(fr, 6, 52, W.COL.road, -46, 38, 0.028);
      const yard = [], yel = [], guide = [];
      W.dashLine(yel, -48, 9.2, 48, 9.2, 2, 1.4, 0.2);
      W.dashLine(yel, -48, 14.8, 48, 14.8, 2, 1.4, 0.2);
      // bay guide lines for reversing trucks, and walkway lanes from each forklift door to the yard
      for (const x of BAYS) for (const s of [-1, 1]) W.dashLine(guide, x + s * 2.1, -5.6, x + s * 2.1, 8.6, 14.2, 0, 0.22);
      for (const x of FDOORS) for (const s of [-1, 1]) W.dashLine(yel, x + s * 1.9, -5.6, x + s * 1.9, 8.8, 1.2, 0.8, 0.22);
      for (const sz of [21, 30]) for (let i = 0; i < 9; i++) {
        const sx = -36 + i * 9;
        this.slots.push({ id: this.slots.length + 1, x: sx, z: sz, pallet: null, reserved: null, aisle: sx + 4.5 });
        W.dashRect(yard, sx, sz, 6.4, 6.4);
      }
      W.dashes(fr, yard, W.COL.yellow, 0.056);
      W.dashes(fr, yel, W.COL.yellow, 0.057);
      W.dashes(fr, guide, 0xffffff, 0.057);
      const s = new T.Group();
      s.rotation.y = -Math.PI / 2;
      s.position.x = 64;
      this.structure.add(s);
      const ST = {
        dc: { colors: ['#2f56e0', '#2a4dcc'], roof: 0x3f66ee, roofLogo: true },
        cold: { colors: ['#f3f5fd', '#dfe3f2'], roof: 0xe9ecf7, flat: true, h: 12 },
        fulfil: { colors: ['#1aa6b7', '#178f9e'], roof: 0x2fbccc, sawtooth: true, h: 12 },
        bulk: { colors: ['#4a5578', '#414b6b'], roof: 0x5b6a94, roofLogo: true, h: 13 },
      }[this.style];
      M.shed(s, Object.assign({ x0: -47, x1: 47, z0: -38, z1: WALL_Z, h: 11, doors: BAYS, forkDoors: FDOORS, sign: this.id }, ST));
      // roller doors: dock doors open while a truck is on the bay, forklift doors open for a forklift
      const roller = (x, w, h) => {
        const d = new T.Mesh(new T.BoxGeometry(w, h, 0.16), M.mat(this.style === 'cold' ? 0x9fb4ff : 0xc7cde3));
        d.position.set(x, h / 2, WALL_Z - 0.25);
        d.userData.h = h;
        s.add(d);
        return d;
      };
      this.rollers = BAYS.map((x) => roller(x, 6.2, 5.3));
      this.fdoors.forEach((d) => (d.roller = roller(d.x, 3.4, 3.7)));
      if (this.style === 'cold') {
        this.coldFans = [];
        for (let x = -41; x < 43; x += 10) for (const z of [-14.5, -29.5]) {
          const f = M.fan();
          f.scale.setScalar(0.9);
          f.position.set(x - 0.9, 14.3, z);
          s.add(f);
          this.coldFans.push(f);
        }
      }
      // outdoor stock by the avenue
      const deco = new T.Group();
      deco.rotation.y = -Math.PI / 2;
      deco.position.x = 64;
      this.structure.add(deco);
      for (let i = 0; i < 6; i++) {
        const p = M.pallet(i % 3 ? 'wrap' : 'crate');
        p.position.set(-20 + i * 3, 0, 52);
        deco.add(p);
      }
    }
    activate() {
      super.activate();
      const hel = WT.PRODUCTS[0];
      this.slots.forEach((s, i) => {
        if (Math.random() < 0.5) {
          const p = new WT.Pallet({ status: 'Staged', priority: i === 4 && this.id === 'WH-01', product: i === 4 && this.id === 'WH-01' ? hel : undefined });
          p.loc = `${this.id} · Yard slot ${s.id}`;
          p.placeIn(this.fr, s.x, s.z, 0, WT.rnd(-0.05, 0.05));
          s.pallet = p;
        }
      });
      // one dock forklift per door, parked inside; two yard forklifts, one per forklift door
      this.bays.forEach((b, i) => { const f = new Forklift(this, i + 1, 'dock', [b.x + 3.5, DOCK_HOME, Math.PI / 2]); f.bay = b; });
      this.fdoors.forEach((d, i) => { const f = new Forklift(this, 4 + i, 'yard', [d.x * 2.2, 40, -Math.PI / 2]); f.door = d; });
      this.forklifts.forEach((f) => WT.spawn(f.role === 'dock' ? this.dockWorker(f) : this.yardWorker(f)));
      this.addGates();
      WT.on('frame', () => {
        const dt = WT.sim.dt;
        const slide = (r, open) => {
          r.userData.o = WT.clamp((r.userData.o || 0) + (open ? dt : -dt) * 0.8, 0, 1);
          r.scale.y = Math.max(0.06, 1 - r.userData.o * 0.94);
          r.position.y = r.userData.h - (r.userData.h * r.scale.y) / 2;
        };
        this.bays.forEach((b, i) => slide(this.rollers[i], b.docked));
        this.fdoors.forEach((d) => slide(d.roller, this.forklifts.some((f) => f.role === 'yard' && Math.abs(f.actor.x - d.x) < 3 && Math.abs(f.actor.z - WALL_Z) < 7.5)));
        if (this.coldFans) for (const f of this.coldFans) f.rotation.y += dt * 8;
      });
    }
    card() {
      const docked = this.bays.filter((b) => b.docked).length;
      return this.cardBase({
        kicker: 'Facility · ' + this.name, icon: this.style === 'cold' ? '❄️' : '🏬', where: Math.round((this.stock / this.capacity) * 100) + '% full',
        rows: [['Stock on hand', WT.fmtNum(this.stock) + ' pallets'], ['Capacity', WT.fmtNum(this.capacity) + ' pallets'], ['Dock doors', docked + ' / 3 trucks docked'],
          ['Forklifts', `${this.bays.length} dock · ${this.fdoors.length} yard`], ['Yard slots', this.slots.filter((s) => s.pallet).length + ' / ' + this.slots.length],
          ['Yard ↔ building', WT.fmtNum(this.moved) + ' pallets'], ['Revenue', '$' + WT.fmtNum(this.income * 60 * WT.G.INCOME_SCALE) + '/min']],
      });
    }

    /* ----- forklift helpers ----- */
    *go(f, pts, speed = 7) {
      const a = f.actor;
      const first = pts.find((p) => Math.hypot(p[0] - a.x, p[1] - a.z) > 0.4);
      if (!first) return;
      const ang = Math.atan2(first[1] - a.z, first[0] - a.x);
      if (Math.abs(WT.angDiff(a.h, ang)) > 0.5) yield* WT.turnTo(a, ang, 3.5);
      const x0 = a.x, z0 = a.z;
      // forklifts give way to moving road vehicles (trucks already stop for forklifts)
      const wp = new T.Vector3(), near = [];
      const hold = () => {
        f.mesh.getWorldPosition(wp);
        return WT.TR.nearby(wp.x, wp.z, 14, near).some((v) => !v.proxyOf && v.actor.speed > 0.5 && Math.hypot(v.actor.x - wp.x, v.actor.z - wp.z) < 11);
      };
      yield* WT.drive(a, [[a.x, a.z], ...pts], { speed, radius: 2.2, turnRate: 6, avoid: true, avoidGap: 6, avoidLat: 2.6, avoidMin: 3.4, accel: 6, latAccel: 5, hold: f.role === 'yard' ? hold : null });
      f.distance += Math.hypot(a.x - x0, a.z - z0) / 1000;
      f.battery = Math.max(20, f.battery - 0.05);
    }
    *back(f, pts, speed = 2.6) {
      const a = f.actor;
      yield* WT.drive(a, [[a.x, a.z], ...pts], { speed, radius: 0, reverse: true, accel: 4 });
    }
    *forks(f, y, sec = 0.55) {
      const y0 = f.lift.position.y;
      yield* WT.tween(sec, (t) => (f.lift.position.y = WT.lerp(y0, y, WT.ease(t))));
    }
    pickUp(f, p) { p.attach(f.lift, 1.1, 0.1, 0); f.carry = p; }
    putDown(f) { const p = f.carry; p.detachTo(this.fr); p.mesh.position.y = 0; f.carry = null; return p; }
    *slide(p, dx, dz, sec, hide) {
      const x0 = p.mesh.position.x, z0 = p.mesh.position.z;
      yield* WT.tween(sec, (t) => {
        p.mesh.position.x = x0 + dx * t;
        p.mesh.position.z = z0 + dz * t;
        if (hide) p.mesh.scale.setScalar(1 - 0.6 * t);
      });
    }
    laneExit(f) {
      const a = f.actor;
      if (a.z < 13.5) return [];
      const ax = Math.round((a.x + 31.5) / 9) * 9 - 31.5;
      return [[ax, a.z], [ax, LANE_Z]];
    }
    *toSlot(f, slot) {
      const pre = slot.z - FORK_REACH - 3;
      yield* this.go(f, [...this.laneExit(f), [slot.aisle, LANE_Z], [slot.aisle, pre], [slot.x, pre], [slot.x, slot.z - FORK_REACH]], 7);
    }
    *leaveSlot(f, slot) { yield* this.back(f, [[slot.x, slot.z - FORK_REACH - 3]]); }
    slotsWith(fn) { const c = this.slots.filter(fn); return c.length ? WT.pick(c) : null; }

    /* ----- dock door: one pallet in or out of the trailer ----- */
    *dockJob(f, bay) {
      const t = bay.truck, x = bay.x, A = f.actor;
      f.task = (t.dir === 'out' ? 'Loading ' : 'Unloading ') + t.id + ' · door ' + bay.n;
      yield* this.go(f, [[x, DOCK_HOME]], 4);
      yield* WT.turnTo(A, Math.PI / 2, 3.5);
      if (t.dir === 'out') {
        // pallet picked from the racking inside, driven over the dock leveler into the trailer
        const p = new WT.Pallet({ status: 'Picked', loc: `${this.id} · Door ${bay.n}` });
        p.placeIn(this.fr, x, DOCK_HOME + FORK_REACH, 0, 0);
        this.stock--;
        this.pickUp(f, p);
        yield* this.forks(f, 1.05, 0.5);
        p.status = 'Loading'; p.loc = `${this.id} · Door ${bay.n} · ${t.id}`;
        yield* this.go(f, [[x, DOCK_STAND]], 3);
        this.putDown(f).mesh.position.y = 1.15;
        yield* this.slide(p, 0, 2.2, 0.6, true);
        p.dispose();
        t.loaded++;
        yield* this.back(f, [[x, DOCK_HOME]], 3);
        yield* this.forks(f, 0.1, 0.4);
      } else {
        yield* this.forks(f, 1.05, 0.4);
        yield* this.go(f, [[x, DOCK_STAND]], 3);
        const p = new WT.Pallet({ status: 'Unloading', loc: `${this.id} · Door ${bay.n} · ${t.id}` });
        p.placeIn(this.fr, x, TRAILER_PAL_Z + 1.2, 1.15, 0);
        yield* this.slide(p, 0, -1.2, 0.5);
        this.pickUp(f, p);
        t.loaded++;
        yield* this.back(f, [[x, DOCK_HOME]], 3);
        yield* this.forks(f, 0.1, 0.4);
        p.status = 'Stored'; p.loc = `${this.id} · Racking`;
        this.putDown(f);
        yield* this.slide(p, 0, -3, 0.6, true);
        p.dispose();
        this.stock = Math.min(this.capacity, this.stock + 1);
      }
    }
    *dockWorker(f) {
      const bay = f.bay;
      while (true) {
        const job = bay.docked && bay.truck && bay.truck !== 'reserved' && bay.jobs.find((j) => !j.claimed);
        if (job) {
          job.claimed = f; bay.busy = f;
          yield* this.dockJob(f, bay);
          bay.busy = null;
          continue;
        }
        f.task = 'Idle';
        const [hx, hz, hh] = f.home, a = f.actor;
        if (Math.hypot(a.x - hx, a.z - hz) > 0.5) {
          f.task = 'Returning to base';
          yield* this.go(f, [[hx, hz]], 4);
          yield* WT.turnTo(a, hh, 3);
        }
        yield;
      }
    }

    /* ----- yard ↔ building through the forklift doors ----- */
    // put a yard pallet away inside the building
    *putAway(f, slot) {
      const d = f.door, p = slot.pallet;
      slot.reserved = f;
      f.task = `Put-away ${p.id} → door F${d.n}`;
      yield* this.toSlot(f, slot);
      this.pickUp(f, p); slot.pallet = null; slot.reserved = null;
      p.status = 'Moving'; p.loc = `${this.id} · ${f.id}`;
      yield* this.forks(f, 0.5);
      yield* this.leaveSlot(f, slot);
      yield* this.go(f, [...this.laneExit(f), [d.x, LANE_Z], [d.x, WALL_Z + 3], [d.x, FDOOR_IN]], 6);
      yield* this.forks(f, 0.1, 0.4);
      this.putDown(f);
      p.status = 'Stored'; p.loc = `${this.id} · Racking`;
      yield* this.back(f, [[d.x, FDOOR_IN - FORK_REACH - 0.5]], 2.6);
      yield* this.slide(p, 0, -2.5, 0.5, true);
      p.dispose();
      this.stock = Math.min(this.capacity, this.stock + 1);
      this.moved++;
      yield* WT.turnTo(f.actor, Math.PI / 2, 3);
      yield* this.go(f, [[d.x, WALL_Z + 3], [d.x, LANE_Z]], 5);
    }
    // bring a pallet out of the building and stage it in the yard
    *bringOut(f, slot) {
      const d = f.door;
      slot.reserved = f;
      f.task = `Staging from door F${d.n} → slot ${slot.id}`;
      yield* this.go(f, [...this.laneExit(f), [d.x, LANE_Z], [d.x, WALL_Z + 3], [d.x, FDOOR_IN]], 6);
      const p = new WT.Pallet({ status: 'Picked', loc: `${this.id} · ${f.id}` });
      p.placeIn(this.fr, d.x, FDOOR_IN - FORK_REACH, 0, 0);
      this.stock--;
      this.pickUp(f, p);
      yield* this.forks(f, 0.5);
      yield* this.back(f, [[d.x, WALL_Z + 3]], 2.6);
      yield* WT.turnTo(f.actor, Math.PI / 2, 3);
      p.status = 'Moving';
      yield* this.go(f, [[d.x, LANE_Z]], 5);
      yield* this.toSlot(f, slot);
      yield* this.forks(f, 0.1);
      this.putDown(f);
      slot.pallet = p; slot.reserved = null;
      p.status = 'Staged'; p.loc = `${this.id} · Yard slot ${slot.id}`;
      this.moved++;
      yield* this.leaveSlot(f, slot);
    }
    *yardWorker(f) {
      let idle = WT.rnd(2, 8);
      while (true) {
        idle -= WT.sim.dt;
        if (idle <= 0) {
          // keep the yard about half full: put away when it fills up, stage pallets out when it empties
          const full = this.slots.filter((s) => s.pallet).length / this.slots.length;
          const out = full < 0.35 || (full < 0.6 && Math.random() < 0.5);
          const slot = out ? this.slotsWith((s) => !s.pallet && !s.reserved) : this.slotsWith((s) => s.pallet && !s.reserved && !s.pallet.priority);
          if (slot && (out ? this.stock > 20 : this.stock < this.capacity)) {
            yield* out ? this.bringOut(f, slot) : this.putAway(f, slot);
            idle = WT.rnd(3, 9);
            continue;
          }
          idle = 4;
        }
        f.task = 'Idle';
        const [hx, hz, hh] = f.home, a = f.actor;
        if (Math.hypot(a.x - hx, a.z - hz) > 1) {
          f.task = 'Returning to base';
          yield* this.go(f, [...this.laneExit(f), [hx, LANE_Z - 1], [hx, hz]], 7);
          yield* WT.turnTo(a, hh, 3);
        }
        yield;
      }
    }

    // called by a truck reversed onto the dock door
    *serve(t, leg) {
      const bay = leg.dock;
      bay.truck = t;
      t.dir = leg.op === 'unload' ? 'in' : 'out';
      t.total = WT.rint(4, 7);
      t.loaded = 0;
      t.status = leg.op === 'stuff' ? 'Stuffing' : t.dir === 'out' ? 'Loading' : 'Unloading';
      if (leg.op === 'stuff' && t.container) { t.container.status = 'Stuffing'; t.container.loc = this.id; WT.SUP.note(t.container, `Stuffing at ${this.id}`); }
      t.where = `${this.id} · Door ${bay.n}`;
      if (t.shipment) { t.shipment.total = t.total; WT.advanceShipment(t.shipment, 2); }
      bay.docked = true;
      bay.jobs = Array.from({ length: t.total }, () => ({}));
      while (t.loaded < t.total) {
        if (t.shipment) { t.shipment.loaded = t.loaded; WT.updateShipment(t.shipment, Math.max(1, Math.round(WT.secToMin((t.total - t.loaded) * 7)))); }
        yield* WT.sleep(0.5);
      }
      if (t.shipment) t.shipment.loaded = t.loaded;
      // the forklift backs out of the trailer before the door comes down and the truck pulls away
      yield* WT.waitFor(() => !bay.busy);
      t.status = 'Sealing';
      yield* WT.sleep(1.2);
      bay.docked = false;
      bay.jobs = [];
      if (leg.op === 'stuff' && t.container) {
        WT.SUP.fillProduct(t.container, (this.product || WT.pick(Object.keys(WT.SUP.RECIPES))) + ' (palletised)', t.total);
        t.container.status = 'Export · sealed';
        WT.SUP.note(t.container, `Sealed at ${this.id} with ${t.total} pallets`);
      }
      yield* WT.sleep(1.0);
      this.moves += t.total;
      WT.G && WT.G.earn(t.total * 2500, this);
    }
  }
  WT.Warehouse = Warehouse;
})();
