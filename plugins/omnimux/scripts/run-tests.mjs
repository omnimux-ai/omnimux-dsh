import { spawnSync } from 'node:child_process'
import { globSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
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

/** Plan non-overlapping Hub runs within the source discovery boundary. */
export function planHubTestRuns(files) {
  assertTestFiles(files)
  if (!files.includes(NETWORK_GUARD_TEST)) {
    throw new Error(`Missing required network guard test: ${NETWORK_GUARD_TEST}`)
  }
  const ordinary = []
  const resource = []
  for (const file of files) {
    if (file === NETWORK_GUARD_TEST) continue
    // Conservative resource scheduling, not proof of browser execution.
    if (/\.e2e\.test\.(js|ts|mjs)$/.test(file) || file === 'src/client/provider-config-state.test.js') {
      resource.push(file)
    } else {
      ordinary.push(file)
    }
  }
  return [
    { files: [NETWORK_GUARD_TEST], args: [] },
    { files: ordinary, args: [] },
    { files: resource, args: ['--test-concurrency=1'] },
  ].filter((group) => group.files.length > 0)
}

export function runTests(cwd = process.cwd()) {
  const files = discoverTestFiles(cwd)
  const [guard, ...phases] = planHubTestRuns(files)
  console.log(`[omnimux:test] discovered ${files.length} test files`)

  // Throwaway DSH_HOME shared only by this runner's test phases: code paths that resolve
  // hubHomeDir() (media task ledger, auth store, plugin manage routes, …)
  // must never write the developer machine's real ~/.dsh. A test may still
  // override DSH_HOME inside its own process, which wins over this inherit.
  const dshHome = mkdtempSync(join(tmpdir(), 'omnimux-test-home-'))
  const ownedHome = realpathSync(dshHome)
  const env = { ...process.env, DSH_HOME: dshHome }
  const cleanup = () => {
    if (!ownedHome.startsWith(join(realpathSync(tmpdir()), 'omnimux-test-home-'))) {
      throw new Error('Hub test home is outside its owned temporary prefix')
    }
    rmSync(ownedHome, { recursive: true, force: true })
  }

  const preload = new URL('./test-network-guard.mjs', import.meta.url).href
  const run = (group) => spawnSync(process.execPath, ['--import', preload, '--test', ...group.args, ...group.files], {
    cwd,
    stdio: 'inherit',
    env,
  })
  try {
    const guardResult = run(guard)
    if (guardResult.error) throw guardResult.error
    if (guardResult.signal) {
      throw new Error(`Hub network guard test terminated by ${guardResult.signal}`)
    }
    if (guardResult.status !== 0) return guardResult.status ?? 1

    let status = 0
    let failure
    for (const phase of phases) {
      const result = run(phase)
      if (!failure && result.error) failure = result.error
      if (!failure && result.signal) {
        failure = new Error(`Hub test runner terminated by ${result.signal}`)
      }
      if (status === 0) status = result.status ?? 1
    }
    if (failure) throw failure
    return status
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
