import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = fileURLToPath(new URL('../', import.meta.url))
const sourceManifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'))
const temporaryRoot = await mkdtemp(join(tmpdir(), 'client-ui-chat-pack-'))
const environment = { ...process.env }
delete environment.NODE_PATH
delete environment.NODE_OPTIONS

function npm(args, cwd) {
  const command = process.platform === 'win32' ? process.execPath : 'npm'
  const commandArgs = process.platform === 'win32'
    ? [join(dirname(execFileSync(join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'where.exe'), ['npm.cmd'], { encoding: 'utf8' }).trim().split(/\r?\n/)[0]), 'node_modules/npm/bin/npm-cli.js'), ...args]
    : args
  return execFileSync(command, commandArgs, {
    cwd,
    env: environment,
    stdio: 'inherit',
  })
}

try {
  const packDirectory = process.env.PACK_DIRECTORY
    ? resolve(process.env.PACK_DIRECTORY)
    : join(temporaryRoot, 'pack')
  if (!process.env.PACK_DIRECTORY) {
    await mkdir(packDirectory)
    npm(['pack', '--pack-destination', packDirectory], packageRoot)
  }
  const archives = (await readdir(packDirectory)).filter(name => /^everywhere-harness-client-ui-chat-\d.*\.tgz$/.test(name))
  assert.equal(archives.length, 1, 'PACK_DIRECTORY must contain exactly one client-ui-chat tarball')
  const archive = join(packDirectory, archives[0])
  const tarCommand = process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar'
  const files = execFileSync(tarCommand, ['-tzf', archive], { encoding: 'utf8' }).trim().split(/\r?\n/)
  for (const file of files) {
    assert.ok(/^package\/(?:package\.json|cordis\.patch\.yml|README\.md|LICENSE|lib(?:\/.*)?)$/.test(file), `Unexpected packed file: ${file}`)
    assert.ok(!file.split('/').includes('..'), `Unsafe packed path: ${file}`)
    assert.ok(!file.includes('/node_modules/'), `Bundled node_modules: ${file}`)
  }
  const manifest = JSON.parse(execFileSync(tarCommand, ['-xOzf', archive, 'package/package.json'], { encoding: 'utf8' }))
  const expectedManifest = structuredClone(sourceManifest)
  if (expectedManifest.dependencies?.['@everywhere-harness/client-ui-chat-totvs']?.startsWith('workspace:')) {
    expectedManifest.dependencies['@everywhere-harness/client-ui-chat-totvs'] = expectedManifest.dependencies['@everywhere-harness/client-ui-chat-totvs'].slice('workspace:'.length)
  }
  assert.equal(manifest.name, sourceManifest.name)
  assert.equal(manifest.version, sourceManifest.version)
  assert.equal(manifest.type, 'module')
  assert.deepEqual(manifest.exports, expectedManifest.exports)
  assert.deepEqual(manifest.dsh, expectedManifest.dsh)
  assert.deepEqual(manifest.dependencies, expectedManifest.dependencies)
  assert.deepEqual(manifest.peerDependencies, expectedManifest.peerDependencies)
  assert.ok(!manifest.private, 'Packed package must not be private')
  assert.ok(!manifest.bundleDependencies && !manifest.bundledDependencies, 'Dependencies must not be bundled')
  for (const section of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    for (const [name, version] of Object.entries(manifest[section] ?? {})) {
      assert.ok(!/^(?:workspace:|file:|link:|portal:|[./\\]|[a-z]:[\\/])/i.test(version), `Local dependency: ${name}=${version}`)
    }
  }
  function checkExports(value) {
    if (typeof value === 'string') {
      assert.ok(value.startsWith('./') && !value.split('/').includes('..'), `Invalid export: ${value}`)
      if (value.includes('*')) {
        const [prefix, suffix] = value.slice(2).split('*')
        assert.ok(files.some(file => file.startsWith(`package/${prefix}`) && file.endsWith(suffix)), `Missing packed export pattern: ${value}`)
      } else {
        assert.ok(files.includes(`package/${value.slice(2)}`), `Missing packed export: ${value}`)
      }
    } else {
      for (const entry of Object.values(value)) checkExports(entry)
    }
  }
  checkExports(manifest.exports)
  for (const required of ['lib/index.js', 'lib/client.js', 'lib/types/index.d.ts', 'lib/types/client/index.d.ts', 'cordis.patch.yml', 'README.md', 'LICENSE']) {
    assert.ok(files.includes(`package/${required}`), `Missing packed file: ${required}`)
  }

  const providedHelperArchives = (await readdir(packDirectory)).filter(name => /^everywhere-harness-client-ui-chat-totvs-\d.*\.tgz$/.test(name))
  let helperArchive
  if (providedHelperArchives.length > 0) {
    assert.equal(providedHelperArchives.length, 1, 'PACK_DIRECTORY must contain at most one helper tarball')
    helperArchive = join(packDirectory, providedHelperArchives[0])
  } else {
    const helperPackDirectory = join(temporaryRoot, 'helper-pack')
    await mkdir(helperPackDirectory)
    npm(['pack', '--pack-destination', helperPackDirectory], resolve(packageRoot, '../client-ui-chat-totvs'))
    const helperArchives = (await readdir(helperPackDirectory)).filter(name => name.endsWith('.tgz'))
    assert.equal(helperArchives.length, 1, 'helper pack must contain exactly one tarball')
    helperArchive = join(helperPackDirectory, helperArchives[0])
  }

  const installDirectory = join(temporaryRoot, 'consumer')
  await mkdir(installDirectory)
  await writeFile(join(installDirectory, 'package.json'), JSON.stringify({ private: true, type: 'module' }))
  npm(['install', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false', helperArchive, archive, `react@${sourceManifest.devDependencies.react}`], installDirectory)
  execFileSync(process.execPath, ['--input-type=module', '--eval', `
    import assert from 'node:assert/strict'
    import { readFile, realpath } from 'node:fs/promises'
    import { createRequire } from 'node:module'
    import { isAbsolute, relative, resolve, sep } from 'node:path'
    import { pathToFileURL } from 'node:url'
    import { runInNewContext } from 'node:vm'

    const require = createRequire(resolve('package.json'))
    async function installed(name) {
      const path = await realpath(require.resolve(name))
      const location = relative(await realpath('node_modules'), path)
      assert.ok(!isAbsolute(location) && location !== '..' && !location.startsWith('..' + sep), 'Dependency resolved outside isolated node_modules: ' + name)
      return path
    }
    const host = await import(pathToFileURL(await installed(${JSON.stringify(manifest.name)})).href)
    assert.equal(typeof host.apply, 'function')
    host.apply()
    const code = await readFile(await installed(${JSON.stringify(`${manifest.name}/client`)}), 'utf8')
    const registrations = []
    runInNewContext(code, { window: { __ModuleLoader__: { load: entry => registrations.push(entry) } } })
    assert.equal(registrations.length, 1)
    assert.equal(registrations[0].id, ${JSON.stringify(manifest.name)})
    assert.equal(typeof registrations[0].factory, 'function')
    const shared = new Map()
    for (const name of ['react', 'react/jsx-runtime', '@deepseek-ai/cordis']) {
      await installed(name)
      shared.set(name, require(name))
    }
    const requested = []
    const client = registrations[0].factory(name => {
      assert.ok(shared.has(name), 'Unexpected shared dependency: ' + name)
      requested.push(name)
      return shared.get(name)
    })
    assert.equal(typeof client.apply, 'function')
    assert.deepEqual(Array.from(client.inject), ['slots'])
    assert.ok(requested.includes('react'), 'Client must request installed shared React')
    const totvsName = '@everywhere-harness/client-ui-chat-totvs'
    const totvsEntry = await installed(totvsName)
    const totvsHost = await import(pathToFileURL(totvsEntry).href)
    assert.equal(typeof totvsHost.apply, 'function')
    const totvsCode = await readFile(await installed(totvsName + '/client'), 'utf8')
    const totvsRegistrations = []
    runInNewContext(totvsCode, { window: { __ModuleLoader__: { load: entry => totvsRegistrations.push(entry) } } })
    assert.equal(totvsRegistrations.length, 1)
    assert.equal(totvsRegistrations[0].id, totvsName)
    assert.equal(typeof totvsRegistrations[0].factory(name => shared.get(name)).apply, 'function')
    console.log('Packed host imports and installed shared-module client factories passed')
  `], { cwd: installDirectory, env: environment, stdio: 'inherit' })
  console.log(`Packed-install smoke passed: ${manifest.name}@${manifest.version}`)
} finally {
  await rm(temporaryRoot, { recursive: true, force: true })
}