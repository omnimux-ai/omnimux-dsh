import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, execSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync, chmodSync, lstatSync, realpathSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const here = dirname(fileURLToPath(import.meta.url))
const scriptPath = join(here, 'dev-env.sh')
const source = readFileSync(scriptPath, 'utf8')

describe('scripts/dev-env.sh L2 Host install-closure preflight', () => {
  let testRoot
  let prodProfile
  let wtRoot
  let fakeDshSrc
  let fakeBin
  let pnpmLog
  let hostArgsLog

  const writePkg = (dir, name, deps = {}) => {
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, version: '0.0.0-test', type: 'module', dependencies: deps }, null, 2))
  }

  /**
   * Build a mini monorepo that mirrors apps/cli → dsh-web-app → dsh-client-ui-chat.
   * When `complete` is false, ui-chat is omitted so createRequire fails.
   */
  const setupDshSrc = ({ complete }) => {
    fakeDshSrc = join(testRoot, 'dsrsrc')
    const cliDir = join(fakeDshSrc, 'apps', 'cli')
    const webAppDir = join(fakeDshSrc, 'packages', 'web-app')
    const chatDir = join(fakeDshSrc, 'packages', 'ui-chat')
    mkdirSync(join(cliDir, 'lib'), { recursive: true })
    mkdirSync(join(cliDir, 'node_modules', '@deepseek-ai'), { recursive: true })
    mkdirSync(join(webAppDir, 'node_modules', '@deepseek-ai'), { recursive: true })
    mkdirSync(join(chatDir, 'lib'), { recursive: true })

    writePkg(cliDir, '@deepseek-ai/dsh', { '@deepseek-ai/dsh-web-app': 'workspace:^' })
    writePkg(webAppDir, '@deepseek-ai/dsh-web-app', complete
      ? { '@deepseek-ai/dsh-client-ui-chat': 'workspace:^' }
      : {})
    writePkg(chatDir, '@deepseek-ai/dsh-client-ui-chat', {})
    writeFileSync(join(chatDir, 'lib', 'index.js'), 'export default {}\n')
    writeFileSync(join(cliDir, 'lib', 'bin.js'),
      "import { writeFileSync } from 'node:fs';\nwriteFileSync(process.env.TEST_HOST_ARGS_LOG, JSON.stringify(process.argv.slice(2)));\nconst i = process.argv.indexOf('--port');\nconst port = i >= 0 ? process.argv[i+1] : 44201;\nconsole.log('http://127.0.0.1:' + port);\nsetInterval(() => {}, 1000);\n")

    // node resolution graph: cli → web-app; web-app → ui-chat (optional)
    symlinkSync(webAppDir, join(cliDir, 'node_modules', '@deepseek-ai', 'dsh-web-app'))
    if (complete) {
      symlinkSync(chatDir, join(webAppDir, 'node_modules', '@deepseek-ai', 'dsh-client-ui-chat'))
    }
  }

  const setupSandbox = ({ complete, emptyProdScope = true }) => {
    const runId = Math.random().toString(36).substring(2, 9)
    testRoot = join(tmpdir(), `omnimux-dev-env-deps-${runId}`)
    prodProfile = join(testRoot, 'prod', 'profiles', 'omnimux')
    mkdirSync(join(prodProfile, 'node_modules'), { recursive: true })
    // Real OmniMux seeds carry profile-local file: sources. The L2 must copy
    // those sources and let pnpm recreate node_modules; it must not copy this sentinel.
    const snapshot = join(prodProfile, '.materialize-snapshots', 'plugins')
    for (const name of ['dsh-ui-kit', 'omnimux']) {
      const source = join(snapshot, name)
      mkdirSync(source, { recursive: true })
      writeFileSync(join(source, 'package.json'), JSON.stringify({ name, version: '1.0.0', main: 'index.js' }))
      writeFileSync(join(source, 'index.js'), `export const source = '${name}'\n`)
      writeFileSync(join(source, 'source-marker.txt'), `seed-${name}`)
    }
    writeFileSync(join(prodProfile, 'package.json'), JSON.stringify({
      name: 'omnimux-profile-seed',
      dependencies: {
        'dsh-ui-kit': 'file:.materialize-snapshots/plugins/dsh-ui-kit',
        omnimux: 'file:.materialize-snapshots/plugins/omnimux',
      },
    }, null, 2))
    writeFileSync(join(prodProfile, 'cordis.patch.yml'), '')
    writeFileSync(join(prodProfile, 'pnpm-workspace.yaml'), 'packages:\n  - .\n')
    writeFileSync(join(prodProfile, 'pnpm-lock.yaml'), `lockfileVersion: '9.0'\n\nimporters:\n\n  .:\n    dependencies:\n      dsh-ui-kit:\n        specifier: file:.materialize-snapshots/plugins/dsh-ui-kit\n        version: file:.materialize-snapshots/plugins/dsh-ui-kit\n      omnimux:\n        specifier: file:.materialize-snapshots/plugins/omnimux\n        version: file:.materialize-snapshots/plugins/omnimux\n`)
    writeFileSync(join(prodProfile, '.npmrc'), 'store-dir=/shared-dev-store\n//registry.example/:_authToken=forbidden\n')
    writeFileSync(join(prodProfile, 'node_modules', 'seed-sentinel.txt'), 'must not copy')
    if (!emptyProdScope) {
      // Only used if a test wants a populated private scope (not required).
      const chat = join(prodProfile, 'node_modules', '@deepseek-ai', 'dsh-client-ui-chat', 'lib')
      mkdirSync(chat, { recursive: true })
      writeFileSync(join(chat, 'index.js'), 'sentinel')
    }
    wtRoot = join(testRoot, 'wt-root')
    mkdirSync(join(wtRoot, 'plugins', 'omnimux-assets'), { recursive: true })
    writeFileSync(join(wtRoot, 'plugins', 'omnimux-assets', 'package.json'), JSON.stringify({ name: 'omnimux-assets', version: '1.0.0' }))
    fakeBin = join(testRoot, 'bin')
    pnpmLog = join(testRoot, 'pnpm.log')
    hostArgsLog = join(testRoot, 'host-args.json')
    mkdirSync(fakeBin, { recursive: true })
    symlinkSync(process.execPath, join(fakeBin, 'node'))
    writeFileSync(join(fakeBin, 'corepack'), `#!/bin/bash
set -euo pipefail
[ "\${1}" = pnpm ] || exit 2
printf '%s\\n' "\${PWD} \${*}" >> "\${TEST_PNPM_LOG}"
store="\$(sed -n 's/^store-dir=//p' .npmrc)"
[ -n "\${store}" ] || exit 3
mkdir -p "\${store}"
printf '%s\\n' "store=\${store}" >> "\${TEST_PNPM_LOG}"
for name in dsh-ui-kit omnimux; do
  target="\${PWD}/node_modules/.pnpm/\${name}@l2/node_modules/\${name}"
  mkdir -p "\$(dirname "\${target}")"
  ln -s "../../../../.materialize-snapshots/plugins/\${name}" "\${target}"
  ln -s ".pnpm/\${name}@l2/node_modules/\${name}" "\${PWD}/node_modules/\${name}"
done
printf '%s\\n' 'virtualStoreDir: .pnpm' > "\${PWD}/node_modules/.modules.yaml"
`)
    chmodSync(join(fakeBin, 'corepack'), 0o755)
    setupDshSrc({ complete })
  }

  const cleanupSandbox = () => {
    if (testRoot && existsSync(testRoot)) {
      try {
        try {
          execSync(`bash "${scriptPath}" rm deps-test`, {
            env: { ...process.env, DSH_DEV_HOME: join(testRoot, 'dev') }, stdio: 'ignore',
          })
        } catch { /* ignore */ }
        rmSync(testRoot, { recursive: true, force: true })
      } catch { /* ignore */ }
    }
  }

  const runCommand = (args, extraEnv = {}) => execFileSync(
    'bash', [scriptPath, ...args, `--source=${wtRoot}`],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        // 隔离测试：显式种子，避免误用开发者本机 ~/.omnimux-dev
        OMNIMUX_L2_SEED_PROFILE: prodProfile,
        DSH_HOME: join(testRoot, 'prod'),
        DSH_DEV_HOME: join(testRoot, 'dev'),
        DSH_SRC: fakeDshSrc,
        PATH: `${fakeBin}:${process.env.PATH}`,
        TEST_PNPM_LOG: pnpmLog,
        TEST_HOST_ARGS_LOG: hostArgsLog,
        OMNIMUX_NODE_BIN: join(fakeBin, 'node'),
        // Even an older caller requesting 44200 must never allocate production.
        OMNIMUX_L2_PORT_POOL_START: '44200',
        ...extraEnv,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  )

  const runStart = () => runCommand(['start', 'deps-test', 'omnimux-assets'])

  const assertWorkspaceBrowserOverlay = () => {
    const args = JSON.parse(readFileSync(hostArgsLog, 'utf8'))
    const patchIndex = args.indexOf('--patch')
    assert.ok(patchIndex >= 0, 'Host must receive the workspace browser composition')
    assert.equal(args[patchIndex + 1], join(here, 'l2-workspace-browser.patch.yml'))
    assert.equal(args.filter((arg) => arg === '--patch').length, 1)
    assert.ok(patchIndex < args.indexOf('--host'), 'launcher patches must precede app passthrough arguments')
    assert.equal(args[args.indexOf('--host') + 1], '127.0.0.1', 'picker selection must not widen network exposure')
  }

  it('clones managed snapshots and uses L2-local pnpm node_modules without copying seed node_modules', () => {
    setupSandbox({ complete: true, emptyProdScope: true })
    try {
      const out = runStart()
      assert.ok(out.includes('L2 Host 安装闭包完整'), `expected install-closure pass, got: ${out}`)
      assert.ok(out.includes('dev 环境已启动'), 'complete DSH_SRC closure should start Host')
      assertWorkspaceBrowserOverlay()
      const allocated = Number(readFileSync(join(testRoot, 'dev/tasks/deps-test/profiles/omnimux-dev-deps-test/port.txt'), 'utf8').trim())
      assert.ok(allocated >= 44201 && allocated <= 44299, `unsafe allocated port: ${allocated}`)
      const l2Profile = join(testRoot, 'dev/tasks/deps-test/profiles/omnimux-dev-deps-test')
      const l2ProfileReal = realpathSync(l2Profile)
      for (const name of ['dsh-ui-kit', 'omnimux']) {
        const seedSource = join(prodProfile, '.materialize-snapshots', 'plugins', name)
        const l2Source = join(l2Profile, '.materialize-snapshots', 'plugins', name)
        assert.equal(readFileSync(join(l2Source, 'source-marker.txt'), 'utf8'), `seed-${name}`)
        assert.notEqual(realpathSync(l2Source), realpathSync(seedSource), `${name} must be a private L2 source copy`)
        assert.equal(lstatSync(l2Source).isSymbolicLink(), false, `${name} source must not link to seed`)
        assert.ok(realpathSync(join(l2Profile, 'node_modules', name)).startsWith(`${l2ProfileReal}/`), `${name} must resolve inside the L2 profile`)
      }
      assert.equal(existsSync(join(l2Profile, 'node_modules', 'seed-sentinel.txt')), false, 'seed node_modules must not be copied')
      const l2Store = join(dirname(l2Profile), '.pnpm-store', 'v10')
      assert.equal(readFileSync(join(l2Profile, '.npmrc'), 'utf8'), `store-dir=${l2Store}\n`)
      assert.doesNotMatch(readFileSync(join(l2Profile, '.npmrc'), 'utf8'), /authToken|shared-dev-store/)
      assert.match(readFileSync(pnpmLog, 'utf8'), /pnpm install --frozen-lockfile/)
      assert.ok(readFileSync(pnpmLog, 'utf8').includes(`store=${l2Store}`), 'pnpm must use the task-local sibling store')
      assert.ok(existsSync(l2Store), 'pnpm may create only the task-local sibling store during temporary install')
      assert.equal(readFileSync(join(l2Profile, 'node_modules', '.modules.yaml'), 'utf8'), 'virtualStoreDir: .pnpm\n')
      assert.equal(existsSync(join(l2Profile, basename(l2Profile), 'package.json')), false, 'publishing the temporary profile must not nest it below a pre-created target')
      assert.ok(existsSync(join(l2Profile, 'package.json')), 'published profile manifest must remain at the target root')
      assert.equal(realpathSync(join(l2Profile, 'node_modules', 'omnimux-assets')), realpathSync(join(wtRoot, 'plugins', 'omnimux-assets')))
      // Empty prod @deepseek-ai must not be treated as missing deps.
      assert.ok(!out.includes('生产 dsh 层缺失'), 'must not blame empty prod profile scope')
    } finally {
      cleanupSandbox()
    }
  })

  it('applies the same workspace browser overlay on an existing task restart without rewriting its profile or data', () => {
    setupSandbox({ complete: true })
    try {
      runStart()
      const l2Profile = join(testRoot, 'dev/tasks/deps-test/profiles/omnimux-dev-deps-test')
      const patchPath = join(l2Profile, 'cordis.patch.yml')
      const beforePatch = readFileSync(patchPath, 'utf8')
      const beforePort = readFileSync(join(l2Profile, 'port.txt'), 'utf8')
      const sessionPath = join(testRoot, 'dev/tasks/deps-test', 'session-marker.json')
      writeFileSync(sessionPath, '{"session":"keep"}\n')
      rmSync(hostArgsLog)

      const out = runCommand(['restart-host', 'deps-test'])

      assertWorkspaceBrowserOverlay()
      assert.equal(readFileSync(patchPath, 'utf8'), beforePatch)
      assert.equal(readFileSync(join(l2Profile, 'port.txt'), 'utf8'), beforePort)
      assert.equal(readFileSync(sessionPath, 'utf8'), '{"session":"keep"}\n')
      assert.match(out, /保持不变/)
    } finally {
      cleanupSandbox()
    }
  })

  it('passes an optional experimental overlay as one argument on start and restart', () => {
    setupSandbox({ complete: true })
    try {
      const overlay = join(testRoot, 'experimental overlay.yml')
      writeFileSync(overlay, '- id: client-hmr\n  disabled: true\n')
      const env = { OMNIMUX_L2_EXTRA_PATCH: overlay }
      for (const command of [['start', 'deps-test', 'omnimux-assets'], ['restart-host', 'deps-test']]) {
        runCommand(command, env)
        const args = JSON.parse(readFileSync(hostArgsLog, 'utf8'))
        const patches = args.flatMap((arg, index) => arg === '--patch' ? [args[index + 1]] : [])
        assert.deepEqual(patches, [join(here, 'l2-workspace-browser.patch.yml'), overlay])
        assert.ok(args.indexOf(overlay) < args.indexOf('--host'))
      }
    } finally {
      cleanupSandbox()
    }
  })

  for (const printsUrl of [false, true]) {
    it(`rejects an exited restart process despite ${printsUrl ? 'new and historical' : 'historical'} Host URLs`, () => {
      setupSandbox({ complete: true })
      try {
        runStart()
        const l2Profile = join(testRoot, 'dev/tasks/deps-test/profiles/omnimux-dev-deps-test')
        const logPath = join(l2Profile, 'host.log')
        const oldLog = readFileSync(logPath, 'utf8')
        assert.match(oldLog, /http:\/\/127\.0\.0\.1:\d+/)
        const oldPort = readFileSync(join(l2Profile, 'port.txt'), 'utf8')
        writeFileSync(join(fakeDshSrc, 'apps/cli/lib/bin.js'), [
          "import { writeFileSync } from 'node:fs';",
          'writeFileSync(process.env.TEST_HOST_ARGS_LOG, JSON.stringify(process.argv.slice(2)));',
          ...(printsUrl ? ["console.log('http://127.0.0.1:' + process.argv[process.argv.indexOf('--port') + 1]);"] : []),
          "console.error('fixture: CLI exited before serving');",
          'process.exit(23);',
          '',
        ].join('\n'))
        rmSync(hostArgsLog)

        assert.throws(() => runCommand(['restart-host', 'deps-test']), (error) => {
          assert.equal(error.status, 1)
          assert.match(error.stderr, /新进程已退出/)
          assert.doesNotMatch(error.stdout, /冷重启完成/)
          return true
        })

        assertWorkspaceBrowserOverlay()
        assert.ok(readFileSync(logPath, 'utf8').startsWith(oldLog), 'restart must preserve historical logs')
        assert.match(readFileSync(logPath, 'utf8'), /fixture: CLI exited before serving/)
        assert.equal(readFileSync(join(l2Profile, 'port.txt'), 'utf8'), oldPort)
        assert.equal(existsSync(join(l2Profile, 'host.pid')), false, 'dead restart PID must not remain registered')
      } finally {
        cleanupSandbox()
      }
    })
  }

  it('fails fast when DSH_SRC cannot resolve web-app → ui-chat', () => {
    setupSandbox({ complete: false, emptyProdScope: true })
    try {
      try {
        runStart()
        assert.fail('should have rejected incomplete install closure')
      } catch (err) {
        const msg = `${err.stdout || ''}${err.stderr || ''}`
        assert.ok(msg.includes('L2 Host 安装闭包不完整'), `expected closure error, got: ${msg}`)
        assert.ok(msg.includes('ui-chat') || msg.includes('MISS'), `should mention ui-chat miss, got: ${msg}`)
        assert.ok(msg.includes('yarn omnimux:sync') === false || msg.includes('只物化'), 'must not claim sync fixes official client closure alone')
        assert.ok(!msg.includes('dev 环境已启动'), 'must not start Host on incomplete closure')
      }
    } finally {
      cleanupSandbox()
    }
  })

  it('rejects a seed better-sidebar that still imports removed settingsNamespace', () => {
    setupSandbox({ complete: true, emptyProdScope: true })
    try {
      const bsLib = join(prodProfile, '.materialize-snapshots', 'plugins', 'dsh-better-sidebar', 'lib')
      mkdirSync(bsLib, { recursive: true })
      writeFileSync(join(bsLib, 'index.js'),
        'import { SettingsConflictError, settingsNamespace } from "@deepseek-ai/dsh-settings";\nexport default {}\n')
      writeFileSync(join(prodProfile, '.materialize-snapshots', 'plugins', 'dsh-better-sidebar', 'package.json'),
        JSON.stringify({ name: 'dsh-better-sidebar', version: '0.13.1-stale' }))
      // Provide a dsh-settings package WITHOUT settingsNamespace export in the fake monorepo
      const settingsDir = join(fakeDshSrc, 'packages', 'settings')
      writePkg(settingsDir, '@deepseek-ai/dsh-settings', {})
      writeFileSync(join(settingsDir, 'index.js'), 'export class SettingsConflictError extends Error {}\n')
      mkdirSync(join(fakeDshSrc, 'apps', 'cli', 'node_modules', '@deepseek-ai'), { recursive: true })
      try { symlinkSync(settingsDir, join(fakeDshSrc, 'apps', 'cli', 'node_modules', '@deepseek-ai', 'dsh-settings')) } catch { /* exists */ }
      // Also link from web-app so createRequire from cli can still see web-app→chat path
      try {
        runStart()
        assert.fail('should reject incompatible better-sidebar seed')
      } catch (err) {
        const msg = `${err.stdout || ''}${err.stderr || ''}`
        assert.ok(msg.includes('better-sidebar') && msg.includes('不兼容'), `expected compat error, got: ${msg}`)
        assert.ok(msg.includes('omnimux-dev') || msg.includes('OMNIMUX_L2_SEED_PROFILE'), 'should point to Dev seed')
        assert.ok(!msg.includes('dev 环境已启动'), 'must not start Host')
      }
    } finally {
      cleanupSandbox()
    }
  })

  it('fails before profile creation when a manifest file dependency lacks its managed snapshot', () => {
    setupSandbox({ complete: true, emptyProdScope: true })
    try {
      rmSync(join(prodProfile, '.materialize-snapshots', 'plugins', 'omnimux', 'package.json'))
      try {
        runStart()
        assert.fail('should reject a missing managed source')
      } catch (err) {
        const msg = `${err.stdout || ''}${err.stderr || ''}`
        assert.match(msg, /受管 source 或 pnpm 锁无效/)
        assert.match(msg, /受管物化源缺失/)
        assert.equal(existsSync(join(testRoot, 'dev/tasks/deps-test/profiles/omnimux-dev-deps-test')), false, 'must not create a partial L2 profile')
        assert.equal(existsSync(pnpmLog), false, 'must not invoke pnpm for an invalid seed')
      }
    } finally {
      cleanupSandbox()
    }
  })

  it('fails before profile creation when the managed dsh-ui-kit snapshot is missing', () => {
    setupSandbox({ complete: true, emptyProdScope: true })
    try {
      rmSync(join(prodProfile, '.materialize-snapshots', 'plugins', 'dsh-ui-kit', 'package.json'))
      try {
        runStart()
        assert.fail('should reject a missing managed kit source')
      } catch (err) {
        const msg = `${err.stdout || ''}${err.stderr || ''}`
        assert.match(msg, /受管 source 或 pnpm 锁无效/)
        assert.match(msg, /受管物化源缺失/)
        assert.equal(existsSync(join(testRoot, 'dev/tasks/deps-test/profiles/omnimux-dev-deps-test')), false, 'must not create a partial L2 profile')
        assert.equal(existsSync(pnpmLog), false, 'must not invoke pnpm for a missing kit source')
      }
    } finally {
      cleanupSandbox()
    }
  })

  it('embeds DSH_SRC install-closure preflight and accurate guidance in source', () => {
    assert.ok(source.includes('assert_l2_source_deps'), 'preflight function must exist')
    assert.ok(source.includes('createRequire'), 'must resolve via Node install-anchor semantics')
    assert.ok(source.includes('dsh-client-ui-chat'), 'must check ui-chat')
    assert.ok(source.includes('L2 Host 安装闭包'), 'must use install-closure banner')
    assert.ok(source.includes('OMNIMUX_L2_SEED_PROFILE') || source.includes('omnimux-dev'), 'must prefer Dev seed')
    assert.ok(source.includes('settingsNamespace'), 'must detect better-sidebar API skew')
    assert.ok(source.includes('clone_l2_seed_profile'), 'must clone managed seed sources into L2')
    assert.ok(source.includes('corepack pnpm install --frozen-lockfile'), 'must let pnpm create L2 node_modules')
    assert.ok(source.includes('.materialize-snapshots/plugins'), 'must require managed snapshot sources')
    assert.ok(source.includes('host.log 尾部'), 'host-fail diagnostics must dump the log tail')
    assert.ok(source.includes('l2-workspace-browser.patch.yml'), 'must load workspace browser overlay')
    assert.ok(source.includes('host_log_offset'), 'restart must offset host.log to reject stale URLs')
  })
})
