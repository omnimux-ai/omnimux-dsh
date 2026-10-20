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
  }
}

/**
 * Build the JXA chooser. Keeping the panel inside `osascript` avoids the Apple
 * Events (System Events) TCC dependency entirely; the accessory activation
 * policy keeps the dialog out of the Dock. The modal answer is 1 for
 * "choose"; anything else is a cancel, which exits 0 with empty stdout.
 * `NSURL.path` reports directories without a trailing slash — domain clients
 * trim, so the contract is unchanged.
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
    '  return picked.join("\\n");',
    '}',
  ].join('\n')
}

/**
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
 * @param {unknown} error
 */
function isUserCancel(error) {
  return /User canceled|-128/i.test(messageOf(error))
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
      Object.assign(error, { code: code ?? undefined, stderr })
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
  try {
    const { stdout } = await run('osascript', ['-l', 'JavaScript', '-e', pickScript(kind, prompt)])
    const paths = parsePickedPaths(stdout)
    return { path: paths[0] ?? null, paths }
  } catch (error) {
    if (isUserCancel(error)) return { path: null, paths: [] }
    throw new PickerError(PICKER_ERROR_CODES.failed, messageOf(error))
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
