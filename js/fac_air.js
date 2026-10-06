/* WareTrack – airport district: airfield, cargo terminal, stands with ULD tugs, control tower */
(function () {
  const T = THREE, M = WT.M, W = WT.W, FX = WT.FX;
  // parallel runways: 09L (z −525) for departures, 09R (z −575) for arrivals; arrivals cross 09L at the east end
  const AIR = (WT.AIR = { runwayZ: -525, runway2Z: -575, taxiZ: -494, standZ: -445, crossX: 1130, holdZ: -548,
    standXs: [700, 780, 860, 940, 1020, 1100], runway: null, final: null, crossing: null, planes: [], ulds: 0, arrivals: 0, departures: 0 });

  /* ---------- aircraft ---------- */
  let flightSeq = 721;
  class Plane extends WT.Entity {
    constructor(stand) {
      super();
      this.kind = 'plane';
      this.stand = stand;
      this.flight = 'WT' + flightSeq++;
      this.id = this.flight;
      this.reg = 'N7' + WT.rint(10, 99) + 'WT';
      this.type = WT.pick(['Boeing 767-300F', 'Airbus A330-200F', 'Boeing 757-200F', 'Boeing 777F']);
      this.from = WT.pick(WT.AIR_DEST);
      this.dest = WT.pick(WT.AIR_DEST.filter((d) => d !== this.from));
      this.status = 'Approach';
      this.ulds = 0; this.uldTotal = 3;
      this.mesh = M.plane(WT.pick([0x2f56e0, 0x1aa6b7, 0x2140b8, 0xd9434b]));
      this.actor = new WT.Actor('plane', this.mesh, 'air');
      this.actor.entity = this;
      WT.scene.add(this.mesh);
      WT.register(this);
      AIR.planes.push(this);
    }
    radius() { return 20; }
    remove() { this.actor.remove(); WT.unregister(this); AIR.planes.splice(AIR.planes.indexOf(this), 1); }
    card() {
      return {
        kicker: 'Aircraft · ' + this.type, title: 'Flight ' + this.flight, sub: this.from + ' → ' + this.dest,
        icon: '✈️', iconBg: '#9fd3ff', status: this.status, statusTone: WT.toneFor(this.status), where: this.stand.id,
        rows: [['Registration', this.reg], ['Booked orders', this.manifest && this.manifest.length ? this.manifest.map((u) => u.po.id).join(', ') : 'Express mail only'], ['Type', this.type], ['Stand', this.stand.id], ['ULDs', this.ulds + ' / ' + this.uldTotal],
          ['Shipment', this.shipment ? '#' + this.shipment.id : '—'], ['Altitude', Math.round(this.actor.y * 30) + ' ft']],
      };
    }
    label() { return 'Flight ' + this.flight; }
  }

  class Tug extends WT.Entity {
    constructor(stand) {
      super();
      this.kind = 'tug';
      this.id = 'GSE-' + stand.n + '1';
      this.status = 'Idle';
      this.mesh = M.tug();
      this.dolly = M.dolly();
      this.dolly.position.x = -4.3;
      this.mesh.add(this.dolly);
      this.actor = new WT.Actor('tug', this.mesh, 'gse');
      this.actor.scope = stand.id;
      WT.scene.add(this.mesh);
      WT.register(this);
    }
    radius() { return 4; }
    card() {
      return { kicker: 'Ground support · ULD tug', title: this.id, sub: 'Tug + dolly', icon: '🚜', iconBg: '#ffd84d', status: this.status,
        statusTone: WT.toneFor(this.status), where: 'Apron', rows: [['Task', this.status], ['Fuel', '72%']] };
    }
    label() { return this.id; }
  }

  /* ---------- airfield (runway, taxiway, apron, access road) ---------- */
  class Airfield extends WT.Facility {
    constructor() {
      super('Airfield', 'AIR', 'Skyport Airfield', null);
      this.income = 0;
      this.mode = 'sweep';
      this.x0 = 630;
    }
    center() { return [880, -470]; }
    bounds() { return { x0: 620, x1: 1165, z0: -602, z1: -335 }; }
    radius() { return 220; }
    build() {
      const S = this.structure;
      S.position.x = this.x0;
      const L = 520, x = (v) => v - this.x0;
      const RZ1 = AIR.runwayZ, RZ2 = AIR.runway2Z, XC = AIR.crossX;
      for (const rz of [RZ1, RZ2]) W.flat(S, L, 30, W.COL.runway, x(890), rz, 0.03);
      W.flat(S, 510, 12, W.COL.road, x(895), AIR.taxiZ, 0.032);
      W.flat(S, 12, 34, W.COL.road, x(660), -510, 0.031);
      W.flat(S, 14, 84, W.COL.road, x(XC), (RZ2 + AIR.taxiZ) / 2, 0.031);
      W.flat(S, 460, 80, W.COL.apron, x(900), -452, 0.034);
      const rw = [], ty = [], hs = [];
      for (const rz of [RZ1, RZ2]) {
        W.dashLine(rw, x(660), rz, x(1120), rz, 8, 7, 0.7);
        for (const ex of [x(642), x(1138)]) for (let k = -5; k <= 5; k++) if (k) rw.push({ x: ex, z: rz + k * 2.4, len: 9, w: 1 });
        for (const ex of [x(700), x(1080)]) for (const k of [-1, 1]) rw.push({ x: ex, z: rz + k * 7, len: 22, w: 3 }); // touchdown zone bars
      }
      W.dashes(S, rw, W.COL.mark, 0.06);
      W.groundText(S, '09L', x(668), RZ1, 9, 5, '#ffffff', -Math.PI / 2, 80);
      W.groundText(S, '09R', x(668), RZ2, 9, 5, '#ffffff', -Math.PI / 2, 80);
      W.dashLine(ty, x(650), AIR.taxiZ, x(XC), AIR.taxiZ, 2.5, 1.5, 0.3);
      W.dashLine(ty, x(XC), RZ2, x(XC), AIR.taxiZ, 2.5, 1.5, 0.3);
      for (const sx of AIR.standXs) W.dashLine(ty, x(sx), AIR.taxiZ, x(sx), AIR.standZ + 18, 2.5, 1.5, 0.3);
      W.dashes(S, ty, W.COL.yellow, 0.07);
      // hold-short bars before each runway crossing / line-up
      for (const [hx, hz] of [[XC, AIR.holdZ + 4], [XC, -508], [660, -508]]) for (const o of [-0.6, 0.6]) W.dashLine(hs, x(hx) - 6, hz + o, x(hx) + 6, hz + o, 1.2, 0.6, 0.3);
      W.dashes(S, hs, 0xf0b429, 0.071);
      const b = new M.MB();
      for (let xx = 650; xx < 1135; xx += 22) for (const z of [-541, -509, -591, -559]) if (Math.abs(xx - XC) > 9) b.box(0.4, 0.5, 0.4, 0xf0b429, x(xx), 0, z);
      // windsock by the threshold
      b.box(0.3, 6, 0.3, 0x9aa1c4, x(640), 0, -600);
      b.boxC(3, 1.1, 1.1, 0xf08c2a, x(641.5), 5.4, -600, 0, 0, 0);
      S.add(b.mesh());
    }
    *prepare() { yield* W.extendAvenue(900, -1, 352); }
    card() {
      return this.cardBase({ kicker: 'Facility · Airfield', icon: '🛬', sub: 'Parallel runways 09L / 09R · 480 m', where: (AIR.final ? 'Arrival on final' : 'Approach clear') + ' · ' + (AIR.runway ? 'departure rolling' : '09L clear'),
        rows: [['Arrivals', '09R · ' + AIR.arrivals + ' landed'], ['Departures', '09L · ' + AIR.departures + ' flown'], ['Aircraft', String(AIR.planes.length)], ['Stands', WT.facilities.filter((f) => f.type === 'Stand' && f.active).length + ' / ' + AIR.standXs.length]] });
    }
  }

  /* ---------- cargo terminal (landside docks) ---------- */
  class AirTerminal extends WT.Facility {
    constructor() {
      super('Air terminal', 'AIR', 'Skyport Cargo Terminal', null);
      this.id = 'AIR-T1';
      this.income = 26000;
      this.docks = [760, 800, 840, 880].map((x, i) => ({ n: i + 1, x, z: -374, truck: null, ops: ['air-drop'] }));
      this.docks.push({ n: 5, x: 960, z: -372, truck: null, uld: true, ops: ['uld-pick', 'uld-return'] });
      this.docks.push({ n: 6, x: 994, z: -372, truck: null, uld: true, ops: ['uld-pick', 'uld-return'] });
      // landside ULD rack (roller deck) where import ULDs wait for their truck
      this.rack = [];
      for (let i = 0; i < 11; i++) this.rack.push({ x: 926 + i * 7, z: -379, u: null });
      this.site = { x: 900, z: -396, w: 320, d: 28, h: 13, world: true };
      this.stock = 40;
      this.comp = 12;
    }
    center() { return [900, -396]; }
    bounds() { return { x0: 735, x1: 1065, z0: -412, z1: -340 }; }
    radius() { return 160; }
    get gateIn() { return { A: 900, z: -352 }; }
    get gateOut() { return { A: 900, z: -348 }; }
    inPath(d) {
      if (d.uld) return [[903, -352], [903, -364], [d.x - 14, -364], [d.x - 6, -372], [d.x, -372]];
      return [[903, -352], [903, -363], [d.x - 12, -363]];
    }
    // general cargo docks are back-in: pull past, reverse until the trailer doors meet the terminal wall
    dockPath(d) { return d.uld ? null : [[d.x - 12, -363], [d.x, -363], [d.x, -373.6]]; }
    outPath(d) {
      if (d.uld) return [[d.x, -372], [d.x + 14, -372], [d.x + 22, -364], [1030, -364], [1038, -356], [1030, -348], [906, -348]];
      return [[d.x, -373.6], [d.x, -366], [d.x - 8, -363], [730, -363], [730, -348], [890, -348]];
    }
    // a ULD has cleared the terminal: park it on the landside rack and book a truck
    *receiveULD(u) {
      let slot;
      while (!(slot = this.rack.find((r) => !r.u))) yield* WT.sleep(1);
      slot.u = u;
      WT.scene.add(u.mesh);
      u.mesh.position.set(slot.x, 0.95, slot.z);
      u.mesh.rotation.set(0, 0, 0);
      u.mesh.scale.setScalar(0.01);
      yield* WT.tween(0.5, (k) => u.mesh.scale.setScalar(Math.max(0.01, k)));
      u.at = this; u.status = 'Landside rack · awaiting truck'; u.loc = this.id;
      WT.SUP.note(u, 'Cleared customs, on landside rack at ' + this.id);
      if (u.po) WT.SUP.grounded(u.po, this.id);
    }
    build() {
      const S = this.structure, g = this.group;
      W.flat(g, 180, 6, W.COL.road, 816, -364, 0.032);
      W.flat(g, 6, 22, W.COL.road, 730, -356, 0.032);
      W.flat(g, 170, 6, W.COL.road, 813, -348, 0.032);
      W.flat(g, 140, 6, W.COL.road, 970, -364, 0.032);
      W.flat(g, 6, 22, W.COL.road, 1038, -356, 0.032);
      W.flat(g, 136, 6, W.COL.road, 972, -348, 0.032);
      const rb = new M.MB();
      rb.box(80, 0.9, 4, 0x9aa1c4, 961, 0, -379);
      for (const z of [-380.4, -377.6]) rb.box(80, 0.12, 0.2, 0xf0b429, 961, 0.9, z);
      for (let x = 922; x <= 1000; x += 7) rb.box(0.3, 0.9, 4.2, 0x6a7194, x, 0, -379);
      S.add(rb.mesh());
      M.block(S, {
        x: 900, z: -396, w: 320, d: 28, h: 13, trim: 0x2f56e0, extra: (b) => {
          for (const d of this.docks) b.box(5, 4.4, 0.4, 0x5d7ff0, d.x, 0, -381.9);
          for (const sx of AIR.standXs) b.box(5, 4.4, 0.4, 0x5d7ff0, sx + 5.6, 0, -410.1);
        },
      });
      const tex = M.canvasTex(512, 128, (ctx) => {
        ctx.fillStyle = '#2f56e0'; ctx.font = '800 64px Inter, "Segoe UI", Arial'; ctx.textBaseline = 'middle';
        ctx.fillText('SKYPORT CARGO', 20, 66);
      });
      const s = M.decal(tex, 40, 10);
      s.rotation.x = -Math.PI / 2;
      s.position.set(900, 13.7, -396);
      S.add(s);
    }
    activate() {
      super.activate();
      for (const d of this.docks) {
        if (d.uld) continue;
        d.beltIn = new WT.FX.Conveyor(this.group, [[d.x - 0.8, 1.2, -381.5], [d.x - 0.8, 1.2, -385]], { item: 'carton', speed: 2.6, spacing: 1.4, colors: [0xd4d9ea, 0xc3c9de, 0xcf9d62] });
        d.beltOut = new WT.FX.Conveyor(this.group, [[d.x + 0.8, 1.2, -385], [d.x + 0.8, 1.2, -381.5]], { item: 'carton', speed: 2.6, spacing: 1.4, colors: [0xd4d9ea, 0xc3c9de, 0xcf9d62] });
      }
    }
    *slideTo(m, to, sec = 1.6) {
      const p0 = m.position.clone(), mid = new T.Vector3(to.x, p0.y + 0.4, p0.z);
      yield* WT.tween(sec * 0.6, (k) => m.position.lerpVectors(p0, mid, WT.ease(k)));
      const p1 = m.position.clone();
      yield* WT.tween(sec * 0.4, (k) => m.position.lerpVectors(p1, to, WT.ease(k)));
    }
    *serve(t, leg) {
      t.where = this.id + ' · Dock ' + leg.dock.n;
      const cargo = t.mesh.userData.cargo, S = WT.SUP;
      if (leg.op === 'uld-pick') {
        const u = leg.uld;
        t.status = 'Loading ULD';
        yield* WT.waitFor(() => u.at === this);
        const slot = this.rack.find((r) => r.u === u);
        const p = new T.Vector3(1.5, 0, 0);
        cargo.localToWorld(p);
        yield* this.slideTo(u.mesh, p);
        cargo.attach(u.mesh);
        u.mesh.position.set(1.5, 0, 0); u.mesh.rotation.set(0, 0, 0);
        if (slot) slot.u = null;
        u.at = null; u.status = 'On truck'; u.loc = t.id;
        t.ulds = [u];
        S.note(u, `Loaded on ${t.id} at ${this.id}`);
        yield* WT.sleep(0.6);
        return;
      }
      if (leg.op === 'uld-return') {
        t.status = 'Returning ULD';
        for (const u of t.ulds || []) {
          let slot;
          while (!(slot = this.rack.find((r) => !r.u))) yield* WT.sleep(0.5);
          slot.u = u;
          WT.scene.attach(u.mesh);
          yield* this.slideTo(u.mesh, new T.Vector3(slot.x, 0.95, slot.z));
          u.mesh.rotation.set(0, 0, 0);
          S.note(u, 'Returned empty to ' + this.id);
          u.status = 'Empty · airline pool';
          WT.spawn((function* () {
            yield* WT.sleep(4);
            yield* WT.tween(0.8, (k) => (u.mesh.position.z = slot.z - k * 5));
            slot.u = null;
            if (u.mesh.parent) u.mesh.parent.remove(u.mesh);
            WT.unregister(u);
          })());
        }
        t.ulds = [];
        yield* WT.sleep(0.5);
        return;
      }
      if (leg.op === 'air-drop') {
        t.status = 'Unloading air cargo';
        yield* this.beltServe(t, leg.dock.beltIn, WT.rint(4, 7));
        this.stock += t.total;
      } else {
        t.status = 'Loading air cargo';
        yield* this.beltServe(t, leg.dock.beltOut, WT.rint(4, 7));
        t.cargo = { mat: 'comp', qty: WT.SUP.MAT.comp.size };
      }
      this.moves += t.total;
      WT.G && WT.G.earn(t.total * 3000, this);
    }
    card() {
      return this.cardBase({ kicker: 'Facility · Air cargo terminal', icon: '🛫', sub: 'Landside docks + ' + AIR.standXs.length + ' stands', where: AIR.planes.length + ' aircraft',
        rows: [['ULDs on rack', this.rack.filter((r) => r.u).length + ' / ' + this.rack.length], ['ULDs handled', WT.fmtNum(AIR.ulds)], ['Docks', this.docks.filter((d) => d.truck).length + ' / 4 busy'], ['Revenue', '$' + WT.fmtNum(this.income * 60 * WT.G.INCOME_SCALE) + '/min']] });
    }
  }

  /* ---------- aircraft stand ---------- */
  class Stand extends WT.Facility {
    constructor(n) {
      super('Stand', 'STAND', 'Cargo stand', null);
      this.n = n;
      this.id = 'STAND-' + n;
      this.sx = AIR.standXs[n - 1];
      this.income = 18000;
      this.site = { x: this.sx, z: -440, w: 30, d: 30, h: 8, world: true };
      this.plane = null;
    }
    center() { return [this.sx, -445]; }
    bounds() { return { x0: this.sx - 30, x1: this.sx + 30, z0: -470, z1: -412 }; }
    radius() { return 30; }
    build() {
      const S = this.structure, sx = this.sx;
      const b = new M.MB();
      b.box(3, 5, 3, 0xe9ecf7, sx - 12, 0, -414);
      b.boxC(14, 2.6, 2.6, 0xdfe3f2, sx - 6, 5.5, -418, 0, -0.45, 0);
      b.box(1.2, 4.4, 1.2, 0x9aa1c4, sx - 2, 0, -421);
      b.box(4, 3, 0.3, 0x2f56e0, sx + 9, 0, -416);
      S.add(b.mesh());
      W.groundText(this.group, String(this.n), sx, -472, 6, 3, '#e0b75a', 0, 80);
    }
    activate() {
      super.activate();
      this.tug = new Tug(this);
      this.tug.actor.place(this.sx + 5.6, -414, -Math.PI / 2);
      WT.spawn(this.cycle());
    }
    *tugTo(plane) {
      const a = this.tug.actor;
      if (plane) yield* WT.drive(a, [[a.x, a.z], [this.sx + 5.6, -440.3]], { speed: 6, radius: 0 });
      else yield* WT.drive(a, [[a.x, a.z], [this.sx + 5.6, -414]], { speed: 6, radius: 0, reverse: true });
    }
    *moveMesh(m, to, sec) {
      const p0 = m.position.clone();
      yield* WT.tween(sec, (t) => m.position.lerpVectors(p0, to, WT.ease(t)));
    }
    *uldOps(plane, sh) {
      const tug = this.tug, sx = this.sx;
      const DOOR = new T.Vector3(sx + 2.6, 3.6, -436);
      plane.status = 'Unloading';
      const at = WT.facilities.find((f) => f.type === 'Air terminal');
      const units = plane.manifest.length ? plane.manifest : [null];
      for (const unit of units) {
        tug.status = 'To aircraft';
        yield* this.tugTo(true);
        tug.status = 'Unloading ULD';
        const u = unit ? unit.mesh : M.uld();
        if (unit) { unit.status = 'Unloading'; unit.loc = this.id; WT.SUP.note(unit, `Unloaded from ${plane.flight} at ${this.id}`); }
        u.position.copy(DOOR);
        u.scale.setScalar(1);
        WT.scene.add(u);
        const slot = tug.dolly.userData.slot, p = new T.Vector3();
        slot.getWorldPosition(p);
        yield* this.moveMesh(u, p, 1.0);
        slot.attach(u); u.position.set(0, 0, 0); u.rotation.set(0, 0, 0);
        plane.ulds++;
        tug.status = 'To terminal';
        yield* this.tugTo(false);
        WT.scene.attach(u);
        yield* this.moveMesh(u, new T.Vector3(u.position.x, u.position.y, -404), 0.9);
        WT.scene.remove(u);
        AIR.ulds++;
        if (unit && at) {
          unit.status = 'Customs + breakdown check'; unit.loc = at.id;
          WT.spawn((function* () { yield* WT.sleep(WT.rnd(3, 6)); yield* at.receiveULD(unit); })());
        }
        WT.G && WT.G.earn(5000, this);
      }
      plane.status = 'Loading';
      plane.ulds = 0;
      WT.advanceShipment(sh, 2);
      for (let i = 0; i < 3; i++) {
        WT.updateShipment(sh, Math.round(WT.secToMin((3 - i) * 12)));
        tug.status = 'Loading ULD';
        const u = M.uld();
        const slot = tug.dolly.userData.slot, p = new T.Vector3();
        slot.getWorldPosition(p);
        u.position.set(p.x, p.y, -404);
        WT.scene.add(u);
        yield* this.moveMesh(u, p, 0.9);
        slot.attach(u); u.position.set(0, 0, 0); u.rotation.set(0, 0, 0);
        tug.status = 'To aircraft';
        yield* this.tugTo(true);
        WT.scene.attach(u);
        yield* this.moveMesh(u, DOOR, 1.0);
        WT.scene.remove(u);
        plane.ulds++;
        sh.loaded++;
        AIR.ulds++;
        WT.G && WT.G.earn(5000, this);
        tug.status = 'To terminal';
        yield* this.tugTo(false);
      }
      tug.status = 'Idle';
    }
    // 09L is clear of anything a crossing aircraft could meet: no departure on its roll or still low near the crossing
    static runwayClearToCross() {
      const p = AIR.runway;
      return !p || p.actor.x > AIR.crossX + 40 || p.actor.y > 18;
    }
    *cycle() {
      yield* WT.sleep(WT.rnd(2, 8));
      const R1 = AIR.runwayZ, R2 = AIR.runway2Z, TZ = AIR.taxiZ, SZ = AIR.standZ, XC = AIR.crossX, sx = this.sx;
      // taxiing aircraft hold for a stand pushing back across the taxiway ahead, and keep wingtip spacing
      const blockedByPushback = (pl) => () => {
        const a = pl.actor;
        if (Math.abs(a.z - TZ) > 14) return false;
        return AIR.planes.some((q) => q !== pl && q.actor.y < 3 && (
          (q.pushZone && a.x > q.pushZone[0] && a.x - 75 < q.pushZone[1]) ||
          // wingtip spacing: keep 48 m behind anything ahead on (or just turning off) the westbound taxiway
          (Math.abs(q.actor.z - a.z) < 22 && q.actor.x < a.x && a.x - q.actor.x < 48)));
      };
      const taxiFor = (pl, o = {}) => Object.assign({ speed: 11, radius: 12, accel: 2, latAccel: 3, avoid: true, avoidGap: 50, avoidLat: 8, avoidMin: 42, hold: blockedByPushback(pl) }, o);
      while (true) {
        // arrivals are sequenced onto 09R: one aircraft on final at a time
        yield* WT.waitFor(() => !AIR.final);
        const plane = new Plane(this);
        AIR.final = plane;
        plane.manifest = WT.SUP.takeManifest('air', 3).map((po) => {
          const u = new WT.ULD();
          WT.SUP.fillPO(u, po);
          WT.SUP.note(u, `Built up at ${plane.from} for ${po.to.id} (${po.id})`);
          WT.SUP.ev(po, `On flight · ${plane.flight} from ${plane.from}`);
          po.vehicle = plane;
          u.loc = 'Flight ' + plane.flight;
          return u;
        });
        this.plane = plane;
        const a = plane.actor, gear = plane.mesh.userData.gear, body = plane.mesh;
        const TD = 690; // touchdown point
        let x = -900, v = 58;
        a.place(x, R2, 0);
        gear.visible = false;
        plane.status = 'Approach';
        WT.log(`Flight ${plane.flight} on final for 09R → ${this.id}`, 'blue', true);
        WT.emit('event', { kind: 'plane', ent: plane, weight: 3 });
        // 3° glide path, gear down at 50 m, then a flare over the last 160 m: nose up, sink rate bleeds off
        while (x < TD) {
          const dt = WT.sim.dt;
          x += v * dt;
          v = Math.max(46, v - 0.35 * dt);
          const togo = TD - x, flare = WT.clamp(1 - togo / 160, 0, 1);
          const glide = 110 * togo / 1590;
          a.y = Math.max(0, glide * (1 - flare) + glide * flare * (1 - WT.ease(flare)) * 0.6);
          body.rotation.z = WT.lerp(0.04, 0.12, WT.ease(flare));
          gear.visible = a.y < 50;
          a.place(x, R2, 0);
          yield;
        }
        // touchdown: tyre smoke off both main gears, nose wheel lowers onto the runway
        a.y = 0;
        AIR.final = null; // the next arrival may start its approach
        AIR.arrivals++;
        plane.status = 'Landing';
        for (let k = 0; k < 6; k++) for (const s of [-1, 1]) FX.puff(x - 2 - k * 0.8, 0.6, R2 + s * 3.6, { size0: 1.5, size1: 6, life: 1.6, vy: 0.6, op: 0.55, color: 0xeef0f8 });
        let nose = 0;
        while (x < 1050) {
          const dt = WT.sim.dt;
          v = Math.max(11, v - 4.2 * dt);
          x += v * dt;
          nose = Math.min(1, nose + dt / 1.6);
          body.rotation.z = 0.12 * (1 - WT.ease(nose));
          a.place(x, R2, 0);
          yield;
        }
        body.rotation.z = 0;
        a.speed = v;
        plane.status = 'Taxiing';
        // vacate 09R at the east end and hold short of 09L
        yield* WT.drive(a, [[1050, R2], [XC, R2], [XC, AIR.holdZ]], taxiFor(plane, { speed: 9 }));
        if (!Stand.runwayClearToCross() || AIR.crossing) {
          plane.status = 'Holding short 09L';
          yield* WT.waitFor(() => Stand.runwayClearToCross() && !AIR.crossing);
        }
        AIR.crossing = plane;
        plane.status = 'Crossing 09L';
        let crossed = false;
        yield* WT.drive(a, [[XC, AIR.holdZ], [XC, TZ], [sx, TZ], [sx, SZ]], taxiFor(plane, {
          onTick: () => { if (!crossed && a.z > R1 + 22) { crossed = true; if (AIR.crossing === plane) AIR.crossing = null; plane.status = 'Taxiing'; } },
        }));
        if (AIR.crossing === plane) AIR.crossing = null;
        plane.status = 'On stand';
        const sh = WT.createShipment({ mode: 'air', to: plane.dest, carrier: 'WareTrack Air', vehicle: plane, total: 3, transit: WT.rint(120, 300) });
        plane.shipment = sh;
        yield* this.uldOps(plane, sh);
        // pushback is only approved once the taxiway behind the stand is clear of taxiing aircraft
        plane.status = 'Awaiting pushback';
        yield* WT.waitFor(() => AIR.planes.every((p) => p === plane || p.actor.y > 3 || Math.abs(p.actor.z - TZ) > 24 || p.actor.x < sx - 70 || p.actor.x > sx + 110));
        plane.pushZone = [sx - 30, sx + 45]; // taxiway stretch reserved for the pushback
        plane.status = 'Pushback';
        yield* WT.sleep(1.2);
        yield* WT.drive(a, [[sx, SZ], [sx, TZ + 8], [sx + 12, TZ]], { speed: 2.4, reverse: true, radius: 8 });
        plane.pushZone = null;
        plane.status = 'Taxiing';
        yield* WT.drive(a, [[sx + 12, TZ], [668, TZ]], taxiFor(plane));
        plane.status = 'Holding';
        // departures own 09L; wait for the runway and for nobody crossing it
        yield* WT.waitFor(() => !AIR.runway && !AIR.crossing);
        AIR.runway = plane;
        plane.status = 'Line up 09L';
        yield* WT.drive(a, [[668, TZ], [658, TZ], [658, R1], [700, R1]], { speed: 7, radius: 10, accel: 2, latAccel: 3 });
        plane.status = 'Takeoff';
        WT.log(`Flight ${plane.flight} departing 09L → ${plane.dest}`, 'green', true);
        WT.emit('event', { kind: 'plane', ent: plane, weight: 2 });
        let px = 700, pv = a.speed || 4, rot = 0;
        while (px < W.EDGE + 600) {
          const dt = WT.sim.dt;
          pv = Math.min(78, pv + 7.5 * dt);
          px += pv * dt;
          // rotate at Vr, lift off, climb out; gear up once safely airborne
          if (pv > 36) rot = Math.min(1, rot + dt / 2.2);
          body.rotation.z = 0.17 * WT.ease(rot);
          if (pv > 41) {
            a.y += (pv - 33) * 0.3 * dt;
            if (a.y > 8) gear.visible = false;
            if (sh.stage < 3) { plane.status = 'Climbing'; WT.advanceShipment(sh, 3); AIR.departures++; }
            if (a.y > 18 && AIR.runway === plane) AIR.runway = null;
          } else if (Math.random() < 0.3) FX.puff(px - 14, 4, R1 + WT.rnd(-7, 7), { size0: 1.2, size1: 4, life: 0.8, vy: 0.4, op: 0.25, color: 0xdfe3f2 });
          a.place(px, R1, 0);
          yield;
        }
        if (AIR.runway === plane) AIR.runway = null;
        plane.remove();
        this.plane = null;
        WT.G && WT.G.earn(60000, this);
        yield* WT.sleep(WT.rnd(3, 10));
      }
    }
    card() {
      return this.cardBase({ kicker: 'Facility · Aircraft stand', icon: '🛩️', sub: 'Nose-in cargo stand', where: this.plane ? 'Flight ' + this.plane.flight : 'Vacant',
        rows: [['Aircraft', this.plane ? this.plane.type : '—'], ['Status', this.plane ? this.plane.status : 'Vacant'], ['Tug', this.tug ? this.tug.status : '—']] });
    }
  }

  /* ---------- control tower ---------- */
  class Tower extends WT.Facility {
    constructor() {
      super('Tower', 'ATC', 'Skyport Tower', null);
      this.id = 'ATC';
      this.site = { x: 1090, z: -380, w: 12, d: 12, h: 34, world: true };
    }
    center() { return [1090, -380]; }
    bounds() { return { x0: 1080, x1: 1100, z0: -390, z1: -370 }; }
    radius() { return 10; }
    build() {
      const b = new M.MB();
      b.cyl(2.2, 2.8, 30, 0xf3f5fd, 1090, 15, -380, 12);
      b.cyl(5, 3.6, 1.4, 0x2f56e0, 1090, 30.7, -380, 10);
      b.cyl(4.6, 4.6, 3.6, 0x3a4a86, 1090, 33.2, -380, 10);
      b.cyl(5.2, 4.8, 0.8, 0x2f56e0, 1090, 35.4, -380, 10);
      b.cyl(0.15, 0.15, 5, 0x9aa1c4, 1090, 38.3, -380, 6);
      b.box(10, 5, 10, 0xe9ecf7, 1090, 0, -380);
      this.structure.add(b.mesh());
      this.radar = new T.Group();
      const rb = new M.MB();
      rb.box(4, 0.6, 0.3, 0xe9ecf7, 0, 0, 0);
      this.radar.add(rb.mesh());
      this.radar.position.set(1090, 36, -380);
      this.structure.add(this.radar);
    }
    activate() { super.activate(); WT.on('frame', () => (this.radar.rotation.y += WT.sim.dt * 1.4)); }
    card() { return this.cardBase({ kicker: 'Air traffic control', icon: '📡', sub: 'Skyport Tower', where: AIR.final ? 'Flight ' + AIR.final.flight + ' on final' : 'Sequencing', rows: [['Wind', '270° / 9 kt'], ['Arrivals', '09R'], ['Departures', '09L'], ['Crossing', AIR.crossing ? AIR.crossing.flight : '—']] }); }
  }

  WT.Airfield = Airfield; WT.AirTerminal = AirTerminal; WT.Stand = Stand; WT.Tower = Tower;
})();
