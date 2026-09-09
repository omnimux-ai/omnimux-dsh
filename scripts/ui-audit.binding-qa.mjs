import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawnSync, execFileSync } from 'node:child_process'

const root = process.cwd()
const out = path.join(root, 'docs/implementation/ui-audit-fixes')
const kit = '/Users/x/Desktop/Project/dsh-plugin/personal/dsh-ui-kit/.worktrees/ui-audit-fixes'
const binding = JSON.parse(fs.readFileSync(path.join(out, 'binding.json')))
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const hash = file => sha(fs.readFileSync(file))
const results = []
function record(name, detail) { results.push({ name, ...detail }); console.log(name, JSON.stringify(detail)) }
assert.equal(hash(path.join(kit, 'lib/index.js')), binding.kitLibSha256)
assert.equal(hash(path.join(out, 'dsh-ui-kit-0.1.0.tgz')), binding.kitTarSha256)
assert.equal(fs.realpathSync('node_modules/dsh-ui-kit'), kit)
for (const [name, expected] of Object.entries(binding.bundles)) {
  assert.equal(hash(`plugins/${name}/lib/client.js`), expected.sha256)
  assert.equal(fs.statSync(`plugins/${name}/lib/client.js`).size, expected.bytes)
  // Execute the checked-in build entry unchanged except redirect its final output
  // into this task's QA evidence directory; no implementation/lib is overwritten.
  const original = fs.readFileSync(`plugins/${name}/scripts/build-client.mjs`, 'utf8')
  const target = path.join(out, `qa-rebuild-${name}.js`)
  const source = original.replace("const root = join(dirname(fileURLToPath(import.meta.url)), '..')", `const root = ${JSON.stringify(path.join(root, 'plugins', name))}`).replace("const outFile = join(root, 'lib', 'client.js')", `const outFile = ${JSON.stringify(target)}`)
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', source], { cwd: root, encoding: 'utf8' })
  record(name, { exit: run.status, rebuiltSha: run.status === 0 ? hash(target) : null, expectedSha: expected.sha256, output: run.stdout + run.stderr })
  assert.equal(run.status, 0)
  assert.equal(hash(target), expected.sha256)
}
const entries = execFileSync('/usr/bin/tar', ['-tzf', path.join(out, 'dsh-ui-kit-0.1.0.tgz')], { encoding: 'utf8' }).trim().split('\n')
let checked = 0
for (const entry of entries) {
  if (entry.endsWith('/')) continue
  assert.ok(entry.startsWith('package/') && !entry.split('/').includes('..'))
  const relative = entry.slice(8)
  const bytes = execFileSync('/usr/bin/tar', ['-xOzf', path.join(out, 'dsh-ui-kit-0.1.0.tgz'), entry], { maxBuffer: 32 * 1024 * 1024 })
  assert.equal(sha(bytes), hash(path.join(kit, relative)), relative)
  checked++
}
record('kit archive payload equals fixed checkout', { files: checked, sha256: binding.kitTarSha256 })
const map = JSON.parse(fs.readFileSync(path.join(kit, 'lib/index.js.map')))
let mapped = 0
for (let i = 0; i < map.sources.length; i++) {
  const file = path.resolve(kit, 'lib', map.sources[i])
  if (!fs.existsSync(file) || !file.startsWith(kit + '/src/')) continue
  assert.equal(map.sourcesContent[i], fs.readFileSync(file, 'utf8'), file)
  mapped++
}
record('kit sourcemap source consistency', { files: mapped })
fs.writeFileSync(path.join(out, 'qa-binding-result.json'), JSON.stringify(results, null, 2) + '\n')
