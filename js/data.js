/* WareTrack – reference data + entity classes */
(function () {
  const T = THREE, M = WT.M;

  WT.PRODUCTS = [
    { cat: 'PPE', name: 'Safety Helmet', sku: 'PPE-HLM-Y', icon: '⛑️', color: '#ffb547', unit: 0.42, qty: [60, 120], style: 'carton' },
    { cat: 'Electronics', name: 'LED Monitor 27"', sku: 'ELC-MON-27', icon: '🖥️', color: '#7c9cff', unit: 6.8, qty: [24, 40], style: 'carton' },
    { cat: 'Beverages', name: 'Spring Water 1.5L', sku: 'BEV-WTR-15', icon: '💧', color: '#5cc8ff', unit: 1.55, qty: [300, 480], style: 'wrap' },
    { cat: 'Apparel', name: 'Cotton T-Shirt', sku: 'APP-TSH-M', icon: '👕', color: '#ff8fb1', unit: 0.2, qty: [400, 900], style: 'carton' },
    { cat: 'Auto Parts', name: 'Brake Rotor', sku: 'AUT-BRK-12', icon: '⚙️', color: '#a3acc9', unit: 7.4, qty: [40, 70], style: 'crate' },
    { cat: 'Pharma', name: 'Vitamin C Tabs', sku: 'PHA-VTC-60', icon: '💊', color: '#6fdc8c', unit: 0.12, qty: [800, 1600], style: 'wrap' },
    { cat: 'Tools', name: 'Cordless Drill', sku: 'TLS-DRL-18', icon: '🔧', color: '#ffa26b', unit: 2.1, qty: [60, 120], style: 'carton' },
    { cat: 'Grocery', name: 'Canned Tomatoes', sku: 'GRC-TOM-400', icon: '🥫', color: '#ff6b6b', unit: 0.45, qty: [500, 900], style: 'carton' },
    { cat: 'Furniture', name: 'Office Chair', sku: 'FRN-CHR-01', icon: '🪑', color: '#c8a2ff', unit: 14, qty: [10, 18], style: 'crate' },
    { cat: 'Toys', name: 'Building Blocks', sku: 'TOY-BLK-500', icon: '🧱', color: '#ffd84d', unit: 1.1, qty: [80, 160], style: 'carton' },
  ];
  WT.CARRIERS = [
    { name: 'WareTrack', cab: 0x2f56e0, stripe: 0x2f56e0 },
    { name: 'Bluepeak', cab: 0x1aa6b7, stripe: 0x1aa6b7 },
    { name: 'Northline', cab: 0xf08c2a, stripe: 0xf08c2a },
    { name: 'Atlas', cab: 0xd9434b, stripe: 0xd9434b },
    { name: 'Redwood', cab: 0x7a5cd6, stripe: 0x7a5cd6 },
  ];
  WT.CITIES = ['Philadelphia, PA', 'Newark, NJ', 'Boston, MA', 'Baltimore, MD', 'Pittsburgh, PA', 'Columbus, OH', 'Albany, NY', 'Richmond, VA', 'Hartford, CT', 'Charlotte, NC'];
  WT.RAIL_DEST = ['Chicago, IL', 'Cleveland, OH', 'Atlanta, GA', 'Kansas City, MO', 'Memphis, TN'];
  WT.AIR_DEST = ['Chicago ORD', 'Memphis MEM', 'Louisville SDF', 'Dallas DFW', 'Los Angeles LAX', 'Frankfurt FRA'];
  WT.SEA_DEST = ['Rotterdam, NL', 'Hamburg, DE', 'Antwerp, BE', 'Savannah, GA', 'Valencia, ES'];
  WT.DRIVERS = ['Marcus Lee', 'Priya Shah', 'Diego Ruiz', 'Hannah Kim', 'Omar Haddad', 'Lena Novak', 'Sam Carter', 'Aisha Bello', 'Tom Becker', 'Rosa Diaz'];
  WT.OPERATORS = ['Mia Torres', 'Jake Wilson', 'Noah Patel', 'Ella Brooks'];
  WT.VESSELS = ['MV Riverside Star', 'MV Atlantic Crest', 'MV Nordic Bay', 'MV Blue Horizon'];

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  WT.dateStr = (daysAgo = 0) => {
    const d = new Date(Date.now() - daysAgo * 864e5);
    return MONTHS[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
  };
  WT.fmtNum = (n) => Math.round(n).toLocaleString('en-US');

  let palSeq = 1026, trkSeq = 2300, shpSeq = 78442, cntSeq = 4410;
  WT.nextTruckId = () => 'TRK-' + (trkSeq += WT.rint(7, 60));
  WT.nextShipId = () => 'SHP-' + shpSeq++;
  WT.nextContainerId = () => WT.pick(['MSKU', 'TGHU', 'CMAU', 'WTRU']) + ' ' + (cntSeq++ * 37 % 900000 + 100000);

  /* ---------- base entity ---------- */
  class Entity {
    pos() {
      const v = new T.Vector3();
      this.mesh.getWorldPosition(v);
      return v;
    }
    radius() { return 4; }
  }
  WT.Entity = Entity;

  /* ---------- pallets ---------- */
  class Pallet extends Entity {
    constructor(o = {}) {
      super();
      this.kind = 'pallet';
      this.id = o.id || 'PAL-' + palSeq++;
      this.product = o.product || WT.pick(WT.PRODUCTS);
      const p = this.product;
      this.qty = o.qty || WT.rint(p.qty[0], p.qty[1]);
      this.weight = Math.round(this.qty * p.unit + 24);
      this.lot = o.lot || 'L' + WT.rint(2401, 2612);
      this.received = o.received || WT.dateStr(WT.rint(0, 9));
      this.status = o.status || 'Staged';
      this.loc = o.loc || 'WH-01';
      this.site = o.site || 'Riverside Logistics Park';
      this.priority = !!o.priority;
      this.mesh = M.pallet(p.style, WT.rint(2, 3));
      WT.register(this);
    }
    radius() { return 2; }
    placeIn(parent, x, z, y = 0, rot = 0) {
      parent.add(this.mesh);
      this.mesh.position.set(x, y, z);
      this.mesh.rotation.set(0, rot, 0);
    }
    attach(parent, x, y, z) {
      parent.add(this.mesh);
      this.mesh.position.set(x, y, z);
      this.mesh.rotation.set(0, 0, 0);
    }
    detachTo(parent) { parent.attach(this.mesh); }
    dispose() {
      if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
      this.gone = true;
      WT.unregister(this);
    }
    card() {
      const p = this.product;
      return {
        kicker: 'Pallet · ' + p.cat, title: p.name, sub: this.id + ' · ' + p.sku,
        icon: p.icon, iconBg: p.color, status: this.status, statusTone: toneFor(this.status), where: this.loc,
        rows: [
          ['Quantity', WT.fmtNum(this.qty) + ' units'],
          ['Gross weight', WT.fmtNum(this.weight) + ' kg'],
          ['Location', this.loc],
          ['Lot', this.lot],
          ['Received', this.received],
          ['Site', this.site],
        ],
      };
    }
    label() { return this.id + ' · ' + this.product.name; }
  }
  WT.Pallet = Pallet;

  function toneFor(s) {
    s = (s || '').toLowerCase();
    if (/(staged|loading|unloading|available|idle|on time|berthed|parked|stored|delivered|arrived|ready)/.test(s)) return 'green';
    if (/(en route|transit|arriving|taxi|sailing|departed|approach|climb|moving|carrying|travel|landing|picked|received|build)/.test(s)) return 'blue';
    if (/(delay|hold|waiting|charging|low)/.test(s)) return 'amber';
    return 'grey';
  }
  WT.toneFor = toneFor;

  /* ---------- static (clickable) site objects ---------- */
  class Static extends Entity {
    constructor(mesh, cardFn, labelText, r = 10) {
      super();
      this.kind = 'static';
      this.mesh = mesh; this.cardFn = cardFn; this.labelText = labelText; this.r = r;
      WT.register(this);
    }
    radius() { return this.r; }
    card() { return this.cardFn(); }
    label() { return this.labelText; }
  }
  WT.Static = Static;

  /* ---------- containers ---------- */
  class Container extends Entity {
    // openMat: an open-frame box for that material, its load visible (and craned) in the open
    constructor(color, len = 11, mesh, openMat) {
      super();
      this.kind = 'container';
      this.id = WT.nextContainerId();
      this.len = len;
      this.open = openMat || null;
      this.size = (len > 8 ? "40'" : "20'") + (this.open ? (M.loadKind(this.open) === 'heap' ? ' open-top' : ' flat-rack') : len > 8 ? ' HC' : ' DV');
      this.product = WT.pick(WT.PRODUCTS);
      this.weight = WT.rint(len > 8 ? 9000 : 5000, len > 8 ? 26000 : 18000);
      this.seal = 'SL' + WT.rint(100000, 999999);
      this.status = 'Stored';
      this.loc = '';
      const col = color === null || color === undefined ? WT.pick(M.CONT_COLORS) : color;
      this.mesh = mesh || (this.open ? M.openFrame(col, len) : M.container(col, len));
      if (this.open) {
        this.load = new M.Load(this.open, len - 0.5);
        this.load.g.position.y = 0.25;
        this.mesh.add(this.load.g);
      }
      this.journey = [];
      this.contents = null;
      this.full = false;
      WT.register(this);
    }
    radius() { return this.len / 2; }
    card() {
      const S = WT.SUP, desc = S ? S.describe(this) : this.product.name;
      const journey = (this.journey || []).slice(-6).reverse().map((j) => [WT.fmtTime(j.t), j.text]);
      return {
        kicker: 'Container · ' + this.size + (this.line ? ' · ' + this.line : ''), title: this.id, sub: desc,
        icon: '📦', iconBg: '#9fb4ff', status: this.status, statusTone: toneFor(this.status), where: this.loc,
        rows: [['Contents', desc], ['Order', this.po ? this.po.id + ' · ' + this.po.status : '—'], ['Load', this.contents ? this.contents.qty + (this.contents.kind === 'mat' ? ' t' : ' pallets') : '—'],
          ['Seal', this.full ? this.seal : 'Open'], ['Location', this.loc], ...(journey.length ? journey : [['Journey', 'No moves yet']])],
      };
    }
    label() { return this.id; }
    detachTo(parent) { parent.attach(this.mesh); }
  }
  WT.Container = Container;

  /* ---------- air cargo unit load devices ---------- */
  let uldSeq = 31200;
  class ULD extends Entity {
    constructor() {
      super();
      this.kind = 'uld';
      this.id = 'AKE ' + uldSeq++ + 'WT';
      this.len = 3;
      this.status = 'In flight';
      this.loc = '';
      this.journey = [];
      this.contents = null;
      this.full = false;
      this.mesh = M.uld();
      WT.register(this);
    }
    radius() { return 2.5; }
    card() {
      const desc = WT.SUP.describe(this);
      const journey = this.journey.slice(-6).reverse().map((j) => [WT.fmtTime(j.t), j.text]);
      return {
        kicker: 'ULD · AKE container', title: this.id, sub: desc, icon: '🧳', iconBg: '#c3c9de', status: this.status, statusTone: toneFor(this.status), where: this.loc,
        rows: [['Contents', desc], ['Order', this.po ? this.po.id : '—'], ['Location', this.loc], ...(journey.length ? journey : [['Journey', 'No moves yet']])],
      };
    }
    label() { return this.id; }
  }
  WT.ULD = ULD;
})();
