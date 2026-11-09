import { spawnSync } from 'node:child_process';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

async function ensurePnpm() {
  const command = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const probe = spawnSync(command, ['--version'], { stdio: 'ignore', shell: process.platform === 'win32' });
  if (!probe.error && probe.status === 0) return undefined;

  const binDirectory = await mkdtemp(join(tmpdir(), 'ewh-pnpm-'));
  const npmArgs = [
    'install',
    '--no-save',
    '--no-package-lock',
    '--prefix',
    binDirectory,
    'pnpm@12.18.0'
  ];
  const npmExecPath = process.env.npm_execpath;
  const install = npmExecPath
    ? spawnSync(process.execPath, [npmExecPath, ...npmArgs], { stdio: 'inherit' })
    : spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', npmArgs, {
      stdio: 'inherit',
      shell: process.platform === 'win32'
    });
  if (install.error) throw install.error;
  if (install.status !== 0) process.exit(install.status ?? 1);

  const pnpmBinary = join(binDirectory, 'node_modules', '.bin', command);
  if (process.platform !== 'win32') await chmod(pnpmBinary, 0o755);
  process.env.PATH = `${join(binDirectory, 'node_modules', '.bin')}${delimiter}${process.env.PATH ?? ''}`;
  return async () => rm(binDirectory, { recursive: true, force: true });
}

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

const cleanupPnpm = await ensurePnpm();
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
await cleanupPnpm?.();
