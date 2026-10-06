// End-to-end simulation test: boots the park in a headless browser, lets it grow for most of a
// day, and checks it stays healthy — no script errors, the park grows, factories get fed, traffic
// never overlaps or locks up, and no truck path drives through a building.
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { open, advance } from './browser.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const site = process.env.SITE ? join(root, process.env.SITE) : existsSync(join(root, 'dist/index.html')) ? join(root, 'dist') : root;
const BATCHES = +(process.env.SIM_BATCHES || 26); // × 20 sim-minutes

let failed = 0;
const check = (cond, msg) => { if (cond) console.log('✓ ' + msg); else { failed++; console.error('✗ ' + msg); } };

const { browser, page, errors } = await open(site, { width: 1280, height: 720 });
console.log(`site: ${site}`);
try {
  const badge = await page.$eval('#brand .ver', (e) => e.textContent);
  const version = await page.evaluate(() => WT.VERSION);
  check(badge.startsWith('v' + version), `version badge shows ${badge}`);

  let maxOverlap = 0, maxJam = 0;
  const t0 = Date.now();
  await advance(page, BATCHES, async (i) => {
    const s = await page.evaluate(() => {
      const V = WT.TR.vehicles.filter((v) => !v.proxyOf);
      let o = 0;
      for (let i = 0; i < V.length; i++) for (let j = i + 1; j < V.length; j++) {
        const a = V[i].actor, b = V[j].actor;
        if (Math.hypot(a.x - b.x, a.z - b.z) < 2.2) o++;
      }
      return { t: WT.fmtTime(WT.sim.minutes), n: WT.facilities.filter((f) => f.active).length, trucks: WT.trucks.length, jam: WT.TR.jam, o };
    });
    maxOverlap = Math.max(maxOverlap, s.o);
    if (i > BATCHES / 2) maxJam = Math.max(maxJam, s.jam);
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
      delivered: WT.SUP.orders.filter((o) => o.status === 'Delivered').length,
      trucks: WT.trucks.length,
    };
  });
  check(st.n >= 20, `park grew to ${st.n} facilities of ${st.types} types`);
  check(st.plants >= 4 && st.fed >= st.plants - 1, `${st.fed}/${st.plants} factories have input stock`);
  check(st.delivered >= 20, `${st.delivered} purchase orders delivered end to end`);
  check(st.trucks > 10, `${st.trucks} vehicles on the network`);
  check(maxOverlap <= 3, `vehicles never pile into each other (max ${maxOverlap} touching pairs)`);
  check(maxJam < 0.85, `traffic keeps moving (peak ${Math.round(maxJam * 100)}% queued)`);

  const audit = await page.evaluate(auditPaths);
  for (const r of audit.report.slice(0, 8)) console.error(`    ${r.fac} ${r.type}: ${r.n} hits ${JSON.stringify(r.sample)}`);
  check(audit.report.length === 0, `path audit: ${audit.checked} truck paths clear of buildings (${audit.report.length} violations)`);
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
  for (const e of WT.entities.values()) if (['forklift', 'tug', 'pallet', 'uld'].includes(e.kind)) mark(e.mesh);
  WT.scene.traverse((o) => { if (o.isSprite || o.isLine || o.isLineSegments) skip.add(o); });
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
  let checked = 0;
  function check(pts, label, rev) {
    checked++;
    const p = WT.buildPath(pts, 5), out = [], targets = targetsFor(pts);
    for (let s = 0; s <= p.len; s += 1.0) {
      const q = p.at(s), hd = rev ? q.a + Math.PI : q.a, nx = -Math.sin(hd), nz = Math.cos(hd), fx = Math.cos(hd), fz = Math.sin(hd);
      for (const lon of [-7.2, -3.6, 0, 3.4, 6.4]) for (const off of [-1.55, 0, 1.55]) {
        org.set(q.x + nx * off + fx * lon, 12, q.z + nz * off + fz * lon);
        if (treeHit(org.x, org.z)) { out.push({ label, at: [Math.round(org.x), Math.round(org.z)], hit: 'tree' }); continue; }
        ray.set(org, down);
        const h = ray.intersectObjects(targets, false).find((h) => h.point.y > 0.35 && h.point.y < 4.6);
        if (h) out.push({ label, at: [Math.round(q.x), Math.round(q.z)], hit: owner(h.object) });
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
      if (v.length) report.push({ fac: f.id, type: f.type, n: v.length, sample: v.slice(0, 3) });
    }
  }
  for (const f of WT.facilities) {
    if (!f.active || !f.gateIn) continue;
    for (const side of ['W', 'E']) {
      const rin = WT.W.route({ edge: side }, f.gateIn), last = rin.slice(-2);
      const dir = Math.sign(last[0][0] - rin[0][0]) || 1;
      let v = check([[last[0][0] - dir * 40, last[0][1]], ...last, ...f.inPath(f.docks[0] || null).slice(0, 2)], 'road-in');
      const rout = WT.W.route(f.gateOut, { edge: side });
      v = v.concat(check([...f.outPath(f.docks[0] || null).slice(-2), ...rout.slice(0, 2), [rout[1][0] + (side === 'W' ? -40 : 40), rout[1][1]]], 'road-out'));
      if (v.length) report.push({ fac: f.id, type: 'road → ' + f.type, n: v.length, sample: v.slice(0, 3) });
    }
  }
  return { checked, report };
}
