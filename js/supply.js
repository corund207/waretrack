/* WareTrack – order-driven supply chain
   Plants reorder inputs (MRP) → purchase orders → routed by road / sea / rail / air / in-park transfer →
   the exact container, ULD or load is carried by a specific vessel/train/flight/truck → delivered → stock. */
(function () {
  const S = (WT.SUP = {});

  /* ---------- materials ---------- */
  // modes in order of preference; pack = how it travels by road
  S.MAT = {
    iron: { name: 'Iron ore', size: 20, modes: ['sea', 'rail', 'road'], pack: 'container', item: 'ore', colors: [0x8a5a44, 0x6a7194, 0x7a5b46] },
    ore: { name: 'Copper ore', size: 20, modes: ['sea', 'rail', 'road'], pack: 'container', item: 'ore', colors: [0xb87333, 0xa0683a, 0x8a90ad] },
    sand: { name: 'Silica sand', size: 20, modes: ['rail', 'road'], pack: 'container', item: 'ore', colors: [0xe8d6a8, 0xd9c48f, 0xf0e2bd] },
    fabric: { name: 'Textiles', size: 16, modes: ['sea', 'road'], pack: 'container', item: 'carton', colors: [0xc8a2ff, 0xff8fb1, 0xa3acc9] },
    comp: { name: 'Electronic components', size: 10, modes: ['air', 'road'], pack: 'uld', item: 'carton', colors: [0x7c9cff, 0x9fb4ff, 0xd9ad74] },
    timber: { name: 'Timber logs', size: 18, modes: ['road'], pack: 'logs', item: 'log', colors: [0xa0754e, 0xb58a5d, 0x8f6644] },
    chem: { name: 'Chemicals', size: 20, modes: ['road'], pack: 'tanker' },
    syrup: { name: 'Syrup concentrate', size: 20, modes: ['road'], pack: 'tanker' },
    steel: { name: 'Steel coils', size: 18, modes: ['internal', 'road'], pack: 'coil', item: 'can', colors: [0xb8c2dc, 0x9aa1c4] },
    wire: { name: 'Copper wire', size: 14, modes: ['internal', 'road'], pack: 'bundle', item: 'can', colors: [0xc87533, 0xb86a2c] },
    resin: { name: 'Plastic resin', size: 20, modes: ['internal', 'road'], pack: 'tanker' },
    lumber: { name: 'Lumber', size: 18, modes: ['internal', 'road'], pack: 'bundle', item: 'plank', colors: [0xdcb47e, 0xe2c79b] },
    glass: { name: 'Float glass', size: 16, modes: ['internal', 'sea', 'road'], pack: 'container', item: 'carton', colors: [0xbfe3f2, 0xd6eef7, 0xa9d6ea] },
  };
  // intermediate plants feed assembly plants inside the park
  S.PLANTS = {
    'Steel Mill': { in: ['iron'], out: 'steel', proc: 'blast', colors: [0xb8c2dc] },
    'Copper Refinery': { in: ['ore'], out: 'wire', proc: 'refinery', colors: [0xc87533] },
    'Chemical Plant': { in: ['chem'], out: 'resin', proc: 'chem', colors: [0xf6f7fd] },
    Sawmill: { in: ['timber'], out: 'lumber', proc: 'saw', colors: [0xdcb47e] },
    'Glass Works': { in: ['sand'], out: 'glass', proc: 'glassworks', colors: [0xbfe3f2] },
    Electronics: { in: ['comp', 'wire', 'resin'], proc: 'press', colors: [0x7c9cff, 0xd9ad74, 0xcf9d62] },
    Appliances: { in: ['steel', 'resin'], proc: 'press', colors: [0xf6f7fd, 0xcf9d62, 0xd9ad74] },
    'Auto Parts': { in: ['steel', 'iron'], proc: 'smelter', colors: [0xa3acc9, 0xcf9d62, 0xc4925a] },
    Beverages: { in: ['glass', 'syrup'], proc: 'tanks', colors: [0x5cc8ff, 0x3a6ff7, 0xd9ad74] },
    Furniture: { in: ['lumber', 'fabric'], proc: 'sawmill', colors: [0xb98b55, 0xcf9d62, 0xdcb47e] },
    Pharma: { in: ['chem', 'comp'], proc: 'tanks', colors: [0x6fdc8c, 0xf6f7fd, 0xd9ad74] },
  };
  S.ASSEMBLY = ['Electronics', 'Appliances', 'Auto Parts', 'Beverages', 'Furniture', 'Pharma'];
  S.INTERMEDIATE = ['Steel Mill', 'Copper Refinery', 'Chemical Plant', 'Sawmill', 'Glass Works'];
  S.RECIPES = S.PLANTS;
  S.LINES = [
    { name: 'Bluewave', color: 0x2f56e0 }, { name: 'Coral Line', color: 0xe2703a }, { name: 'Northstar', color: 0x2aa198 },
    { name: 'Atlas Box', color: 0xd9434b }, { name: 'Hexa Lines', color: 0x7a5cd6 }, { name: 'Sunport', color: 0xf0b429 },
    { name: 'Polar', color: 0xf2f3f8 }, { name: 'Evergrove', color: 0x37b26c },
  ];
  const MODE_NAME = { sea: 'vessel', rail: 'train', air: 'flight', road: 'truck', internal: 'transfer' };

  /* ---------- units (containers / ULDs) ---------- */
  S.note = (c, text) => {
    if (!c) return;
    c.journey = c.journey || [];
    c.journey.push({ t: WT.sim.minutes, text });
    if (c.journey.length > 14) c.journey.shift();
  };
  // raw materials travel in open-frame boxes (open-tops for bulk, flat-racks for crates, glass and coils)
  S.openFor = (m) => (m && S.MAT[m] && S.MAT[m].pack === 'container' ? m : null);
  S.newContainer = (len = 11, mat) => {
    const line = WT.pick(S.LINES);
    const c = new WT.Container(line.color, len, undefined, S.openFor(mat));
    c.line = line.name;
    return c;
  };
  S.fillPO = (u, po) => { u.contents = { kind: 'mat', mat: po.mat, qty: po.qty, name: S.MAT[po.mat].name, po }; u.full = true; u.po = po; po.unit = u; if (u.load) u.load.set(1); };
  S.fillProduct = (c, name, qty) => { c.contents = { kind: 'product', name, qty }; c.full = true; c.po = null; };
  S.empty = (c) => { c.contents = null; c.full = false; c.po = null; if (c.load) c.load.set(0); };
  S.describe = (c) => {
    if (!c.contents) return 'Empty';
    if (c.contents.kind === 'mat') return `${c.contents.name} → ${c.contents.po ? c.contents.po.to.id : '?'}`;
    return c.contents.name + ' (export)';
  };

  /* ---------- purchase orders ---------- */
  S.orders = [];
  S.backlog = { sea: [], rail: [], air: [] };
  S.dispatchQ = []; // POs grounded at a terminal / air rack, waiting for a truck
  S.roadQ = [];
  S.internalQ = [];
  let poSeq = 4100;
  const open = (o) => o.status !== 'Delivered' && o.status !== 'Cancelled';
  S.onOrder = (f, m) => S.orders.reduce((n, o) => n + (o.to === f && o.mat === m && open(o) ? o.qty : 0), 0);
  S.openCount = (f, m) => S.orders.filter((o) => o.to === f && o.mat === m && open(o)).length;
  S.ev = (po, text) => { po.events.push({ t: WT.sim.minutes, text }); po.status = text.split(' · ')[0]; po.detail = text; };
  const active = (type) => WT.facilities.filter((f) => f.type === type && f.active);
  S.plants = () => WT.facilities.filter((f) => f.type === 'Factory' && f.active);
  S.producers = (m) => S.plants().filter((p) => p.recipe.out === m);
  S.sourceFor = (m) => {
    // sea and rail both land ocean/inland freight: book whichever has the shorter queue
    const ms = S.MAT[m].modes;
    if (ms.includes('sea') && ms.includes('rail') && active('Port terminal').length && active('Rail terminal').length && WT.W.railBuilt)
      return S.backlog.sea.length / active('Port terminal').length <= S.backlog.rail.length / active('Rail terminal').length ? 'sea' : 'rail';
    for (const mode of ms) {
      if (mode === 'internal' && S.producers(m).length) return mode;
      if (mode === 'sea' && active('Port terminal').length) return mode;
      if (mode === 'rail' && active('Rail terminal').length && WT.W.railBuilt) return mode;
      if (mode === 'air' && active('Air terminal').length && active('Stand').length) return mode;
      if (mode === 'road') return mode;
    }
    return 'road';
  };
  S.place = (f, m) => {
    const mode = S.sourceFor(m);
    const po = { id: 'PO-' + poSeq++, mat: m, qty: S.MAT[m].size, to: f, mode, status: 'Placed', events: [], placed: WT.sim.minutes, unit: null, vehicle: null };
    S.orders.unshift(po);
    if (S.orders.length > 160) {
      const i = S.orders.findIndex((o, k) => k > 120 && !open(o));
      if (i >= 0) S.orders.splice(i, 1);
    }
    if (mode === 'road') { S.ev(po, 'Ordered · supplier dispatching by road'); S.roadQ.push(po); }
    else if (mode === 'internal') {
      const p = S.producers(m).sort((a, b) => b.outStock - a.outStock)[0];
      po.from = p;
      S.ev(po, `Transfer order · from ${p.id}`);
      S.internalQ.push(po);
    } else { S.ev(po, `Awaiting ${MODE_NAME[mode]} · booked ${mode} freight`); S.backlog[mode].push(po); }
    return po;
  };
  // carriers call this to fill their manifest
  S.takeManifest = (mode, n) => S.backlog[mode].splice(0, n);
  S.grounded = (po, where) => { S.ev(po, `At ${where} · awaiting truck`); S.dispatchQ.push(po); };
  S.delivered = (po) => {
    if (!open(po)) return;
    S.ev(po, `Delivered · ${po.to.id}`);
    po.deliveredAt = WT.sim.minutes;
    po.to.stock[po.mat] = Math.min(po.to.cap, (po.to.stock[po.mat] || 0) + po.qty);
    WT.G && WT.G.earn(po.qty * 1500);
  };
  S.cancel = (po, why) => { if (open(po)) { S.ev(po, 'Cancelled · ' + why); } };

  // MRP: reorder whenever stock + on-order drops under the reorder point
  function mrp() {
    for (const f of S.plants()) for (const m of f.recipe.in) {
      if (S.openCount(f, m) >= (f.intermediate ? 7 : 4)) continue;
      // primary plants sit at the end of long ocean / rail lead times, so they keep a deeper pipeline
      const rop = f.cap * (f.intermediate ? 0.95 : 0.62);
      if (f.stock[m] + S.onOrder(f, m) < rop) S.place(f, m);
    }
  }

  /* ---------- trucks ---------- */
  const terminals = () => [...active('Rail terminal'), ...active('Port terminal')];
  const firstFree = (list, op) => { const c = list.filter((f) => f.freeDocks(op)); return c.length ? WT.pick(c) : null; };
  const carrier = () => WT.pick(WT.CARRIERS);
  const working = () => WT.trucks.filter((t) => t.busy).length;
  function launch(o, legs) {
    for (const l of legs) {
      if (l.dock || l.lazy) continue;
      l.dock = l.fac.reserve(l.op);
      if (!l.dock) { legs.forEach((x) => x.dock && x.fac.release(x.dock)); return null; }
    }
    for (const l of legs) if (l.lazy) l.fac.lazyN = (l.fac.lazyN || 0) + 1;
    const t = new WT.Truck(Object.assign({ legs }, o));
    t.busy = true;
    WT.spawn(WT.runTruck(t));
    return t;
  }
  // local fleet yards sit just off the highway either side of each avenue
  const near = (A) => A + (Math.random() < 0.5 ? -1 : 1) * WT.rnd(70, 160);
  const trailerFor = (m) => ({ container: 'flat', tanker: 'tanker', coil: 'coil', logs: 'logs', bundle: 'stake', curtain: 'curtain', uld: 'uld', box: 'box' }[S.MAT[m].pack] || 'box');

  // what to do with an empty container / ULD after the factory has unloaded it
  S.emptyPlan = (t) => {
    if (t.ulds && t.ulds.length) {
      const at = active('Air terminal')[0];
      if (at && at.freeDocks('uld-return')) { t.mission = 'Return empty ULD → ' + at.id; return [{ fac: at, op: 'uld-return' }]; }
      return null;
    }
    if (!t.container || t.container.full) return null;
    const open = t.container.open; // open frames can't be stuffed with export pallets
    const term = terminals().filter((f) => (f.lazyN || 0) < 5 && f.stackRoom() - f.pendingDrop > 1);
    const whs = active('Warehouse').filter((w) => w.stock > 60 && w.freeDocks('stuff'));
    if (!open && term.length && whs.length && Math.random() < 0.7) {
      const wh = WT.pick(whs), tm = WT.pick(term);
      const d1 = wh.reserve('stuff');
      if (d1) {
        tm.pendingDrop++; tm.lazyN = (tm.lazyN || 0) + 1;
        t.mission = 'Street-turn: stuff at ' + wh.id + ' → export via ' + tm.id;
        return [{ fac: wh, op: 'stuff', dock: d1 }, { fac: tm, op: 'drop', lazy: true }];
      }
    }
    // every depot visit is an appointment taken at its gate, so nobody holds the RTG lane from outside
    const dep = active('Container depot').filter((f) => f.room() > 1 && (f.lazyN || 0) < 4);
    if (dep.length) { const d = WT.pick(dep); d.lazyN = (d.lazyN || 0) + 1; t.mission = 'Return empty → ' + d.id; return [{ fac: d, op: 'drop-empty', lazy: true }]; }
    if (active('Container depot').length) return null; // depot full right now: head out, the box goes back via the interstate
    if (term.length) { const tm = WT.pick(term); tm.pendingDrop++; tm.lazyN = (tm.lazyN || 0) + 1; t.mission = 'Reposition empty → ' + tm.id; return [{ fac: tm, op: 'drop', lazy: true }]; }
    return null;
  };

  // a PO's unit is sitting at a terminal / air rack: send a truck to collect it and deliver it
  function dray(po) {
    if (!open(po) || !po.to.active) { S.cancel(po, 'consignee unavailable'); return true; }
    const u = po.unit, at = u && u.at;
    if (!at || (po.to.lazyN || 0) >= 4) return false;
    let t;
    if (u.kind === 'uld') {
      if (!at.freeDocks('uld-pick')) return false;
      t = launch({ variant: 'box', trailer: 'uld', carrier: carrier(), spawnX: near(900), mission: `ULD ${u.id}: ${at.id} → ${po.to.id}` }, [{ fac: at, op: 'uld-pick', uld: u }, { fac: po.to, op: 'unload', lazy: true }]);
    } else {
      if ((at.lazyN || 0) >= 5) return false;
      t = launch({ variant: 'flat', carrier: carrier(), spawnX: near(at.A), mission: `Drayage ${po.id}: ${at.id} → ${po.to.id}` }, [{ fac: at, op: 'pick', cont: u, lazy: true }, { fac: po.to, op: 'unload', lazy: true }]);
    }
    if (!t) return false;
    t.po = po; t.cargo = { mat: po.mat, qty: po.qty }; t.plan = S.emptyPlan;
    po.vehicle = t;
    S.ev(po, `Out for delivery · ${t.id} from ${at.id}`);
    return true;
  }
  function road(po) {
    if (!open(po)) return true;
    if (!po.to.active) { S.cancel(po, 'consignee unavailable'); return true; }
    if ((po.to.lazyN || 0) >= 4) return false;
    const tr = trailerFor(po.mat);
    let c = null;
    if (tr === 'flat') { c = S.newContainer(11, po.mat); S.fillPO(c, po); S.note(c, `Trucked in from the interstate for ${po.to.id} (${po.id})`); }
    const t = launch({ variant: tr === 'flat' ? 'flat' : tr === 'tanker' ? 'tanker' : 'box', trailer: tr === 'uld' ? 'curtain' : tr, carrier: carrier(), container: c, mission: `Supplier ${po.id}: ${S.MAT[po.mat].name} → ${po.to.id}` }, [{ fac: po.to, op: 'unload', lazy: true }]);
    if (!t) { if (c) WT.unregister(c); return false; }
    t.po = po; t.cargo = { mat: po.mat, qty: po.qty };
    t.setBedLoad(po.mat, 1);
    if (c) t.plan = S.emptyPlan;
    po.vehicle = t;
    S.ev(po, `In transit · ${t.id} (road)`);
    return true;
  }
  function transfer(po) {
    if (!open(po)) return true;
    let p = po.from;
    if (!p || !p.active) { const ps = S.producers(po.mat); if (!ps.length) { po.mode = 'road'; S.roadQ.push(po); return true; } p = po.from = ps[0]; }
    if (p.outStock < po.qty || !p.freeDocks('ship') || (po.to.lazyN || 0) >= 4) { if (p.outStock < po.qty) S.ev(po, `In production · ${p.id}`); return false; }
    const tr = trailerFor(po.mat);
    const t = launch({ variant: tr === 'tanker' ? 'tanker' : 'box', trailer: tr === 'flat' ? 'stake' : tr, carrier: { name: 'Riverside Shuttle', cab: 0x2f56e0, stripe: 0x2f56e0 }, startAt: true, mission: `Transfer ${po.id}: ${p.id} → ${po.to.id}` },
      [{ fac: p, op: 'ship', po }, { fac: po.to, op: 'unload', lazy: true }]);
    if (!t) return false;
    p.outStock -= po.qty;
    t.po = po; t.cargo = { mat: po.mat, qty: po.qty };
    t.setBedLoad(po.mat, 0); // shuttle starts empty at the producer's shipping bay
    po.vehicle = t;
    S.ev(po, `Collecting · ${t.id} at ${p.id}`);
    return true;
  }
  function drain(q, fn, max) {
    let n = 0;
    for (let i = 0; i < q.length && n < max; i++) {
      if (fn(q[i])) { q.splice(i, 1); i--; n++; }
    }
  }

  /* ---------- non-PO flows: distribution, exports, empties ---------- */
  const PLANS = [
    {
      w: 5, go() {
        const wh = firstFree(active('Warehouse').filter((w) => w.stock > 20), 'load');
        if (!wh) return false;
        const t = launch({ variant: 'box', trailer: wh.style === 'cold' ? 'reefer' : WT.pick(['box', 'box', 'curtain']), carrier: carrier(), mission: 'Customer delivery · ' + (wh.product || 'mixed goods') }, [{ fac: wh, op: 'load' }]);
        if (t) { t.shipment = WT.createShipment({ mode: 'truck', to: WT.pick(WT.CITIES), carrier: t.carrier.name, vehicle: t, total: 6 }); WT.advanceShipment(t.shipment, 1); }
        return !!t;
      },
    },
    {
      w: 1, go() {
        const wh = firstFree(active('Warehouse'), 'unload');
        return wh ? !!launch({ variant: 'box', trailer: wh.style === 'cold' ? 'reefer' : 'box', carrier: carrier(), mission: 'Customer returns' }, [{ fac: wh, op: 'unload' }]) : false;
      },
    },
    {
      w: 3, go() {
        const at = active('Air terminal')[0];
        const wh = firstFree(active('Warehouse').filter((w) => w.stock > 30), 'load');
        if (!at || !wh || !at.freeDocks('air-drop')) return false;
        const t = launch({ variant: 'box', trailer: 'curtain', carrier: carrier(), mission: 'Air export · ' + wh.id + ' → ' + at.id }, [{ fac: wh, op: 'load' }, { fac: at, op: 'air-drop' }]);
        if (t) { t.shipment = WT.createShipment({ mode: 'truck', to: 'Skyport Cargo', carrier: t.carrier.name, vehicle: t, total: 6 }); WT.advanceShipment(t.shipment, 1); }
        return !!t;
      },
    },
    {
      w: 3, go() {
        const tm = terminals().filter((f) => (f.lazyN || 0) < 4 && f.stackRoom() - f.pendingDrop > 2 && f.exportCount() < 10);
        const wh = firstFree(active('Warehouse').filter((w) => w.stock > 80), 'stuff');
        if (!tm.length || !wh) return false;
        const term = WT.pick(tm);
        const dep = active('Container depot').filter((d) => d.count() > 2 && (d.lazyN || 0) < 3);
        const legs = [];
        let c = null;
        if (dep.length) legs.push({ fac: WT.pick(dep), op: 'pick-empty', lazy: true });
        else { c = S.newContainer(term.type === 'Port terminal' ? 5.8 : 11); S.note(c, 'Empty positioned from off-site depot'); }
        legs.push({ fac: wh, op: 'stuff' }, { fac: term, op: 'drop', lazy: true });
        const t = launch({ variant: 'flat', carrier: carrier(), container: c, mission: `Export: ${wh.id} → ${term.id}` }, legs);
        if (t) term.pendingDrop++;
        else if (c) WT.unregister(c);
        return !!t;
      },
    },
    {
      // a nearly full depot sends surplus empties back to the shipping lines off-site, keeping room for the terminals
      w: 3, go() {
        const dep = active('Container depot').filter((d) => d.room() < 20 && (d.lazyN || 0) < 3);
        if (!dep.length) return false;
        const d = WT.pick(dep);
        return !!launch({ variant: 'flat', carrier: carrier(), spawnX: near(d.plot.A), mission: `Empty return: ${d.id} → shipping line` }, [{ fac: d, op: 'pick-empty', lazy: true }]);
      },
    },
  ];

  // empties left at a port or rail yard are trucked to the empty-container depot (they never ride a train or ship);
  // runs on its own clock so terminals are cleared even when the roads are too busy for optional work
  function evacuateEmpty() {
    const dep = active('Container depot').filter((d) => d.room() > 2 && (d.lazyN || 0) < 5);
    if (!dep.length) return false;
    const terms = terminals().filter((f) => (f.lazyN || 0) < 4 && f.emptyOnTop && f.emptyOnTop()).sort((a, b) => b.emptyCount() - a.emptyCount());
    const term = terms[0];
    if (!term) return false;
    const c = term.emptyOnTop();
    c.reserved = true;
    const d = dep.reduce((a, b) => (Math.abs(b.plot.A - term.A) < Math.abs(a.plot.A - term.A) ? b : a));
    const t = launch({ variant: 'flat', carrier: carrier(), spawnX: near(term.A), mission: `Empty ${c.id}: ${term.id} → ${d.id}` }, [{ fac: term, op: 'pick', cont: c, lazy: true }, { fac: d, op: 'drop-empty', lazy: true }]);
    if (!t) { c.reserved = false; return false; }
    WT.SUP.note(c, `Empty collected for ${d.id}`);
    return true;
  }

  S.truckCap = () => Math.min(140, 10 + WT.facilities.filter((f) => f.active && f.docks.length).length * 4);
  S.start = function () {
    WT.spawn((function* () {
      let mrpT = 0, evacT = 0;
      while (true) {
        yield* WT.sleep(0.4);
        mrpT += 0.4;
        if (mrpT > 1.5) { mrpT = 0; mrp(); }
        evacT += 0.4;
        if (evacT > 6 && !S.holding) { evacT = 0; evacuateEmpty(); }
        // purchase orders always take priority over everything else, but dispatch meters
        // trucks onto the network when the roads are congested
        const jam = WT.TR.jam;
        S.holding = jam > 0.42;
        if (jam < 0.3) { drain(S.dispatchQ, dray, 3); drain(S.internalQ, transfer, 2); drain(S.roadQ, road, 2); }
        else if (!S.holding && Math.random() < 0.35) { drain(S.dispatchQ, dray, 1); drain(S.internalQ, transfer, 1); drain(S.roadQ, road, 1); }
        if (jam > 0.25 || working() >= S.truckCap() || S.dispatchQ.length + S.roadQ.length + S.internalQ.length > 6) continue;
        let r = Math.random() * PLANS.reduce((n, p) => n + p.w, 0);
        for (const p of PLANS) { r -= p.w; if (r <= 0) { p.go(); break; } }
      }
    })());
  };
})();
