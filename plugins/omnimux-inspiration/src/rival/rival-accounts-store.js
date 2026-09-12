/**
 * Persistence for the rival-accounts module: accounts, config, the daily budget
 * ledger and the per-account post cache.
 *
 * Two rules this file exists to enforce:
 *
 * 1. **Whitelist constructors.** `buildAccountRow` / `buildPostRow` / `buildConfig`
 *    name every persisted field. This repository has lost state twice to the same
 *    bug — a field written by a handler that the row builder never copied, so the
 *    write "succeeded" and the value never came back. A caller's extra key is
 *    dropped on purpose, and `rival-accounts-store.test.js` asserts that.
 * 2. **Atomic writes.** Every write goes to a temp file and is renamed into
 *    place, so a crash cannot leave a half-written store behind.
 *
 * The clock is injected (`now`) instead of read from `Date.now()` so the daily
 * reset and backoff arithmetic are assertable.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { resolveRivalPaths, rivalDirs, rivalPostsFile } from './rival-paths.js'
import {
  BUDGET_REASONS,
  BACKOFF_MINUTES,
  IDENTITY_KINDS,
  LIMIT_CALLS_GLOBAL_DAY,
  LIMIT_CALLS_PER_ACCOUNT_CYCLE,
  LIMIT_CALLS_PER_ACCOUNT_DAY,
  MANUAL_COOLDOWN_MINUTES,
  POSTS_CACHE_MAX_ROWS,
  POSTS_PER_REFRESH,
  REFRESH_INTERVAL_CHOICES,
  REFRESH_INTERVAL_HOURS_DEFAULT,
  REFRESH_STATES,
  RIVAL_ID_PREFIX,
  VIEWS_HISTORY_MAX,
} from './constants.js'

export class RivalStoreError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {number} [status]
   */
  constructor(code, message, status = 400) {
    super(message)
    this.name = 'RivalStoreError'
    this.code = code
    this.status = status
  }
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/**
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number}
 */
function finiteNumber(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/**
 * @param {unknown} value
 * @returns {number | null}
 */
function nullableNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function nullableText(value) {
  return typeof value === 'string' && value !== '' ? value : null
}

/**
 * Persisted account row. Every field the module can write is named here.
 * @param {Record<string, any>} record
 * @param {{ id?: string, created_at?: string, now: string }} identity
 * @returns {Record<string, any>}
 */
export function buildAccountRow(record, identity) {
  const source = isPlainObject(record) ? record : {}
  const metrics = isPlainObject(source.metrics) ? source.metrics : {}
  const analysis = isPlainObject(source.analysis) ? source.analysis : {}
  const niche = isPlainObject(analysis.niche) ? analysis.niche : {}
  const state = REFRESH_STATES.includes(source.refresh_state) ? source.refresh_state : 'idle'
  const identityKind = IDENTITY_KINDS.includes(source.external_id_kind) ? source.external_id_kind : 'username'
  const interval = REFRESH_INTERVAL_CHOICES.includes(source.refresh_interval_hours)
    ? source.refresh_interval_hours
    : REFRESH_INTERVAL_HOURS_DEFAULT
  return {
    id: identity.id || String(source.id || `${RIVAL_ID_PREFIX}${randomUUID().slice(0, 8)}`),
    platform: typeof source.platform === 'string' ? source.platform : '',
    external_id: typeof source.external_id === 'string' ? source.external_id : '',
    external_id_kind: identityKind,
    external_id_canonical: nullableText(source.external_id_canonical),
    handle: typeof source.handle === 'string' ? source.handle : '',
    profile_url: typeof source.profile_url === 'string' ? source.profile_url : '',
    nickname: typeof source.nickname === 'string' ? source.nickname : '',
    avatar_url: typeof source.avatar_url === 'string' ? source.avatar_url : '',
    bio: typeof source.bio === 'string' ? source.bio : '',
    tags: Array.isArray(source.tags) ? source.tags.filter((tag) => typeof tag === 'string' && tag) : [],
    followers: nullableNumber(source.followers),
    posts_count: nullableNumber(source.posts_count),
    refresh_interval_hours: interval,
    last_refresh_at: nullableText(source.last_refresh_at),
    next_auto_refresh_at: nullableText(source.next_auto_refresh_at),
    last_success_at: nullableText(source.last_success_at),
    refresh_state: state,
    error_code: nullableText(source.error_code),
    error_message: nullableText(source.error_message),
    consecutive_failures: finiteNumber(source.consecutive_failures, 0),
    refresh_count: finiteNumber(source.refresh_count, 0),
    cloud_calls_today: finiteNumber(source.cloud_calls_today, 0),
    metrics: {
      latest: {
        followers: nullableNumber(metrics.latest?.followers ?? source.followers),
        posts_count: nullableNumber(metrics.latest?.posts_count ?? source.posts_count),
        avg_views_recent: finiteNumber(metrics.latest?.avg_views_recent, 0),
      },
      previous: {
        followers: nullableNumber(metrics.previous?.followers),
        posts_count: nullableNumber(metrics.previous?.posts_count),
        avg_views_recent: finiteNumber(metrics.previous?.avg_views_recent, 0),
      },
      delta_pct: {
        followers: nullableNumber(metrics.delta_pct?.followers),
        posts_count: nullableNumber(metrics.delta_pct?.posts_count),
        avg_views_recent: nullableNumber(metrics.delta_pct?.avg_views_recent),
      },
    },
    analysis: {
      avg_views: finiteNumber(analysis.avg_views, 0),
      median_views: finiteNumber(analysis.median_views, 0),
      avg_likes: finiteNumber(analysis.avg_likes, 0),
      avg_comments: finiteNumber(analysis.avg_comments, 0),
      posting_frequency_per_week: finiteNumber(analysis.posting_frequency_per_week, 0),
      activity_level: typeof analysis.activity_level === 'string' ? analysis.activity_level : '--',
      niche: {
        primary: typeof niche.primary === 'string' ? niche.primary : '--',
        confidence: finiteNumber(niche.confidence, 0),
      },
      computed_at: nullableText(analysis.computed_at),
    },
    created_at: identity.created_at || nullableText(source.created_at) || identity.now,
    updated_at: identity.now,
  }
}

/**
 * One page of `views_history` is `{ at, views }`; anything else is dropped so a
 * malformed row cannot grow the cache file without bound.
 * @param {unknown} value
 * @returns {Array<{ at: string, views: number }>}
 */
function buildViewsHistory(value) {
  if (!Array.isArray(value)) return []
  return value
    .filter((entry) => isPlainObject(entry) && typeof entry.at === 'string' && typeof entry.views === 'number')
    .map((entry) => ({ at: entry.at, views: entry.views }))
    .slice(-VIEWS_HISTORY_MAX)
}

/**
 * Persisted post row.
 * @param {Record<string, any>} record
 * @param {{ now: string, accountId?: string, platform?: string, existing?: Record<string, any> | null }} ctx
 * @returns {Record<string, any>}
 */
export function buildPostRow(record, ctx) {
  const source = isPlainObject(record) ? record : {}
  const stats = isPlainObject(source.stats) ? source.stats : {}
  const potential = isPlainObject(source.potential) ? source.potential : {}
  const history = buildViewsHistory(source.metrics?.views_history ?? ctx.existing?.metrics?.views_history)
  const views = nullableNumber(stats.views)
  if (views !== null) {
    const last = history[history.length - 1]
    if (!last || last.views !== views || last.at !== ctx.now) history.push({ at: ctx.now, views })
  }
  const firstSeen = ctx.existing?.first_seen_at || nullableText(source.first_seen_at) || ctx.now
  return {
    id: String(source.id || ''),
    account_id: nullableText(source.account_id) || nullableText(ctx.accountId) || '',
    platform: nullableText(source.platform) || nullableText(ctx.platform) || '',
    url: typeof source.url === 'string' ? source.url : '',
    title: typeof source.title === 'string' ? source.title : '',
    text: typeof source.text === 'string' ? source.text : '',
    posted_at: nullableText(source.posted_at),
    type: typeof source.type === 'string' ? source.type : 'text',
    cover_url: typeof source.cover_url === 'string' ? source.cover_url : '',
    cover_local_path: nullableText(source.cover_local_path),
    cover_http_url: nullableText(source.cover_http_url),
    video_url: nullableText(source.video_url),
    video_local_path: nullableText(source.video_local_path),
    duration: nullableNumber(source.duration),
    stats: {
      views: nullableNumber(stats.views),
      likes: nullableNumber(stats.likes),
      comments: nullableNumber(stats.comments),
      shares: nullableNumber(stats.shares),
      saves: nullableNumber(stats.saves),
    },
    potential: {
      flagged: Boolean(potential.flagged),
      rules: Array.isArray(potential.rules) ? potential.rules.filter((rule) => typeof rule === 'string') : [],
      reason_keys: Array.isArray(potential.reason_keys)
        ? potential.reason_keys.filter((key) => typeof key === 'string')
        : [],
      scored_at: nullableText(potential.scored_at),
      score: nullableNumber(potential.score),
    },
    inspiration_id: nullableText(source.inspiration_id),
    in_library: Boolean(source.in_library),
    metrics: { views_history: history.slice(-VIEWS_HISTORY_MAX) },
    first_seen_at: firstSeen,
    last_seen_at: ctx.now,
  }
}

/**
 * Persisted config. Thresholds are read from `constants.js`, never from a
 * caller, so a request can never widen its own budget.
 * @param {Record<string, any>} [patch]
 * @param {string} now
 * @returns {Record<string, any>}
 */
export function buildConfig(patch = {}, now) {
  const source = isPlainObject(patch) ? patch : {}
  return {
    version: 1,
    refresh_interval_hours: REFRESH_INTERVAL_CHOICES.includes(source.refresh_interval_hours)
      ? source.refresh_interval_hours
      : REFRESH_INTERVAL_HOURS_DEFAULT,
    posts_per_refresh: POSTS_PER_REFRESH,
    limits: {
      cloud_calls_per_account_per_cycle: LIMIT_CALLS_PER_ACCOUNT_CYCLE,
      cloud_calls_per_account_per_day: LIMIT_CALLS_PER_ACCOUNT_DAY,
      cloud_calls_global_per_day: LIMIT_CALLS_GLOBAL_DAY,
    },
    backoff_minutes: [...BACKOFF_MINUTES],
    manual_cooldown_minutes: { ...MANUAL_COOLDOWN_MINUTES },
    l1_analyze_enabled: source.l1_analyze_enabled !== false,
    media_download: {
      cover: source.media_download?.cover !== false,
      avatar: source.media_download?.avatar !== false,
      video: 'on-demand',
    },
    posts_cache_max_rows: POSTS_CACHE_MAX_ROWS,
    updated_at: now,
  }
}

/**
 * @param {unknown} value
 * @param {string | null} dayOverride local day the ledger belongs to, set by the
 *   rollover reset; the stored `day` is kept when it is null.
 * @returns {Record<string, any>}
 */
function buildBudget(value, dayOverride) {
  const source = isPlainObject(value) ? value : {}
  const perAccount = {}
  if (isPlainObject(source.per_account)) {
    for (const [id, entry] of Object.entries(source.per_account)) {
      if (!isPlainObject(entry)) continue
      perAccount[id] = { calls: finiteNumber(entry.calls, 0), manual: finiteNumber(entry.manual, 0) }
    }
  }
  const paused = isPlainObject(source.paused) ? source.paused : {}
  return {
    version: 1,
    day: typeof dayOverride === 'string' && dayOverride ? dayOverride : String(source.day || ''),
    global_calls: finiteNumber(source.global_calls, 0),
    global_calls_manual: finiteNumber(source.global_calls_manual, 0),
    per_account: perAccount,
    paused: {
      global: Boolean(paused.global),
      reason: nullableText(paused.reason),
      paused_at: nullableText(paused.paused_at),
    },
  }
}

/** @param {string} iso */
function localDay(iso) {
  return new Date(iso).toISOString().slice(0, 10)
}

/**
 * Dedup key of the requirement-2 identity: `platform + external_id`.
 *
 * The `@` is decoration, not identity, so it is stripped on both sides of the
 * comparison: `x.com/@bar` and `x.com/bar` are one account, and a row written
 * before the import path settled on the `@`-prefixed form (a bare `foo`) still
 * matches. Stripping is idempotent, so it does not matter how many times it is
 * applied; a YouTube channel id (`UC…`) has no `@` and passes through unchanged.
 *
 * Comparison is deliberately *looser* than storage: only one form is ever
 * written, but any legacy form still resolves.
 * @param {unknown} value
 * @returns {string}
 */
function identityKey(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

/**
 * Budget ledgers whose pause is a *daily* fact, and the account state that
 * pause is written as. A rollover lifts these; every other pause reason
 * (`identity-unverified`, an exhausted retry `error`, a user-hold) is a fact the
 * user or the cloud has to change, so it survives the boundary.
 */
const DAILY_CAP_REASONS = new Set([
  BUDGET_REASONS.GLOBAL_DAILY_CAP,
  BUDGET_REASONS.ACCOUNT_DAILY_CAP,
  BUDGET_REASONS.PER_CYCLE_CAP,
])
/** Refresh state a cap pause is written as; the account state is not touched. */
const CAP_PAUSE_STATE = 'paused'

/**
 * @param {{ paths?: import('./rival-paths.js').RivalPaths, now?: () => number, homeDir?: string, env?: NodeJS.ProcessEnv }} [opts]
 */
export function createRivalAccountsStore(opts = {}) {
  const paths = opts.paths ?? resolveRivalPaths({ homeDir: opts.homeDir, env: opts.env })
  const now = typeof opts.now === 'function' ? opts.now : () => Date.now()
  // `limits` exists so a test can widen the daily allowance and assert the
  // behaviour *under* it; production callers never pass one and the constants
  // module stays the single source of truth.
  const limitsOverride = isPlainObject(opts.limits) ? opts.limits : null
  const nowIso = () => new Date(now()).toISOString()

  /** @type {Promise<unknown>} */
  let exclusiveTail = Promise.resolve()

  /**
   * Serialize read-modify-write windows that span an await. Single-tick
   * mutations are already atomic in Node and are not chained: doing so would
   * force every caller onto a promise it does not need.
   * @template T
   * @param {() => T | Promise<T>} work
   * @returns {Promise<T>}
   */
  function runExclusive(work) {
    const result = exclusiveTail.then(() => work())
    exclusiveTail = result.then(() => undefined, () => undefined)
    return result
  }

  function ensureDirs() {
    for (const dir of rivalDirs(paths)) {
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    }
  }

  /**
   * @param {string} file
   * @returns {Record<string, any>}
   */
  function readJson(file) {
    if (!existsSync(file)) return {}
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf8'))
      return isPlainObject(parsed) ? parsed : {}
    } catch {
      return {}
    }
  }

  /**
   * @param {string} file
   * @param {Record<string, any>} payload
   */
  function writeJson(file, payload) {
    ensureDirs()
    const temp = `${file}.${randomUUID()}.tmp`
    try {
      writeFileSync(temp, JSON.stringify(payload, null, 2), 'utf8')
      renameSync(temp, file)
    } catch (err) {
      try { if (existsSync(temp)) unlinkSync(temp) } catch { /* best effort */ }
      throw err
    }
  }

  /** @returns {Record<string, any>} */
  function readConfigFile() {
    const raw = readJson(paths.configFile)
    const config = Object.keys(raw).length > 0 ? buildConfig(raw, nowIso()) : buildConfig({}, nowIso())
    if (!limitsOverride) return config
    return { ...config, limits: { ...config.limits, ...limitsOverride } }
  }

  /** @returns {Record<string, any>[]} */
  function readAccountRows() {
    const raw = readJson(paths.accountsFile)
    return Array.isArray(raw.items) ? raw.items : []
  }

  /** @param {Record<string, any>[]} items */
  function writeAccountRows(items) {
    writeJson(paths.accountsFile, { version: 1, items, updated_at: nowIso() })
  }

  /**
   * @param {string} accountId
   * @returns {Record<string, any>}
   */
  function readPostFile(accountId) {
    const raw = readJson(rivalPostsFile(paths, accountId))
    return isPlainObject(raw) ? raw : {}
  }

  /**
   * Read the budget from disk, resetting it when the local day rolled over.
   *
   * A rollover clears the counters *and* the pause: the pause was raised by a
   * daily cap that no longer applies, and carrying it across the boundary would
   * leave the module refusing work for a reason the user can no longer act on.
   *
   * The release runs on **both** this path and `writeBudget`'s, because either
   * one can be the first budget touch of a new day: the pause can be lifted
   * while a spend is being recorded just as easily as while the ledger is being
   * read, and a release that only happened on one of them would leave the
   * account parked depending on which call arrived first. It is keyed on the
   * *rollover*, not on the day: a same-day read must not undo a pause the ledger
   * still says is correct.
   * @returns {Record<string, any>}
   */
  function readBudget() {
    const today = localDay(nowIso())
    const raw = readJson(paths.budgetFile)
    if (Object.keys(raw).length === 0) return buildBudget({}, today)
    const stored = buildBudget(raw, null)
    if (stored.day === today) return stored
    releaseDailyCapPauses(today)
    return buildBudget({ day: today }, today)
  }

  /**
   * The ledger exactly as stored: no rollover rebuild, no side effects.
   *
   * Unlike `readBudget` it does not substitute today's date, because the
   * *stored* day is the fact the caller needs — a ledger can already have been
   * rebuilt for today while still carrying yesterday's counters, and "does this
   * cap still apply?" is a question about today's numbers.
   *
   * This is also the seam that keeps `releaseDailyCapPauses` from calling
   * `readBudget`, which calls back into the release.
   * @returns {Record<string, any>}
   */
  function readStoredBudget() {
    return buildBudget(readJson(paths.budgetFile), null)
  }

  /**
   * `paused → idle` for the accounts a daily cap parked, at the rollover.
   *
   * `rival-refresh.js` treats `paused` as terminal for the tick, so a cap pause
   * that outlived the ledger it came from would stop that account's automatic
   * refresh for good — the state machine's `paused → idle : 跨日重置` promise,
   * and the "跨日自动恢复" copy the UI shows, both unmet.
   *
   * Only cap pauses are touched: the reason is read back off `error_code`, so
   * `identity-unverified`, an exhausted backoff `error`, and any state a future
   * user-hold introduces stay parked.
   *
   * The released account is also made **due**, by anchoring
   * `next_auto_refresh_at` at the start of the new day. A successful cycle sets
   * that timestamp to `now + interval` and the ledger check happens before it,
   * so a parked account still carries a moment hours in the future — releasing
   * it to `idle` alone would leave `isRefreshDue()` false and the tick would
   * skip it anyway.
   *
   * A pause the ledger *still* refuses is left exactly as it was. Releasing on
   * the rollover alone would be wrong for an account that spends its whole
   * allowance again the very next day: it would read `idle`, be queued by the
   * tick, and be refused on every attempt. The account's own ledger entry is the
   * authority — the same entry `reserve` refuses on.
   *
   * The pause *also* lives in `budget.paused.global`; the rebuilt budget clears
   * that copy of it.
   *
   * Exposed so the scheduler can run it at the top of a tick: a process that was
   * down across midnight would otherwise only notice when something happened to
   * write the budget first.
   * @param {string} [day] local day now in effect
   */
  function releaseDailyCapPauses(day = localDay(nowIso())) {
    const items = readAccountRows()
    if (items.length === 0) return
    const limits = readConfigFile().limits
    // A stored ledger from an earlier day has already spent its allowance: the
    // caps it enforced do not carry over, and `readBudget` has not necessarily
    // rebuilt it yet. Reading the stored day is what makes the release
    // independent of which budget touch happens to come first.
    const stored = readStoredBudget()
    const budget = stored.day === day ? stored : buildBudget({}, day)
    const iso = nowIso()
    let changed = false
    const released = items.map((row) => {
      if (row.refresh_state !== CAP_PAUSE_STATE) return row
      if (!DAILY_CAP_REASONS.has(String(row.error_code || ''))) return row
      // The cap that parked it no longer applies if this account could reserve a
      // cycle against today's ledger.
      const used = finiteNumber(budget.per_account[row.id]?.calls, 0)
      const overAccountCap = used + LIMIT_CALLS_PER_ACCOUNT_CYCLE > limits.cloud_calls_per_account_per_day
      const overGlobalCap = budget.global_calls + LIMIT_CALLS_PER_ACCOUNT_CYCLE > limits.cloud_calls_global_per_day
      if (budget.paused.global || overAccountCap || overGlobalCap) return row
      // `refresh_interval_hours === 0` means "manual only": the account has no
      // automatic schedule to resume, so it is not given one.
      const nextAt = finiteNumber(row.refresh_interval_hours, 0) > 0 ? `${day}T00:00:00.000Z` : null
      changed = true
      return buildAccountRow(
        {
          ...row,
          refresh_state: 'idle',
          error_code: null,
          error_message: null,
          next_auto_refresh_at: nextAt,
        },
        { id: row.id, created_at: row.created_at, now: iso },
      )
    })
    if (changed) writeAccountRows(released)
  }

  /**
   * @param {Record<string, any>} budget
   * @returns {Record<string, any>}
   */
  function writeBudget(budget) {
    const today = localDay(nowIso())
    const raw = readJson(paths.budgetFile)
    const rolledOver = raw && typeof raw.day === 'string' && raw.day !== '' && raw.day !== today
    const next = buildBudget({ ...budget, day: today }, today)
    writeJson(paths.budgetFile, next)
    // A spend or a refusal can be the first budget touch of a new day, so the
    // release is duplicated here rather than left to `readBudget`. It only runs
    // on an actual rollover: a same-day write must not lift a live pause.
    if (rolledOver) releaseDailyCapPauses(today)
    return next
  }

  /**
   * Whether an account's next refresh is due.
   * @param {Record<string, any>} account
   * @param {number} [atMs]
   * @returns {boolean}
   */
  function isRefreshDue(account, atMs) {
    if (!account || account.refresh_state === 'error' || account.refresh_interval_hours === 0) return false
    const at = typeof atMs === 'number' ? atMs : now()
    const due = Date.parse(String(account.next_auto_refresh_at || ''))
    if (Number.isNaN(due)) return true
    return due <= at
  }

  return {
    paths,

    runExclusive,
    now,
    nowIso,

    // ── config ────────────────────────────────────────────────────────────
    readConfig: readConfigFile,

    /**
     * @param {Record<string, any>} patch
     * @returns {Record<string, any>}
     */
    writeConfig(patch) {
      const next = buildConfig({ ...readConfigFile(), ...(isPlainObject(patch) ? patch : {}) }, nowIso())
      writeJson(paths.configFile, next)
      return next
    },

    // ── accounts ──────────────────────────────────────────────────────────
    /** @returns {Record<string, any>[]} */
    listAccounts() {
      return readAccountRows()
    },

    /**
     * @param {string} id
     * @returns {Record<string, any> | null}
     */
    getAccount(id) {
      return readAccountRows().find((row) => row.id === id) || null
    },

    /**
     * Dedup key of requirement 2: `platform + external_id`, `@`-insensitive.
     * @param {string} platform
     * @param {string} externalId
     * @returns {Record<string, any> | null}
     */
    findAccount(platform, externalId) {
      const key = identityKey(externalId)
      if (!platform || !key) return null
      return readAccountRows().find(
        (row) => row.platform === platform && identityKey(row.external_id) === key,
      ) || null
    },

    /**
     * @param {Record<string, any>} record
     * @returns {Record<string, any>}
     */
    addAccount(record) {
      const iso = nowIso()
      const row = buildAccountRow(record, { now: iso })
      const items = readAccountRows()
      items.push(row)
      writeAccountRows(items)
      return row
    },

    /**
     * @param {string} id
     * @param {Record<string, any>} patch
     * @returns {Record<string, any>}
     */
    updateAccount(id, patch) {
      const items = readAccountRows()
      const index = items.findIndex((row) => row.id === id)
      if (index === -1) throw new RivalStoreError('account-not-found', `对标账号不存在 (account not found): ${id}`, 404)
      const current = items[index]
      const merged = { ...current, ...(isPlainObject(patch) ? patch : {}) }
      // Nested objects merge field-by-field: a patch that only advances
      // `metrics.latest` must not drop `metrics.previous` and lose the
      // comparison the monitor view is built from.
      for (const key of ['metrics', 'analysis']) {
        if (isPlainObject(patch) && isPlainObject(patch[key])) {
          merged[key] = { ...current[key], ...patch[key] }
          if (isPlainObject(patch[key].niche) || isPlainObject(current[key]?.niche)) {
            merged[key].niche = { ...current[key]?.niche, ...patch[key]?.niche }
          }
        }
      }
      const row = buildAccountRow(merged, { id: current.id, created_at: current.created_at, now: nowIso() })
      items[index] = row
      writeAccountRows(items)
      return row
    },

    /**
     * @param {string} id
     * @returns {{ removed: true, account: Record<string, any> }}
     */
    removeAccount(id) {
      const items = readAccountRows()
      const index = items.findIndex((row) => row.id === id)
      if (index === -1) throw new RivalStoreError('account-not-found', `对标账号不存在 (account not found): ${id}`, 404)
      const [removed] = items.splice(index, 1)
      writeAccountRows(items)
      try {
        const file = rivalPostsFile(paths, id)
        if (existsSync(file)) rmSync(file)
      } catch { /* the row is gone; a stale cache file is not fatal */ }
      return { removed: true, account: removed }
    },

    // ── posts ─────────────────────────────────────────────────────────────
    /**
     * @param {string} accountId
     * @returns {{ account_id: string, platform: string, external_id: string, last_refresh_at: string | null, carry_over: number, field_probe: Record<string, string | null>, items: Record<string, any>[] }}
     */
    readPostsFile(accountId) {
      const raw = readPostFile(accountId)
      return {
        account_id: accountId,
        platform: typeof raw.platform === 'string' ? raw.platform : '',
        external_id: typeof raw.external_id === 'string' ? raw.external_id : '',
        last_refresh_at: nullableText(raw.last_refresh_at),
        carry_over: finiteNumber(raw.carry_over, 0),
        field_probe: isPlainObject(raw.field_probe) ? raw.field_probe : {},
        items: Array.isArray(raw.items) ? raw.items : [],
      }
    },

    /**
     * @param {string} accountId
     * @returns {Record<string, any>[]}
     */
    readPosts(accountId) {
      return this.readPostsFile(accountId).items
    },

    /**
     * Merge a refresh's rows into the cache.
     *
     * Rows the answer did not mention are kept (a hidden or deleted post must not
     * silently vanish from the user's list) and counted in `carry_over`; the
     * whole list is then trimmed to `posts_cache_max_rows`, newest first.
     * @param {string} accountId
     * @param {Record<string, any>[]} rows
     * @param {{ platform?: string, externalId?: string, fieldProbe?: Record<string, string | null>, replace?: boolean }} [meta]
     * @returns {{ items: Record<string, any>[], carry_over: number }}
     */
    writePosts(accountId, rows, meta = {}) {
      const iso = nowIso()
      const previous = readPostFile(accountId)
      const previousItems = Array.isArray(previous.items) ? previous.items : []
      const previousById = new Map(previousItems.map((row) => [String(row.id), row]))
      const incoming = Array.isArray(rows) ? rows : []
      const incomingIds = new Set(incoming.map((row) => String(row.id)))

      /** @type {Record<string, any>[]} */
      const merged = []
      for (const row of incoming) {
        const existing = previousById.get(String(row.id)) || null
        merged.push(buildPostRow({ ...row, platform: meta.platform ?? previous.platform ?? row.platform },
          { now: iso, accountId, platform: meta.platform ?? previous.platform, existing }))
      }
      if (!meta.replace) {
        for (const row of previousItems) {
          if (incomingIds.has(String(row.id))) continue
          merged.push(row)
        }
      }

      const sorted = merged.slice().sort((a, b) => {
        const left = Date.parse(String(a.posted_at || ''))
        const right = Date.parse(String(b.posted_at || ''))
        if (Number.isNaN(left) && Number.isNaN(right)) return String(b.id).localeCompare(String(a.id))
        if (Number.isNaN(left)) return 1
        if (Number.isNaN(right)) return -1
        return right - left
      })
      const items = sorted.slice(0, POSTS_CACHE_MAX_ROWS)

      let carryOver = 0
      for (const row of previousItems) {
        if (!incomingIds.has(String(row.id))) carryOver += 1
      }

      writeJson(rivalPostsFile(paths, accountId), {
        version: 1,
        account_id: accountId,
        platform: meta.platform ?? previous.platform ?? '',
        external_id: meta.externalId ?? previous.external_id ?? '',
        last_refresh_at: iso,
        carry_over: carryOver,
        field_probe: isPlainObject(meta.fieldProbe) ? meta.fieldProbe : (isPlainObject(previous.field_probe) ? previous.field_probe : {}),
        items,
      })
      return { items, carry_over: carryOver }
    },

    /**
     * Merge a patch into one cached post (inspiration_id, media paths, ...).
     * @param {string} accountId
     * @param {string} postId
     * @param {Record<string, any>} patch
     * @returns {Record<string, any>}
     */
    updatePost(accountId, postId, patch) {
      const raw = readPostFile(accountId)
      const items = Array.isArray(raw.items) ? raw.items : []
      const index = items.findIndex((row) => String(row.id) === String(postId))
      if (index === -1) throw new RivalStoreError('post-not-found', `对标帖子不存在 (post not found): ${postId}`, 404)
      const existing = items[index]
      const merged = buildPostRow(
        { ...existing, ...patch, metrics: { ...existing.metrics, ...patch.metrics } },
        { now: nowIso(), accountId, platform: raw.platform, existing },
      )
      items[index] = merged
      writeJson(rivalPostsFile(paths, accountId), { ...raw, items, updated_at: nowIso() })
      return merged
    },

    /**
     * @param {string} accountId
     * @param {string} postId
     * @returns {Record<string, any> | null}
     */
    findPost(accountId, postId) {
      const items = readPostFile(accountId).items
      if (!Array.isArray(items)) return null
      return items.find((row) => String(row.id) === String(postId)) || null
    },

    // ── budget ────────────────────────────────────────────────────────────
    readBudget,

    /**
     * Whether a cycle could be reserved right now, without reserving it.
     *
     * Used where the caller has to describe the situation before acting — the
     * enqueue path prefers "out of allowance" over "you asked too soon", and it
     * must not consume budget to find that out.
     *
     * **A refusal writes nothing.** A per-account cap is not a global pause, and
     * having this non-mutating probe raise one is how an account that merely ran
     * out of its own allowance would stop every *other* account from refreshing.
     * Only `reserve` records a refusal, and only for the ledger it is about.
     * @param {{ accountId?: string }} [opts]
     * @returns {{ allowed: boolean, reason: string | null, budget: Record<string, any> }}
     */
    canReserve(opts = {}) {
      const budget = readBudget()
      const accountId = opts.accountId ? String(opts.accountId) : ''
      const limits = readConfigFile().limits
      if (budget.paused.global) {
        return { allowed: false, reason: budget.paused.reason || BUDGET_REASONS.GLOBAL_DAILY_CAP, budget }
      }
      if (budget.global_calls + LIMIT_CALLS_PER_ACCOUNT_CYCLE > limits.cloud_calls_global_per_day) {
        return { allowed: false, reason: BUDGET_REASONS.GLOBAL_DAILY_CAP, budget }
      }
      if (accountId) {
        const used = finiteNumber(budget.per_account[accountId]?.calls, 0)
        if (used + LIMIT_CALLS_PER_ACCOUNT_CYCLE > limits.cloud_calls_per_account_per_day) {
          // A per-account cap parks *that account* only. The global pause stays
          // clear, so one spent account cannot stall the others.
          return { allowed: false, reason: BUDGET_REASONS.ACCOUNT_DAILY_CAP, budget }
        }
      }
      return { allowed: true, reason: null, budget }
    },

    /**
     * Reserve `count` cloud calls for a refresh cycle.
     *
     * The decision is explicit: a refusal names the ledger that stopped it, so
     * the caller reports "paused, because the daily cap was reached" instead of
     * failing silently. Nothing is decremented on refusal.
     *
     * **The unit is a cycle attempt, not an HTTP call.** A cycle that dies on
     * its first call still charges the full two: the reservation is what the
     * day's allowance is spent against, and the tick, the manual path and the
     * import path all go through it, so the cap is a cap on *attempts*. Making
     * a mid-cycle failure cheaper would let a repeatedly failing account spend
     * an unbounded number of cloud calls inside the same allowance — the exact
     * thing `LIMIT_CALLS_PER_ACCOUNT_DAY` exists to bound. A refund path was
     * removed for that reason rather than left unwired.
     * @param {{ accountId?: string, scope?: 'cycle' | 'manual' }} [opts]
     * @returns {{ allowed: boolean, reason: string | null, budget: Record<string, any> }}
     */
    reserve(opts = {}) {
      const budget = readBudget()
      const accountId = opts.accountId ? String(opts.accountId) : ''
      const limits = readConfigFile().limits
      if (budget.paused.global) {
        return { allowed: false, reason: budget.paused.reason || BUDGET_REASONS.GLOBAL_DAILY_CAP, budget }
      }
      if (budget.global_calls + LIMIT_CALLS_PER_ACCOUNT_CYCLE > limits.cloud_calls_global_per_day) {
        const paused = writeBudget({
          ...budget,
          paused: { global: true, reason: BUDGET_REASONS.GLOBAL_DAILY_CAP, paused_at: nowIso() },
        })
        return { allowed: false, reason: BUDGET_REASONS.GLOBAL_DAILY_CAP, budget: paused }
      }
      if (accountId) {
        const used = finiteNumber(budget.per_account[accountId]?.calls, 0)
        if (used + LIMIT_CALLS_PER_ACCOUNT_CYCLE > limits.cloud_calls_per_account_per_day) {
          // Per-account cap: the ledger is unchanged and the global pause stays
          // clear, so one spent account cannot stall the others.
          return { allowed: false, reason: BUDGET_REASONS.ACCOUNT_DAILY_CAP, budget }
        }
      }
      const next = {
        ...budget,
        global_calls: budget.global_calls + LIMIT_CALLS_PER_ACCOUNT_CYCLE,
        global_calls_manual: budget.global_calls_manual + (opts.scope === 'manual' ? 1 : 0),
        per_account: {
          ...budget.per_account,
          ...(accountId
            ? {
                [accountId]: {
                  calls: finiteNumber(budget.per_account[accountId]?.calls, 0) + LIMIT_CALLS_PER_ACCOUNT_CYCLE,
                  manual: finiteNumber(budget.per_account[accountId]?.manual, 0) + (opts.scope === 'manual' ? 1 : 0),
                },
              }
            : {}),
        },
      }
      return { allowed: true, reason: null, budget: writeBudget(next) }
    },

    /**
     * Clear a pause (the user's "continue refreshing" action).
     *
     * Note this clears the *ledger's* pause only. An account parked by the cap
     * also carries `refresh_state: 'paused'`, which the rollover reset lifts;
     * a manual resume of an account that still has no allowance would only put
     * it back to sleep on the next attempt.
     * @returns {Record<string, any>}
     */
    resumeBudget() {
      const budget = readBudget()
      return writeBudget({ ...budget, paused: { global: false, reason: null, paused_at: null } })
    },

    /**
     * Lift the cap pauses a new day has invalidated, and make the released
     * accounts due again. Idempotent; callable at any time, but the guarantee it
     * provides is only as fresh as its last invocation — `readBudget` and
     * `writeBudget` call it on a rollover, and the scheduler calls it once per
     * tick so a process that slept across midnight recovers without waiting for
     * some other write to happen first.
     */
    releaseDailyCapPauses,

    isRefreshDue,
  }
}
