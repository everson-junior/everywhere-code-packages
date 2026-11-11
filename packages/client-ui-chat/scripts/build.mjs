import { build } from 'esbuild'
import { copyFile, readFile, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'

const root = fileURLToPath(new URL('../', import.meta.url))
const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
await rm(new URL('../lib', import.meta.url), { recursive: true, force: true })
const require = createRequire(import.meta.url)
execFileSync(process.execPath, [require.resolve('typescript/bin/tsc'), '-p', root], { stdio: 'inherit' })

function clientWrapper(id) {
  return {
    banner: { js: `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, factory: function(require) { const module = { exports: {} }; const exports = module.exports;` },
    footer: { js: 'return module.exports; } });' },
  }
}

await build({
  absWorkingDir: root,
  entryPoints: ['src/index.ts'],
  outfile: 'lib/index.js',
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node24',
})
await build({
  absWorkingDir: root,
  entryPoints: ['src/client/index.ts'],
  outfile: 'lib/client.js',
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2024',
  jsx: 'automatic',
  loader: { '.css': 'text' },
  external: ['react', 'react/jsx-runtime', '@deepseek-ai/cordis'],
  ...clientWrapper(manifest.name),
})
await build({
  absWorkingDir: root,
  entryPoints: ['src/client/totvs-entry.ts'],
  outfile: '../client-ui-chat-totvs/client.js',
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2024',
  jsx: 'automatic',
  loader: { '.css': 'text' },
  external: ['react', 'react/jsx-runtime', '@deepseek-ai/cordis'],
  ...clientWrapper('@everywhere-harness/client-ui-chat-totvs'),
})
await copyFile(new URL('../lib/types/totvs.d.ts', import.meta.url), new URL('../../client-ui-chat-totvs/index.d.ts', import.meta.url))
await copyFile(new URL('../lib/types/client/totvs-entry.d.ts', import.meta.url), new URL('../../client-ui-chat-totvs/client.d.ts', import.meta.url))