/* WareTrack – warehouse facility: dock bays, apron + yard forklifts, yard slots.
   All internal logic runs in the warehouse "dock frame" (X along the dock wall, Z away from it). */
(function () {
  const T = THREE, M = WT.M, W = WT.W;
  const TRUCK_Z = 2, STAND_N = -2.25, STAND_DOOR = -5.35, DOOR_PAL_Z = -8.2, TURN_Z = -2.7;
  const STAND_S = 6.2, YARD_PAL_Z = 3.35, FORK_REACH = 2.85;
  const BAYS = [26, 0, -26];

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
      this.mesh = M.forklift(role === 'apron' ? 0xf5a524 : 0xf2c12e);
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
        kicker: 'Forklift · ' + (this.role === 'apron' ? 'Dock apron' : 'Yard'), title: this.id, sub: 'Operator ' + this.operator,
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
      this.bays = BAYS.map((x, i) => ({ n: i + 1, x, door: { x, z: -6 }, truck: null, jobs: [], docked: false }));
      this.docks = this.bays;
      this.slots = [];
      this.forklifts = [];
      this.income = 9000;
      this.site = { x: 86, z: 0, w: 34, d: 96, h: 11 };
      this.belts = [];
    }
    P(X, Z) { return this.toWorld(64 - Z, X); }
    get gateIn() { return { A: this.plot.A, z: this.P(46, 64)[1] }; }
    get gateOut() { return { A: this.plot.A, z: this.P(-46, 64)[1] }; }
    inPath(bay) { return [[46, 64], [46, 12], [bay.x + 10, 12], [bay.x + 10, TRUCK_Z], [bay.x, TRUCK_Z]].map(([x, z]) => this.P(x, z)); }
    outPath(bay) { return [[bay.x, TRUCK_Z], [bay.x - 3, TRUCK_Z], [bay.x - 9, 12], [-46, 12], [-46, 64]].map(([x, z]) => this.P(x, z)); }

    build() {
      this.pad();
      const fr = this.fr;
      W.flat(fr, 96, 11, W.COL.apron, 0, -0.5, 0.026);
      W.flat(fr, 98, 6, W.COL.road, 0, 12, 0.028);
      W.flat(fr, 6, 52, W.COL.road, 46, 38, 0.028);
      W.flat(fr, 6, 52, W.COL.road, -46, 38, 0.028);
      const yard = [], yel = [];
      W.dashLine(yel, -48, 9.2, 48, 9.2, 2, 1.4, 0.2);
      W.dashLine(yel, -48, 14.8, 48, 14.8, 2, 1.4, 0.2);
      for (const sz of [21, 30]) for (let i = 0; i < 9; i++) {
        const sx = -36 + i * 9;
        this.slots.push({ id: this.slots.length + 1, x: sx, z: sz, pallet: null, reserved: null, aisle: sx + 4.5 });
        W.dashRect(yard, sx, sz, 6.4, 6.4);
      }
      W.dashes(fr, yard, W.COL.yellow, 0.056);
      W.dashes(fr, yel, W.COL.yellow, 0.057);
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
      M.shed(s, Object.assign({ x0: -47, x1: 47, z0: -38, z1: -6, h: 11, doors: BAYS, sign: this.id }, ST));
      // roller doors (open while a truck is docked)
      this.rollers = BAYS.map((x) => {
        const d = new T.Mesh(new T.BoxGeometry(6.2, 5.3, 0.16), M.mat(this.style === 'cold' ? 0x9fb4ff : 0xc7cde3));
        d.position.set(x, 2.65, -6.25);
        s.add(d);
        return d;
      });
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
      new Forklift(this, 1, 'apron', [43, -3.4, Math.PI]);
      new Forklift(this, 2, 'apron', [-43, -3.4, 0]);
      new Forklift(this, 3, 'yard', [28, 40, -Math.PI / 2]);
      new Forklift(this, 4, 'yard', [-28, 40, -Math.PI / 2]);
      this.forklifts.forEach((f) => WT.spawn(this.worker(f)));
      this.addGates();
      WT.on('frame', () => {
        const dt = WT.sim.dt;
        this.bays.forEach((b, i) => {
          const r = this.rollers[i], open = b.docked ? 1 : 0;
          r.userData.o = WT.clamp((r.userData.o || 0) + (open ? dt : -dt) * 0.8, 0, 1);
          r.scale.y = Math.max(0.06, 1 - r.userData.o * 0.94);
          r.position.y = 5.3 - (5.3 * r.scale.y) / 2;
        });
        if (this.coldFans) for (const f of this.coldFans) f.rotation.y += dt * 8;
      });
    }
    card() {
      const docked = this.bays.filter((b) => b.docked).length;
      return this.cardBase({
        kicker: 'Facility · ' + this.name, icon: this.style === 'cold' ? '❄️' : '🏬', where: Math.round((this.stock / this.capacity) * 100) + '% full',
        rows: [['Stock on hand', WT.fmtNum(this.stock) + ' pallets'], ['Capacity', WT.fmtNum(this.capacity) + ' pallets'], ['Dock bays', docked + ' / 3 docked'],
          ['Forklifts', String(this.forklifts.length)], ['Yard slots', this.slots.filter((s) => s.pallet).length + ' / ' + this.slots.length], ['Revenue', '$' + WT.fmtNum(this.income * 60 * WT.G.INCOME_SCALE) + '/min']],
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
      yield* WT.drive(a, [[a.x, a.z], ...pts], { speed, radius: 2.2, turnRate: 6, avoid: true, avoidGap: 6, avoidLat: 2.6, avoidMin: 3.4, accel: 6, latAccel: 5, hold });
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
      return [[ax, a.z], [ax, 12]];
    }
    *toSlot(f, slot) {
      const pre = slot.z - FORK_REACH - 3;
      yield* this.go(f, [...this.laneExit(f), [slot.aisle, 12.5], [slot.aisle, pre], [slot.x, pre], [slot.x, slot.z - FORK_REACH]], 7);
    }
    *leaveSlot(f, slot) { yield* this.back(f, [[slot.x, slot.z - FORK_REACH - 3]]); }
    slotsWith(fn) { const c = this.slots.filter(fn); return c.length ? WT.pick(c) : null; }

    /* ----- jobs ----- */
    *apronJob(f, bay) {
      const t = bay.truck, x = bay.x, A = f.actor;
      f.task = (t.dir === 'out' ? 'Loading ' : 'Unloading ') + t.id;
      yield* this.go(f, [[A.x, -3.4], [x, -3.4]].filter((p, i) => i || Math.abs(A.z + 3.4) > 0.5), 6);
      if (t.dir === 'out') {
        const p = new WT.Pallet({ status: 'Picked', loc: `${this.id} · Dock door ${bay.n}` });
        p.placeIn(this.fr, x, DOOR_PAL_Z);
        this.stock--;
        p.mesh.scale.setScalar(0.01);
        yield* WT.tween(0.3, (k) => p.mesh.scale.setScalar(Math.max(0.01, k)));
        yield* WT.turnTo(A, -Math.PI / 2, 3.5);
        yield* this.go(f, [[x, STAND_DOOR]], 2.5);
        this.pickUp(f, p);
        p.status = 'Loading'; p.loc = `${this.id} · Bay ${bay.n} · ${t.id}`;
        yield* this.forks(f, 0.5);
        yield* this.back(f, [[x, TURN_Z]]);
        yield* WT.turnTo(A, Math.PI / 2, 3);
        yield* this.go(f, [[x, STAND_N]], 2);
        yield* this.forks(f, 1.05, 0.4);
        this.putDown(f).mesh.position.y = 1.15;
        yield* this.slide(p, 0, 1.6, 0.6, true);
        p.dispose();
        t.loaded++;
        yield* this.forks(f, 0.1, 0.4);
        yield* this.back(f, [[x, TURN_Z]]);
      } else {
        yield* WT.turnTo(A, Math.PI / 2, 3.5);
        yield* this.go(f, [[x, STAND_N]], 2);
        const p = new WT.Pallet({ status: 'Unloading', loc: `${this.id} · Bay ${bay.n} · ${t.id}` });
        p.placeIn(this.fr, x, STAND_N + FORK_REACH + 1.0, 1.15, 0);
        yield* this.slide(p, 0, -1.0, 0.5);
        yield* this.forks(f, 1.05, 0.2);
        this.pickUp(f, p);
        yield* this.back(f, [[x, TURN_Z]]);
        yield* this.forks(f, 0.5, 0.4);
        yield* WT.turnTo(A, -Math.PI / 2, 3);
        yield* this.go(f, [[x, STAND_DOOR]], 2.5);
        p.status = 'Stored'; p.loc = `${this.id} · Inbound buffer`;
        yield* this.forks(f, 0.1, 0.4);
        this.putDown(f);
        yield* this.back(f, [[x, TURN_Z]]);
        yield* this.slide(p, 0, -4, 0.8, true);
        p.dispose();
        t.loaded++;
        this.stock++;
      }
    }
    *yardJob(f, bay, job) {
      const t = bay.truck, tx = bay.x - 2, A = f.actor;
      f.task = (t.dir === 'out' ? 'Loading ' : 'Unloading ') + t.id;
      if (t.dir === 'out') {
        let p;
        if (job.slot) {
          p = job.slot.pallet;
          yield* this.toSlot(f, job.slot);
          this.pickUp(f, p);
          job.slot.pallet = null; job.slot.reserved = null;
          yield* this.forks(f, 0.5);
          yield* this.leaveSlot(f, job.slot);
          yield* this.go(f, [...this.laneExit(f), [tx, 11], [tx, STAND_S]], 7);
        } else {
          p = new WT.Pallet({ status: 'Picked', loc: `${this.id} · Cross-dock` });
          p.placeIn(this.fr, tx, 13.5 + FORK_REACH, 0, 0);
          yield* this.go(f, [...this.laneExit(f), [tx, 13.5]], 7);
          yield* WT.turnTo(A, Math.PI / 2, 3);
          this.pickUp(f, p);
          yield* this.forks(f, 0.5);
          yield* WT.turnTo(A, -Math.PI / 2, 3);
          yield* this.go(f, [[tx, STAND_S]], 3);
        }
        p.status = 'Loading'; p.loc = `${this.id} · Bay ${bay.n} · ${t.id}`;
        yield* this.forks(f, 1.05, 0.4);
        this.putDown(f).mesh.position.y = 1.15;
        yield* this.slide(p, 0, -1.6, 0.6, true);
        p.dispose();
        t.loaded++;
        yield* this.forks(f, 0.1, 0.4);
        yield* this.back(f, [[tx, 10.5]]);
      } else {
        yield* this.go(f, [...this.laneExit(f), [tx, 11], [tx, STAND_S]], 7);
        const p = new WT.Pallet({ status: 'Unloading', loc: `${this.id} · Bay ${bay.n} · ${t.id}` });
        p.placeIn(this.fr, tx, YARD_PAL_Z - 1.0, 1.15, 0);
        yield* this.slide(p, 0, 1.0, 0.5);
        yield* this.forks(f, 1.05, 0.2);
        this.pickUp(f, p);
        t.loaded++;
        yield* this.back(f, [[tx, 10.5]]);
        yield* this.forks(f, 0.5, 0.4);
        const slot = job.slot;
        p.status = 'Received'; p.loc = `${this.id} · Yard slot ${slot.id}`;
        yield* this.toSlot(f, slot);
        yield* this.forks(f, 0.1, 0.4);
        this.putDown(f);
        slot.pallet = p; slot.reserved = null;
        yield* this.leaveSlot(f, slot);
        WT.spawn((function* () { yield* WT.sleep(12); if (!p.gone && p.status === 'Received') p.status = 'Staged'; })());
      }
    }
    *relocate(f) {
      const from = this.slotsWith((s) => s.pallet && !s.reserved && !s.pallet.priority);
      const to = this.slotsWith((s) => !s.pallet && !s.reserved);
      if (!from || !to) return;
      from.reserved = to.reserved = f;
      const p = from.pallet;
      f.task = 'Relocating ' + p.id;
      yield* this.toSlot(f, from);
      this.pickUp(f, p); from.pallet = null; from.reserved = null;
      p.status = 'Moving';
      yield* this.forks(f, 0.5);
      yield* this.leaveSlot(f, from);
      yield* this.toSlot(f, to);
      yield* this.forks(f, 0.1);
      this.putDown(f);
      to.pallet = p; to.reserved = null;
      p.status = 'Staged'; p.loc = `${this.id} · Yard slot ${to.id}`;
      yield* this.leaveSlot(f, to);
    }
    *worker(f) {
      let idle = 0;
      while (true) {
        let did = false;
        for (const bay of this.bays) {
          if (!bay.docked || !bay.truck || bay.truck === 'reserved') continue;
          const key = f.role === 'apron' ? 'apronBusy' : 'yardBusy';
          if (bay[key]) continue;
          const job = bay.jobs.find((j) => j.side === f.role && !j.claimed);
          if (!job) continue;
          job.claimed = f; bay[key] = f;
          if (f.role === 'apron') yield* this.apronJob(f, bay, job);
          else yield* this.yardJob(f, bay, job);
          bay[key] = null;
          did = true;
          idle = 0;
          break;
        }
        if (did) continue;
        f.task = 'Idle';
        idle += WT.sim.dt;
        if (f.role === 'yard' && idle > 6 && Math.random() < 0.015) {
          yield* this.relocate(f);
          idle = 0;
          continue;
        }
        const [hx, hz, hh] = f.home, a = f.actor;
        if (Math.hypot(a.x - hx, a.z - hz) > 1) {
          f.task = 'Returning to base';
          if (f.role === 'apron') yield* this.go(f, [[a.x, -3.4], [hx, hz]].filter((p, i) => i || Math.abs(a.z + 3.4) > 0.5), 6);
          else yield* this.go(f, [...this.laneExit(f), [hx, 11.5], [hx, hz]], 7);
          yield* WT.turnTo(a, hh, 3);
        }
        yield;
      }
    }
    makeJobs(t, bay) {
      const jobs = [];
      for (let i = 0; i < t.total - t.loaded; i++) {
        const j = { side: i % 2 === 0 ? 'apron' : 'yard' };
        if (j.side === 'yard') {
          if (t.dir === 'out') {
            const staged = this.slots.filter((s) => s.pallet && !s.reserved).length;
            const s = staged > 6 ? this.slotsWith((s) => s.pallet && !s.reserved && s.pallet.status === 'Staged') : null;
            if (s) { s.reserved = t; j.slot = s; s.pallet.status = 'Allocated'; }
          } else {
            const s = this.slotsWith((s) => !s.pallet && !s.reserved);
            if (s) { s.reserved = t; j.slot = s; } else j.side = 'apron';
          }
        }
        jobs.push(j);
      }
      bay.jobs = jobs;
    }
    // called by a truck parked at the bay
    *serve(t, leg) {
      const bay = leg.dock;
      bay.truck = t;
      t.dir = leg.op === 'unload' ? 'in' : 'out';
      t.total = WT.rint(4, 7);
      t.loaded = 0;
      t.status = leg.op === 'stuff' ? 'Stuffing' : t.dir === 'out' ? 'Loading' : 'Unloading';
      if (leg.op === 'stuff' && t.container) { t.container.status = 'Stuffing'; t.container.loc = this.id; WT.SUP.note(t.container, `Stuffing at ${this.id}`); }
      t.where = `${this.id} · Bay ${bay.n}`;
      if (t.shipment) { t.shipment.total = t.total; WT.advanceShipment(t.shipment, 2); }
      bay.docked = true;
      this.makeJobs(t, bay);
      while (t.loaded < t.total) {
        if (t.shipment) { t.shipment.loaded = t.loaded; WT.updateShipment(t.shipment, Math.max(1, Math.round(WT.secToMin((t.total - t.loaded) * 9)))); }
        yield* WT.sleep(0.5);
      }
      if (t.shipment) t.shipment.loaded = t.loaded;
      t.status = 'Sealing';
      yield* WT.sleep(1.2);
      yield* WT.waitFor(() => !bay.apronBusy && !bay.yardBusy && this.forklifts.every((f) => Math.hypot(f.actor.x - (bay.x - 2), f.actor.z - 7) > 5));
      bay.docked = false;
      bay.jobs = [];
      if (leg.op === 'stuff' && t.container) {
        WT.SUP.fillProduct(t.container, (this.product || WT.pick(Object.keys(WT.SUP.RECIPES))) + ' (palletised)', t.total);
        t.container.status = 'Export · sealed';
        WT.SUP.note(t.container, `Sealed at ${this.id} with ${t.total} pallets`);
      }
      this.moves += t.total;
      WT.G && WT.G.earn(t.total * 2500, this);
    }
  }
  WT.Warehouse = Warehouse;
})();
