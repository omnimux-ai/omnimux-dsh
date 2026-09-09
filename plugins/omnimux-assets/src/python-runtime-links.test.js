import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const source = fileURLToPath(new URL('.', import.meta.url))
const sha = (value) => createHash('sha256').update(value).digest('hex')
const supported = process.platform === 'darwin' && ['arm64', 'x64'].includes(process.arch)

async function verify(t, { link = 'a-target', kind = 'copy', bytes = 'python', targetKind = 'file' } = {}) {
  const plugin = mkdtempSync(join(source, '.private-links-'))
  t.after(() => rmSync(plugin, { recursive: true, force: true }))
  mkdirSync(join(plugin, 'src'))
  for (const name of ['python-runtime.js', 'storage-types.js']) copyFileSync(join(source, name), join(plugin, 'src', name))
  writeFileSync(join(plugin, 'package.json'), '{"type":"module"}')
  const root = join(plugin, 'runtime', 'payload')
  mkdirSync(root, { recursive: true })
  const entries = [{ path: 'a-target', bytes: 6, sha256: sha('python') }, { path: 'z-link', link }]
  writeFileSync(join(root, 'a-target'), 'python', { mode: 0o755 })
  if (targetKind === 'link') {
    entries.push({ path: 'chain', link: 'a-target' })
    symlinkSync('a-target', join(root, 'chain'))
  }
  if (targetKind === 'directory') {
    entries.push({ path: 'directory' })
    mkdirSync(join(root, 'directory'))
  }
  if (kind === 'copy') writeFileSync(join(root, 'z-link'), bytes)
  else if (kind === 'link') symlinkSync(link, join(root, 'z-link'))
  else if (kind === 'directory') mkdirSync(join(root, 'z-link'))
  writeFileSync(join(dirname(root), `${process.arch}-integrity.json`), JSON.stringify({ arch: process.arch, archiveSha256: 'fixed', entries }))
  writeFileSync(join(dirname(root), 'python-supply.json'), JSON.stringify({ version: '3.13.15', release: '20260807', executionFlags: ['-I', '-S', '-B', '-u'], artifacts: [{ platform: process.platform, arch: process.arch, directory: 'payload', executable: 'a-target', executableSha256: sha('python'), sha256: 'fixed' }] }))
  const module = await import(pathToFileURL(join(plugin, 'src/python-runtime.js')))
  return module.privatePythonRuntime()
}

for (const kind of ['copy', 'link', 'omitted']) test(`listed runtime link supports ${kind} after target was visited`, { skip: !supported }, async (t) => {
  assert.ok((await verify(t, { kind })).executable.endsWith('/a-target'))
})
for (const [name, options] of [
  ['changed digest', { bytes: 'Python' }],
  ['changed size', { bytes: 'python!' }],
  ['outside target', { link: '../outside' }],
  ['absolute target', { link: '/tmp/outside' }],
  ['unknown target', { link: 'unknown' }],
  ['chained target', { link: 'chain', targetKind: 'link' }],
  ['directory target', { link: 'directory', targetKind: 'directory' }],
  ['directory substituted for link', { kind: 'directory' }],
]) test(`listed runtime link rejects ${name}`, { skip: !supported }, async (t) => {
  await assert.rejects(verify(t, options), /private filesystem runtime unavailable/)
})
