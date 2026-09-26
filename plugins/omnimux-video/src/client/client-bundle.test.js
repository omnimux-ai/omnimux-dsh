import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { createContext, runInContext } from 'node:vm'

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '../..')
const clientPath = join(pluginRoot, 'lib/client.js')

test('build writes a classic-script ModuleLoader bundle for omnimux-video', () => {
  const built = spawnSync(process.execPath, ['scripts/build-client.mjs'], {
    cwd: pluginRoot,
    encoding: 'utf8',
  })
  assert.equal(built.status, 0, built.stderr || built.stdout)

  const client = readFileSync(clientPath, 'utf8')
  assert.match(client, /^window\.__ModuleLoader__\.load\(\{/)
  assert.match(client, /id: "omnimux-video"/)
  assert.match(client, /return module\.exports/)
  assert.doesNotMatch(client, /require\(["']\.\//)
  assert.doesNotMatch(client, /require\(["']\.\.\//)
  assert.match(client, /require\(["']react["']\)/)
  assert.doesNotMatch(client, /\bimport\s+/)

  const registered = []
  const sandbox = {
    window: { __ModuleLoader__: { load(registration) { registered.push(registration) } } },
    console,
  }
  runInContext(client, createContext(sandbox), { filename: clientPath })
  assert.equal(registered.length, 1)
  assert.equal(registered[0].id, 'omnimux-video')
  assert.equal(typeof registered[0].factory, 'function')

  const react = { createElement: (...args) => ({ args }) }
  const exports = registered[0].factory((spec) => {
    if (spec === 'react' || spec === 'react/jsx-runtime') return react
    throw new Error(`unexpected require ${spec}`)
  })
  assert.equal(exports.name, 'omnimux-video')
  assert.equal(typeof exports.apply, 'function')
})
