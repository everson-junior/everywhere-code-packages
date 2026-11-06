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
