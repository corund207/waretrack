/* WareTrack – port: container berths with STS cranes, feeder vessels, passing traffic at sea */
(function () {
  const T = THREE, M = WT.M, W = WT.W, CR = WT.CraneOps, FX = WT.FX;

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
      this.scale = o.scale || 1;
      if (o.scale) this.mesh.scale.setScalar(o.scale);
      this.actor = new WT.Actor('ship', this.mesh, 'sea');
      this.actor.entity = this;
      WT.scene.add(this.mesh);
      WT.register(this);
      WT.ships.push(this);
      this.moves = 0;
    }
    radius() { return 40; }
    // Return the ship's world-space bounding box half-extents [halfLength, halfWidth] based on model and scale
    getBounds() {
      const s = this.mesh.scale.x || 1;
      if (this.shipKind === 'container') {
        // M.ship: hull from x=-44 to 46 (len 90), z=-7.5 to 7.5 (wid 15)
        return { halfLen: 45 * s, halfWid: 7.5 * s };
      } else {
        // M.cargoShip: hull from x=-50 to 52 (len 102), z=-8 to 8 (wid 16)
        return { halfLen: 51 * s, halfWid: 8 * s };
      }
    }
    // Check if this ship's bounding box overlaps a given x-range at its current z
    overlapsXRange(x0, x1) {
      const b = this.getBounds();
      const cx = this.actor.x;
      return cx + b.halfLen > x0 && cx - b.halfLen < x1;
    }
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

  // sea lanes: inbound track, outbound track, anchorage line (all clear of the offshore through-traffic at 790 / 860)
  const SEA = (WT.SEA = { inbound: 712, outbound: 672, anchor: 748, entryX: () => W.edgeX() + 200 });

  // churned water off a moving vessel's stern
  function wake(ship) {
    const a = ship.actor;
    if (a.speed < 1.5 || Math.random() > a.speed * 0.05) return;
    const ch = Math.cos(a.h), sh = Math.sin(a.h), k = ship.mesh.scale.x || 1;
    const x = a.x - ch * 46 * k, z = a.z - sh * 46 * k;
    FX.puff(x + WT.rnd(-3, 3), 0.4, z + WT.rnd(-5, 5), { size0: 2.5, size1: 9, life: 3.2, vy: 0.15, op: 0.5, color: 0xf2f6ff });
  }

  // harbour tugs: a pair that meets the ship, stands off its seaward side at bow and stern, presses it onto the quay
  // (push) or pulls it off (pull), then heads back to base
  function tugMesh() {
    const b = new M.MB();
    b.box(11, 2.2, 4.6, 0x262a3d, 0, -0.6, 0);
    b.box(11.2, 0.5, 4.8, 0xd9434b, 0, 1.4, 0);
    b.box(4.2, 2.6, 3.2, 0xf3f5fd, 0.8, 1.9, 0);
    b.box(4.4, 0.4, 3.4, 0x2f56e0, 0.8, 4.5, 0);
    b.cyl(0.5, 0.6, 2.2, 0xf0b429, -1.6, 5.4, 0, 8);
    for (const s of [-1, 1]) b.box(10, 0.6, 0.4, 0x141933, 0, 0.6, s * 2.45); // fendering
    b.box(0.7, 0.9, 4.2, 0x141933, 5.6, 0.6, 0);
    const m = b.mesh();
    m.userData.fx = true;
    return m;
  }
  function tugs(ship) {
    const ctl = { push: false, pull: false, leave: false };
    const along = [36, -34];
    const boats = along.map((al) => {
      const m = tugMesh();
      const a = ship.actor, ch = Math.cos(a.h), sh = Math.sin(a.h);
      const st = { m, al, x: a.x + ch * al + WT.rnd(-40, 40), z: a.z + sh * al + 60, h: a.h, t: 0 };
      m.position.set(st.x, 0, st.z);
      m.scale.setScalar(0.01);
      WT.scene.add(m);
      return st;
    });
    WT.spawn((function* () {
      let out = 0;
      while (true) {
        const dt = WT.sim.dt, a = ship.actor, ch = Math.cos(a.h), sh = Math.sin(a.h);
        if (dt > 0) {
          if (ctl.leave) out += dt;
          for (const b of boats) {
            b.t += dt;
            let tx, tz, th;
            if (ctl.leave) { tx = b.x + Math.cos(b.h) * 9 * dt; tz = b.z + 9 * dt; th = Math.PI / 2 + (b.al > 0 ? -0.6 : 0.6); }
            else {
              const side = ctl.push ? 9.2 : ctl.pull ? 12 : 15; // seaward stand-off from the hull
              tx = a.x + ch * b.al; tz = a.z + sh * b.al + side;
              th = ctl.push || ctl.pull ? (ctl.push ? -Math.PI / 2 : Math.PI / 2) : a.h;
            }
            const k = Math.min(1, dt * (ctl.leave ? 1 : 1.6));
            b.x += (tx - b.x) * k; b.z += (tz - b.z) * k;
            b.h += WT.angDiff(b.h, th) * Math.min(1, dt * 2);
            b.m.position.set(b.x, 0, b.z);
            b.m.rotation.y = -b.h;
            const sc = ctl.leave ? Math.max(0.01, 1 - Math.max(0, out - 6) / 2) : Math.min(1, b.t / 1.2);
            b.m.scale.setScalar(sc);
            if ((ctl.push || ctl.pull || ctl.leave) && Math.random() < 0.25) FX.puff(b.x - Math.cos(b.h) * 6, 0.3, b.z - Math.sin(b.h) * 6, { size0: 1.4, size1: 5, life: 1.8, vy: 0.2, op: 0.5, color: 0xf2f6ff });
          }
          if (out > 8.2) break;
        }
        yield;
      }
      for (const b of boats) WT.scene.remove(b.m);
    })());
    return ctl;
  }

  // between the quay crane's leg rows (z 584 / 594): a service lane with three truck spots and a bypass lane
  const SRV = 586.7, BYP = 591.3, CPAD = 7.5;
  class Port extends WT.CraneTerminal {
    constructor(A) {
      super('Port terminal', 'PORT', 'Container Berth', null);
      this.A = A;
      this.cz = 588;
      this.berth = { x: A + 20, z: 616 };
      this.craneTag = 'STS';
      this.liftValue = 9000;
      this.initYard({ srv: SRV, byp: BYP, merge: 20, spots: [A + 8, A + 50] });
      this.income = 28000;
      this.busy = null;
      this.slots = [];
      for (let x = A - 26; x <= A + 70; x += 6.2) this.slots.push({ x, z: 576, items: [] }); // quay stack spans both cranes' halves
    }
    center() { return [this.A + 10, 590]; }
    bounds() { return { x0: this.A - 120, x1: this.A + 120, z0: 560, z1: 602 }; }
    radius() { return 90; }
    // queue head waits here: its nose must stay clear of the exit lane crossing at z 569
    get gateIn() { return { A: this.A, z: 555 }; }
    get gateIdx() { return 0; }
    get gateOut() { return { A: this.A, z: 569 }; }
    laneIn() { const A = this.A; return [[A - 3, 568], [A - 3, 571], [A - 38, 571], [A - 38, BYP]]; }
    laneOut() { const A = this.A; return [[A + 80, BYP], [A + 88, 581], [A + 80, 569], [A + 10, 569]]; }
    ct(z) { return z - this.cz; }
    build() {
      const A = this.A, g = this.group, S = this.structure;
      W.flat(g, 240, 42, W.COL.concrete, A + 10, 581, 0.028);
      W.flat(g, 132, 9.4, W.COL.road, A + 25, (SRV + BYP) / 2, 0.032);
      W.flat(g, 38, 6, W.COL.road, A - 20, 571, 0.032);
      W.flat(g, 6, 22, W.COL.road, A - 38, 581, 0.032);
      W.flat(g, 84, 6, W.COL.road, A + 46, 569, 0.032);
      W.flat(g, 6, 22, W.COL.road, A + 88, 580, 0.032);
      W.flat(g, 6, 12, W.COL.road, A - 3, 566, 0.032);
      const lm = [], spotM = [];
      W.dashLine(lm, A - 34, (SRV + BYP) / 2, A + 84, (SRV + BYP) / 2, 3, 2.4, 0.2);
      for (const d of this.docks) W.dashRect(spotM, d.x - 1, SRV, 17, 3.8, 1, 0.5, 0.2);
      W.dashes(g, lm, 0xffffff, 0.06);
      W.dashes(g, spotM, W.COL.yellow, 0.061);
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
      // two ship-to-shore cranes on the quay rails; the gate road and exit loop cross the rails at A − 38 / A + 88
      const cranes = [0, 1].map(() => {
        const c = M.quayCrane();
        c.group.position.set(A, 0, this.cz);
        S.add(c.group);
        return c;
      });
      this.setupCranes(cranes, [A - 27, A + 70], CPAD, 21, 7);
      this.site = { x: A + 20, z: 590, w: 40, d: 30, h: 28, world: true };
    }
    activate() {
      super.activate();
      for (let i = 0; i < 3; i++) {
        const s = WT.pick(this.slots.filter((q) => q.items.length < 2));
        const c = WT.SUP.newContainer(11);
        WT.SUP.note(c, 'Empty off an earlier vessel');
        c.mesh.position.set(s.x, s.items.length * 2.7, s.z);
        c.loc = this.id + ' · Quay stack';
        c.status = 'Empty · stacked';
        WT.scene.add(c.mesh);
        s.items.push(c);
      }
      this.startCranes();
      WT.spawn(this.berthLoop());
    }
    stackWorld(ship, st, extra = 0) {
      const v = new T.Vector3(st.x, 3.8 + (st.items.length + extra) * 2.75, st.z);
      ship.mesh.localToWorld(v);
      return v;
    }
    // a booked box still on deck of the vessel alongside, on top of its row: lift it straight onto the truck
    aboard(c) {
      const st = c.shipStack, ship = c.ship;
      if (!st || !ship || this.busy !== ship || st.items[st.items.length - 1] !== c.mesh) return null;
      const p = new T.Vector3();
      c.mesh.getWorldPosition(p);
      return { x: p.x, z: p.z, top: p.y + 2.7, take: () => { st.items.splice(st.items.indexOf(c.mesh), 1); c.shipStack = null; ship.moves++; } };
    }
    /* ----- vessel traffic: inbound track → anchorage → tug-assisted berthing → outbound track ----- */
    // nothing else is crossing this port's approach water (other ports' departures on the outbound track,
    // or another vessel berthing nearby)
    approachClear(ship) {
      const A = this.A;
      // Approach corridor: from entry (A+200) to berth (A+20), plus ship length margin
      // Use each ship's actual scaled bounds for clearance
      return WT.ships.every((o) => {
        if (o === ship || o.status === 'Passing' || o.actor.z > 730) return true;
        if (o.port === this && o === this.busy) return true;
        const b = o.getBounds();
        const ox = o.actor.x;
        // Ship overlaps approach corridor if its bounds intersect [A-30, A+280]
        // (extended by ship's half-length to be safe)
        return !(ox + b.halfLen > A - 30 && ox - b.halfLen < A + 280);
      });
    }
    departureClear(ship) {
      const A = this.A;
      return WT.ships.every((o) => {
        if (o === ship || o.status === 'Passing' || !o.mesh.visible || o.actor.z > 730) return true;
        const b = o.getBounds();
        const ox = o.actor.x;
        if (/Berthing|Inbound|To anchorage/.test(o.status)) {
          // Inbound/berthing ships occupy corridor from entry to berth
          return !(ox + b.halfLen > A - 320 && ox - b.halfLen < A + 80);
        }
        if (o.status === 'Sailing') {
          // Departing ships swing wide then head to outbound track
          return !(ox + b.halfLen > A - 260 && ox - b.halfLen < A + 320);
        }
        return true;
      });
    }
    *berthLoop() {
      yield* WT.sleep(WT.rnd(4, 12));
      const S = WT.SUP;
      while (true) {
        // pipeline: book the next vessel while the current one is still alongside; it waits at anchor
        yield* WT.waitFor(() => !this.next && (S.backlog.sea.length || this.exportCount() >= 2));
        const ship = new Ship();
        ship.port = this;
        // every inbound vessel enters the inbound track at one point off the east edge (never at the origin)
        ship.actor.place(SEA.entryX(), SEA.inbound, Math.PI);
        ship.mesh.visible = false;
        ship.manifest = S.takeManifest('sea', Math.max(2, Math.min(10, this.stackRoom() - 2)));
        this.next = ship;
        WT.spawn(this.shipCall(ship));
        yield* WT.sleep(WT.rnd(6, 12));
      }
    }
    *shipCall(ship) {
      const a = ship.actor, B = this.berth, A = this.A, S = WT.SUP;
      const stacks = ship.mesh.userData.stacks;
      const origin = WT.pick(['Rotterdam', 'Shanghai', 'Santos', 'Busan', 'Antwerp', 'Singapore']);
      ship.manifest = (ship.manifest || []).map((po) => {
        const st = stacks.filter((q) => q.items.length < 3).sort((p, q) => p.items.length - q.items.length || Math.abs(p.x) - Math.abs(q.x))[0];
        const c = S.newContainer(11, po.mat);
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
      const sx0 = SEA.entryX(), ANC = { x: A + 230, z: SEA.anchor };
      const sea = { avoid: true, avoidGap: 160, avoidLat: 18, avoidMin: 110, onTick: () => wake(ship) };
      // enter the track only with a clear gap to the vessel ahead (use scaled bounds)
      ship.status = 'Awaiting entry';
      const entryGap = ship.getBounds().halfLen * 2 + 40; // ship length + margin
      yield* WT.waitFor(() => WT.ships.every((o) => o === ship || !o.mesh.visible || Math.abs(o.actor.z - SEA.inbound) > 25 || Math.abs(o.actor.x - sx0) > entryGap));
      a.place(sx0, SEA.inbound, Math.PI);
      ship.mesh.visible = true;
      ship.status = 'Inbound';
      WT.log(`${ship.name} inbound to ${this.id}`, 'blue');
      WT.emit('event', { kind: 'ship', ent: ship, weight: 2 });
      // in along the inbound track; if the berth is taken or the approach is busy, drop anchor off the lanes
      yield* WT.drive(a, [[sx0, SEA.inbound], [ANC.x + 90, SEA.inbound]], Object.assign({ speed: 22, accel: 1, decel: 0.6, radius: 40, latAccel: 2 }, sea));
      if (this.busy || !this.approachClear(ship)) {
        ship.status = 'To anchorage';
        yield* WT.drive(a, [[a.x, a.z], [ANC.x + 30, ANC.z], [ANC.x, ANC.z]], Object.assign({ speed: 7, accel: 0.8, radius: 30, latAccel: 1.5 }, sea));
        ship.status = 'At anchor';
        yield* WT.waitFor(() => !this.busy && this.approachClear(ship));
      }
      this.busy = ship;
      this.next = null;
      ship.status = 'Berthing';
      const tug = tugs(ship);
      // swing in, then a straight final run along the quay line so she lies exactly parallel at the berth
      yield* WT.drive(a, [[a.x, a.z], [A + 190, 676], [A + 115, B.z], [B.x, B.z]], Object.assign({ speed: 8, accel: 0.6, decel: 0.5, radius: 40, latAccel: 1.2 }, sea));
      tug.push = true;
      yield* WT.sleep(3.5);
      tug.leave = true;
      ship.status = 'Discharging';
      WT.log(`${ship.name} all fast at ${this.id}`, 'blue', true);
      const sh = WT.createShipment({ mode: 'sea', to: ship.dest, carrier: ship.name, vehicle: ship, total: 4, transit: WT.rint(600, 1400) });
      ship.shipment = sh;
      // pre-advice: release every booked box to drayage on arrival; early trucks get theirs straight off the deck
      for (const m of ship.manifest) { m.c.ship = ship; m.c.shipStack = m.st; m.c.at = this; m.c.status = 'On deck at ' + this.id; S.grounded(m.po, this.id); }
      // both cranes discharge at once, each from the top of whichever row is nearest
      const p = new T.Vector3();
      const discharge = ship.manifest.map((m) => this.addJob({
        label: 'Discharging ' + ship.name,
        where: () => { m.c.mesh.getWorldPosition(p); return p.x; },
        plan: (c) => {
          if (!m.c.shipStack) return 'skip'; // went straight onto a truck
          if (m.c.lifting || m.st.items[m.st.items.length - 1] !== m.c.mesh) return null;
          m.c.mesh.getWorldPosition(p);
          const r = this.stackLift(c, m.c.mesh, p.x, p.z, p.y + 2.7, () => {
            m.st.items.splice(m.st.items.indexOf(m.c.mesh), 1);
            m.c.shipStack = null; m.c.ship = null;
            ship.moves++;
            S.note(m.c, `Discharged at ${this.id}`);
            m.c.status = 'Grounded · awaiting truck'; m.c.loc = this.id + ' · Quay stack';
            return m.c;
          });
          if (r) r.lock = m.c;
          return r;
        },
      }));
      yield* this.waitJobs(discharge);
      ship.status = 'Loading';
      WT.advanceShipment(sh, 2);
      // only sealed exports go to sea — empties go back to the depot by truck
      const n = Math.min(4, this.exportCount());
      const load = Array.from({ length: n }, () => this.addJob({
        label: 'Loading ' + ship.name,
        plan: (c) => {
          let best = null, bd = 1e9;
          for (const s of stacks) {
            if (s.items.length >= 3 || s.busy) continue;
            const w = this.stackWorld(ship, s), d = Math.abs(w.x - c.group.position.x) + s.items.length * 2;
            if (this.allowed(c, w.x) && d < bd) { bd = d; best = s; }
          }
          if (!best) return null;
          const target = this.stackWorld(ship, best);
          const r = this.unstackLift(c, (x) => this.isFullExport(x) && !x.reserved, target.x, target.z, target.y, (cont, m) => {
            ship.mesh.attach(m);
            m.position.set(best.x, 3.8 + best.items.length * 2.75, best.z);
            m.rotation.set(0, 0, 0);
            best.items.push(m);
            best.busy = false;
            WT.SUP.note(cont, `Loaded on ${ship.name} → ${ship.dest}`);
            WT.unregister(cont);
            sh.loaded++; ship.moves++;
            WT.updateShipment(sh, Math.round(WT.secToMin((4 - sh.loaded) * 14)));
          });
          if (r && r !== 'skip') best.busy = true;
          return r;
        },
      }));
      yield* this.waitJobs(load);
      // departure clearance: nobody berthing or inbound across our way out
      ship.status = 'Awaiting clearance';
      yield* WT.waitFor(() => this.departureClear(ship));
      ship.status = 'Sailing';
      WT.advanceShipment(sh, 3);
      WT.log(`${ship.name} sailed from ${this.id} → ${ship.dest}`, 'green', true);
      WT.emit('event', { kind: 'ship', ent: ship, weight: 1 });
      const tug2 = tugs(ship);
      tug2.pull = true;
      yield* WT.sleep(2.5);
      tug2.pull = false;
      let freed = false;
      yield* WT.drive(a, [[B.x, B.z], [A - 25, B.z], [A - 100, 646], [A - 190, SEA.outbound], [-W.EDGE - 300, SEA.outbound]], Object.assign({}, sea, {
        speed: 12, accel: 0.6, radius: 40, latAccel: 1.5,
        // the berth (and the approach) is free for the next vessel once we're clear of it
        onTick: () => { wake(ship); if (!freed && a.x < A - 70) { freed = true; tug2.leave = true; if (this.busy === ship) this.busy = null; } },
      }));
      if (this.busy === ship) this.busy = null;
      tug2.leave = true;
      ship.remove();
    }
    card() {
      return this.cardBase({
        kicker: 'Facility · Port terminal', icon: '⚓', sub: '2 STS cranes · Avenue ' + this.A, where: this.busy ? this.busy.name + ' alongside' : 'Berth free',
        rows: [['Imports waiting', String(this.importCount())], ['Exports staged', String(this.exportCount())], ['Empties', String(this.emptyCount()) + ' → depot'], ['Quay stack', this.stackCount() + ' / ' + this.slots.length * 2 + ' TEU'],
          ...this.craneRows(), ['Vessel', this.busy ? this.busy.name : '—'], ['Revenue', '$' + WT.fmtNum(this.income * 60 * WT.G.INCOME_SCALE) + '/min']],
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
        yield* WT.sleep(WT.rnd(16, 34));
      }
    })());
  };
})();
