import { spawnSync } from 'node:child_process'
import { globSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const TEST_GLOBS = [
  'src/**/*.test.js',
  'src/**/*.test.ts',
  // *.test.mjs 也在收集范围：曾有 6 个测试因后缀漏掉从未执行（Issue #3014）
  'src/**/*.test.mjs',
]

const EXCLUDED_GLOBS = [
  'src/**/node_modules/**',
  'src/**/fixture/**',
  'src/**/fixtures/**',
  'src/**/vendor/**',
  'src/**/build/**',
  'src/**/dist/**',
]
const NETWORK_GUARD_TEST = 'src/media/test-network-guard.test.js'

export function discoverTestFiles(cwd = process.cwd()) {
  return globSync(TEST_GLOBS, {
    cwd,
    exclude: EXCLUDED_GLOBS,
  }).map((file) => file.replaceAll('\\', '/')).sort()
}

export function assertTestFiles(files) {
  if (files.length === 0) {
    throw new Error('No Hub test files matched the source test globs')
  }
}

export function runTests(cwd = process.cwd()) {
  const files = discoverTestFiles(cwd)
  assertTestFiles(files)
  if (!files.includes(NETWORK_GUARD_TEST)) {
    throw new Error(`Missing required network guard test: ${NETWORK_GUARD_TEST}`)
  }
  console.log(`[omnimux:test] discovered ${files.length} test files`)

  // Throwaway DSH_HOME per spawned test process: code paths that resolve
  // hubHomeDir() (media task ledger, auth store, plugin manage routes, …)
  // must never write the developer machine's real ~/.dsh. A test may still
  // override DSH_HOME inside its own process, which wins over this inherit.
  const dshHome = mkdtempSync(join(tmpdir(), 'omnimux-test-home-'))
  const env = { ...process.env, DSH_HOME: dshHome }
  const cleanup = () => rmSync(dshHome, { recursive: true, force: true })

  const preload = new URL('./test-network-guard.mjs', import.meta.url).href
  const run = (testFiles) => spawnSync(process.execPath, ['--import', preload, '--test', ...testFiles], {
    cwd,
    stdio: 'inherit',
    env,
  })
  try {
    const guardResult = run([NETWORK_GUARD_TEST])
    if (guardResult.error) throw guardResult.error
    if (guardResult.signal) {
      throw new Error(`Hub network guard test terminated by ${guardResult.signal}`)
    }
    if (guardResult.status !== 0) return guardResult.status ?? 1

    const result = run(files.filter((file) => file !== NETWORK_GUARD_TEST))
    if (result.error) throw result.error
    if (result.signal) {
      throw new Error(`Hub test runner terminated by ${result.signal}`)
    }
    return result.status ?? 1
  } finally {
    cleanup()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = runTests()
  } catch (error) {
    console.error(`[omnimux:test] ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}
