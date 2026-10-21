import assert from 'node:assert/strict'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { createTokenStore } from './store.js'

describe('token store (canonical 0600 file)', () => {
  it('sets and unsets a file-backed token in canonical secrets.json with 0600 mode', async () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'omnimux-auth-home-'))
    const configDir = mkdtempSync(join(tmpdir(), 'omnimux-auth-cfg-'))
    const store = createTokenStore({ homeDir, configDir })
    try {
      assert.equal((await store.describe()).configured, false)
      await store.set('pat-test-1')
      assert.equal(await store.resolve(), 'pat-test-1')
      const desc = await store.describe()
      assert.equal(desc.configured, true)
      assert.equal(desc.source, 'secrets')

      // Verify secrets.json permissions and content
      const secretsPath = join(configDir, 'secrets.json')
      assert.equal(existsSync(secretsPath), true)
      const secretsStat = statSync(secretsPath)
      assert.equal(secretsStat.mode & 0o777, 0o600)

      const secretsContent = JSON.parse(readFileSync(secretsPath, 'utf8'))
      assert.equal(secretsContent.access_token, 'pat-test-1')
      assert.equal(secretsContent.active_slot, 'desktop:default')
      assert.equal(secretsContent.slots['desktop:default'].access_token, 'pat-test-1')
      assert.equal(typeof secretsContent.slots['desktop:default'].updated_at, 'number')

      store.writeProfileCache({ username: 'ada' })
      assert.equal(store.readProfileCache().username, 'ada')
      assert.equal(existsSync(join(configDir, 'profile.json')), true)
      assert.equal(existsSync(join(homeDir, 'omnimux', 'profile.json')), false)

      await store.unset()
      assert.equal(await store.resolve(), undefined)
      assert.equal(store.readProfileCache(), null)
      assert.equal(existsSync(secretsPath), false)
    } finally {
      rmSync(homeDir, { recursive: true, force: true })
      rmSync(configDir, { recursive: true, force: true })
    }
  })

  it('canonical secrets.json takes precedence over credentials seam so CLI updates reflect immediately', async () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'omnimux-auth-home-'))
    const configDir = mkdtempSync(join(tmpdir(), 'omnimux-auth-cfg-'))
    /** @type {Record<string, string>} */
    const mem = { OMNIMUX_ACCESS_TOKEN: 'stale-token-in-credentials-yaml' }
    const store = createTokenStore({
      homeDir,
      configDir,
      credentials: {
        async resolve(ref) {
          const value = mem[ref]
          return value ? { value, source: 'credentials' } : undefined
        },
        async describe(ref) {
          return { configured: Boolean(mem[ref]), source: 'credentials', writable: true }
        },
        async set(ref, value) {
          mem[ref] = value
        },
        async unset(ref) {
          delete mem[ref]
        },
      },
    })
    try {
      // 1. Initially without secrets.json, falls back to credentials seam
      assert.equal(await store.resolve(), 'stale-token-in-credentials-yaml')
      assert.equal((await store.describe()).source, 'credentials')

      // 2. When CLI logs in and writes secrets.json + config.json
      const secretsPath = join(configDir, 'secrets.json')
      writeFileSync(secretsPath, JSON.stringify({
        version: 1,
        active_slot: 'cli:default',
        access_token: 'fresh-token-from-cli',
        slots: { 'cli:default': { access_token: 'fresh-token-from-cli' } },
      }), { mode: 0o600 })

      // App immediately resolves fresh CLI token instead of being shadowed by stale credentials
      assert.equal(await store.resolve(), 'fresh-token-from-cli')
      assert.equal((await store.describe()).source, 'secrets')

      // 3. When App logs in, updates secrets.json and config.json
      await store.set('app-token-2', { userId: '101', baseUrl: 'https://omnimux.ai' })
      assert.equal(await store.resolve(), 'app-token-2')
      const cfgPath = join(configDir, 'config.json')
      assert.equal(existsSync(cfgPath), true)
      const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'))
      assert.equal(cfg.user_id, '101')
      assert.equal(cfg.base_url, 'https://omnimux.ai')

      // 4. Logout cleans token and config user_id
      await store.unset()
      assert.equal(await store.resolve(), undefined)
      assert.equal(existsSync(secretsPath), false)
    } finally {
      rmSync(homeDir, { recursive: true, force: true })
      rmSync(configDir, { recursive: true, force: true })
    }
  })

  it('env OMNIMUX_ACCESS_TOKEN overrides credentials and storage without persisting to disk', async () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'omnimux-auth-home-'))
    const configDir = mkdtempSync(join(tmpdir(), 'omnimux-auth-cfg-'))
    const store = createTokenStore({
      homeDir,
      configDir,
      env: { OMNIMUX_ACCESS_TOKEN: 'pat-from-env' },
    })
    try {
      const resolved = await store.resolve()
      assert.equal(resolved, 'pat-from-env')
      const desc = await store.describe()
      assert.equal(desc.configured, true)
      assert.equal(desc.source, 'env')
      assert.equal(desc.writable, false)

      const secretsPath = join(configDir, 'secrets.json')
      assert.equal(existsSync(secretsPath), false)
    } finally {
      rmSync(homeDir, { recursive: true, force: true })
      rmSync(configDir, { recursive: true, force: true })
    }
  })

  it('reads flat CLI secrets.json format as well as slot-structured format', async () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'omnimux-auth-home-'))
    const configDir = mkdtempSync(join(tmpdir(), 'omnimux-auth-cfg-'))

    // 1. Flat format: { "access_token": "pat-cli" }
    const secretsPath = join(configDir, 'secrets.json')
    writeFileSync(secretsPath, JSON.stringify({ access_token: 'pat-cli-flat' }), { mode: 0o600 })

    const storeFlat = createTokenStore({ homeDir, configDir })
    assert.equal(await storeFlat.resolve(), 'pat-cli-flat')

    // 2. Slot format: { active_slot: "cli:default", slots: { ... } }
    writeFileSync(
      secretsPath,
      JSON.stringify({
        version: 1,
        active_slot: 'cli:default',
        slots: {
          'cli:default': { access_token: 'pat-cli-slot' },
          'desktop:default': { access_token: 'pat-desktop' },
        },
      }),
      { mode: 0o600 },
    )

    const storeSlot = createTokenStore({ homeDir, configDir })
    assert.equal(await storeSlot.resolve(), 'pat-cli-slot')

    rmSync(homeDir, { recursive: true, force: true })
    rmSync(configDir, { recursive: true, force: true })
  })

  it('enforces 0600 mode on existing secrets.json with loose permissions', async () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'omnimux-auth-home-'))
    const configDir = mkdtempSync(join(tmpdir(), 'omnimux-auth-cfg-'))
    const secretsPath = join(configDir, 'secrets.json')

    writeFileSync(secretsPath, JSON.stringify({ access_token: 'pat-loose' }), { mode: 0o644 })
    const store = createTokenStore({ homeDir, configDir })
    assert.equal(await store.resolve(), 'pat-loose')

    const stat = statSync(secretsPath)
    assert.equal(stat.mode & 0o777, 0o600)

    rmSync(homeDir, { recursive: true, force: true })
    rmSync(configDir, { recursive: true, force: true })
  })

  it('preserves other slots during set and unset operations', async () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'omnimux-auth-home-'))
    const configDir = mkdtempSync(join(tmpdir(), 'omnimux-auth-cfg-'))
    const secretsPath = join(configDir, 'secrets.json')

    writeFileSync(
      secretsPath,
      JSON.stringify({
        version: 1,
        active_slot: 'cli:default',
        access_token: 'pat-cli',
        slots: {
          'cli:default': { access_token: 'pat-cli', updated_at: 100 },
        },
      }),
      { mode: 0o600 },
    )

    const store = createTokenStore({ homeDir, configDir, slot: 'desktop:default' })
    await store.set('pat-desktop-new')

    const afterSet = JSON.parse(readFileSync(secretsPath, 'utf8'))
    assert.equal(afterSet.slots['cli:default'].access_token, 'pat-cli')
    assert.equal(afterSet.slots['desktop:default'].access_token, 'pat-desktop-new')
    assert.equal(afterSet.active_slot, 'desktop:default')

    // Unset desktop slot: cli slot remains
    await store.unset()
    assert.equal(existsSync(secretsPath), true)
    const afterUnset = JSON.parse(readFileSync(secretsPath, 'utf8'))
    assert.equal(afterUnset.slots['desktop:default'], undefined)
    assert.equal(afterUnset.slots['cli:default'].access_token, 'pat-cli')
    assert.equal(afterUnset.active_slot, 'cli:default')

    rmSync(homeDir, { recursive: true, force: true })
    rmSync(configDir, { recursive: true, force: true })
  })

  it('bidirectional single-sign-on: CLI login immediately unlocks App, and App login immediately unlocks CLI without collision', async () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'omnimux-auth-home-'))
    const configDir = mkdtempSync(join(tmpdir(), 'omnimux-auth-cfg-'))

    const appStore = createTokenStore({ homeDir, configDir })
    const secretsPath = join(configDir, 'secrets.json')
    const configPath = join(configDir, 'config.json')

    try {
      // 1. Initially neither is logged in
      assert.equal(await appStore.resolve(), undefined)
      assert.equal((await appStore.describe()).configured, false)

      // 2. CLI performs login and writes canonical secrets.json + config.json
      writeFileSync(
        secretsPath,
        JSON.stringify({
          version: 1,
          active_slot: 'cli:default',
          access_token: 'cli-user-pat-42',
          slots: {
            'cli:default': { access_token: 'cli-user-pat-42', user_id: '42', updated_at: 1000 },
          },
        }),
        { mode: 0o600 },
      )
      writeFileSync(
        configPath,
        JSON.stringify({
          base_url: 'https://omnimux.ai',
          user_id: '42',
        }),
        { mode: 0o600 },
      )

      // 3. App immediately shares and resolves CLI login state
      assert.equal(await appStore.resolve(), 'cli-user-pat-42')
      const appDesc = await appStore.describe()
      assert.equal(appDesc.configured, true)
      assert.equal(appDesc.source, 'secrets')
      assert.equal(appStore.readConfig().user_id, '42')

      // 4. App updates login (e.g. user re-authenticated via App UI)
      await appStore.set('app-user-pat-99', { userId: '99', baseUrl: 'https://omnimux.ai' })

      // 5. Verification: CLI secrets.json & config.json are seamlessly updated with new token and user_id
      const secretsRaw = JSON.parse(readFileSync(secretsPath, 'utf8'))
      assert.equal(secretsRaw.access_token, 'app-user-pat-99')
      const configRaw = JSON.parse(readFileSync(configPath, 'utf8'))
      assert.equal(configRaw.user_id, '99')
      assert.equal(configRaw.base_url, 'https://omnimux.ai')

      // 6. Explicit logout removes credentials completely
      await appStore.unset()
      assert.equal(await appStore.resolve(), undefined)
      assert.equal(existsSync(secretsPath), false)
      assert.equal(appStore.readConfig()?.user_id, undefined)
    } finally {
      rmSync(homeDir, { recursive: true, force: true })
      rmSync(configDir, { recursive: true, force: true })
    }
  })

  it('cleans up stale login-flows files on initialization', async () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'omnimux-auth-home-'))
    const configDir = mkdtempSync(join(tmpdir(), 'omnimux-auth-cfg-'))
    const flowsDir = join(configDir, 'login-flows')
    mkdirSync(flowsDir, { recursive: true })

    const staleFile = join(flowsDir, 'stale-flow.json')
    const freshFile = join(flowsDir, 'fresh-flow.json')
    const expiredByField = join(flowsDir, 'expired-field.json')

    const baseTime = 1700000000000
    writeFileSync(staleFile, JSON.stringify({ device_code: 'abc' }))
    const oldTime = (baseTime - 48 * 60 * 60 * 1000) / 1000
    try {
      utimesSync(staleFile, oldTime, oldTime)
    } catch {
      // ignore
    }

    writeFileSync(freshFile, JSON.stringify({ device_code: 'def', expires_at: baseTime + 600000 }))
    writeFileSync(expiredByField, JSON.stringify({ device_code: 'ghi', expires_at: baseTime - 1000 }))

    createTokenStore({
      homeDir,
      configDir,
      now: () => baseTime,
    })

    assert.equal(existsSync(staleFile), false)
    assert.equal(existsSync(expiredByField), false)
    assert.equal(existsSync(freshFile), true)

    rmSync(homeDir, { recursive: true, force: true })
    rmSync(configDir, { recursive: true, force: true })
  })

  it('Dev and Prod homes share one profile.json under configDir, not $DSH_HOME', async () => {
    const configDir = mkdtempSync(join(tmpdir(), 'omnimux-auth-shared-cfg-'))
    const devHome = mkdtempSync(join(tmpdir(), 'omnimux-dev-home-'))
    const prodHome = mkdtempSync(join(tmpdir(), 'omnimux-prod-home-'))
    try {
      const devStore = createTokenStore({ homeDir: devHome, configDir })
      await devStore.set('shared-pat')
      devStore.writeProfileCache({ id: 1, username: 'admin', display_name: 'Root User', quota_usd: 10 })

      const prodStore = createTokenStore({ homeDir: prodHome, configDir })
      assert.equal(await prodStore.resolve(), 'shared-pat')
      assert.equal(prodStore.readProfileCache().username, 'admin')
      assert.equal(prodStore.profilePath, join(configDir, 'profile.json'))
      assert.equal(existsSync(join(devHome, 'omnimux', 'profile.json')), false)
      assert.equal(existsSync(join(prodHome, 'omnimux', 'profile.json')), false)
    } finally {
      rmSync(configDir, { recursive: true, force: true })
      rmSync(devHome, { recursive: true, force: true })
      rmSync(prodHome, { recursive: true, force: true })
    }
  })

  it('lifts a leftover $DSH_HOME profile cache into the shared config dir once', async () => {
    const configDir = mkdtempSync(join(tmpdir(), 'omnimux-auth-lift-cfg-'))
    const homeDir = mkdtempSync(join(tmpdir(), 'omnimux-auth-lift-home-'))
    const prev = process.env.NODE_TEST_CONTEXT
    try {
      mkdirSync(join(homeDir, 'omnimux'), { recursive: true })
      writeFileSync(join(homeDir, 'omnimux', 'profile.json'), JSON.stringify({ id: 7, username: 'legacy' }))
      delete process.env.NODE_TEST_CONTEXT
      const store = createTokenStore({ homeDir, configDir })
      assert.equal(store.readProfileCache().username, 'legacy')
      assert.equal(existsSync(join(configDir, 'profile.json')), true)
    } finally {
      if (prev === undefined) delete process.env.NODE_TEST_CONTEXT
      else process.env.NODE_TEST_CONTEXT = prev
      rmSync(configDir, { recursive: true, force: true })
      rmSync(homeDir, { recursive: true, force: true })
    }
  })

  it('node:test runs do not touch real ~/.config/omnimux/secrets.json', async () => {
    const realSecrets = join(homedir(), '.config', 'omnimux', 'secrets.json')
    const hadSecrets = existsSync(realSecrets)
    const store = createTokenStore({ homeDir: join(homedir(), '.dsh') })
    await store.set('pat-must-not-escape')
    assert.equal(existsSync(realSecrets), hadSecrets)
    assert.notEqual(store.secretsPath, realSecrets)
    await store.unset()
  })
})

describe('logout cleanup failures are observable and propagated', () => {
  it('normal logout stays silent and removes secrets, config user_id and profile cache', async () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'omnimux-auth-home-'))
    const configDir = mkdtempSync(join(tmpdir(), 'omnimux-auth-cfg-'))
    /** @type {string[]} */
    const warnings = []
    const store = createTokenStore({
      homeDir,
      configDir,
      logger: { warn(message) { warnings.push(String(message)) } },
    })
    try {
      await store.set('pat-normal-logout', { userId: '42', baseUrl: 'https://omnimux.ai' })
      store.writeProfileCache({ username: 'ada' })

      await store.unset()

      assert.deepEqual(warnings, [])
      assert.equal(await store.resolve(), undefined)
      assert.equal(existsSync(store.secretsPath), false)
      assert.equal(store.readConfig()?.user_id, undefined)
      assert.equal(existsSync(store.profilePath), false)
    } finally {
      rmSync(homeDir, { recursive: true, force: true })
      rmSync(configDir, { recursive: true, force: true })
    }
  })

  it('rejects with the failed step when secrets.json cannot be removed, and still runs later steps', async () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'omnimux-auth-home-'))
    const configDir = mkdtempSync(join(tmpdir(), 'omnimux-auth-cfg-'))
    /** @type {string[]} */
    const warnings = []
    /** @type {string[]} */
    const seamUnsets = []
    const store = createTokenStore({
      homeDir,
      configDir,
      logger: { warn(message) { warnings.push(String(message)) } },
      credentials: {
        async unset(ref) {
          seamUnsets.push(String(ref))
        },
      },
    })
    try {
      await store.set('pat-secrets-stuck', { userId: '42' })
      store.writeProfileCache({ username: 'ada' })
      // A directory at the secrets path makes rmSync fail without deleting token material.
      rmSync(store.secretsPath, { force: true })
      mkdirSync(store.secretsPath)

      await assert.rejects(store.unset(), (error) => {
        assert.match(error.message, /unsetSecrets failed:/)
        assert.match(error.message, /logout cleanup incomplete/)
        return true
      })

      assert.equal(warnings.length, 1)
      assert.match(warnings[0], /unsetSecrets failed:/)
      assert.equal(/pat-secrets-stuck|access_token/.test(warnings.join('\n')), false)
      assert.equal(store.readConfig()?.user_id, undefined, 'config user_id cleanup still ran')
      assert.equal(existsSync(store.profilePath), false, 'profile cache cleanup still ran')
      assert.equal(seamUnsets.length, 1, 'credentials seam cleanup still ran')
    } finally {
      rmSync(homeDir, { recursive: true, force: true })
      rmSync(configDir, { recursive: true, force: true })
    }
  })

  it('rejects with the failed step when config.json cannot be atomically rewritten', async () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'omnimux-auth-home-'))
    const configDir = mkdtempSync(join(tmpdir(), 'omnimux-auth-cfg-'))
    const profileDir = mkdtempSync(join(tmpdir(), 'omnimux-auth-profile-'))
    /** @type {string[]} */
    const warnings = []
    const store = createTokenStore({
      homeDir,
      configDir,
      profilePath: join(profileDir, 'profile.json'),
      logger: { warn(message) { warnings.push(String(message)) } },
    })
    try {
      writeFileSync(
        store.configPath,
        JSON.stringify({ user_id: '42', base_url: 'https://omnimux.ai' }),
        { mode: 0o600 },
      )
      store.writeProfileCache({ username: 'ada' })
      // Read-only parent directory defeats the atomic tmp-file + rename without hiding config.json.
      chmodSync(configDir, 0o500)

      await assert.rejects(store.unset(), (error) => {
        assert.match(error.message, /unsetConfig failed:/)
        assert.match(error.message, /logout cleanup incomplete/)
        return true
      })

      assert.equal(warnings.length, 1)
      assert.match(warnings[0], /unsetConfig failed:/)
      assert.equal(existsSync(store.secretsPath), false)
      const configAfter = JSON.parse(readFileSync(store.configPath, 'utf8'))
      assert.equal(configAfter.user_id, '42', 'failed cleanup must leave config visible, not fake success')
      assert.equal(existsSync(store.profilePath), false, 'profile cache cleanup still ran after config failure')
    } finally {
      chmodSync(configDir, 0o700)
      rmSync(homeDir, { recursive: true, force: true })
      rmSync(configDir, { recursive: true, force: true })
      rmSync(profileDir, { recursive: true, force: true })
    }
  })

  it('never echoes token material when both file cleanups fail', async () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'omnimux-auth-home-'))
    const configDir = mkdtempSync(join(tmpdir(), 'omnimux-auth-cfg-'))
    const profileDir = mkdtempSync(join(tmpdir(), 'omnimux-auth-profile-'))
    /** @type {string[]} */
    const warnings = []
    const store = createTokenStore({
      homeDir,
      configDir,
      profilePath: join(profileDir, 'profile.json'),
      logger: { warn(message) { warnings.push(String(message)) } },
    })
    try {
      await store.set('pat-must-not-leak', { userId: '42', baseUrl: 'https://omnimux.ai' })
      chmodSync(configDir, 0o500)

      /** @type {Error | undefined} */
      let rejection
      try {
        await store.unset()
      } catch (error) {
        rejection = /** @type {Error} */ (error)
      }

      assert.ok(rejection instanceof Error)
      assert.match(rejection.message, /unsetSecrets failed:/)
      assert.match(rejection.message, /unsetConfig failed:/)
      const trace = `${rejection.message}\n${warnings.join('\n')}`
      assert.equal(/pat-must-not-leak|access_token/.test(trace), false)
      assert.equal(warnings.length, 2)
    } finally {
      chmodSync(configDir, 0o700)
      rmSync(homeDir, { recursive: true, force: true })
      rmSync(configDir, { recursive: true, force: true })
      rmSync(profileDir, { recursive: true, force: true })
    }
  })

  it('collects a credentials seam failure while file-backed credentials are still removed', async () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'omnimux-auth-home-'))
    const configDir = mkdtempSync(join(tmpdir(), 'omnimux-auth-cfg-'))
    /** @type {string[]} */
    const warnings = []
    const store = createTokenStore({
      homeDir,
      configDir,
      logger: { warn(message) { warnings.push(String(message)) } },
      credentials: {
        async unset() {
          throw new Error('seam unavailable')
        },
      },
    })
    try {
      await store.set('pat-seam-residual', { userId: '42' })
      store.writeProfileCache({ username: 'ada' })

      await assert.rejects(store.unset(), /credentials\.unset failed: seam unavailable/)

      assert.equal(warnings.length, 1)
      assert.match(warnings[0], /credentials\.unset failed: seam unavailable/)
      assert.equal(existsSync(store.secretsPath), false)
      assert.equal(store.readConfig()?.user_id, undefined)
      assert.equal(existsSync(store.profilePath), false)
    } finally {
      rmSync(homeDir, { recursive: true, force: true })
      rmSync(configDir, { recursive: true, force: true })
    }
  })

  it('falls back to console.warn when no logger is injected', async () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'omnimux-auth-home-'))
    const configDir = mkdtempSync(join(tmpdir(), 'omnimux-auth-cfg-'))
    const store = createTokenStore({ homeDir, configDir })
    const originalWarn = console.warn
    /** @type {string[]} */
    const captured = []
    try {
      mkdirSync(store.secretsPath)
      console.warn = (message) => {
        captured.push(String(message))
      }
      await assert.rejects(store.unset(), /unsetSecrets failed:/)
    } finally {
      console.warn = originalWarn
      rmSync(homeDir, { recursive: true, force: true })
      rmSync(configDir, { recursive: true, force: true })
    }
    assert.equal(captured.length, 1)
    assert.match(captured[0], /unsetSecrets failed:/)
  })

  it('does not turn an env-token logout into a 5xx when the credentials seam refuses unset', async () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'omnimux-auth-home-'))
    const configDir = mkdtempSync(join(tmpdir(), 'omnimux-auth-cfg-'))
    /** @type {string[]} */
    const warnings = []
    /** @type {string[]} */
    const seamUnsets = []
    const store = createTokenStore({
      homeDir,
      configDir,
      env: { OMNIMUX_ACCESS_TOKEN: 'pat-from-env' },
      logger: { warn(message) { warnings.push(String(message)) } },
      credentials: {
        // Mirrors the official credentials-local seam: unset throws while the env shadows it.
        async unset(ref) {
          seamUnsets.push(String(ref))
          throw new Error('credential is shadowed by the environment')
        },
      },
    })
    try {
      await store.set('pat-env-ignored', { userId: '42', baseUrl: 'https://omnimux.ai' })
      store.writeProfileCache({ username: 'ada' })

      // env token is process configuration; logout must still clear the on-disk copies.
      await store.unset()

      assert.deepEqual(warnings, [], 'env-token logout has no cleanup failure to report')
      assert.deepEqual(seamUnsets, [], 'env override is not a persisted credential; seam unset is skipped')
      assert.equal(existsSync(store.secretsPath), false)
      assert.equal(store.readConfig()?.user_id, undefined)
      assert.equal(existsSync(store.profilePath), false)
    } finally {
      rmSync(homeDir, { recursive: true, force: true })
      rmSync(configDir, { recursive: true, force: true })
    }
  })
})
