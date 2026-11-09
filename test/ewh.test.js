import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

test('launcher delegates to the official DeepSeek Harness CLI', async () => {
  const source = await readFile(new URL('../bin/ewh.js', import.meta.url), 'utf8')

  assert.match(source, /^#!\/usr\/bin\/env node/u)
  assert.match(source, /require\.resolve\('@deepseek-ai\/dsh\/lib\/bin\.js'\)/u)
  assert.match(source, /process\.argv\.slice\(2\)/u)
  assert.match(source, /stdio: 'inherit'/u)
})

test('launcher embeds no plugins or presets', async () => {
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

  assert.deepEqual(manifest.dependencies, { '@deepseek-ai/dsh': '0.2.1-rc.5' })
})

test('postinstall is included and configures the web profile plugins', async () => {
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  const source = await readFile(new URL('../bin/postinstall.js', import.meta.url), 'utf8')

  assert.equal(manifest.scripts.postinstall, 'node bin/postinstall.js')
  assert.ok(manifest.files.includes('bin/postinstall.js'))
  assert.match(source, /'@everywhere-harness\/plugin-providers@latest'/u)
  assert.match(source, /'@everywhere-harness\/client-ui-chat@latest'/u)
  assert.doesNotMatch(source, /@deepseek-ai\/dsh-experimental-plugin-market-bundle/u)
  assert.doesNotMatch(source, /plugin-market/u)
  assert.match(source, /'--profile',\n  'web',\n  'add'/u)
  assert.match(source, /enableWebBundles/u)
  assert.match(source, /ensurePnpm/u)
  assert.match(source, /pnpm@12\.18\.0/u)
})

test('package version is ready for the next release', async () => {
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  const lockfile = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'))

  assert.equal(manifest.version, '0.2.16')
  assert.equal(lockfile.version, manifest.version)
  assert.equal(lockfile.packages[''].version, manifest.version)
})
