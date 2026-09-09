import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../../plugins/omnimux-assets/', import.meta.url))
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const pack = JSON.parse(readFileSync(join(root, '.final-pack.json'), 'utf8'))[0]
const archive = join(root, pack.filename)
const listing = spawnSync('/usr/bin/tar', ['-tzf', archive], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 })
assert.equal(listing.status, 0, listing.stderr)
const paths = listing.stdout.trim().split('\n')
assert.ok(paths.every(path => path.startsWith('package/') && !path.split('/').includes('..')))
assert.equal(new Set(paths).size, paths.length)
assert.ok(paths.every(path => !/__pycache__|\.pyc$|\.test\.|runtime\/(archives|evidence)\/|\.package-cache|storage-pressure/.test(path)))
const listed = new Set(paths.map(path => path.slice('package/'.length)))
const temp = mkdtempSync(join(root, '.package-verify-current-'))
try {
  const extracted = spawnSync('/usr/bin/tar', ['-xzf', archive, '-C', temp], { encoding: 'utf8' })
  assert.equal(extracted.status, 0, extracted.stderr)
  const required = ['package.json', 'dsh.manifest.json', 'lib/client.js', 'scripts/build-client.mjs', 'cordis.patch.yml', 'README.md']
  function visit(directory, prefix) {
    for (const name of readdirSync(directory)) {
      const path = join(directory, name)
      const relative = `${prefix}/${name}`
      if (lstatSync(path).isDirectory()) visit(path, relative)
      else if (!/\.test\.js$|storage-pressure\.mjs$|\/(\.storage-|\.private-)/.test(relative)) required.push(relative)
    }
  }
  visit(join(root, 'src'), 'src')
  for (const path of required) {
    assert.ok(listed.has(path), `missing current source: ${path}`)
    assert.equal(sha(readFileSync(join(temp, 'package', path))), sha(readFileSync(join(root, path))), path)
  }
  console.log(JSON.stringify({ filename: pack.filename, sha256: sha(readFileSync(archive)), bytes: lstatSync(archive).size, currentSourceFilesVerified: required.length, archiveEntries: paths.length, exclusions: 'PASS', currentSource: 'PASS' }, null, 2))
} finally {
  rmSync(temp, { recursive: true, force: true })
}
