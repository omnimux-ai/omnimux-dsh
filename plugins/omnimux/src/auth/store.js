import { chmodSync, existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { homedir, tmpdir } from 'node:os'
import { atomicWriteFileSync } from './atomic-write.js'
import { CREDENTIAL_REF } from './omnimux-auth.js'

/**
 * @param {string | undefined} homeDir
 */
export function resolveDshHome(homeDir) {
  return homeDir || process.env.DSH_HOME || join(homedir(), '.dsh')
}

/**
 * Scans and cleans up stale login flow files in ~/.config/omnimux/login-flows/
 * @param {string} configDir
 * @param {() => number} nowFn
 */
function cleanupStaleLoginFlows(configDir, nowFn) {
  const flowsDir = join(configDir, 'login-flows')
  try {
    if (!existsSync(flowsDir)) return
    const entries = readdirSync(flowsDir)
    const currentTime = nowFn()
    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue
      const filePath = join(flowsDir, entry)
      try {
        const stat = statSync(filePath)
        const isOlderThan24h = currentTime - stat.mtimeMs > 24 * 60 * 60 * 1000
        let isExpiredAt = false
        try {
          const raw = JSON.parse(readFileSync(filePath, 'utf8'))
          if (raw && typeof raw.expires_at === 'number' && raw.expires_at < currentTime) {
            isExpiredAt = true
          }
        } catch {
          // ignore json parse error
        }
        if (isOlderThan24h || isExpiredAt) {
          rmSync(filePath, { force: true })
        }
      } catch {
        // ignore per-file stat error
      }
    }
  } catch {
    // ignore directory error
  }
}

function runningUnderNodeTest() {
  return Boolean(process.env.NODE_TEST_CONTEXT)
}

/**
 * Resolves a thrown value into a loggable message without touching token material.
 * @param {unknown} error
 */
function errorDetail(error) {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Wraps a failed logout cleanup step so callers can act on the step name.
 * @param {string} step
 * @param {unknown} error
 */
function cleanupStepError(step, error) {
  const wrapped = new Error(`${step} failed: ${errorDetail(error)}`)
  wrapped.cleanupStep = step
  wrapped.cause = error
  return /** @type {Error & { cleanupStep: string, cause: unknown }} */ (wrapped)
}

/**
 * One-shot copy of a home-local profile cache into the shared config dir.
 * Never reads ~/.dsh as an ongoing auth path; only lifts the previous
 * `$DSH_HOME/omnimux/profile.json` when the canonical file is absent.
 * @param {{ dest: string, legacy: string, skip: boolean }} opts
 */
function migrateLegacyProfileCache(opts) {
  if (opts.skip) return
  try {
    if (existsSync(opts.dest) || !existsSync(opts.legacy)) return
    const raw = readFileSync(opts.legacy, 'utf8')
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return
    atomicWriteFileSync(opts.dest, raw.endsWith('\n') ? raw : `${raw}\n`, { mode: 0o600, dirMode: 0o700 })
  } catch {
    // absent or unreadable legacy cache is not fatal
  }
}

/**
 * Creates the single canonical token store backed by ~/.config/omnimux/secrets.json (0600).
 * No OS Keychain dependencies; no legacy migration overhead.
 *
 * @param {{
 *   credentials?: { resolve?: Function, set?: Function, unset?: Function, describe?: Function },
 *   homeDir?: string,
 *   configDir?: string,
 *   env?: Record<string, string | undefined>,
 *   now?: () => number,
 *   profilePath?: string,
 *   seamCleanupMarkerPath?: string,
 *   logger?: { warn: (message: string) => void },
 * }} [opts]
 */
export function createTokenStore(opts = {}) {
  const env = opts.env || process.env
  const underTest = runningUnderNodeTest()
  const now = opts.now || Date.now
  const home = resolveDshHome(opts.homeDir)
  const realDshHome = join(homedir(), '.dsh')
  const realConfigDir = join(homedir(), '.config', 'omnimux')
  const sandboxRoot = join(tmpdir(), `omnimux-node-test-${process.pid}`)
  const pinchesRealHome = underTest && home === realDshHome
  const configDir = opts.configDir || (underTest ? join(sandboxRoot, 'config') : realConfigDir)
  const secretsPath = join(configDir, 'secrets.json')
  const configPath = join(configDir, 'config.json')
  // Public profile cache lives next to secrets/config so CLI, Dev App and
  // Prod App share one account picture. $DSH_HOME stays plugin/project data.
  const profilePath = opts.profilePath || (pinchesRealHome
    ? join(sandboxRoot, 'profile.json')
    : join(configDir, 'profile.json'))
  const credentials = opts.credentials
  // Cleanup failures must stay observable even when tests or callers replace the logger.
  const logger = opts.logger && typeof opts.logger.warn === 'function' ? opts.logger : console

  /**
   * Leaves a credential-free trace (step + error message) of a failed logout cleanup.
   * @param {string} step
   * @param {unknown} error
   */
  function logCleanupFailure(step, error) {
    logger.warn(`[omnimux-auth] ${step} failed: ${errorDetail(error)}`)
  }

  // Logout can leave a seam mirror behind when OMNIMUX_ACCESS_TOKEN shadows the
  // official credentials seam (its `set`/`unset` both assertUnshadowed). The marker
  // records that fact — ref/reason/time only, never token material — so a later
  // start without the env override can finish the deletion through the official seam.
  // Scope MUST be the same as the seam ($DSH_HOME), not the shared configDir: Dev and
  // Prod homes share ~/.config/omnimux but have separate .credentials.yaml files
  // (Issue #3514 review B1).
  const seamCleanupMarkerPath = opts.seamCleanupMarkerPath
    || (pinchesRealHome ? join(sandboxRoot, 'seam-cleanup-pending.json') : join(home, 'omnimux', 'seam-cleanup-pending.json'))

  /** Marker whose content does not match our schema: keep it for inspection, warn, never act on it. */
  const INVALID_SEAM_MARKER = Object.freeze({ invalid: true })

  /** Raw env override, matching the official seam's `inherited()` (raw length > 0). */
  function envOverrideToken() {
    const value = env.OMNIMUX_ACCESS_TOKEN
    return typeof value === 'string' && value.length > 0 ? value : ''
  }

  /** @returns {{ version?: number, ref?: string, reason?: string, createdAt?: string } | null | { invalid: true }} */
  function readSeamCleanupMarker() {
    try {
      const raw = JSON.parse(readFileSync(seamCleanupMarkerPath, 'utf8'))
      if (!raw || typeof raw !== 'object' || raw.version !== 1 || raw.ref !== CREDENTIAL_REF || raw.reason !== 'env-shadowed-logout') {
        logCleanupFailure('seam cleanup marker', new Error('unexpected marker shape; leaving it for inspection (delete it after confirming no resident token)'))
        return INVALID_SEAM_MARKER
      }
      return raw
    } catch (error) {
      if (/** @type {NodeJS.ErrnoException} */ (error)?.code === 'ENOENT') return null
      logCleanupFailure('seam cleanup marker', error)
      return INVALID_SEAM_MARKER
    }
  }

  /** @param {string} reason */
  function writeSeamCleanupMarker(reason) {
    try {
      atomicWriteFileSync(
        seamCleanupMarkerPath,
        `${JSON.stringify({ version: 1, ref: CREDENTIAL_REF, reason, createdAt: new Date(now()).toISOString() }, null, 2)}\n`,
        { mode: 0o600, dirMode: 0o700 },
      )
    } catch (error) {
      logCleanupFailure('seam cleanup marker', error)
    }
  }

  function clearSeamCleanupMarker() {
    try {
      rmSync(seamCleanupMarkerPath, { force: true })
    } catch (error) {
      logCleanupFailure('seam cleanup marker', error)
    }
  }

  /**
   * One-shot cleanup of a seam mirror left by a logout made while the env token
   * shadowed the official seam. Only runs when the env override is gone, no
   * canonical token is active (still logged out) and the marker matches our ref;
   * otherwise the marker is kept for the next start.
   * Never rejects: failures keep the marker and are logged, so startup is unaffected.
   * @returns {Promise<boolean>}
   */
  async function cleanupPendingSeamMirror() {
    try {
      const marker = readSeamCleanupMarker()
      if (!marker || marker === INVALID_SEAM_MARKER) return false
      if (envOverrideToken()) return false
      if (readSecrets()?.token) {
        // Still logged in: the canonical token is authoritative and the seam may now
        // be a legitimate mirror. Keep the marker so a later logout (or an external
        // canonical removal) still converges; do NOT delete a live login's seam token.
        return false
      }
      if (!credentials || typeof credentials.unset !== 'function') return false
      try {
        await credentials.unset(CREDENTIAL_REF)
      } catch (error) {
        logCleanupFailure('credentials.unset (pending seam mirror)', error)
        return false
      }
      clearSeamCleanupMarker()
      return true
    } catch (error) {
      logCleanupFailure('seam cleanup', error)
      return false
    }
  }

  migrateLegacyProfileCache({
    dest: profilePath,
    legacy: join(home, 'omnimux', 'profile.json'),
    skip: underTest || pinchesRealHome || Boolean(opts.profilePath),
  })

  let expired = false

  // Never sweep the operator's real login-flows directory from unit tests.
  if (!underTest || Boolean(opts.configDir)) {
    cleanupStaleLoginFlows(configDir, now)
  }

  // Fire-and-forget startup convergence for a seam mirror left by an env-shadowed
  // logout. resolve()/describe() await it so callers never observe the stale token
  // after the env override has been removed.
  const seamCleanup = cleanupPendingSeamMirror()

  function isExpired() {
    return expired
  }

  function markExpired() {
    expired = true
  }

  function clearExpired() {
    expired = false
  }

  /**
   * Reads config.json (non-secret user configuration).
   * @returns {Record<string, unknown> | null}
   */
  function readConfig() {
    try {
      if (!existsSync(configPath)) return null
      const raw = JSON.parse(readFileSync(configPath, 'utf8'))
      return raw && typeof raw === 'object' ? raw : null
    } catch {
      return null
    }
  }

  /**
   * Writes/patches config.json (e.g. user_id, base_url).
   * @param {{ userId?: string | number, baseUrl?: string, autoUpdate?: boolean }} patch
   */
  function writeConfig(patch = {}) {
    const existing = readConfig() || {}
    const payload = { ...existing }
    if (patch.baseUrl) payload.base_url = String(patch.baseUrl).trim()
    if (patch.userId != null) payload.user_id = String(patch.userId).trim()
    if (patch.autoUpdate !== undefined) payload.auto_update = Boolean(patch.autoUpdate)
    atomicWriteFileSync(configPath, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600, dirMode: 0o700 })
  }

  /**
   * Cleans user_id in config.json on explicit logout.
   * Absent/already-clean files are success; a real write failure is logged and thrown
   * so logout cannot report success while config.json still carries account state.
   */
  function unsetConfig() {
    try {
      if (!existsSync(configPath)) return
      const existing = readConfig()
      if (existing && typeof existing === 'object') {
        delete existing.user_id
        if (Object.keys(existing).filter((k) => k !== 'base_url' && k !== 'auto_update').length === 0 && !existing.base_url) {
          rmSync(configPath, { force: true })
        } else {
          atomicWriteFileSync(configPath, `${JSON.stringify(existing, null, 2)}\n`, { mode: 0o600, dirMode: 0o700 })
        }
      }
    } catch (error) {
      logCleanupFailure('unsetConfig', error)
      throw cleanupStepError('unsetConfig', error)
    }
  }

  /**
   * Reads secrets.json and extracts token.
   * Ensures 0600 permissions if the file exists.
   * @returns {{ token?: string, raw?: Record<string, unknown> } | null}
   */
  function readSecrets() {
    try {
      if (!existsSync(secretsPath)) return null
      try {
        const stat = statSync(secretsPath)
        if ((stat.mode & 0o777) !== 0o600) {
          chmodSync(secretsPath, 0o600)
        }
      } catch {
        // ignore chmod failure
      }
      const raw = JSON.parse(readFileSync(secretsPath, 'utf8'))
      if (!raw || typeof raw !== 'object') return null

      let token = undefined
      if (typeof raw.access_token === 'string' && raw.access_token.trim()) {
        token = raw.access_token.trim()
      } else if (raw.active_slot && raw.slots && typeof raw.slots === 'object') {
        const slot = raw.slots[raw.active_slot]
        if (slot && typeof slot.access_token === 'string' && slot.access_token.trim()) {
          token = slot.access_token.trim()
        }
      }
      return { token, raw }
    } catch {
      return null
    }
  }

  /**
   * Writes token to secrets.json using atomic write (tmp -> fsync -> 0600 -> rename).
   * @param {string} token
   */
  function writeSecrets(token) {
    const existing = readSecrets()?.raw || {}
    const slots = existing.slots && typeof existing.slots === 'object' ? { ...existing.slots } : {}
    const targetSlot = typeof opts.slot === 'string' && opts.slot ? opts.slot : (existing.active_slot || 'desktop:default')

    slots[targetSlot] = {
      ...(slots[targetSlot] && typeof slots[targetSlot] === 'object' ? slots[targetSlot] : {}),
      access_token: token,
      updated_at: now(),
    }

    const payload = {
      version: typeof existing.version === 'number' ? existing.version : 1,
      active_slot: targetSlot,
      access_token: token,
      slots,
    }

    atomicWriteFileSync(secretsPath, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600, dirMode: 0o700 })
  }

  /**
   * Cleans up token in secrets.json on explicit logout.
   * Absent/already-clean files are success; a real removal/rewrite failure is logged
   * and thrown so logout cannot report success while the token stays on disk.
   */
  function unsetSecrets() {
    try {
      if (!existsSync(secretsPath)) return
      if (!opts.slot) {
        rmSync(secretsPath, { force: true })
        return
      }

      const existing = readSecrets()?.raw
      if (!existing || typeof existing !== 'object') {
        rmSync(secretsPath, { force: true })
        return
      }

      const slots = existing.slots && typeof existing.slots === 'object' ? { ...existing.slots } : {}
      delete slots[opts.slot]
      if (existing.active_slot === opts.slot) {
        delete existing.active_slot
      }

      const remainingSlots = Object.keys(slots).filter((k) => slots[k] && slots[k].access_token)
      if (remainingSlots.length === 0) {
        rmSync(secretsPath, { force: true })
      } else {
        const nextActive = remainingSlots[0]
        const payload = {
          version: existing.version || 1,
          active_slot: nextActive,
          access_token: slots[nextActive].access_token,
          slots,
        }
        atomicWriteFileSync(secretsPath, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600, dirMode: 0o700 })
      }
    } catch (error) {
      logCleanupFailure('unsetSecrets', error)
      throw cleanupStepError('unsetSecrets', error)
    }
  }

  /**
   * Resolves active access token across the 3-level pipeline:
   * Level 1: env OMNIMUX_ACCESS_TOKEN (explicit process override)
   * Level 2: Canonical ~/.config/omnimux/secrets.json (Single Source of Truth for shared CLI + App auth)
   * Level 3: DSH credentials seam ($DSH_HOME/.credentials.yaml fallback)
   *
   * @returns {Promise<string | undefined>}
   */
  async function resolve() {
    // 0. Finish any pending seam-mirror cleanup before deciding what is configured.
    await seamCleanup

    // 1. Process environment override
    const envToken = typeof env.OMNIMUX_ACCESS_TOKEN === 'string' ? env.OMNIMUX_ACCESS_TOKEN.trim() : ''
    if (envToken) return envToken

    // 2. Canonical secrets.json file (0600) — Single Source of Truth for shared CLI + App
    const secrets = readSecrets()
    if (secrets?.token) return secrets.token

    // 3. Credentials seam fallback
    if (credentials && typeof credentials.resolve === 'function') {
      try {
        const hit = await credentials.resolve(CREDENTIAL_REF)
        if (hit && typeof hit.value === 'string' && hit.value.trim()) return hit.value.trim()
      } catch {
        // fall through
      }
    }

    return undefined
  }

  /**
   * Describes the current token configuration state.
   * @returns {Promise<{ configured: boolean, source?: string, writable: boolean }>}
   */
  async function describe() {
    // 0. Finish any pending seam-mirror cleanup before deciding what is configured.
    await seamCleanup

    // 1. Process environment override
    const envToken = typeof env.OMNIMUX_ACCESS_TOKEN === 'string' ? env.OMNIMUX_ACCESS_TOKEN.trim() : ''
    if (envToken) {
      return { configured: true, source: 'env', writable: false }
    }

    // 2. Canonical secrets.json file (0600)
    const secrets = readSecrets()
    if (secrets?.token) {
      return { configured: true, source: 'secrets', writable: true }
    }

    // 3. Credentials seam fallback
    if (credentials && typeof credentials.describe === 'function') {
      try {
        const info = await credentials.describe(CREDENTIAL_REF)
        if (info && typeof info.configured === 'boolean' && info.configured) {
          return { configured: true, source: info.source || 'credentials', writable: info.writable !== false }
        }
      } catch {
        // fall through
      }
    }

    return { configured: false, source: undefined, writable: true }
  }

  /**
   * Sets new access token into canonical secrets.json.
   * @param {string} value
   * @param {{ userId?: string | number, baseUrl?: string }} [extra]
   */
  async function set(value, extra = {}) {
    if (!value || typeof value !== 'string' || !value.trim()) {
      throw new Error('empty access token')
    }
    const token = value.trim()
    clearExpired()

    // 1. Write to canonical secrets.json
    writeSecrets(token)

    // 2. Sync to canonical config.json if metadata is present
    if (extra && (extra.userId != null || extra.baseUrl)) {
      writeConfig({ userId: extra.userId, baseUrl: extra.baseUrl })
    }

    // 3. Best-effort mirror to credentials seam
    if (credentials && typeof credentials.set === 'function') {
      try {
        await credentials.set(CREDENTIAL_REF, token)
        // A fresh login supersedes any earlier env-shadowed logout residue.
        clearSeamCleanupMarker()
      } catch {
        // ignore credentials seam write errors (env-shadowed seam refuses set too)
      }
    }
  }

  /**
   * Cleans up token on explicit user logout.
   * Every step runs independently so one failure cannot leave later credential
   * copies behind; the aggregated failure then propagates so HTTP logout is 5xx.
   */
  async function unset() {
    clearExpired()

    // OMNIMUX_ACCESS_TOKEN is explicit process-level configuration, not a credential
    // this store persisted; logout owns the on-disk copies only. The official
    // credentials seam refuses `unset` while the env shadows it (assertUnshadowed),
    // so a shadowed seam failure is recorded as a known residue instead of a 5xx.
    const envOverride = Boolean(envOverrideToken())

    /** @type {string[]} */
    const failedSteps = []
    /** @type {Array<[string, () => void | Promise<void>]>} */
    const cleanupSteps = [
      // 1. Canonical secrets.json (logs + throws on real failure)
      ['unsetSecrets', () => unsetSecrets()],
      // 2. config.json user_id (logs + throws on real failure)
      ['unsetConfig', () => unsetConfig()],
      // 3. Credentials seam: a stale seam value still resolves after logout.
      //    Always attempt it; under an env override the seam refuses by design, so
      //    the refusal is kept visible as a warning (seam mirror may survive) rather
      //    than failing a logout whose active credential is process config.
      ['credentials.unset', async () => {
        if (!credentials || typeof credentials.unset !== 'function') return
        try {
          await credentials.unset(CREDENTIAL_REF)
          // The seam no longer holds a copy, so any earlier pending marker is moot.
          clearSeamCleanupMarker()
        } catch (error) {
          if (!envOverride) throw error
          logCleanupFailure('credentials.unset', error)
          // Defer the seam deletion until the env override is gone (official seam
          // refuses writes while shadowed); do not turn this logout into a 5xx.
          // Always record a marker: while the env shadows the seam, the official
          // describe()/resolve() report only the env layer, so there is no public
          // way to tell whether a file copy exists. A marker for an env-only setup
          // converges into one harmless no-op unset on the next start (review B2).
          writeSeamCleanupMarker('env-shadowed-logout')
        }
      }],
      // 4. Profile cache
      ['profile cache cleanup', () => rmSync(profilePath, { force: true })],
    ]

    for (const [step, run] of cleanupSteps) {
      try {
        await run()
      } catch (error) {
        // unsetSecrets/unsetConfig warn and tag the step before throwing; only
        // the remaining steps need their warning emitted here.
        const tagged = error instanceof Error && typeof (/** @type {Error & { cleanupStep?: string }} */ (error)).cleanupStep === 'string'
        if (!tagged) logCleanupFailure(step, error)
        const detail = error instanceof Error && error.cause instanceof Error ? error.cause.message : errorDetail(error)
        failedSteps.push(`${step} failed: ${detail}`)
      }
    }

    if (failedSteps.length > 0) {
      throw new Error(`logout cleanup incomplete: ${failedSteps.join('; ')}`)
    }
  }

  function readProfileCache() {
    try {
      const raw = JSON.parse(readFileSync(profilePath, 'utf8'))
      return raw && typeof raw === 'object' ? raw : null
    } catch {
      return null
    }
  }

  /**
   * @param {Record<string, unknown>} profile
   */
  function writeProfileCache(profile) {
    atomicWriteFileSync(profilePath, `${JSON.stringify(profile)}\n`, { mode: 0o600, dirMode: 0o700 })
  }

  return {
    resolve,
    describe,
    set,
    unset,
    /** Pending env-shadowed seam-mirror cleanup; awaited by resolve()/describe(). */
    seamCleanup,
    seamCleanupMarkerPath,
    readProfileCache,
    writeProfileCache,
    markExpired,
    isExpired,
    clearExpired,
    profilePath,
    configDir,
    configPath,
    secretsPath,
    readConfig,
    writeConfig,
    unsetConfig,
  }
}
