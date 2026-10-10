// Fast checks that need no browser: every script parses, every asset referenced by index.html
// exists, and all cache-busting tags agree with WT.VERSION.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
const fail = (msg) => { failed++; console.error('✗ ' + msg); };
const ok = (msg) => console.log('✓ ' + msg);

const version = readFileSync(join(root, 'js/core.js'), 'utf8').match(/WT\.VERSION = '([^']+)'/)?.[1];
if (!version) fail('WT.VERSION not found in js/core.js');
else ok(`WT.VERSION = ${version}`);
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
if (pkg !== version) fail(`package.json version ${pkg} does not match WT.VERSION ${version}`);

for (const f of readdirSync(join(root, 'js')).filter((f) => f.endsWith('.js'))) {
  try { execFileSync(process.execPath, ['--check', join(root, 'js', f)], { stdio: 'pipe' }); } catch (e) { fail(`syntax error in js/${f}\n${e.stderr}`); }
}
ok('all scripts parse');

const html = readFileSync(join(root, 'index.html'), 'utf8');
const refs = [...html.matchAll(/(?:src|href)="((?:js|css)\/[^"?]+)\?v=([^"]+)"/g)];
if (refs.length < 20) fail(`expected the app's scripts and stylesheet in index.html, found ${refs.length}`);
for (const [, file, v] of refs) {
  if (!existsSync(join(root, file))) fail(`index.html references missing ${file}`);
  if (v !== version) fail(`${file} is tagged ?v=${v}, expected ${version}`);
}
if (!html.includes(`<title>WareTrack v${version}`)) fail(`<title> does not carry v${version}`);
ok(`${refs.length} assets referenced, all tagged v${version}`);

if (failed) { console.error(`\n${failed} static check(s) failed`); process.exit(1); }
