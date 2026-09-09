import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'

const root = process.cwd()
const out = path.join(root, 'docs/implementation/ui-audit-fixes')
const kit = '/Users/x/Desktop/Project/dsh-plugin/personal/dsh-ui-kit/.worktrees/ui-audit-fixes'
const sha = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
const delivery = JSON.parse(fs.readFileSync(path.join(out, 'repair/delivery.json')))
const binding = JSON.parse(fs.readFileSync(path.join(out, 'binding.json')))
assert.equal(git(root, 'rev-parse', 'HEAD'), delivery.productHead)
assert.equal(git(kit, 'rev-parse', 'HEAD'), delivery.kitHead)
assert.equal(git(kit, 'status', '--porcelain'), '')
for (const [name, expected, cwd] of [
  ['product-fix.bundle', delivery.productBundleSha256, root],
  ['kit-fix.bundle', delivery.kitBundleSha256, kit],
]) {
  const file = path.join(out, 'repair', name)
  assert.equal(sha(file), expected)
  execFileSync('git', ['bundle', 'verify', file], { cwd, stdio: 'pipe' })
  const heads = execFileSync('git', ['bundle', 'list-heads', file], { cwd, encoding: 'utf8' })
  assert.ok(heads.includes(cwd === kit ? delivery.kitHead : delivery.productHead))
}
const protectedFiles = JSON.parse(fs.readFileSync(path.join(out, 'repair/protected-qa-sha256.json')))
for (const [name, expected] of Object.entries(protectedFiles)) assert.equal(sha(path.join(name.startsWith('scripts/') ? root : out, name)), expected)
const rebuild = path.join(out, 'qa-round2/kit-rebuild')
execFileSync(path.join(kit, 'node_modules/.bin/tsdown'), ['--out-dir', rebuild], { cwd: kit, stdio: 'pipe' })
assert.equal(sha(path.join(rebuild, 'index.js')), binding.kitLibSha256)
assert.equal(sha(path.join(rebuild, 'index.d.ts')), sha(path.join(kit, 'lib/index.d.ts')))
for (const name of ['index.js.map', 'index.d.ts.map']) {
  const actual = JSON.parse(fs.readFileSync(path.join(rebuild, name)))
  const expected = JSON.parse(fs.readFileSync(path.join(kit, 'lib', name)))
  assert.deepEqual(actual.sourcesContent, expected.sourcesContent)
  assert.equal(actual.mappings, expected.mappings)
}
const environment = []
for (const profile of ['/Users/x/.omnimux-dev/profiles/omnimux', '/Users/x/.dsh-dev/tasks/ui-audit-qa-0909/profiles/omnimux-dev-ui-audit-qa-0909']) {
  const pkg = JSON.parse(fs.readFileSync(path.join(profile, 'package.json')))
  const viewer = path.join(profile, '.materialize-snapshots/plugins/@crosery/dsh-viewer/lib/index.js')
  const installed = path.join(profile, 'node_modules/@crosery/dsh-viewer/lib/index.js')
  const text = fs.readFileSync(viewer, 'utf8')
  environment.push({ profile, viewerDependency: pkg.dependencies['@crosery/dsh-viewer'], viewerSha: sha(viewer), installedViewerSha: sha(installed), importsInstallSettingsSection: /import[^;]*\binstallSettingsSection\b[^;]*from\s*["']@deepseek-ai\/dsh-settings["']/.test(text), kitSha: sha(path.join(profile, '.materialize-snapshots/plugins/dsh-ui-kit/lib/index.js')) })
}
const official = '/Users/x/Desktop/Project/Github/deepseek-harness'
const settings = path.join(official, 'packages/settings/settings/lib/index.js')
const settingsText = fs.readFileSync(settings, 'utf8')
const exports = [...settingsText.matchAll(/export\s*\{([^}]+)\}/g)].map(match => match[1])
const result = { productHead: delivery.productHead, kitHead: delivery.kitHead, protectedQaUnchanged: true, gitBundlesVerified: true, kitRebuildMatches: true, environment, officialHead: git(official, 'rev-parse', 'HEAD'), settingsSha: sha(settings), settingsExports: exports, l2EnvExists: fs.existsSync(path.join(root, '.l2-dev.env')) }
fs.writeFileSync(path.join(out, 'qa-round2/identity-environment.json'), JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify(result, null, 2))
