// Shared headless-browser harness for the simulation tests and the screenshot script.
import puppeteer from 'puppeteer';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

// software WebGL so the scene renders on CI machines without a GPU
const ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'];

export async function open(siteDir, { width = 1600, height = 900, seed = 7 } = {}) {
  const browser = await puppeteer.launch({
    protocolTimeout: 0,
    executablePath: process.env.CHROME_PATH || undefined,
    headless: process.env.CHROME_PATH ? 'shell' : true,
    args: ARGS,
  });
  const page = await browser.newPage();
  await page.setViewport({ width, height });
  // a fixed light theme, whatever the machine's dark-mode setting (README screenshots are light)
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message + '\n' + e.stack));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test(m.text())) errors.push(m.text()); });
  // deterministic runs: seed Math.random before any app script executes
  if (seed !== null) await page.evaluateOnNewDocument((s) => {
    let a = s >>> 0;
    Math.random = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }, seed);
  await page.evaluateOnNewDocument(() => {
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (fn) => raf((time) => {
      if (window.WT?.sim) WT.sim.paused = true;
      fn(time);
    });
  });
  await page.goto(pathToFileURL(join(siteDir, 'index.html')).href);
  await page.waitForFunction(() => window.WT && WT.facilities && WT.G, { timeout: 60000 });
  await new Promise((r) => setTimeout(r, 1000));
  // Test advances own the simulation clock; rendering must not insert unseeded timing-dependent steps.
  await page.evaluate(() => WT.setPaused(true));
  return { browser, page, errors };
}

// advance the simulation by `batches` × 20 sim-minutes, headless and as fast as possible
export async function advance(page, batches, each) {
  for (let i = 0; i < batches; i++) {
    await page.evaluate(() => { for (let k = 0; k < 400; k++) { WT.sim.dt = 0.1; WT.sim.minutes += 0.05; WT.stepTasks(); WT.emit('frame', k * 0.1); WT.FX.update(0.1); } });
    if (each) await each(i);
  }
}

// let the renderer settle after a camera move so a screenshot shows the new view
export async function settle(page, ms = 2200) {
  for (let k = 0; k < 4; k++) {
    await page.evaluate(() => { for (let i = 0; i < 20; i++) { WT.sim.dt = 0.05; WT.stepTasks(); WT.emit('frame', i * 0.05); WT.FX.update(0.05); } });
    await new Promise((r) => setTimeout(r, ms / 4));
  }
}
