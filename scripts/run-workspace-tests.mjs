#!/usr/bin/env node
/**
 * Runs every workspace package's `test` script the same way locally and in CI, and fails on
 * anything short of a clean pass.
 *
 * A package passes only when its test command exits 0, reports at least one test, and its TAP
 * output contains no `not ok` line and no cancelled test. The `not ok` scan matters because a
 * suite that throws while collecting can print `not ok` while node:test still exits 0.
 *
 * Packages run without proxy variables so a test that silently depends on a reachable proxy
 * fails locally the same way it fails on a clean CI runner. HOME is left alone: headless Chrome
 * on macOS aborts when HOME points at an empty directory, and the CI runner already has a clean
 * HOME of its own.
 *
 * Usage: node scripts/run-workspace-tests.mjs [--json <file>] [--logs <dir>] [package-name ...]
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { delimiter, dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const WORKSPACE_DIRS = ['plugins', 'packages']
const PROXY_VARIABLES = [
  'http_proxy', 'https_proxy', 'all_proxy', 'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NODE_USE_ENV_PROXY',
]

/** @typedef {{ name: string, dir: string, command: string }} WorkspacePackage */
/** @typedef {{ location: string, name: string, error: string }} TestFailure */
/**
 * @typedef {{
 *   tests: number, pass: number, fail: number, cancelled: number, skipped: number,
 *   notOk: number, failures: TestFailure[],
 * }} TapSummary
 */

/** @returns {WorkspacePackage[]} */
export function discoverPackages(root = repoRoot) {
  const found = []
  for (const group of WORKSPACE_DIRS) {
    const base = join(root, group)
    if (!existsSync(base)) continue
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const dir = join(base, entry.name)
      const manifestPath = join(dir, 'package.json')
      if (!existsSync(manifestPath)) continue
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
      const command = manifest.scripts?.test
      if (typeof command === 'string' && command.trim()) found.push({ name: manifest.name || entry.name, dir, command })
    }
  }
  return found.sort((a, b) => a.name.localeCompare(b.name))
}

function sumCounter(text, key) {
  let total = 0
  for (const match of text.matchAll(new RegExp(`^# ${key} (\\d+)$`, 'gm'))) total += Number(match[1])
  return total
}

/**
 * Parses node:test TAP output. Several runs may be concatenated (one per spawned test command),
 * so counters are summed. Only leaf failures are listed; parents that failed because a subtest
 * failed are counted but not repeated.
 * @param {string} text
 * @returns {TapSummary}
 */
export function parseTap(text) {
  const lines = text.split('\n')
  /** @type {TestFailure[]} */
  const failures = []
  let notOk = 0
  for (let i = 0; i < lines.length; i++) {
    const head = /^\s*not ok \d+ - (.*)$/.exec(lines[i])
    if (!head) continue
    notOk++
    const block = []
    for (let j = i + 1; j < lines.length && !/^\s*\.\.\.\s*$/.test(lines[j]); j++) block.push(lines[j])
    const body = block.join('\n')
    if (/failureType: 'subtestsFailed'/.test(body)) continue
    const location = /location: '([^']+)'/.exec(body)?.[1] ?? ''
    const inline = /error: '([^']*)'/.exec(body) ?? /error: "([^"]*)"/.exec(body)
    let error = inline?.[1] ?? ''
    if (!inline) {
      const start = block.findIndex((line) => /^\s*error: \|-?\s*$/.test(line))
      if (start >= 0) error = block.slice(start + 1, start + 4).map((line) => line.trim()).join(' ')
    }
    failures.push({ location, name: head[1], error })
  }
  return {
    tests: sumCounter(text, 'tests'),
    pass: sumCounter(text, 'pass'),
    fail: sumCounter(text, 'fail'),
    cancelled: sumCounter(text, 'cancelled'),
    skipped: sumCounter(text, 'skipped'),
    notOk,
    failures,
  }
}

/**
 * @param {{ exitCode: number | null, tap: TapSummary }} run
 * @returns {string[]} reasons the package did not pass; empty means it passed
 */
export function judge({ exitCode, tap }) {
  const reasons = []
  if (exitCode !== 0) reasons.push(`exit code ${exitCode}`)
  if (tap.tests === 0) reasons.push('no tests reported')
  if (tap.notOk > 0) reasons.push(`${tap.notOk} not ok line(s)`)
  if (tap.cancelled > 0) reasons.push(`${tap.cancelled} cancelled`)
  return reasons
}

/** Environment for one package run: TAP reporter, repo-local bins first, no proxy. */
export function packageEnv(pkgDir, base = process.env) {
  const env = { ...base }
  for (const key of PROXY_VARIABLES) delete env[key]
  env.NODE_OPTIONS = [base.NODE_OPTIONS, '--test-reporter=tap'].filter(Boolean).join(' ')
  env.PATH = [join(pkgDir, 'node_modules', '.bin'), join(repoRoot, 'node_modules', '.bin'), base.PATH].filter(Boolean).join(delimiter)
  return env
}

function runPackage(pkg, logsDir) {
  const started = Date.now()
  const result = spawnSync('bash', ['-c', pkg.command], {
    cwd: pkg.dir,
    env: packageEnv(pkg.dir),
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
  })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  if (logsDir) writeFileSync(join(logsDir, `${pkg.name.replaceAll('/', '__')}.log`), output)
  const tap = parseTap(output)
  const exitCode = result.error ? -1 : result.status
  return { name: pkg.name, exitCode, seconds: Math.round((Date.now() - started) / 1000), tap, reasons: judge({ exitCode, tap }) }
}

function parseArgs(argv) {
  const options = { json: '', logs: '', only: [] }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--json') options.json = argv[++i]
    else if (argv[i] === '--logs') options.logs = argv[++i]
    else options.only.push(argv[i])
  }
  return options
}

export function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv)
  let packages = discoverPackages()
  if (options.only.length) {
    const unknown = options.only.filter((name) => !packages.some((pkg) => pkg.name === name))
    if (unknown.length) {
      console.error(`unknown package(s): ${unknown.join(', ')}`)
      return 2
    }
    packages = packages.filter((pkg) => options.only.includes(pkg.name))
  }
  if (options.logs) mkdirSync(options.logs, { recursive: true })

  const results = []
  for (const pkg of packages) {
    const result = runPackage(pkg, options.logs)
    results.push(result)
    const status = result.reasons.length ? `FAIL (${result.reasons.join(', ')})` : 'ok'
    console.log(`${result.name.padEnd(26)} tests=${String(result.tap.tests).padStart(5)} fail=${result.tap.fail} cancelled=${result.tap.cancelled} ${result.seconds}s ${status}`)
    for (const failure of result.tap.failures.slice(0, 50)) {
      console.log(`    ✖ ${failure.location || '(no location)'} — ${failure.name}${failure.error ? ` — ${failure.error.slice(0, 200)}` : ''}`)
    }
  }
  if (options.json) writeFileSync(options.json, `${JSON.stringify(results, null, 2)}\n`)

  const failed = results.filter((result) => result.reasons.length)
  console.log(`\n${results.length - failed.length}/${results.length} package(s) passed`)
  return failed.length ? 1 : 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = main()
}
