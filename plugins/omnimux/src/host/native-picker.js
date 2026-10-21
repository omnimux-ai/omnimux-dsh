/**
 * Neutral native file/folder picker seam (`nativeFilePicker`).
 *
 * macOS drives an AppKit `NSOpenPanel` through JavaScript for Automation
 * (`osascript -l JavaScript`). The panel is owned by the helper process and the
 * app runs as an accessory, so the chooser needs no Automation (Apple Events)
 * permission and shows no temporary Dock icon. `tell application "System
 * Events"` used to require `kTCCServiceAppleEvents`, which ad-hoc signed builds
 * can never be granted — every import then failed with `picker-failed`.
 *
 * Domain plugins call this seam through `ctx.get('nativeFilePicker')`; they do
 * not ship their own picker copies. Other platforms answer
 * `picker-unsupported` (no silent path-typing fallback).
 */
import { spawn } from 'node:child_process'

export const PICKER_DEFAULT_PROMPTS = Object.freeze({
  file: '选择要导入的素材',
  directory: '选择要导入的文件夹',
})

/** Codes are part of the seam contract; callers map them to their own HTTP status. */
export const PICKER_ERROR_CODES = Object.freeze({
  invalidKind: 'picker-invalid-kind',
  unsupported: 'picker-unsupported',
  failed: 'picker-failed',
})

export class PickerError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message)
    this.name = 'PickerError'
    this.code = code
    /** Truncated helper stdout for picker-failed diagnostics; undefined otherwise. */
    this.stdout = undefined
  }
}

/**
 * Build the JXA chooser. Keeping the panel inside `osascript` avoids the Apple
 * Events (System Events) TCC dependency entirely; the accessory activation
 * policy keeps the dialog out of the Dock. The modal answer is 1 for
 * "choose"; anything else is a cancel, which exits 0 with empty stdout.
 * `NSURL.path` reports directories without a trailing slash — domain clients
 * trim, so the contract is unchanged.
 *
 * Selected paths travel back as a single-line JSON string array so filenames
 * containing newlines, trailing spaces or tabs survive unchanged.
 * @param {'file' | 'directory'} kind
 * @param {string} prompt
 * @returns {string}
 */
export function pickScript(kind, prompt) {
  const chooseFiles = kind === 'file'
  const chooseDirectories = kind === 'directory'
  return [
    "ObjC.import('Cocoa');",
    'function run() {',
    '  var app = $.NSApplication.sharedApplication;',
    '  app.setActivationPolicy($.NSApplicationActivationPolicyAccessory);',
    '  app.activateIgnoringOtherApps(true);',
    '  var panel = $.NSOpenPanel.openPanel;',
    `  panel.setCanChooseFiles(${chooseFiles});`,
    `  panel.setCanChooseDirectories(${chooseDirectories});`,
    '  panel.setAllowsMultipleSelection(true);',
    `  panel.setMessage(${JSON.stringify(prompt)});`,
    '  panel.setPrompt("选取");',
    '  if (Number(panel.runModal) !== 1) return "";',
    '  var urls = panel.URLs;',
    '  var picked = [];',
    '  for (var i = 0; i < Number(urls.count); i += 1) {',
    '    picked.push(ObjC.unwrap(urls.objectAtIndex(i).path));',
    '  }',
    '  return JSON.stringify(picked);',
    '}',
  ].join('\n')
}

/**
 * Parse the JSON path array printed by `pickScript`. Empty output means the
 * user cancelled; anything else must be a JSON array of strings — invalid
 * output throws instead of being mistaken for a cancel.
 * @param {string} stdout
 * @returns {string[]}
 */
export function parsePickedPaths(stdout) {
  if (typeof stdout !== 'string') {
    throw new Error('native picker returned a non-string path payload')
  }
  const trimmed = stdout.trim()
  if (trimmed === '') return []
  let parsed
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    throw new Error('native picker returned a non-JSON path payload')
  }
  if (!Array.isArray(parsed) || parsed.some((row) => typeof row !== 'string')) {
    throw new Error('native picker returned an invalid path payload')
  }
  return parsed
}

/**
 * @param {unknown} error
 */
function messageOf(error) {
  if (error instanceof Error) {
    const extra = (/** @type {Error & { stderr?: string }} */ (error).stderr) ?? ''
    return `${error.message} ${extra}`
  }
  return String(error)
}

/**
 * A legacy AppleScript cancel is only recognized on a failed osascript run
 * (non-zero numeric exit code) whose stderr is the AppleScript execution error
 * -128. Arbitrary messages that merely contain "-128" must not be classified
 * as a user cancellation.
 * @param {unknown} error
 */
function isUserCancel(error) {
  if (!error || typeof error !== 'object') return false
  const code = (/** @type {{ code?: unknown }} */ (error)).code
  if (typeof code !== 'number' || code === 0) return false
  const stderr = (/** @type {{ stderr?: unknown }} */ (error)).stderr
  return typeof stderr === 'string' && /execution error:[\s\S]*\(-128\)/.test(stderr)
}

/**
 * @param {string} command
 * @param {string[]} argv
 * @returns {Promise<{ stdout: string, stderr: string }>}
 */
function runCommand(command, argv) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, argv, { stdio: ['ignore', 'pipe', 'pipe'] })
    /** @type {Buffer[]} */
    const stdoutChunks = []
    /** @type {Buffer[]} */
    const stderrChunks = []
    child.stdout.on('data', (chunk) => stdoutChunks.push(/** @type {Buffer} */ (chunk)))
    child.stderr.on('data', (chunk) => stderrChunks.push(/** @type {Buffer} */ (chunk)))
    child.on('error', rejectPromise)
    child.on('close', (code) => {
      const stdout = Buffer.concat(stdoutChunks).toString('utf8')
      const stderr = Buffer.concat(stderrChunks).toString('utf8')
      if (code === 0) {
        resolvePromise({ stdout, stderr })
        return
      }
      const error = new Error(`${command} exited with code ${code}`)
      Object.assign(error, { code: code ?? undefined, stderr, stdout })
      rejectPromise(error)
    })
  })
}

/**
 * @typedef {{
 *   platform?: NodeJS.Platform,
 *   run?: (command: string, argv: string[]) => Promise<{ stdout: string, stderr: string }>,
 *   prompt?: string,
 * }} PickNativePathDeps
 */

/**
 * @param {string} kind
 * @param {PickNativePathDeps} [deps]
 * @returns {Promise<{ path: string | null, paths: string[] }>}
 */
export async function pickNativePath(kind, deps = {}) {
  if (kind !== 'file' && kind !== 'directory') {
    throw new PickerError(PICKER_ERROR_CODES.invalidKind, `unknown pick kind: ${String(kind)}`)
  }
  const platform = deps.platform ?? process.platform
  if (platform !== 'darwin') {
    throw new PickerError(PICKER_ERROR_CODES.unsupported, `native picker not supported on ${platform}`)
  }
  const prompt = typeof deps.prompt === 'string' && deps.prompt !== ''
    ? deps.prompt
    : PICKER_DEFAULT_PROMPTS[kind]
  const run = deps.run ?? runCommand
  let stdout = ''
  try {
    const result = await run('osascript', ['-l', 'JavaScript', '-e', pickScript(kind, prompt)])
    stdout = result.stdout
    const paths = parsePickedPaths(stdout)
    return { path: paths[0] ?? null, paths }
  } catch (error) {
    if (isUserCancel(error)) return { path: null, paths: [] }
    const failure = new PickerError(PICKER_ERROR_CODES.failed, messageOf(error))
    // Prefer stdout captured before the rejection; runCommand also attaches it
    // on non-zero exits so real osascript failures keep their raw output.
    const rejected = /** @type {{ stdout?: unknown } | null} */ (error)?.stdout
    const raw = typeof rejected === 'string' && rejected !== '' ? rejected : stdout
    if (typeof raw === 'string' && raw.trim() !== '') failure.stdout = raw.slice(0, 500)
    throw failure
  }
}

/** @typedef {{ pick: (kind: 'file' | 'directory', options?: { prompt?: string }) => Promise<{ path: string | null, paths: string[] }> }} NativeFilePicker */

/**
 * Build the seam value registered as `ctx.provide('nativeFilePicker', …)`.
 * `pick(kind, { prompt })` preserves each domain's copy while sharing the
 * dialog, cancel and activation logic.
 * @param {PickNativePathDeps} [deps]
 * @returns {NativeFilePicker}
 */
export function createNativeFilePicker(deps = {}) {
  return {
    pick(kind, options = {}) {
      const next = { ...deps }
      if (typeof options?.prompt === 'string' && options.prompt !== '') next.prompt = options.prompt
      return pickNativePath(kind, next)
    },
  }
}
