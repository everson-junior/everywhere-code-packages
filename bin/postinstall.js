import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ewhJs = join(__dirname, 'ewh.js');

// Keep this list as the single source of truth for plugins installed in web.
// Use the @latest tag so a new npm release is picked up on reinstall/update.
const webPlugins = [
  '@everywhere-harness/plugin-providers@latest',
  '@everywhere-harness/client-ui-chat@latest',
  '@deepseek-ai/dsh-experimental-plugin-market-bundle@latest'
];

const packageName = (specifier) => specifier.slice(0, specifier.lastIndexOf('@'));

function profileDirectory() {
  const dshHome = process.env.DSH_HOME || join(homedir(), '.dsh');
  return join(dshHome, 'profiles', 'web');
}

async function enableWebBundles() {
  const profilePath = join(profileDirectory(), 'package.json');
  const manifest = JSON.parse(await readFile(profilePath, 'utf8'));
  const profile = manifest.dsh ??= {};
  const profileConfig = profile.profile ??= {};
  const bundles = profileConfig.bundles ??= [];

  for (const specifier of webPlugins) {
    const bundleName = packageName(specifier);
    if (!bundles.includes(bundleName)) bundles.push(bundleName);
  }

  await writeFile(profilePath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

console.log('[ewh postinstall] Installing latest plugins for the web profile...');

const result = spawnSync(process.execPath, [
  ewhJs,
  'plugin',
  '--profile',
  'web',
  'add',
  '--save-exact',
  ...webPlugins
], { stdio: 'inherit' });

if (result.error) throw result.error;
if (result.status !== 0) {
  process.exitCode = result.status ?? 1;
} else {
  await enableWebBundles();
  console.log('[ewh postinstall] Web profile plugins installed and enabled.');
}
