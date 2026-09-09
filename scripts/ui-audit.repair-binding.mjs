import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'

const root = process.cwd()
const out = path.join(root, 'docs/implementation/ui-audit-fixes')
const kit = fs.realpathSync(path.join(root, 'node_modules/dsh-ui-kit'))
const sha = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const bindingPath = path.join(out, 'binding.json')
const binding = JSON.parse(fs.readFileSync(bindingPath, 'utf8'))
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()
assert.equal(git('-C', kit, 'status', '--porcelain'), '', 'fixed kit must be clean')
binding.productSourceCommit = '7f0dee48eeba47393fd5ddd60caab79014c96bed'
binding.kitHead = git('-C', kit, 'rev-parse', 'HEAD')
binding.kitSourceBuildCommit = binding.kitHead
binding.kitLibSha256 = sha(path.join(kit, 'lib/index.js'))
binding.kitTarPath = 'docs/implementation/ui-audit-fixes/repair/dsh-ui-kit-0.1.0.tgz'
binding.kitTarSha256 = sha(path.join(root, binding.kitTarPath))
binding.dependencyRealpath = kit
for (const [name, item] of Object.entries(binding.bundles)) {
  const file = path.join(root, 'plugins', name, 'lib/client.js')
  item.sha256 = sha(file)
  item.bytes = fs.statSync(file).size
  item.containsKitSource = fs.readFileSync(file, 'utf8').includes('dshUk-PageHeader-pageHeader')
  assert.equal(item.containsKitSource, true)
}
fs.writeFileSync(bindingPath, JSON.stringify(binding, null, 2) + '\n')
// Preserve the independent QA script and all its original output. Redirect only
// the artifact paths when executing that same verification against this repair.
const original = fs.readFileSync(path.join(root, 'scripts/ui-audit.binding-qa.mjs'), 'utf8')
const redirected = original
  .replaceAll("path.join(out, 'dsh-ui-kit-0.1.0.tgz')", "path.join(out, 'repair/dsh-ui-kit-0.1.0.tgz')")
  .replace('`qa-rebuild-${name}.js`', '`repair/rebuild-${name}.js`')
  .replace("'qa-binding-result.json'", "'repair/binding-result.json'")
const result = spawnSync(process.execPath, ['--input-type=module', '-e', redirected], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
process.stdout.write(result.stdout)
process.stderr.write(result.stderr)
assert.equal(result.status, 0, 'independent binding verification')
const protectedFiles = ['QA-REPORT.md', 'qa-binding-result.json']
const protectedHashes = Object.fromEntries(protectedFiles.map(name => [name, sha(path.join(out, name))]))
for (const name of ['ui-audit.independent.test.mjs', 'ui-audit.binding-qa.mjs']) protectedHashes[`scripts/${name}`] = sha(path.join(root, 'scripts', name))
fs.writeFileSync(path.join(out, 'repair/protected-qa-sha256.json'), JSON.stringify(protectedHashes, null, 2) + '\n')
console.log(JSON.stringify(binding, null, 2))
