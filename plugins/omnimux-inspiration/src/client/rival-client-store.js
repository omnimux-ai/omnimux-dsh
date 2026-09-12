/**
 * Client state of the rival workbench.
 *
 * Kept as a plain store object (created per panel) rather than a React context
 * so the polling, selection and optimistic-update rules can be unit-tested
 * without a renderer — the JSX components stay presentational.
 *
 * Polling is bounded on purpose: it runs only while something is actually
 * refreshing, and it stops as soon as the account reaches a stable state, so an
 * idle workbench makes no requests at all.
 */

import {
  CLIENT_POLL_INTERVAL_MS,
  REFRESH_STALE_AFTER_MS,
} from '../rival/constants.js'
import {
  fetchRivalAccount,
  fetchRivalAccounts,
  fetchRivalPosts,
  fetchRivalStatus,
} from './rival-api.js'

/**
 * @param {{
 *   now?: () => number,
 *   pollIntervalMs?: number,
 *   api?: {
 *     fetchRivalAccounts?: Function, fetchRivalAccount?: Function,
 *     fetchRivalPosts?: Function, fetchRivalStatus?: Function,
 *   },
 * }} [options]
 */
export function createRivalClientStore(options = {}) {
  const now = typeof options.now === 'function' ? options.now : () => Date.now()
  const pollIntervalMs = typeof options.pollIntervalMs === 'number'
    ? options.pollIntervalMs
    : CLIENT_POLL_INTERVAL_MS
  const api = {
    fetchRivalAccounts: options.api?.fetchRivalAccounts ?? fetchRivalAccounts,
    fetchRivalAccount: options.api?.fetchRivalAccount ?? fetchRivalAccount,
    fetchRivalPosts: options.api?.fetchRivalPosts ?? fetchRivalPosts,
    fetchRivalStatus: options.api?.fetchRivalStatus ?? fetchRivalStatus,
  }

  let state = {
    phase: 'idle',
    error: null,
    accounts: [],
    total: 0,
    configSummary: null,
    selectedId: null,
    posts: [],
    postsTotal: 0,
    carryOver: 0,
    fieldProbe: {},
    onlyPotential: false,
    postsLoading: false,
    status: null,
    notices: [],
  }

  /** @type {Set<(next: any) => void>} */
  const listeners = new Set()
  /** @type {ReturnType<typeof setInterval> | null} */
  let pollTimer = null
  let pollAccountId = null
  let pollStartedAt = 0

  function emit() {
    for (const listener of listeners) {
      try {
        listener(state)
      } catch { /* a broken listener must not stop the others */ }
    }
  }

  /** @param {Partial<typeof state>} patch */
  function setState(patch) {
    state = { ...state, ...patch }
    emit()
    return state
  }

  return {
    getState: () => state,

    /** @param {(next: any) => void} listener @returns {() => void} */
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    /** Load the account list (E1). */
    async loadAccounts(filter = {}) {
      setState({ phase: state.accounts.length === 0 ? 'loading' : 'refreshing', error: null })
      try {
        const res = await api.fetchRivalAccounts(filter)
        if (!res?.ok) {
          return setState({ phase: 'ready', error: res?.body?.error || 'error.generic' })
        }
        const data = res.body?.data || {}
        const accounts = Array.isArray(data.items) ? data.items : []
        const selectedId = state.selectedId && accounts.some((row) => row.id === state.selectedId)
          ? state.selectedId
          : (accounts[0]?.id ?? null)
        setState({
          phase: 'ready',
          error: null,
          accounts,
          total: Number(data.total) || accounts.length,
          configSummary: data.config_summary || null,
          selectedId,
        })
        if (selectedId) await this.loadPosts(selectedId, { onlyPotential: state.onlyPotential })
        return state
      } catch (err) {
        return setState({ phase: 'ready', error: String(err?.message || err) })
      }
    },

    /**
     * @param {string} accountId
     * @param {{ onlyPotential?: boolean, limit?: number, sort?: string }} [filter]
     */
    async loadPosts(accountId, filter = {}) {
      setState({ postsLoading: true })
      try {
        const res = await api.fetchRivalPosts(accountId, filter)
        if (!res?.ok) return setState({ postsLoading: false, error: res?.body?.error || 'error.generic' })
        const data = res.body?.data || {}
        return setState({
          postsLoading: false,
          posts: Array.isArray(data.items) ? data.items : [],
          postsTotal: Number(data.total) || 0,
          carryOver: Number(data.carry_over) || 0,
          fieldProbe: data.field_probe || {},
          onlyPotential: Boolean(filter.onlyPotential),
        })
      } catch (err) {
        return setState({ postsLoading: false, error: String(err?.message || err) })
      }
    },

    /**
     * Select an account and load its posts.
     * @param {string} accountId
     */
    async selectAccount(accountId) {
      setState({ selectedId: accountId })
      await this.loadPosts(accountId, { onlyPotential: state.onlyPotential })
      return state
    },

    /**
     * Toggle the potential filter and reload the list.
     * @param {boolean} [next]
     */
    async togglePotential(next) {
      const onlyPotential = typeof next === 'boolean' ? next : !state.onlyPotential
      if (state.selectedId) await this.loadPosts(state.selectedId, { onlyPotential })
      else setState({ onlyPotential })
      return state
    },

    /** Standalone status snapshot (E9). */
    async loadStatus() {
      try {
        const res = await api.fetchRivalStatus()
        if (!res?.ok) return state
        return setState({ status: res.body?.data || null })
      } catch {
        return state
      }
    },

    /**
     * Reload one account and its posts after a refresh finished.
     * @param {string} accountId
     */
    async reloadAccount(accountId) {
      const res = await api.fetchRivalAccount(accountId)
      if (res?.ok && res.body?.data?.account) {
        const account = res.body.data.account
        setState({
          accounts: state.accounts.map((row) => (row.id === account.id ? { ...row, ...account } : row)),
        })
      }
      if (state.selectedId === accountId) await this.loadPosts(accountId, { onlyPotential: state.onlyPotential })
      return state
    },

    /**
     * Poll one account until it stops refreshing.
     *
     * The loop is bounded by `REFRESH_STALE_AFTER_MS`: an account stuck in
     * `running` past that window stops the poll and surfaces a notice, so the
     * workbench never spins forever on a job that died with the Host.
     * @param {string} accountId
     */
    startPolling(accountId) {
      this.stopPolling()
      pollAccountId = accountId
      pollStartedAt = now()
      pollTimer = setInterval(() => {
        void this.pollOnce()
      }, pollIntervalMs)
      if (typeof pollTimer?.unref === 'function') pollTimer.unref()
      return pollTimer
    },

    /** One poll round; exposed so tests can drive it deterministically. */
    async pollOnce() {
      const accountId = pollAccountId
      if (!accountId) return { done: true }
      if (now() - pollStartedAt > REFRESH_STALE_AFTER_MS) {
        this.stopPolling()
        setState({ notices: [...state.notices, { key: 'rivalAccounts.refresh.stale', account_id: accountId }] })
        return { done: true, stale: true }
      }
      try {
        const res = await api.fetchRivalAccount(accountId)
        const account = res?.body?.data?.account
        if (!account) return { done: false }
        setState({
          accounts: state.accounts.map((row) => (row.id === account.id ? { ...row, ...account } : row)),
        })
        if (account.refresh_state !== 'queued' && account.refresh_state !== 'running') {
          this.stopPolling()
          if (state.selectedId === accountId) await this.loadPosts(accountId, { onlyPotential: state.onlyPotential })
          return { done: true, account }
        }
        return { done: false, account }
      } catch {
        return { done: false }
      }
    },

    stopPolling() {
      if (pollTimer) clearInterval(pollTimer)
      pollTimer = null
      pollAccountId = null
      return null
    },

    isPolling: () => pollTimer != null,

    /**
     * Optimistically mark a post as being in the library, so the card settles
     * before the import job reports back.
     * @param {string} postId
     * @param {{ inspiration_id?: string | null }} [patch]
     */
    markPostInLibrary(postId, patch = {}) {
      return setState({
        posts: state.posts.map((row) => (row.id === postId
          ? { ...row, in_library: true, inspiration_id: patch.inspiration_id ?? row.inspiration_id ?? null }
          : row)),
      })
    },

    /** @param {string} key */
    pushNotice(key) {
      return setState({ notices: [...state.notices, { key }] })
    },

    clearNotices() {
      return setState({ notices: [] })
    },
  }
}
