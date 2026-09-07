import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
function detectRepoFromGit(root) {
  try {
    const res = spawnSync('git', ['-C', root, 'remote', 'get-url', 'origin'], { encoding: 'utf8' })
    if (res.status === 0 && res.stdout) {
      const match = res.stdout.trim().match(/github\.com[:/]([^/]+\/[^/.]+)(?:\.git)?$/)
      if (match && match[1]) return match[1]
    }
  } catch {}
  return 'laozhong86/omnimux-dsh'
}
export const REPO = process.env.OMNIMUX_REPO || detectRepoFromGit(repoRoot)
export const BASE_BRANCH = process.env.OMNIMUX_BASE_BRANCH || 'main'
export class PipelineError extends Error {
  constructor(message, details = {}) {
    super(message)
    this.name = 'PipelineError'
    Object.assign(this, details)
  }
}
function displayArgs(args) {
  return args.map(value => {
    const text = String(value)
    return /token|secret|password|key/i.test(text) ? '<redacted>' : text
  }).join(' ')
}
export function runCommand(command, args = [], options = {}) {
  const cwd = options.cwd || repoRoot
  const dryRun = Boolean(options.dryRun)
  process.stdout.write(`\n$ [${cwd}] ${command} ${displayArgs(args)}\n`)
  if (dryRun) {
    process.stdout.write('  (dry-run 跳过实际执行)\n')
    return { status: 0, stdout: '', stderr: '', dryRun: true }
  }
  const result = spawnSync(command, args, {
    cwd, env: { ...process.env, ...(options.env || {}) }, encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024,
  })
  const stdout = result.stdout || ''
  const stderr = result.stderr || ''
  if (stdout) process.stdout.write(stdout)
  if (stderr) process.stderr.write(stderr)
  const status = result.status == null ? 1 : result.status
  if (status !== 0 && !options.allowFailure) {
    throw new PipelineError(`命令失败（exit ${status}）: ${command} ${displayArgs(args)}`, { command, args, status, stdout, stderr })
  }
  return { status, stdout, stderr, signal: result.signal }
}
export function readJsonFile(path, fallback = null) {
  try { return JSON.parse(readFileSync(path, 'utf8')) } catch { return fallback }
}
export function readJsonText(raw, fallback) {
  try { return JSON.parse(raw) } catch { return fallback }
}
export function writeEvidence(path, content) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  writeFileSync(path, content, { encoding: 'utf8', mode: 0o600 })
}
