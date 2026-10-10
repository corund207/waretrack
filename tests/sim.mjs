// End-to-end simulation test: boots the park in a headless browser, lets it grow for most of a
// day, and checks it stays healthy — no script errors, the park grows, factories get fed, traffic
// never overlaps or locks up, and no truck path drives through a building.
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { open, advance } from './browser.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const site = process.env.SITE ? join(root, process.env.SITE) : existsSync(join(root, 'dist/index.html')) ? join(root, 'dist') : root;
const BATCHES = +(process.env.SIM_BATCHES || 60); // × 20 sim-minutes, including factory → mine → terminal → plant lead time

let failed = 0;
const check = (cond, msg) => { if (cond) console.log('✓ ' + msg); else { failed++; console.error('✗ ' + msg); } };

const { browser, page, errors } = await open(site, { width: 1280, height: 720, seed: +(process.env.SEED || 7) });
console.log(`site: ${site}`);
try {
  const badge = await page.$eval('#brand .ver', (e) => e.textContent);
  const version = await page.evaluate(() => WT.VERSION);
  check(badge.startsWith('v' + version), `version badge shows ${badge}`);

  const containerModels = await page.evaluate(() => {
    // every bulk heap gets a full-height open-top bin, everything else open a low flat-rack frame
    const bulk = Object.keys(WT.SUP.MAT).filter(WT.SUP.isBulk);
    const results = bulk.map((mat) => {
      const c = WT.SUP.newContainer(11, mat), w = WT.M.wagonKind('container');
      w.userData.slot.add(c.mesh);
      const valid = c.open === mat && c.openTopBin && c.load && c.mesh.userData.bulkStyle === (mat === 'grain' ? 'covered-grain' : 'reinforced-open-top') && c.mesh.parent === w.userData.slot && w.userData.slot.position.x === 0 && w.userData.slot.position.y === 1.45;
      WT.unregister(c);
      return !!valid;
    });
    const c = WT.SUP.newContainer(11, 'glass');
    const valid = c.open === 'glass' && !!c.load && !c.openTopBin;
    WT.unregister(c);
    return bulk.length >= 6 && results.every(Boolean) && valid;
  });
  check(containerModels, 'bulk heaps ride in open-top bins, other open loads in flat-racks, all mounted at the wagon center');

  let maxOverlap = 0, maxJam = 0, starveS = 0, plantS = 0;
  const t0 = Date.now();
  await advance(page, BATCHES, async (i) => {
    const s = await page.evaluate(() => {
      const V = WT.TR.vehicles.filter((v) => !v.proxyOf);
      let o = 0;
      for (let i = 0; i < V.length; i++) for (let j = i + 1; j < V.length; j++) {
        const a = V[i].actor, b = V[j].actor;
        if (Math.hypot(a.x - b.x, a.z - b.z) < 2.2) o++;
      }
      const next = WT.G.next();
      if (next && (!Number.isFinite(next.cost) || next.cost <= 0 || !next.icon || !next.label)) throw new Error('Invalid planned project: ' + next?.type);
      for (const po of WT.SUP.orders.filter((o) => o.remoteSource)) {
        const c = po.unit;
        if (!c || !c.manufacturer || c.open !== po.mat || c.deliveredToSite !== po.remoteSource || !c.emptyDeliveryTrain) throw new Error('Remote order bypassed manufactured empty delivery: ' + po.id);
        const journey = c.journey.map((j) => j.text);
        const made = journey.findIndex((s) => s.startsWith('Manufactured at'));
        const sent = journey.findIndex((s) => s.startsWith('Shipped empty on'));
        const arrived = journey.findIndex((s) => s.startsWith('Empty delivered to'));
        const loaded = journey.findIndex((s) => s.startsWith('Loaded at ' + po.remoteSource));
        if (!(made >= 0 && made < sent && sent < arrived && arrived < loaded)) throw new Error('Remote container journey out of order: ' + po.id);
      }
      for (const tr of WT.trains) {
        if (tr.origin && tr.manifest.length && tr.cars.length - 1 !== tr.manifest.length) throw new Error('Mine consist exceeds booked cargo: ' + tr.id);
        if (!tr.terminal && tr.cars.slice(1).some((car) => car.kind === 'container' && !car.cont)) throw new Error('Unneeded empty through flat: ' + tr.id);
        if (tr.terminal && !tr.origin && !tr.empties && tr.cars.length - 1 > Math.max(tr.manifest.length, 4)) throw new Error('Unneeded terminal wagons: ' + tr.id);
        for (let i = 0; i < tr.cars.length; i++) {
          const car = tr.cars[i];
          if (car.cont && !car.cont.lifting && car.cont.mesh.parent !== car.g.userData.slot) throw new Error('Container detached from wagon mount: ' + tr.id);
          if (i && Math.hypot(car.g.position.x - tr.cars[i - 1].g.position.x, car.g.position.z - tr.cars[i - 1].g.position.z) < 12) throw new Error('Train cars overlap: ' + tr.id);
        }
      }
      // container handling at the rail and port terminals is for autonomous movers only
      for (const t of WT.trucks) if (t.variant !== 'mover' && [t.curLeg, ...t.legs].some((l) => l && /Rail terminal|Port terminal/.test(l.fac.type))) (WT.__semiAtTerminal = WT.__semiAtTerminal || []).push(t.mission);
      const works = WT.REMOTE.containerFactory();
      if (works && works.slots.some((s) => s.items.length > 3 || s.items.some((c) => c.full || c.contents || c.open !== s.mat || c.manufacturer !== works.id))) throw new Error('Invalid manufactured empty inventory');
      WT.UI.refresh();
      if (/NaN|undefined/.test(document.querySelector('#docks').innerText)) throw new Error('Invalid project display');
      const pl = WT.facilities.filter((f) => f.active && f.type === 'Factory');
      return { t: WT.fmtTime(WT.sim.minutes), n: WT.facilities.filter((f) => f.active).length, trucks: WT.trucks.length, jam: WT.TR.jam, o, sv: pl.filter((f) => f.starved).length, pl: pl.length };
    });
    maxOverlap = Math.max(maxOverlap, s.o);
    if (i > BATCHES / 2) { maxJam = Math.max(maxJam, s.jam); starveS += s.sv; plantS += s.pl; }
    if (i % 4 === 3 || i === BATCHES - 1) console.log(`  ${s.t}  ${s.n} facilities · ${s.trucks} vehicles · ${Math.round(s.jam * 100)}% queued · overlaps ${s.o}`);
    if (errors.length) throw new Error('page error during simulation');
  });
  console.log(`  simulated in ${((Date.now() - t0) / 1000).toFixed(0)} s`);

  const st = await page.evaluate(() => {
    const facs = WT.facilities.filter((f) => f.active);
    const plants = facs.filter((f) => f.type === 'Factory');
    return {
      n: facs.length,
      types: new Set(facs.map((f) => f.type)).size,
      plants: plants.length,
      fed: plants.filter((f) => f.recipe.in.some((m) => f.stock[m] > 0)).length,
      delivered: WT.SUP.deliveryStats.total,
      trucks: WT.trucks.length,
      remote: facs.filter((f) => f.remote).length,
      mineLoads: facs.filter((f) => f.remote).reduce((n, f) => n + f.trainsLoaded, 0),
      pipeDelivered: facs.find((f) => f.type === 'Gas field')?.sent || 0,
      emptyReceived: facs.find((f) => f.type === 'Off-site empty yard')?.received || 0,
      smelter: facs.some((f) => f.lineName === 'Aluminium Smelter'),
      manufactured: WT.REMOTE.containerFactory()?.made || 0,
      emptySent: WT.REMOTE.containerFactory()?.sent || 0,
      remoteDelivered: WT.SUP.deliveryStats.remote,
      siteEmptyReceived: facs.filter((f) => f.remote).reduce((n, f) => n + f.emptiesReceived, 0),
      rail: WT.RAIL_STATS,
      // resource intake: never by road truck — every order rides a trunk carrier, the last leg is a container mover
      roadOrders: WT.SUP.orders.filter((o) => !['rail', 'sea', 'air', 'pipe', 'internal'].includes(o.mode)).length,
      truckIntake: WT.trucks.filter((t) => t.po && t.variant !== 'mover').length,
      movers: WT.trucks.filter((t) => t.variant === 'mover').length,
      semiAtTerminal: WT.__semiAtTerminal || [],
      fleet: WT.SUP.fleet(),
      yards: facs.filter((f) => f.type === 'Rail terminal').map((f) => f.id + '@' + f.A),
      moverWait: WT.SUP.moverWait,
      awaitingMover: WT.SUP.dispatchQ.length,
      starved: plants.filter((f) => f.starved).length,
      moverDepots: facs.filter((f) => f.type === 'Mover depot').length,
      moversDelivered: facs.filter((f) => f.type === 'Mover depot').reduce((n, f) => n + f.delivered, 0),
      moverDeliveries: WT.SUP.orders.filter((o) => o.status === 'Delivered' && o.events.some((e) => /^Mover assigned|^Collecting/.test(e.text))).length,
    };
  });
  check(st.n >= 20, `park grew to ${st.n} facilities of ${st.types} types`);
  check(st.plants >= 4 && st.fed >= st.plants - 1, `${st.fed}/${st.plants} factories have input stock`);
  check(st.delivered >= 20, `${st.delivered} purchase orders delivered end to end`);
  check(st.remote === 5, `all five hinterland production sites constructed (${st.remote})`);
  check(st.smelter, 'Aluminium Smelter constructed without blocking growth');
  check(st.manufactured > 0 && st.emptySent > 0 && st.emptySent <= st.manufactured, `${st.manufactured} material-specific containers manufactured, ${st.emptySent} shipped empty by rail`);
  check(st.siteEmptyReceived > 0 && st.siteEmptyReceived <= st.emptySent, `${st.siteEmptyReceived} manufactured empties received at remote loading sites`);
  check(st.remoteDelivered > 0, `${st.remoteDelivered} orders delivered using the same manufactured containers`);
  check(st.mineLoads > 0, `${st.mineLoads} trains loaded at remote production sites`);
  check(st.pipeDelivered > 0, `${st.pipeDelivered} tonnes delivered by pipeline`);
  check(st.emptyReceived > 0, `${st.emptyReceived} empty containers received off-site by rail`);
  check(st.rail.maxWagons <= 10 && st.rail.freightCalls > 10, `cargo-sized, frequent freight services (${st.rail.freightCalls} calls, up to ${st.rail.maxWagons} wagons)`);
  check(st.trucks > 10, `${st.trucks} vehicles on the network`);
  check(st.roadOrders === 0 && st.truckIntake === 0, 'no resources are trucked in by road (every order uses a trunk carrier)');
  check(st.moverDeliveries > 20, `${st.moverDeliveries} of the latest orders delivered to plants by autonomous container movers (${st.movers} active)`);
  check(st.semiAtTerminal.length === 0, 'only autonomous movers collect or drop containers at rail and port terminals' + (st.semiAtTerminal.length ? ': ' + [...new Set(st.semiAtTerminal)].slice(0, 3).join(' | ') : ''));
  check(st.moverDepots >= 1 && st.fleet.size > 20 && st.moversDelivered > 0, `mover fleet grew to ${st.fleet.size} (${st.moversDelivered} delivered by lowloader, ${st.moverDepots} depot${st.moverDepots > 1 ? 's' : ''}, ${st.fleet.out} on jobs)`);
  console.log(`  plants starved (second half, sampled): ${Math.round((100 * starveS) / Math.max(1, plantS))}%`);
  console.log('  rail yards: ' + st.yards.join(' '));
  const mw = st.moverWait;
  console.log(`  mover wait: ${mw.n} containers · avg ${(mw.sum / Math.max(1, mw.n)).toFixed(1)} min · max ${mw.max.toFixed(1)} min · ${st.awaitingMover} waiting now · ${st.starved}/${st.plants} plants starved`);
  check(maxOverlap <= 3, `vehicles never pile into each other (max ${maxOverlap} touching pairs)`);
  check(maxJam < 0.85, `traffic keeps moving (peak ${Math.round(maxJam * 100)}% queued)`);

  const guards = await page.evaluate(() => {
    const site = WT.REMOTE.siteFor('iron'), factory = WT.REMOTE.containerFactory();
    const term = WT.facilities.find((f) => f.type === 'Rail terminal' && f.active);
    const target = WT.facilities.find((f) => f.type === 'Factory' && f.active);
    const stock = site.stock, received = site.emptiesReceived, loads = site.trainsLoaded;
    const run = (g) => {
      const dt = WT.sim.dt; WT.sim.dt = 0.1;
      try { for (let i = 0; i < 100; i++) if (g.next().done) return; throw new Error('Guard test did not finish'); }
      finally { WT.sim.dt = dt; }
    };
    const bad = [null, WT.SUP.newContainer(11, 'sand'), WT.SUP.newContainer(11, 'iron'), WT.SUP.newContainer(11, 'iron')];
    bad[1].manufacturer = factory.id;
    bad[3].manufacturer = factory.id; bad[3].full = true;
    let blocked = true;
    for (const c of bad) {
      const po = { id: 'GUARD-TEST', mat: 'iron', qty: 20, to: target, events: [], unit: null };
      run(site.loadTrain({ id: 'GUARD-TRAIN', cars: [{}, { cont: c }] }, [po]));
      blocked &&= !po.unit && WT.SUP.backlog.rail.includes(po);
      WT.SUP.backlog.rail.splice(WT.SUP.backlog.rail.indexOf(po), 1);
      if (c) { WT.scene.remove(c.mesh); WT.unregister(c); }
    }
    blocked &&= site.stock === stock && site.emptiesReceived === received && site.trainsLoaded === loads;
    const busy = factory.trainBusy;
    factory.trainBusy = false;
    const boxes = factory.slots.flatMap((s) => s.items);
    const reserved = boxes.map((c) => c.reserved);
    boxes.forEach((c) => { c.reserved = true; });
    let shortage = false;
    try { WT.REMOTE.mineTrain(site, term, [{ mat: 'iron' }]); } catch (e) { shortage = /requires manufactured empty/.test(e.message); }
    boxes.forEach((c, i) => { c.reserved = reserved[i]; });
    factory.trainBusy = busy;
    return { blocked, shortage };
  });
  check(guards.blocked, 'missing, wrong-material, unmanufactured and full boxes cannot load; orders stay queued');
  check(guards.shortage, 'empty-container shortages prevent mine train dispatch');

  // audit twice, 30 sim-seconds apart: anything in a lane both times is fixed scenery; things that moved
  // (a box swinging under a crane, a part being handed over) are transient and only reported for information
  const first = await page.evaluate(auditPaths);
  await page.evaluate(() => { for (let k = 0; k < 300; k++) { WT.sim.dt = 0.1; WT.stepTasks(); WT.emit('frame', k * 0.1); WT.FX.update(0.1); } });
  const second = await page.evaluate(auditPaths);
  const key = (r, h) => `${r.fac}|${h.label}|${h.at}`;
  const again = new Set(second.report.flatMap((r) => r.all.map((h) => key(r, h))));
  const report = [], transient = [];
  for (const r of first.report) {
    const stuck = r.all.filter((h) => again.has(key(r, h)));
    if (stuck.length) report.push({ ...r, n: stuck.length, sample: stuck.slice(0, 3) });
    else transient.push(r);
  }
  for (const r of transient.slice(0, 4)) console.log(`    (transient, ignored) ${r.fac}: ${JSON.stringify(r.sample[0])}`);
  for (const r of report.slice(0, 8)) console.error(`    ${r.fac} ${r.type}: ${r.n} hits ${JSON.stringify(r.sample)}`);
  check(report.length === 0, `path audit: ${first.checked} truck paths clear of buildings (${report.length} violations)`);
} catch (e) {
  failed++;
  console.error('✗ ' + e.message);
} finally {
  check(errors.length === 0, 'no page errors' + (errors.length ? ':\n' + errors.slice(0, 5).join('\n') : ''));
  await browser.close();
}
if (failed) { console.error(`\n${failed} simulation check(s) failed`); process.exit(1); }

// Ray-casts each truck's full body (5 × 3 sample points) along every dock, reverse, staging and
// public-road path, looking for static geometry between 0.35 m and 4.6 m above the road.
function auditPaths() {
  const T = THREE;
  WT.scene.updateMatrixWorld(true);
  const skip = new Set();
  const mark = (o) => o && o.traverse((c) => skip.add(c));
  WT.trucks.forEach((t) => mark(t.mesh));
  (WT.trains || []).forEach((t) => t.cars.forEach((c) => mark(c.g)));
  (WT.ships || []).forEach((s) => mark(s.mesh));
  (WT.AIR.planes || []).forEach((p) => mark(p.mesh));
  WT.FX.belts.forEach((b) => skip.add(b.im));
  WT.TR.gates.forEach((g) => mark(g.arm));
  WT.facilities.forEach((f) => (f.bays || []).forEach((b) => mark(b.mesh))); // movers parked on charge in their own bays
  for (const e of WT.entities.values()) if (['forklift', 'tug', 'pallet', 'uld'].includes(e.kind)) mark(e.mesh);
  WT.scene.traverse((o) => { if (o.isSprite || o.isLine || o.isLineSegments || o.userData.fx) skip.add(o); });
  const forests = new Set(WT.W.forests.map((f) => f.mesh));
  const all = [];
  WT.scene.traverse((o) => { if ((o.isMesh || o.isInstancedMesh) && !skip.has(o) && !forests.has(o)) { const b = new T.Box3().setFromObject(o); if (b.max.y > 0.35 && isFinite(b.min.x)) all.push({ o, b }); } });
  const targetsFor = (pts) => {
    const bb = new T.Box3();
    for (const [x, z] of pts) bb.expandByPoint(new T.Vector3(x, 0, z));
    bb.expandByScalar(12); bb.min.y = -1; bb.max.y = 20;
    return all.filter((t) => t.b.intersectsBox(bb)).map((t) => t.o);
  };
  const treeHit = (x, z) => { for (const f of WT.W.forests) for (let i = 0; i < f.x.length; i++) if (f.alive[i] && Math.abs(f.x[i] - x) < 1.6 && Math.abs(f.z[i] - z) < 1.6) return true; return false; };
  const ray = new T.Raycaster();
  ray.far = 14;
  const down = new T.Vector3(0, -1, 0), org = new T.Vector3();
  const owner = (o) => { while (o) { if (o.userData && o.userData.entityId) { const e = WT.entities.get(o.userData.entityId); if (e) return e.id || e.kind; } o = o.parent; } return 'scene'; };
  // name the thing that was hit: an entity whose mesh contains it (containers, vehicles) or its size
  const describe = (o) => {
    const byMesh = new Map([...WT.entities.values()].filter((e) => e.mesh).map((e) => [e.mesh, e]));
    const bb = new T.Box3().setFromObject(o), sz = bb.getSize(new T.Vector3()), c = bb.getCenter(new T.Vector3());
    const shape = `${o.type} ${sz.x.toFixed(1)}×${sz.y.toFixed(1)}×${sz.z.toFixed(1)} at ${c.x.toFixed(0)},${c.z.toFixed(0)}`;
    for (let q = o; q; q = q.parent) { const e = byMesh.get(q); if (e && e.kind !== 'facility') return `${e.kind} ${e.id} (${e.status || ''}${e.loc ? ' @ ' + e.loc : ''})`; }
    return shape;
  };
  let checked = 0;
  function check(pts, label, rev) {
    checked++;
    const p = WT.buildPath(pts, WT.TR.TRUCK_R || 5), out = [], targets = targetsFor(pts);
    // a point `d` metres along the path, extended straight past either end
    const along = (d) => {
      if (d >= 0 && d <= p.len) return p.at(d);
      const e = p.at(d < 0 ? 0 : p.len), k = d < 0 ? d : d - p.len;
      return { x: e.x + Math.cos(e.a) * k, z: e.z + Math.sin(e.a) * k, a: e.a };
    };
    for (let s = 0; s <= p.len; s += 1.0) {
      const q = p.at(s);
      for (const lon of [-7.2, -3.6, 0, 3.4, 6.4]) for (const off of [-1.55, 0, 1.55]) {
        // articulated rig: each body point rides on the path at its own distance ahead/behind
        const b = along(rev ? s - lon : s + lon), nx = -Math.sin(b.a), nz = Math.cos(b.a);
        org.set(b.x + nx * off, 12, b.z + nz * off);
        if (treeHit(org.x, org.z)) { out.push({ label, at: [Math.round(org.x), Math.round(org.z)], hit: 'tree' }); continue; }
        ray.set(org, down);
        const h = ray.intersectObjects(targets, false).find((h) => h.point.y > 0.35 && h.point.y < 4.6);
        if (h) out.push({ label, at: [Math.round(q.x), Math.round(q.z)], y: +h.point.y.toFixed(1), hit: owner(h.object), what: describe(h.object), local: h.object.worldToLocal(h.point.clone()).toArray().map((v) => +v.toFixed(1)), org: [+org.x.toFixed(1), +org.z.toFixed(1)] });
      }
    }
    return out;
  }
  const report = [];
  for (const f of WT.facilities) {
    if (!f.active || !f.inPath) continue;
    for (const d of f.docks.length ? f.docks : [null]) {
      const lane = f.gateIn ? [[f.gateIn.A + (f.gateIn.z < 0 ? 3 : -3), f.gateIn.z]] : [];
      let v = check([...lane, ...f.inPath(d)], 'in').concat(check(f.outPath(d), 'out'));
      const dp = f.dockPath && f.dockPath(d);
      if (dp) v = v.concat(check(dp, 'reverse', true));
      if (f.stagePath) v = v.concat(check([...lane, ...f.stagePath(), ...f.inPath(d).slice(f.stageSkip || 0)], 'stage'));
      if (v.length) report.push({ fac: f.id, type: f.type, n: v.length, sample: v.slice(0, 3), all: v });
    }
  }
  for (const f of WT.facilities) {
    if (!f.active || !f.gateIn) continue;
    for (const side of ['W', 'E']) {
      const rin = WT.W.route({ edge: side }, f.gateIn), last = rin.slice(-2);
      const dir = Math.sign(last[0][0] - rin[0][0]) || 1;
      let v = check([[last[0][0] - dir * 40, last[0][1]], ...last, ...f.inPath(f.docks[0] || null).slice(0, 3)], 'road-in'); // through the first turn inside the gate, as a truck drives it
      const rout = WT.W.route(f.gateOut, { edge: side });
      v = v.concat(check([...f.outPath(f.docks[0] || null).slice(-2), ...rout.slice(0, 2), [rout[1][0] + (side === 'W' ? -40 : 40), rout[1][1]]], 'road-out'));
      if (v.length) report.push({ fac: f.id, type: 'road → ' + f.type, n: v.length, sample: v.slice(0, 3), all: v });
    }
  }
  return { checked, report };
}
