// Regenerates the README screenshots and the social preview image: `npm run screenshots`.
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { open, advance, settle } from '../tests/browser.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'docs/screenshots');
mkdirSync(outDir, { recursive: true });

const { browser, page, errors } = await open(root, { width: 1600, height: 900, seed: 11 });
const shot = async (name, setup, { settleMs = 2400, path } = {}) => {
  const info = await page.evaluate(setup);
  await settle(page, settleMs);
  await page.screenshot({ path: path || join(outDir, name + '.png') });
  console.log(`📸 ${name}`, info ? JSON.stringify(info) : '');
};
// step in short slices until something worth photographing is on screen
const until = async (cond, maxMinutes = 240) => {
  for (let m = 0; m < maxMinutes; m += 2) {
    if (await page.evaluate(cond)) return true;
    await page.evaluate(() => { for (let k = 0; k < 40; k++) { WT.sim.dt = 0.1; WT.sim.minutes += 0.05; WT.stepTasks(); WT.emit('frame', k * 0.1); WT.FX.update(0.1); } });
  }
  return false;
};
const calm = () => { WT.Cinema.toggle(false); WT.select(null); };
const at = (type, size, dx = 0, dz = 0) => `(() => { (${calm})(); const f = WT.facilities.find((f) => f.active && f.type === '${type}'); const [x, z] = f.center(); WT.flyTo(x + ${dx}, z + ${dz}, ${size}); return f.id; })()`;

try {
  // day one: bare land, the first plot being paved and built
  await advance(page, 1);
  await shot('01-founding', `(() => { (${calm})(); const f = WT.facilities[0]; const [x, z] = f.center(); WT.flyTo(x, z, 150); })()`);

  await advance(page, 22);
  // an open load (bed or open-frame box) being lifted off at a factory dock
  const openUnload = () => WT.trucks.find((t) => (t.bedLoad || (t.container && t.container.open)) && /Unloading/.test(t.status) && t.loaded >= 2 && t.curLeg && t.curLeg.fac.type === 'Factory');
  await until(`(${openUnload})()`, 400);
  await shot('03-factory-docks', `(() => { (${calm})(); const t = (${openUnload})() || WT.trucks.find((t) => t.curLeg && t.curLeg.fac.type === 'Factory'); WT.flyTo(t.actor.x - 1, t.actor.z, 46); return t.id + ' ' + t.status + ' @ ' + t.curLeg.fac.id; })()`, { settleMs: 3200 });

  await until(() => WT.ships.some((s) => s.port && /Berthed|Discharg|Loading|Unload/i.test(s.status)), 180);
  await shot('04-seaport', at('Port terminal', 130, 10, 6));

  await until(() => WT.trains.some((t) => /Unload|Load|Work|Stopped|Berthed|crane/i.test(t.status)), 120);
  await shot('05-rail-terminal', at('Rail terminal', 140));

  await until(() => WT.AIR.planes.some((p) => /Unloading|Loading/.test(p.status)), 180);
  await shot('06-air-cargo', `(() => { (${calm})(); const p = WT.AIR.planes.find((p) => /Unloading|Loading/.test(p.status)) || WT.AIR.planes[0]; const at = WT.facilities.find((f) => f.type === 'Air terminal').center(); WT.flyTo(p.mesh.position.x * 0.85 + at[0] * 0.15, p.mesh.position.z * 0.85 + at[1] * 0.15, 105); return p.flight + ' ' + p.status; })()`);

  await advance(page, 14);
  await shot('02-overview', `(() => { (${calm})(); WT.flyTo(60, -40, 760); })()`, { settleMs: 3200 });
  await shot('07-supply-chain', `(() => { (${calm})(); WT.flyTo(-120, 0, 190); document.querySelector('#docks [data-tab=supply]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); })()`);
  await shot('08-truck-card', `(() => { (${calm})(); const t = WT.trucks.find((t) => t.po && t.container && t.driving) || WT.trucks.find((t) => t.po); WT.select(t, true); return t.id; })()`);
  await shot('09-cinema', `(() => { WT.Cinema.toggle(true); })()`, { settleMs: 4000 });

  // social card: the park itself, with just the top bar and KPIs for branding
  await page.setViewport({ width: 1280, height: 640 });
  await page.addStyleTag({ content: '#tracking, #docks, #modeChips, .right-stack, .toasts, .hint, #labels { display: none !important; }' });
  await shot('social-preview', `(() => { (${calm})(); WT.flyTo(80, -30, 640); })()`, { settleMs: 3200, path: join(root, 'docs/social-preview.png') });
} finally {
  if (errors.length) console.error(errors.join('\n'));
  await browser.close();
}
