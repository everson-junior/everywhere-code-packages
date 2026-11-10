#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const entry = require.resolve('@deepseek-ai/dsh/lib/bin.js')
const result = spawnSync(process.execPath, [entry, ...process.argv.slice(2)], { stdio: 'inherit' })

if (result.error !== undefined) throw result.error
if (result.signal !== null) process.kill(process.pid, result.signal)
process.exit(result.status ?? 1)
