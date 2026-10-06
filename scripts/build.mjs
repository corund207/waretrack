// Builds the static site into dist/ and stamps it with the commit hash, so every deploy
// busts browser caches and the version badge shows exactly which build is live.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist');

function commit() {
  const env = process.env.GITHUB_SHA || process.env.VERCEL_GIT_COMMIT_SHA;
  if (env) return env.slice(0, 7);
  try { return execSync('git rev-parse --short=7 HEAD', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return 'local'; }
}

const version = readFileSync(join(root, 'js/core.js'), 'utf8').match(/WT\.VERSION = '([^']+)'/)[1];
const build = commit();

rmSync(out, { recursive: true, force: true });
mkdirSync(out);
for (const p of ['index.html', 'css', 'js']) cpSync(join(root, p), join(out, p), { recursive: true });
if (existsSync(join(root, 'docs/social-preview.png'))) cpSync(join(root, 'docs/social-preview.png'), join(out, 'og.png'));

const html = join(out, 'index.html');
writeFileSync(html, readFileSync(html, 'utf8').replaceAll(`?v=${version}"`, `?v=${version}-${build}"`));
const core = join(out, 'js/core.js');
writeFileSync(core, readFileSync(core, 'utf8').replace("WT.BUILD = 'dev';", `WT.BUILD = '${build}';`));

console.log(`built dist/ · v${version} · ${build}`);
