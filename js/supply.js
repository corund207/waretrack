/* WareTrack – order-driven supply chain
   Plants reorder inputs (MRP) → purchase orders → routed by road / sea / rail / air / in-park transfer →
   the exact container, ULD or load is carried by a specific vessel/train/flight/truck → delivered → stock. */
(function () {
  const S = (WT.SUP = {});

  /* ---------- materials ---------- */
  // modes: the trunk carriers that can bring it to the park (there is no road supply: the last leg from a terminal
  // or producing plant is always an autonomous container mover). pack: 'container' travels in an open box
  // with the load in view, 'tanker' in an ISO tank, 'uld' in an air-cargo ULD (or a dry box by sea)
  S.MAT = {
    iron: { name: 'Iron ore', size: 20, modes: ['sea', 'rail'], pack: 'container', item: 'ore', colors: [0x8a5a44, 0x6a7194, 0x7a5b46] },
    ore: { name: 'Copper ore', size: 20, modes: ['sea', 'rail'], pack: 'container', item: 'ore', colors: [0xb87333, 0xa0683a, 0x8a90ad] },
    sand: { name: 'Silica sand', size: 20, modes: ['rail'], pack: 'container', item: 'ore', colors: [0xe8d6a8, 0xd9c48f, 0xf0e2bd] },
    fabric: { name: 'Textiles', size: 16, modes: ['sea', 'rail'], pack: 'container', item: 'carton', colors: [0xc8a2ff, 0xff8fb1, 0xa3acc9] },
    comp: { name: 'Electronic components', size: 10, modes: ['air', 'sea'], pack: 'uld', item: 'carton', colors: [0x7c9cff, 0x9fb4ff, 0xd9ad74] },
    timber: { name: 'Timber logs', size: 18, modes: ['rail'], pack: 'container', item: 'log', colors: [0xa0754e, 0xb58a5d, 0x8f6644] },
    chem: { name: 'Chemicals', size: 20, modes: ['pipe', 'rail'], pack: 'tanker' },
    syrup: { name: 'Syrup concentrate', size: 20, modes: ['rail'], pack: 'tanker' },
    steel: { name: 'Steel coils', size: 18, modes: ['internal', 'rail'], pack: 'container', item: 'can', colors: [0xb8c2dc, 0x9aa1c4] },
    wire: { name: 'Copper wire', size: 14, modes: ['internal', 'sea'], pack: 'container', item: 'can', colors: [0xc87533, 0xb86a2c] },
    resin: { name: 'Plastic resin', size: 20, modes: ['internal', 'rail'], pack: 'tanker' },
    lumber: { name: 'Lumber', size: 18, modes: ['internal', 'rail'], pack: 'container', item: 'plank', colors: [0xdcb47e, 0xe2c79b] },
    glass: { name: 'Float glass', size: 16, modes: ['internal', 'sea', 'rail'], pack: 'container', item: 'carton', colors: [0xbfe3f2, 0xd6eef7, 0xa9d6ea] },
    // hinterland materials: mined, quarried and grown at remote sites and railed in; propane by pipeline
    coal: { name: 'Coal', size: 24, modes: ['rail'], pack: 'container', item: 'ore', colors: [0x2b2f3d, 0x3a3f52, 0x22263d] },
    bauxite: { name: 'Bauxite', size: 22, modes: ['rail'], pack: 'container', item: 'ore', colors: [0xb5543d, 0xa04a36, 0xc56a4f] },
    grain: { name: 'Grain', size: 20, modes: ['rail'], pack: 'container', item: 'ore', colors: [0xe2c46b, 0xd6b45a, 0xecd48a] },
    lpg: { name: 'Propane (LPG)', size: 20, modes: ['pipe', 'rail'], pack: 'tanker' },
    alum: { name: 'Aluminium', size: 16, modes: ['internal', 'rail'], pack: 'container', item: 'ingot', colors: [0xd9dde8, 0xc3c9d9] },
  };
  // intermediate plants feed assembly plants inside the park
  S.PLANTS = {
    'Steel Mill': { in: ['iron', 'coal'], out: 'steel', proc: 'blast', colors: [0xb8c2dc] },
    'Copper Refinery': { in: ['ore'], out: 'wire', proc: 'refinery', colors: [0xc87533] },
    'Chemical Plant': { in: ['chem', 'lpg'], out: 'resin', proc: 'chem', colors: [0xf6f7fd] },
    Sawmill: { in: ['timber'], out: 'lumber', proc: 'saw', colors: [0xdcb47e] },
    'Glass Works': { in: ['sand', 'lpg'], out: 'glass', proc: 'glassworks', colors: [0xbfe3f2] },
    'Aluminium Smelter': { in: ['bauxite'], out: 'alum', proc: 'potline', colors: [0xd9dde8] },
    Electronics: { in: ['comp', 'wire', 'resin'], proc: 'press', colors: [0x7c9cff, 0xd9ad74, 0xcf9d62] },
    Appliances: { in: ['steel', 'resin'], proc: 'press', colors: [0xf6f7fd, 0xcf9d62, 0xd9ad74] },
    'Auto Parts': { in: ['steel', 'alum'], proc: 'smelter', colors: [0xa3acc9, 0xcf9d62, 0xc4925a] },
    Beverages: { in: ['glass', 'syrup', 'grain'], proc: 'tanks', colors: [0x5cc8ff, 0x3a6ff7, 0xd9ad74] },
    Furniture: { in: ['lumber', 'fabric'], proc: 'sawmill', colors: [0xb98b55, 0xcf9d62, 0xdcb47e] },
    Pharma: { in: ['chem', 'comp'], proc: 'tanks', colors: [0x6fdc8c, 0xf6f7fd, 0xd9ad74] },
  };
  S.ASSEMBLY = ['Electronics', 'Appliances', 'Auto Parts', 'Beverages', 'Furniture', 'Pharma'];
  S.INTERMEDIATE = ['Steel Mill', 'Copper Refinery', 'Chemical Plant', 'Sawmill', 'Glass Works', 'Aluminium Smelter'];
  S.RECIPES = S.PLANTS;
  S.LINES = [
    { name: 'Bluewave', color: 0x2f56e0 }, { name: 'Coral Line', color: 0xe2703a }, { name: 'Northstar', color: 0x2aa198 },
    { name: 'Atlas Box', color: 0xd9434b }, { name: 'Hexa Lines', color: 0x7a5cd6 }, { name: 'Sunport', color: 0xf0b429 },
    { name: 'Polar', color: 0xf2f3f8 }, { name: 'Evergrove', color: 0x37b26c },
  ];
  const MODE_NAME = { sea: 'vessel', rail: 'train', air: 'flight', internal: 'transfer', pipe: 'pipeline' };
  const MOVERS = (S.MOVERS = { name: 'Riverside Autonomous Movers', cab: 0x2aa198, stripe: 0x2aa198 });
  const HAULER = { name: 'Titan Heavy Haul', cab: 0xd9434b, stripe: 0xf0b429 };

  /* ---------- units (containers / ULDs) ---------- */
  S.note = (c, text) => {
    if (!c) return;
    c.journey = c.journey || [];
    c.journey.push({ t: WT.sim.minutes, text });
    if (c.journey.length > 14) c.journey.shift();
  };
  // raw materials travel in open boxes with the load in view: full-height open-top bins for bulk heaps,
  // low-walled flat-racks for crates, glass and coils (WT.Container picks the right one)
  S.openFor = (m) => (m && S.MAT[m] && S.MAT[m].pack === 'container' ? m : null);
  S.isBulk = (m) => !!S.openFor(m) && WT.M.loadKind(m) === 'heap';
  S.newContainer = (len = 11, mat) => {
    const line = WT.pick(S.LINES);
    const tank = !!mat && S.MAT[mat] && S.MAT[mat].pack === 'tanker';
    const c = new WT.Container(line.color, len, tank ? WT.M.isoTank(line.color, len) : undefined, S.openFor(mat));
    if (tank) { c.tank = true; c.size = "40' ISO tank"; }
    c.line = line.name;
    return c;
  };
  // an empty WareTrack product crate from the park's own pool: distribution centres send finished goods out by rail in these
  S.newCrate = () => {
    const c = new WT.Container(WT.M.P.blue, 11, WT.M.productCrate(11));
    c.crate = true;
    c.size = "40' product crate";
    c.line = 'WareTrack Rail';
    return c;
  };
  S.cratesRailed = 0;
  S.cratesIssued = 0;
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
  S.deliveryStats = { total: 0, remote: 0 };
  S.backlog = { sea: [], rail: [], air: [] };
  S.dispatchQ = []; // POs grounded at a terminal or air rack, waiting for a container mover
  S.pipeQ = []; // POs queued for a pipeline batch from the gas field
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
    // a trunk carrier (rail / sea / air / pipeline) or a park plant supplies each material; null while
    // none of them is running yet (nothing is ever trucked in from outside)
    const ms = S.MAT[m].modes;
    const rail = active('Rail terminal').length > 0 && WT.W.railBuilt;
    // 1. hinterland materials are railed in from their own remote site once it is producing
    if (rail && WT.REMOTE && WT.REMOTE.siteFor(m)) return 'rail';
    // 2. what the park makes itself moves by in-park transfer
    if (ms.includes('internal') && S.producers(m).length) return 'internal';
    // 3. pipeline products stay on the pipe once the gas field is connected
    if (ms.includes('pipe') && active('Gas field').length) return 'pipe';
    // 4. air freight needs a cargo terminal and at least one stand
    if (ms.includes('air') && active('Air terminal').length && active('Stand').length) return 'air';
    // 5. ocean / inland freight: book whichever of sea and rail has the shorter queue per terminal
    const byRail = rail && ms.includes('rail'), bySea = ms.includes('sea') && active('Port terminal').length > 0;
    if (byRail && bySea) return S.backlog.sea.length / active('Port terminal').length <= S.backlog.rail.length / active('Rail terminal').length ? 'sea' : 'rail';
    if (byRail) return 'rail';
    if (bySea) return 'sea';
    return null;
  };
  S.place = (f, m, mode = S.sourceFor(m)) => {
    if (!mode) return null;
    const po = { id: 'PO-' + poSeq++, mat: m, qty: S.MAT[m].size, to: f, mode, status: 'Placed', events: [], placed: WT.sim.minutes, unit: null, vehicle: null };
    S.orders.unshift(po);
    if (S.orders.length > 160) {
      const i = S.orders.findIndex((o, k) => k > 120 && !open(o));
      if (i >= 0) S.orders.splice(i, 1);
    }
    if (mode === 'pipe') { S.ev(po, 'Nominated · pipeline batch from the gas field'); S.pipeQ.push(po); }
    else if (mode === 'internal') {
      const p = S.producers(m).sort((a, b) => b.outStock - a.outStock)[0];
      po.from = p;
      S.ev(po, `Transfer order · from ${p.id}`);
      S.internalQ.push(po);
    } else { S.ev(po, `Awaiting ${MODE_NAME[mode]} · booked ${mode} freight`); S.backlog[mode].push(po); }
    return po;
  };
  // carriers call this to fill their manifest
  S.takeManifest = (mode, n, filter) => {
    if (!filter) return S.backlog[mode].splice(0, n);
    const out = [];
    for (let i = 0; i < S.backlog[mode].length && out.length < n; i++) if (filter(S.backlog[mode][i])) { out.push(S.backlog[mode][i]); S.backlog[mode].splice(i, 1); i--; }
    return out;
  };
  S.grounded = (po, where) => { S.ev(po, `At ${where} · awaiting container mover`); po.groundedAt = WT.sim.minutes; S.dispatchQ.push(po); };
  // how long grounded containers sit before a mover is assigned (sim-minutes)
  S.moverWait = { n: 0, sum: 0, max: 0 };
  const waited = (po) => {
    if (po.groundedAt == null) return;
    const w = WT.sim.minutes - po.groundedAt, m = S.moverWait;
    m.n++; m.sum += w; m.max = Math.max(m.max, w);
  };
  S.delivered = (po) => {
    if (!open(po)) return;
    S.ev(po, `Delivered · ${po.to.id}`);
    po.deliveredAt = WT.sim.minutes;
    S.deliveryStats.total++; if (po.remoteSource) S.deliveryStats.remote++;
    po.to.stock[po.mat] = Math.min(po.to.cap, (po.to.stock[po.mat] || 0) + po.qty);
    WT.G && WT.G.earn(po.qty * 1500);
  };
  S.cancel = (po, why) => { if (open(po)) { S.ev(po, 'Cancelled · ' + why); } };

  // MRP (order-up-to): reorder while stock + on-order leaves room for one more delivery, so the pipeline stays as
  // deep as the store allows and nothing ever arrives to a full bin and is thrown away
  function mrp() {
    for (const f of S.plants()) for (const m of f.recipe.in) {
      // primary plants sit at the end of long ocean / rail / mine lead times, so they keep more orders in flight
      if (S.openCount(f, m) >= (f.intermediate ? 8 : 4)) continue;
      if (f.stock[m] + S.onOrder(f, m) + S.MAT[m].size <= f.cap) S.place(f, m); // waits while no carrier runs yet
    }
  }

  /* ---------- trucks ---------- */
  const terminals = () => [...active('Rail terminal'), ...active('Port terminal')];
  // crane spots not taken or promised: every visit to a crane terminal is counted against its spots when it is
  // dispatched, so a vehicle never reaches the gate to find the yard full and queue out on the avenue (where it would
  // block the exit lane the vehicles inside need to leave by). A yard with its own staging lane may book that too.
  const spotsFree = (f, op) => f.docks.filter((d) => !d.truck && (!op || !d.ops || d.ops.includes(op))).length + (f.stageRoom || 0) - (f.lazyN || 0);
  const firstFree = (list, op) => { const c = list.filter((f) => f.freeDocks(op)); return c.length ? WT.pick(c) : null; };
  const carrier = () => WT.pick(WT.CARRIERS);
  const working = () => WT.trucks.filter((t) => t.busy).length;
  function launch(o, legs) {
    for (const l of legs) {
      if (l.dock || l.lazy) continue;
      l.dock = l.fac.reserveFor ? l.fac.reserveFor(null, l) : l.fac.reserve(l.op);
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

  /* ---------- autonomous mover fleet ---------- */
  // Every container move into, out of or between the terminals, the air terminal and the plants is made
  // by a mover. Movers live in the charging bays of the mover depots; a job takes the charged mover nearest its first
  // stop, which drives out, works its legs and comes back to its own bay.
  const bays = () => active('Mover depot').flatMap((d) => d.bays);
  S.fleet = () => {
    const b = bays(), n = (st) => b.filter((x) => x.state === st).length;
    return { size: n('home') + n('out'), home: n('home'), out: n('out'), incoming: n('incoming'), free: n('empty') };
  };
  S.moverShortT = -1e9;
  // movers held back from background work (exports, empty repositioning) so factory supply never waits behind it
  const reserveN = (size) => Math.max(2, Math.ceil(size / 8));
  function launchMover(o, legs) {
    const [tx, tz] = legs[0].fac.center();
    const home = bays().filter((b) => b.state === 'home');
    if (!home.length) { S.moverShortT = WT.sim.minutes; return null; }
    // product crates only borrow movers beyond the reserve: waiting containers are mostly held up by full plant bays,
    // not by a lack of movers, so the reserve alone keeps factory supply first
    if (o.crateJob && (home.length <= reserveN(S.fleet().size) + 1 || WT.trucks.filter((t) => t.container && t.container.crate).length >= 3)) return null;
    if (o.background && !o.crateJob && (S.dispatchQ.length + S.internalQ.length > 0 || home.length <= reserveN(S.fleet().size))) return null;
    const d2 = (b) => { const [x, z] = b.depot.worldOf(b); return (x - tx) ** 2 + (z - tz) ** 2; };
    const bay = home.reduce((a, b) => (d2(b) < d2(a) ? b : a));
    bay.state = 'out';
    const plan = o.plan;
    const t = launch(Object.assign({}, o, { variant: 'mover', carrier: MOVERS, startAt: true, id: bay.unit.id, plan: null }), [{ fac: bay.depot, op: 'depart', dock: bay }, ...legs]);
    if (!t) { bay.state = 'home'; return null; }
    t.bay = bay; t.noFade = true;
    // after the job: whatever it leaves to do (an empty to return), then the next waiting container if fleet control
    // has one for this mover, otherwise home to charge
    let after = plan;
    t.plan = function next(v) {
      let more = (after && after(v)) || [];
      after = null;
      if (!more.length && (more = chainJob(v) || []).length) after = S.emptyPlan;
      if (!more.length) { v.mission = `Back to ${bay.depot.id} bay ${bay.n} to charge`; return [{ fac: bay.depot, op: 'park', dock: bay }]; }
      v.plan = next;
      return more;
    };
    return t;
  }
  // an empty flat-deck mover takes the oldest waiting container straight on instead of driving home first
  function chainJob(t) {
    if (t.trailer !== 'flat' || t.container || t.ulds.length) return null;
    for (let i = 0; i < S.dispatchQ.length; i++) {
      const po = S.dispatchQ[i], u = po.unit, at = u && u.at;
      if (!open(po) || !po.to.active || !at || u.kind === 'uld' || !at.reserveFor || spotsFree(po.to, 'unload') < 1 || spotsFree(at) < 1) continue;
      const pick = { fac: at, op: 'pick', cont: u, lazy: true };
      S.dispatchQ.splice(i, 1);
      po.to.lazyN = (po.to.lazyN || 0) + 1; at.lazyN = (at.lazyN || 0) + 1;
      t.po = po; t.cargo = { mat: po.mat, qty: po.qty }; t.home = at; po.vehicle = t; waited(po);
      t.mission = `Container ${u.id}: ${at.id} → ${po.to.id}`;
      S.ev(po, `Mover assigned · ${t.id} straight from its last job → ${at.id}`);
      return [pick, { fac: po.to, op: 'unload', lazy: true }];
    }
    return null;
  }
  // fleet planning: sized to demand. Whenever a job found no charged mover lately, or the reserve has run down, the
  // fleet orders enough for every container waiting plus the reserve, less what is charging or already on its way;
  // each one comes in on a heavy-haul lowloader. The next depot is commissioned before the last bays fill up.
  S.needMoverDepot = false;
  const MOVER_COST = 120e3;
  function planFleet() {
    // congested roads are not a mover shortage: more movers would only lengthen the queues
    if (!active('Mover depot').length || WT.TR.jam > 0.2) return;
    const f = S.fleet(), reserve = reserveN(f.size), waiting = S.dispatchQ.length + S.internalQ.length;
    const short = WT.sim.minutes - S.moverShortT < 8 || f.home < reserve;
    const free = bays().filter((b) => b.state === 'empty');
    if (short && free.length <= 4) S.needMoverDepot = true;
    if (!short) return;
    let want = Math.max(1, waiting) + reserve - f.home - f.incoming;
    // one lowloader at a time, at most two on the road
    want = Math.min(want, 1, free.length, 2 - f.incoming);
    for (const b of free.slice(0, Math.max(0, want))) {
      if (WT.G && WT.G.money < MOVER_COST) return;
      const t = launch({ variant: 'flat', trailer: 'flat', carrier: HAULER, mission: 'Fleet delivery' }, [{ fac: b.depot, op: 'deliver', dock: b.del }]);
      if (!t) return;
      b.depot.loadHauler(t, b);
      if (WT.G) WT.G.money -= MOVER_COST;
      WT.log(`🚛 New mover ${t.newUnit.id} ordered for ${b.depot.id} · on a ${HAULER.name} lowloader`, 'info');
    }
  }

  // what to do with an empty container / ULD after the factory has unloaded it
  S.emptyPlan = (t) => {
    if (t.ulds && t.ulds.length) {
      const at = active('Air terminal')[0];
      if (at && spotsFree(at, 'uld-return') > 0) {
        t.mission = 'Return empty ULD → ' + at.id;
        at.lazyN = (at.lazyN || 0) + 1;
        return [{ fac: at, op: 'uld-return', lazy: true }];
      }
      return null;
    }
    if (!t.container || t.container.full) return null;
    const open = t.container.open || t.container.tank; // open frames and tanks can't be stuffed with export pallets
    const term = terminals().filter((f) => spotsFree(f) > 0 && f.stackRoom() - f.pendingDrop > 1);
    // a mover takes its empty straight back to the yard it came from
    if (t.variant === 'mover' && term.includes(t.home)) {
      const tm = t.home; tm.pendingDrop++; tm.lazyN = (tm.lazyN || 0) + 1; t.mission = 'Return empty → ' + tm.id;
      return [{ fac: tm, op: 'drop', lazy: true }];
    }
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

  // a PO's unit is sitting at a terminal or air rack: a container mover drives over from its depot to the
  // crane spot (or ULD dock), takes the unit and drives it into the plant's receiving bay
  function dray(po) {
    if (!open(po) || !po.to.active) { S.cancel(po, 'consignee unavailable'); return true; }
    const u = po.unit, at = u && u.at;
    if (!at || spotsFree(po.to, 'unload') < 1) return false;
    const uld = u.kind === 'uld';
    // crane spots are gate appointments, first come first served: a mover never holds a spot from across the park
    // while the vehicles queued at the gate ahead of it wait for one
    // (the air terminal's ULD docks work the same way, booked on dispatch and taken from its ULD staging lane)
    if ((uld || at.reserveFor) && spotsFree(at, uld ? 'uld-pick' : undefined) < 1) return false;
    const t = launchMover({ trailer: uld ? 'uld' : 'flat', home: at, plan: S.emptyPlan, mission: `${uld ? 'ULD' : 'Container'} ${u.id}: ${at.id} → ${po.to.id}` },
      [uld ? { fac: at, op: 'uld-pick', uld: u, lazy: true } : { fac: at, op: 'pick', cont: u, lazy: !!at.reserveFor }, { fac: po.to, op: 'unload', lazy: true }]);
    if (!t) return false;
    t.po = po; t.cargo = { mat: po.mat, qty: po.qty };
    po.vehicle = t; waited(po);
    S.ev(po, `Mover assigned · ${t.id} from ${t.bay.depot.id} → ${at.id}`);
    return true;
  }
  // in-park transfer: a mover is loaded at the producer's shipping bay and drives through to the consumer
  function transfer(po) {
    if (!open(po)) return true;
    let p = po.from;
    if (!p || !p.active) { const ps = S.producers(po.mat); if (!ps.length) { S.cancel(po, 'producing plant closed'); return true; } p = po.from = ps[0]; }
    if (p.outStock < po.qty || !p.freeDocks('ship') || spotsFree(po.to, 'unload') < 1) { if (p.outStock < po.qty) S.ev(po, `In production · ${p.id}`); return false; }
    const tank = S.MAT[po.mat].pack === 'tanker';
    const t = launchMover({ trailer: tank ? 'tanker' : 'stake', home: p, mission: `Transfer ${po.id}: ${p.id} → ${po.to.id}` },
      [{ fac: p, op: 'ship', po }, { fac: po.to, op: 'unload', lazy: true }]);
    if (!t) return false;
    p.outStock -= po.qty;
    t.po = po; t.cargo = { mat: po.mat, qty: po.qty };
    t.setBedLoad(po.mat, 0); // the mover arrives empty under the producer's out-belt
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

  /* ---------- product crates: finished goods from a distribution centre out by rail ---------- */
  // A mover takes an empty WareTrack crate from the pool, backs it onto a DC dock door, the dock forklifts fill it
  // with pallets, and it is dropped in a rail yard for the next freight call. Runs on its own clock (not the
  // background-plan lottery) but only on spare movers, and never more than three crates on the road at once.
  function crateRun() {
    const yards = active('Rail terminal').filter((f) => spotsFree(f) > 0 && f.stackRoom() - f.pendingDrop > 2 && f.exportCount() < 10);
    const wh = firstFree(active('Warehouse').filter((w) => w.stock > 80), 'stuff');
    if (!yards.length || !wh) return false;
    const [wx, wz] = wh.center();
    const term = yards.reduce((a, b) => (Math.hypot(b.center()[0] - wx, b.center()[1] - wz) < Math.hypot(a.center()[0] - wx, a.center()[1] - wz) ? b : a));
    const c = S.newCrate();
    S.note(c, `Empty crate issued for ${wh.id}`);
    const t = launchMover({ trailer: 'flat', container: c, crateJob: true, mission: `Product crate: ${wh.id} → ${term.id} by rail` }, [{ fac: wh, op: 'stuff' }, { fac: term, op: 'drop', lazy: true }]);
    if (!t) { WT.unregister(c); return false; }
    term.pendingDrop++;
    S.cratesIssued++;
    return true;
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
        const tm = terminals().filter((f) => spotsFree(f) > 0 && f.stackRoom() - f.pendingDrop > 2 && f.exportCount() < 10);
        const wh = firstFree(active('Warehouse').filter((w) => w.stock > 80), 'stuff');
        if (!tm.length || !wh) return false;
        // by sea in a shipping line's box from the depot (rail exports go in the park's own product crates: crateRun)
        const sea = tm.filter((f) => f.type !== 'Rail terminal');
        if (!sea.length) return false;
        const term = WT.pick(sea);
        const legs = [];
        let c = null;
        const dep = active('Container depot').filter((d) => d.count() > 2 && (d.lazyN || 0) < 3);
        if (dep.length) legs.push({ fac: WT.pick(dep), op: 'pick-empty', lazy: true });
        else { c = S.newContainer(11); S.note(c, 'Empty released from the shipping-line pool'); }
        legs.push({ fac: wh, op: 'stuff' }, { fac: term, op: 'drop', lazy: true });
        const t = launchMover({ trailer: 'flat', container: c, background: true, mission: `Export: ${wh.id} → ${term.id}` }, legs);
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
        // with an off-site empty yard, surplus goes to a rail yard for the repositioning train
        const xy = active('Off-site empty yard').length && active('Rail terminal').filter((t) => t.stackRoom() > 6 && spotsFree(t) > 0);
        if (xy && xy.length) {
          const tm = xy.reduce((a, b) => (Math.abs(b.A - d.plot.A) < Math.abs(a.A - d.plot.A) ? b : a));
          tm.pendingDrop++;
          const t = launchMover({ trailer: 'flat', background: true, mission: `Empty for rail: ${d.id} → ${tm.id}` }, [{ fac: d, op: 'pick-empty', lazy: true }, { fac: tm, op: 'drop', lazy: true }]);
          if (!t) tm.pendingDrop--;
          return !!t;
        }
        return !!launch({ variant: 'flat', carrier: carrier(), spawnX: near(d.plot.A), mission: `Empty return: ${d.id} → shipping line` }, [{ fac: d, op: 'pick-empty', lazy: true }]);
      },
    },
  ];

  // empties left at a port or rail yard are taken by mover to the empty-container depot (they never ride a train or ship);
  // runs on its own clock so terminals are cleared even when the roads are too busy for optional work
  function evacuateEmpty() {
    const dep = active('Container depot').filter((d) => d.room() > 2 && (d.lazyN || 0) < 5);
    if (!dep.length) return false;
    const byRail = active('Off-site empty yard').length > 0;
    const terms = terminals().filter((f) => spotsFree(f) > 0 && f.emptyOnTop && f.emptyOnTop() && !(byRail && f.type === 'Rail terminal')).sort((a, b) => b.emptyCount() - a.emptyCount());
    const term = terms[0];
    if (!term) return false;
    const c = term.emptyOnTop();
    c.reserved = true;
    const d = dep.reduce((a, b) => (Math.abs(b.plot.A - term.A) < Math.abs(a.plot.A - term.A) ? b : a));
    const t = launchMover({ trailer: 'flat', mission: `Empty ${c.id}: ${term.id} → ${d.id}` }, [{ fac: term, op: 'pick', cont: c, lazy: true }, { fac: d, op: 'drop-empty', lazy: true }]);
    if (!t) { c.reserved = false; return false; }
    WT.SUP.note(c, `Empty collected for ${d.id}`);
    return true;
  }

  S.truckCap = () => Math.min(140, 10 + WT.facilities.filter((f) => f.active && f.docks.length).length * 4);
  S.start = function () {
    WT.spawn((function* () {
      let mrpT = 0, evacT = 0, fleetT = 0, crateT = 0;
      while (true) {
        yield* WT.sleep(0.4);
        mrpT += 0.4;
        if (mrpT > 1.5) { mrpT = 0; mrp(); }
        evacT += 0.4;
        if (evacT > 6 && !S.holding) { evacT = 0; evacuateEmpty(); }
        fleetT += 0.4;
        if (fleetT > 3) { fleetT = 0; planFleet(); }
        crateT += 0.4;
        if (crateT > 30 && WT.TR.jam < 0.3) { crateT = 0; crateRun(); }
        // purchase orders always take priority over everything else, but dispatch meters
        // trucks onto the network when the roads are congested
        const jam = WT.TR.jam;
        S.holding = jam > 0.42;
        if (jam < 0.3) { drain(S.dispatchQ, dray, 3); drain(S.internalQ, transfer, 2); }
        else if (!S.holding && Math.random() < 0.35) { drain(S.dispatchQ, dray, 1); drain(S.internalQ, transfer, 1); }
        if (jam > 0.25 || working() >= S.truckCap() || S.dispatchQ.length + S.internalQ.length > 6) continue;
        let r = Math.random() * PLANS.reduce((n, p) => n + p.w, 0);
        for (const p of PLANS) { r -= p.w; if (r <= 0) { p.go(); break; } }
      }
    })());
  };
})();
