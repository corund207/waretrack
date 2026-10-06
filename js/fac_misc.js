/* WareTrack – support facilities: power plant, solar farm, tank farm, HQ tower, staff parking */
(function () {
  const T = THREE, M = WT.M, W = WT.W, FX = WT.FX;

  class PowerPlant extends WT.Facility {
    constructor(plot) {
      super('Power plant', 'PWR', 'Thermal Power Station', plot);
      this.income = 16000;
      this.site = { x: 56, z: 0, w: 80, d: 90, h: 30 };
      this.mw = WT.rint(380, 620);
    }
    build() {
      this.pad();
      const b = new M.MB();
      M.coolingTower(b, 30, -24, 0.95);
      M.coolingTower(b, 30, 24, 0.95);
      b.box(30, 14, 24, 0xe9ecf7, 80, 0, 0);
      b.box(30.4, 0.6, 24.4, 0x2f56e0, 80, 14, 0);
      for (let y = 3; y < 13; y += 3) b.box(30.1, 1, 20, 0x3a4a86, 80, y, 0);
      M.chimney(b, 96, -30, 2, 34);
      // transformer yard
      for (let i = 0; i < 4; i++) {
        b.box(4, 4, 3, 0x9aa1c4, 70 + i * 7, 0, 34);
        b.box(0.3, 7, 0.3, 0x6a7194, 70 + i * 7, 0, 39);
      }
      b.box(26, 0.3, 0.3, 0x6a7194, 80.5, 6.8, 39);
      this.structure.add(b.mesh());
      this.vents = [[30, -24], [30, 24]].map(([x, z]) => { const o = new T.Object3D(); o.position.set(x, 29, z); this.structure.add(o); return o; });
      this.stack = new T.Object3D();
      this.stack.position.set(96, 35, -30);
      this.structure.add(this.stack);
    }
    activate() {
      super.activate();
      this.vents.forEach((o) => FX.emitter(o, { rate: 2.4, color: 0xffffff, size0: 9, size1: 30, life: 7, vy: 5, op: 0.65, jitter: 3 }));
      FX.emitter(this.stack, { rate: 1, color: 0xcfd4ea, size0: 3, size1: 12, life: 6, vy: 4, op: 0.5 });
      WT.G && WT.G.powerUp(this);
    }
    card() {
      return this.cardBase({ kicker: 'Facility · Power', icon: '⚡', sub: 'Feeds the park grid', where: this.mw + ' MW',
        rows: [['Output', this.mw + ' MW'], ['Cooling towers', '2'], ['Grid', 'Riverside 132 kV'], ['Revenue', '$' + WT.fmtNum(this.income * 60 * WT.G.INCOME_SCALE) + '/min']] });
    }
  }

  class SolarFarm extends WT.Facility {
    constructor(plot) {
      super('Solar farm', 'SOL', 'Solar Array', plot);
      this.income = 7000;
      this.site = { x: 56, z: 0, w: 96, d: 92, h: 3 };
    }
    build() {
      this.pad();
      const f = M.solarField(96, 92);
      f.position.set(58, 0, 0);
      this.structure.add(f);
      const b = new M.MB();
      b.box(5, 3, 3, 0xe9ecf7, 6, 0, -40);
      b.box(5, 3, 3, 0xe9ecf7, 6, 0, 40);
      this.structure.add(b.mesh());
    }
    card() { return this.cardBase({ kicker: 'Facility · Solar', icon: '☀️', sub: 'Ground-mounted PV', where: '24 MWp', rows: [['Capacity', '24 MWp'], ['Panels', '1,340']] }); }
  }

  class TankFarm extends WT.Facility {
    constructor(plot) {
      super('Tank farm', 'TNK', 'Bulk Liquids Terminal', plot);
      this.income = 11000;
      this.site = { x: 60, z: 0, w: 80, d: 90, h: 14 };
    }
    build() {
      this.pad();
      const b = new M.MB();
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
        const x = 34 + i * 26, z = -22 + j * 44;
        b.cyl(10, 10, 12, 0xf3f5fd, x, 6, z, 24);
        b.cyl(10.1, 10.1, 0.6, 0x2f56e0, x, 9, z, 24);
        b.cyl(9.6, 10, 1.2, 0xdfe3f2, x, 12.6, z, 24);
        b.box(0.4, 13, 0.4, 0x9aa1c4, x + 10.2, 0, z);
      }
      for (const z of [-4, 4]) b.box(90, 0.8, 0.8, 0x9aa1c4, 60, 2.5, z);
      for (let x = 20; x < 100; x += 12) b.box(0.5, 2.6, 0.5, 0x9aa1c4, x, 0, 0);
      this.structure.add(b.mesh());
    }
    card() { return this.cardBase({ kicker: 'Facility · Bulk liquids', icon: '🛢️', sub: '6 storage tanks', where: '84,000 m³', rows: [['Tanks', '6'], ['Capacity', '84,000 m³']] }); }
  }

  class HQ extends WT.Facility {
    constructor(plot) {
      super('Headquarters', 'HQ', 'WareTrack Tower', plot);
      this.id = 'HQ';
      this.income = 12000;
      this.site = { x: 62, z: 0, w: 30, d: 30, h: 62 };
    }
    build() {
      this.pad();
      const b = new M.MB();
      b.box(30, 6, 30, 0xe9ecf7, 62, 0, 0);
      b.box(22, 52, 22, 0x3a5bd9, 62, 6, 0);
      for (let y = 8; y < 58; y += 3) b.box(22.2, 0.4, 22.2, 0xb9c8ff, 62, y, 0);
      for (const o of [-10.6, 10.6]) { b.box(0.6, 52, 22.4, 0xdfe5ff, 62 + o, 6, 0); b.box(22.4, 52, 0.6, 0xdfe5ff, 62, 6, o); }
      b.box(16, 4, 16, 0xe9ecf7, 62, 58, 0);
      b.cyl(0.2, 0.2, 8, 0x9aa1c4, 62, 66, 0, 6);
      // plaza
      b.box(20, 0.3, 50, 0xd6dbef, 30, 0, 0);
      for (const z of [-20, -10, 10, 20]) { b.cyl(0.25, 0.3, 2, 0x9c7a5b, 30, 1, z, 6); b.ico(1.6, 0x7cc96a, 30, 3, z); }
      b.cyl(4, 4, 0.8, 0xadc9f3, 30, 0.4, 0, 20);
      this.structure.add(b.mesh());
      const tex = M.canvasTex(256, 256, (ctx) => {
        ctx.fillStyle = '#ffffff'; M.hexPath(ctx, 128, 128, 110); ctx.fill();
        ctx.fillStyle = '#2f56e0'; M.hexPath(ctx, 128, 128, 60); ctx.fill();
        ctx.fillStyle = '#ffffff'; M.hexPath(ctx, 128, 128, 26); ctx.fill();
      });
      for (const [x, z, r] of [[51.6, 0, -Math.PI / 2], [72.4, 0, Math.PI / 2], [62, 11.4, 0], [62, -11.4, Math.PI]]) {
        const d = new T.Mesh(new T.PlaneGeometry(10, 10), new T.MeshLambertMaterial({ map: tex, transparent: true }));
        d.position.set(x, 50, z);
        d.rotation.y = r;
        this.structure.add(d);
      }
      this.beacon = new T.Mesh(new T.SphereGeometry(0.6, 8, 6), new T.MeshBasicMaterial({ color: 0xff4040 }));
      this.beacon.position.set(62, 70.3, 0);
      this.structure.add(this.beacon);
    }
    activate() { super.activate(); WT.on('frame', (t) => (this.beacon.visible = Math.sin(t * 4) > 0)); }
    card() { return this.cardBase({ kicker: 'Headquarters', icon: '🏢', sub: 'Operations control center', where: '18 floors', rows: [['Floors', '18'], ['Staff', '1,240'], ['Control room', '24/7']] }); }
  }

  class Parking extends WT.Facility {
    constructor(plot) {
      super('Parking', 'PRK', 'Staff Parking', plot);
      this.income = 3000;
      this.site = { x: 56, z: 0, w: 96, d: 92, h: 2 };
    }
    build() {
      this.pad();
      W.flat(this.group, 96, 92, 0xcdd3f0, 58, 0, 0.026);
      const lines = [];
      for (let row = 0; row < 6; row++) for (let i = 0; i < 18; i++) lines.push({ x: 16 + row * 15 + 0, z: -44 + i * 5.2, len: 5.5, w: 0.18, rot: 0 });
      W.dashes(this.group, lines, 0xf8f9ff, 0.05);
      const g = new T.Group();
      for (let row = 0; row < 6; row++) for (let i = 0; i < 17; i++) {
        if (Math.random() < 0.3) continue;
        const c = M.car(WT.pick(M.CAR_COLORS));
        c.position.set(16 + row * 15, 0, -41.4 + i * 5.2);
        c.rotation.y = row % 2 ? 0 : Math.PI;
        g.add(c);
      }
      this.structure.add(g);
    }
    card() { return this.cardBase({ kicker: 'Facility · Parking', icon: '🅿️', sub: 'Staff + visitor parking', where: '102 bays', rows: [['Bays', '102'], ['EV chargers', '24']] }); }
  }

  // staff shuttle loop along the avenue edge of the plot
  function busStop(cls) {
    const P = cls.prototype;
    Object.defineProperty(P, 'gateIn', { get() { return { A: this.plot.A, z: this.toWorld(0, 46)[1] }; } });
    Object.defineProperty(P, 'gateOut', { get() { return { A: this.plot.A, z: this.toWorld(0, -46)[1] }; } });
    P.inPath = function () { return [[0, 46], [10, 38], [10, 22]].map(([x, z]) => this.toWorld(x, z)); };
    P.outPath = function () { return [[10, 22], [10, -38], [0, -46]].map(([x, z]) => this.toWorld(x, z)); };
    P.serve = function* (t) { t.status = 'Boarding staff'; t.where = this.id + ' bus stop'; yield* WT.sleep(WT.rnd(4, 7)); };
    const build = P.build;
    P.build = function () {
      build.call(this);
      this.docks = [{ n: 1, truck: null, ops: ['board'] }];
      W.flat(this.group, 5, 92, W.COL.road, 10, 0, 0.03);
      const b = new M.MB();
      b.box(5, 2.6, 1.6, 0xe9ecf7, 15, 0, 22);
      b.box(5.4, 0.25, 2.2, 0x2f56e0, 15, 2.6, 22);
      b.box(0.3, 2.4, 0.3, 0x9aa1c4, 13.3, 0, 26);
      b.box(1.4, 1.0, 0.1, 0x2f56e0, 13.3, 2.2, 26);
      this.structure.add(b.mesh());
    };
  }
  busStop(HQ); busStop(Parking);
  WT.PowerPlant = PowerPlant; WT.SolarFarm = SolarFarm; WT.TankFarm = TankFarm; WT.HQ = HQ; WT.Parking = Parking;
})();
