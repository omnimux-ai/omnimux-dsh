import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, readdirSync, readlinkSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { AssetsError } from './storage-types.js'

const PLUGIN_ROOT = fileURLToPath(new URL('../', import.meta.url))
const FLAGS = Object.freeze(['-I', '-S', '-B', '-u'])
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
const denied = (message) => new AssetsError('storage-platform-unsupported', message)

/** Verify installation ownership, modes and every shipped Python file before execution. */
function resolvePrivateRuntime() {
  if (process.platform !== 'darwin' || !['arm64', 'x64'].includes(process.arch)) throw denied('private filesystem runtime supports macOS arm64/x64 only')
  const manifest = JSON.parse(readFileSync(join(PLUGIN_ROOT, 'runtime/python-supply.json'), 'utf8'))
  const artifact = manifest.artifacts.find((row) => row.platform === process.platform && row.arch === process.arch)
  if (manifest.version !== '3.13.15' || manifest.release !== '20260807' || !artifact || JSON.stringify(manifest.executionFlags) !== JSON.stringify(FLAGS)) throw denied('invalid fixed Python supply manifest')
  const root = join(PLUGIN_ROOT, 'runtime', artifact.directory)
  const executable = join(root, artifact.executable)
  if (!isAbsolute(executable) || !executable.startsWith(`${PLUGIN_ROOT}runtime${sep}`)) throw denied('invalid private executable path')
  const trusted = (path) => {
    const info = lstatSync(path)
    if (info.isSymbolicLink() || ![0, process.getuid()].includes(info.uid) || (info.mode & 0o6022)) throw denied('untrusted private runtime installation permissions')
    return info
  }
  for (let path = root; ; path = dirname(path)) {
    const info = lstatSync(path)
    // Root-owned sticky temporary ancestors cannot replace this user's child directory.
    if (!(info.uid === 0 && info.isDirectory() && (info.mode & 0o1000))) trusted(path)
    if (dirname(path) === path) break
  }
  const inventoryPath = join(PLUGIN_ROOT, 'runtime', `${process.arch}-integrity.json`)
  trusted(inventoryPath)
  const inventory = JSON.parse(readFileSync(inventoryPath, 'utf8'))
  if (inventory.arch !== process.arch || inventory.archiveSha256 !== artifact.sha256) throw denied('Python inventory does not match supply')
  const expected = new Map(inventory.entries.map((entry) => [entry.path, entry]))
  const visit = (directory) => {
    for (const name of readdirSync(directory)) {
      const path = join(directory, name)
      const rel = relative(root, path).split(sep).join('/')
      const info = lstatSync(path)
      const entry = expected.get(rel)
      if (!entry) throw denied('unlisted Python payload')
      expected.delete(rel)
      if (info.isDirectory()) { trusted(path); visit(path); continue }
      if (info.isSymbolicLink()) {
        if (readlinkSync(path) !== entry.link || !realpathSync(path).startsWith(`${root}${sep}`)) throw denied('unsafe Python payload link')
      } else {
        trusted(path)
        if (!info.isFile() || info.size !== entry.bytes || hash(readFileSync(path)) !== entry.sha256) throw denied('Python payload digest mismatch')
      }
    }
  }
  visit(root)
  // npm omits symlinks, empty directories and explicitly excluded bytecode caches.
  // None is used by the fixed python3.13 + -I -S -B helper invocation.
  const missingRequired = [...expected.values()].some((entry) => entry.bytes !== undefined && !entry.path.includes('/__pycache__/') && !entry.path.endsWith('.pyc'))
  if (missingRequired || hash(readFileSync(executable)) !== artifact.executableSha256) throw denied('incomplete private Python supply')
  const info = trusted(executable)
  if (!(info.mode & 0o100)) throw denied('private Python is not executable')
  return Object.freeze({ executable, executableSha256: artifact.executableSha256,
    args: Object.freeze([...FLAGS, fileURLToPath(new URL('./storage-fs.py', import.meta.url))]),
    env: Object.freeze({ LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' }),
    identity: Object.freeze({ dev: info.dev, ino: info.ino, size: info.size, mtimeMs: info.mtimeMs, ctimeMs: info.ctimeMs }) })
}

// This captures one immutable installation identity, never a configurable global path.
const PRIVATE_RUNTIME = (() => {
  try { return { value: resolvePrivateRuntime() } }
  catch (error) { return { error: denied(`private filesystem runtime unavailable: ${error.message}`) } }
})()

export function privatePythonRuntime() {
  if (PRIVATE_RUNTIME.error) throw PRIVATE_RUNTIME.error
  return PRIVATE_RUNTIME.value
}

/** Recheck the frozen executable identity before each sync or async spawn. */
export function verifyPythonRuntime(runtime) {
  if (runtime !== privatePythonRuntime()) throw denied('unverified filesystem runtime identity')
  const info = lstatSync(runtime.executable)
  if (!info.isFile() || Object.entries(runtime.identity).some(([key, value]) => info[key] !== value)) throw denied('private filesystem executable changed; restart and verify installation')
  return runtime
}
