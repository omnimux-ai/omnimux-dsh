/**
 * Native file/folder chooser for the workbench's "add" flow.
 *
 * macOS uses AppleScript `choose file` / `choose folder` (user-driven system
 * dialog, no Automation permission needed). Other platforms answer
 * `picker-unsupported` for now — no silent fallback to typing paths.
 *
 * File picks allow multiple selections. Folder picks also allow multiple
 * folders; each folder is stored as one path ref (never flattened).
 *
 * The runner is injectable for deterministic tests.
 */
import { spawn } from 'node:child_process'

const PROMPTS = {
  file: '选择要添加的文件',
  directory: '选择要添加的文件夹',
}

/**
 * @param {'file' | 'directory'} kind
 */
function pickScript(kind) {
  const prompt = PROMPTS[kind]
  const choose = kind === 'file' ? 'file' : 'folder'
  return [
    `set theItems to choose ${choose} with prompt "${prompt}" with multiple selections allowed`,
    'set posixPaths to ""',
    'repeat with theItem in theItems',
    'set posixPaths to posixPaths & POSIX path of theItem & linefeed',
    'end repeat',
    'return posixPaths',
  ].join('\n')
}

/**
 * Split osascript POSIX-path output into absolute paths.
 * @param {string} stdout
 * @returns {string[]}
 */
export function parsePickedPaths(stdout) {
  const text = typeof stdout === 'string' ? stdout : ''
  const paths = []
  for (const line of text.split(/\r?\n/)) {
    const path = line.replace(/\s+$/, '')
    if (path === '') continue
    paths.push(path)
  }
  return paths
}

/**
 * @param {'file' | 'directory'} kind
 * @param {{ platform?: NodeJS.Platform, run?: typeof runCommand }} [deps]
 * @returns {Promise<{ path: string | null, paths: string[] }>} path=null means user cancelled.
 */
export async function pickNativePath(kind, deps = {}) {
  if (kind !== 'file' && kind !== 'directory') {
    throw new PickerError('picker-invalid-kind', `unknown pick kind: ${String(kind)}`)
  }
  const platform = deps.platform ?? process.platform
  if (platform !== 'darwin') {
    throw new PickerError('picker-unsupported', `native picker not supported on ${platform}`)
  }
  const run = deps.run ?? runCommand
  const script = pickScript(kind)
  try {
    const { stdout } = await run('osascript', ['-e', script])
    const paths = parsePickedPaths(stdout)
    return { path: paths[0] ?? null, paths }
  } catch (error) {
    if (isUserCancel(error)) return { path: null, paths: [] }
    throw new PickerError('picker-failed', messageOf(error))
  }
}

export class PickerError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message)
    this.name = 'PickerError'
    this.code = code
  }
}

/**
 * @param {unknown} error
 */
function isUserCancel(error) {
  const text = messageOf(error)
  return /User canceled|-128/i.test(text)
}

/**
 * @param {unknown} error
 */
function messageOf(error) {
  if (error instanceof Error) return `${error.message} ${(error.stderr ?? '')}`
  return String(error)
}

/**
 * Default command runner: spawn with an argv array (no shell, no injection).
 * @param {string} command
 * @param {string[]} argv
 * @returns {Promise<{ stdout: string, stderr: string }>}
 */
function runCommand(command, argv) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, argv, { stdio: ['ignore', 'pipe', 'pipe'] })
    const stdoutChunks = []
    const stderrChunks = []
    child.stdout.on('data', (chunk) => stdoutChunks.push(chunk))
    child.stderr.on('data', (chunk) => stderrChunks.push(chunk))
    child.on('error', rejectPromise)
    child.on('close', (code) => {
      const stdout = Buffer.concat(stdoutChunks).toString('utf8')
      const stderr = Buffer.concat(stderrChunks).toString('utf8')
      if (code === 0) {
        resolvePromise({ stdout, stderr })
        return
      }
      const error = new Error(`${command} exited with code ${code}`)
      error.code = code
      error.stderr = stderr
      rejectPromise(error)
    })
  })
}
