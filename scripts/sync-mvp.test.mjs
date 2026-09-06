import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseGateConfig } from '../plugins/omnimux/src/gate/config.js'
import { isToolEnabled, assertCapabilityEnabled } from '../plugins/omnimux/src/gate/guard.js'
import { parseHubConfig } from '../plugins/omnimux/src/config.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const syncToAppScript = join(root, 'scripts/sync-to-app.sh')
const syncStableScript = join(root, 'scripts/sync-stable.sh')

const MVP_EXCLUDED = [
  'omnimux-accounts',
  'omnimux-workflow',
  'omnimux-publish',
  'omnimux-analytics',
]

describe('MVP Mode and Profile Toggle Suite', () => {
  const fakeHome = join(tmpdir(), 'test-mvp-home-' + Date.now() + '-' + Math.random().toString(36).slice(2))
  const fixturePlugins = join(fakeHome, 'fixture-plugins')

  function syncEnv(extra = {}) {
    return {
      ...process.env,
      OMNIMUX_SYNC_VIA: 'internal',
      OMNIMUX_PLUGINS_DIR: fixturePlugins,
      HOME: fakeHome,
      COREPACK_HOME: '/Users/x/.cache/node/corepack',
      CI: 'true',
      npm_config_offline: 'true',
      ...extra,
    }
  }

  function writeFixturePlugin(name, version = '1.0.0') {
    const plugin = join(fixturePlugins, name)
    mkdirSync(plugin, { recursive: true })
    writeFileSync(join(plugin, 'package.json'), JSON.stringify({
      name,
      version,
      main: 'index.js',
      dsh: { bundle: { patch: './cordis.patch.yml' } },
    }, null, 2) + '\n')
    writeFileSync(join(plugin, 'index.js'), `module.exports = { name: ${JSON.stringify(name)} }\n`)
    writeFileSync(join(plugin, 'cordis.patch.yml'), '[]\n')
  }

  function readProfileBundles(sub = '.omnimux-dev') {
    const pkgPath = join(fakeHome, sub, 'profiles', 'omnimux', 'package.json')
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
    return {
      bundles: pkg.dsh?.profile?.bundles || [],
      dependencies: pkg.dependencies || {},
    }
  }

  before(() => {
    for (const name of [
      'omnimux',
      'omnimux-accounts',
      'omnimux-assets',
      'omnimux-products',
      'omnimux-workflow',
      'omnimux-market',
      'omnimux-inspiration',
      'omnimux-clip',
      'omnimux-video',
      'omnimux-analytics',
      'omnimux-publish',
    ]) {
      writeFixturePlugin(name)
    }

    const p = join(fakeHome, '.omnimux-dev', 'profiles', 'omnimux')
    mkdirSync(p, { recursive: true })
    writeFileSync(join(p, 'package.json'), JSON.stringify({
      name: 'omnimux-profile-mock',
      dependencies: {},
      dsh: { profile: { bundles: [] } },
    }, null, 2))
  })

  after(() => {
    try {
      rmSync(fakeHome, { recursive: true, force: true })
    } catch {}
  })

  it('sync-to-app.sh help documents --mvp option', () => {
    const res = spawnSync('bash', [syncToAppScript, '--help'], {
      cwd: root,
      encoding: 'utf8',
    })
    assert.equal(res.status, 1)
    assert.match(res.stdout, /--mvp/)
  })

  it('sync-stable.sh in Full mode includes all 11 plugins in bundles and dependencies', () => {
    const res = spawnSync('bash', [syncStableScript], {
      cwd: root,
      env: syncEnv({ OMNIMUX_MVP: '0' }),
      encoding: 'utf8',
    })
    assert.equal(res.status, 0, `sync-stable failed:\n${res.stderr}\n${res.stdout}`)

    const { bundles, dependencies } = readProfileBundles('.omnimux-dev')
    for (const name of MVP_EXCLUDED) {
      assert.ok(bundles.includes(name), `Full mode must include ${name} in bundles`)
      assert.ok(dependencies[name], `Full mode must include ${name} in dependencies`)
    }
    assert.ok(bundles.includes('omnimux'))
    assert.ok(bundles.includes('omnimux-assets'))
  })

  it('sync-stable.sh --mvp excludes all 4 plugins from bundles and dependencies', () => {
    const res = spawnSync('bash', [syncStableScript, '--mvp'], {
      cwd: root,
      env: syncEnv({ OMNIMUX_MVP: '0' }),
      encoding: 'utf8',
    })
    assert.equal(res.status, 0, `sync-stable --mvp failed:\n${res.stderr}\n${res.stdout}`)

    const { bundles, dependencies } = readProfileBundles('.omnimux-dev')
    for (const name of MVP_EXCLUDED) {
      assert.equal(bundles.includes(name), false, `MVP mode must exclude ${name} from bundles`)
      assert.equal(Boolean(dependencies[name]), false, `MVP mode must remove ${name} from dependencies`)
    }

    // Core and remaining domain plugins stay preserved
    assert.ok(bundles.includes('omnimux'), 'omnimux core must remain in bundles')
    assert.ok(bundles.includes('omnimux-assets'), 'omnimux-assets must remain in bundles')
    assert.ok(bundles.includes('omnimux-products'), 'omnimux-products must remain in bundles')
    assert.ok(bundles.includes('omnimux-market'), 'omnimux-market must remain in bundles')
    assert.ok(bundles.includes('omnimux-inspiration'), 'omnimux-inspiration must remain in bundles')
    assert.ok(bundles.includes('omnimux-clip'), 'omnimux-clip must remain in bundles')
    assert.ok(bundles.includes('omnimux-video'), 'omnimux-video must remain in bundles')
  })

  it('sync-stable.sh with OMNIMUX_MVP=1 environment variable activates MVP mode', () => {
    const res = spawnSync('bash', [syncStableScript], {
      cwd: root,
      env: syncEnv({ OMNIMUX_MVP: '1' }),
      encoding: 'utf8',
    })
    assert.equal(res.status, 0, `sync-stable with OMNIMUX_MVP=1 failed:\n${res.stderr}\n${res.stdout}`)

    const { bundles, dependencies } = readProfileBundles('.omnimux-dev')
    for (const name of MVP_EXCLUDED) {
      assert.equal(bundles.includes(name), false, `OMNIMUX_MVP=1 must exclude ${name} from bundles`)
      assert.equal(Boolean(dependencies[name]), false, `OMNIMUX_MVP=1 must exclude ${name} from dependencies`)
    }
  })

  it('re-running sync-stable.sh in Full mode reverses back, adding all 4 plugins again', () => {
    const res = spawnSync('bash', [syncStableScript], {
      cwd: root,
      env: syncEnv({ OMNIMUX_MVP: '0' }),
      encoding: 'utf8',
    })
    assert.equal(res.status, 0, `sync-stable revert failed:\n${res.stderr}\n${res.stdout}`)

    const { bundles, dependencies } = readProfileBundles('.omnimux-dev')
    for (const name of MVP_EXCLUDED) {
      assert.ok(bundles.includes(name), `Reverted Full mode must re-add ${name} to bundles`)
      assert.ok(dependencies[name], `Reverted Full mode must re-add ${name} to dependencies`)
    }
  })

  it('Hub gate in MVP mode disables official social tools and honors explicit overrides', () => {
    const hubConfig = parseHubConfig({ mvp: true })
    assert.equal(hubConfig.gate.mvp, true)

    // Excluded official tools are disabled
    assert.equal(isToolEnabled(hubConfig.gate, 'omnimux_accounts_list'), false)
    assert.equal(isToolEnabled(hubConfig.gate, 'omnimux_publish_create'), false)
    assert.equal(isToolEnabled(hubConfig.gate, 'omnimux_analytics_daily_metrics'), false)

    // Other tools remain enabled
    assert.equal(isToolEnabled(hubConfig.gate, 'omnimux_social_data'), true)
    assert.equal(isToolEnabled(hubConfig.gate, 'omnimux_inspiration_list'), true)

    // Explicit override in tools re-enables specific tool
    const overrideGate = parseGateConfig({
      mvp: true,
      tools: {
        omnimux_accounts_list: true,
      },
    })
    assert.equal(isToolEnabled(overrideGate, 'omnimux_accounts_list'), true)
    assert.equal(isToolEnabled(overrideGate, 'omnimux_accounts_connect'), false)

    // assertCapabilityEnabled throws for MVP disabled tool
    assert.throws(() => {
      assertCapabilityEnabled(hubConfig.gate, 'omnimux_publish_create', 'tool')
    }, /disabled by capability gate/)
  })
})
