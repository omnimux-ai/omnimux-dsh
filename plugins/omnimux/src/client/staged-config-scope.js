import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'

/** Sentinel for a staged field clear. */
export const STAGED_UNSET = Symbol('omnimux.staged.unset')

const UNAVAILABLE = Object.freeze({
  status: 'unavailable',
  value: undefined,
  base: undefined,
  user: undefined,
  revision: undefined,
  writable: false,
})

/**
 * Overlay staged values on a settings namespace value.
 *
 * @param {object | undefined} value
 * @param {Map<string, unknown>} staged
 * @returns {object}
 */
export function applyStagedValue(value, staged) {
  const next = value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {}
  for (const [field, entry] of staged) {
    if (entry === STAGED_UNSET) delete next[field]
    else next[field] = entry
  }
  return next
}

/**
 * Overlay staged fields on the user layer so overridden badges follow drafts.
 *
 * @param {object | undefined} user
 * @param {Map<string, unknown>} staged
 * @returns {object}
 */
export function applyStagedUser(user, staged) {
  const next = user && typeof user === 'object' && !Array.isArray(user) ? { ...user } : {}
  for (const [field, entry] of staged) {
    if (entry === STAGED_UNSET) delete next[field]
    else next[field] = entry
  }
  return next
}

/**
 * Build the ordered mutation plan a save would send to the Host.
 *
 * @param {Map<string, unknown>} staged
 * @returns {Array<{op: 'set' | 'unset', path: string[], value?: unknown}>}
 */
export function stagedMutationOps(staged) {
  return [...staged].map(([field, entry]) => entry === STAGED_UNSET
    ? { op: 'unset', path: [field] }
    : { op: 'set', path: [field], value: entry })
}

/**
 * A local draft layer over the official ConfigFormController.
 *
 * Controls read and stage through the returned `scope`; nothing reaches the
 * Host until `save()`. Save is one revision-fenced `mutate(ops)` call, so one
 * explicit user action maps to one settings document edit (the native
 * `SettingsFormModel` behavior). Leaving the page without saving discards drafts.
 *
 * @param {{
 *   getSnapshot: () => object,
 *   subscribe?: (listener: () => void) => () => void,
 *   set?: (field: string, value: unknown) => Promise<boolean> | boolean,
 *   unset?: (field: string) => Promise<boolean> | boolean,
 *   mutate?: (ops: Array<object>, revision?: number) => Promise<boolean>,
 * }} scope
 */
export function useStagedConfigScope(scope) {
  const raw = useSyncExternalStore(
    (listener) => (scope && typeof scope.subscribe === 'function' ? scope.subscribe(listener) : () => {}),
    () => (scope && typeof scope.getSnapshot === 'function' ? scope.getSnapshot() : UNAVAILABLE),
  )
  const [staged, setStaged] = useState(() => new Map())
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const baselineRevision = useRef(null)

  useEffect(() => {
    setStaged(new Map())
    baselineRevision.current = null
    setFailed(false)
  }, [scope])

  const stage = useCallback((field, entry) => {
    if (baselineRevision.current === null) baselineRevision.current = raw.revision
    setStaged((current) => {
      const next = new Map(current)
      next.set(field, entry)
      return next
    })
    setFailed(false)
  }, [raw.revision])

  const set = useCallback(async (field, value) => {
    stage(field, value)
    return true
  }, [stage])

  const unset = useCallback(async (field) => {
    stage(field, STAGED_UNSET)
    return true
  }, [stage])

  const mutate = useCallback(async (ops = []) => {
    for (const op of ops) {
      const field = Array.isArray(op?.path) ? op.path[0] : ''
      if (typeof field !== 'string' || !field) continue
      if (op.op === 'unset') stage(field, STAGED_UNSET)
      else stage(field, op.value)
    }
    return true
  }, [stage])

  const snapshot = useMemo(() => ({
    ...raw,
    value: applyStagedValue(raw.value, staged),
    user: applyStagedUser(raw.user, staged),
  }), [raw, staged])

  const draftScope = useMemo(() => ({
    getSnapshot: () => snapshot,
    subscribe: (listener) => (scope && typeof scope.subscribe === 'function' ? scope.subscribe(listener) : () => {}),
    set,
    unset,
    mutate,
  }), [mutate, scope, set, snapshot, unset])

  const save = useCallback(async () => {
    if (saving || staged.size === 0) return false
    setSaving(true)
    setFailed(false)
    try {
      let accepted = true
      if (scope && typeof scope.mutate === 'function') {
        accepted = await scope.mutate(stagedMutationOps(staged), baselineRevision.current ?? raw.revision)
      } else if (scope && typeof scope.set === 'function') {
        for (const [field, entry] of staged) {
          if (entry === STAGED_UNSET) {
            if (typeof scope.unset === 'function') await scope.unset(field)
          } else {
            await scope.set(field, entry)
          }
        }
      } else {
        accepted = false
      }
      if (!accepted) {
        const revision = scope && typeof scope.getSnapshot === 'function' ? scope.getSnapshot()?.revision : undefined
        if (revision !== undefined) baselineRevision.current = revision
        setFailed(true)
        return false
      }
      setStaged(new Map())
      baselineRevision.current = null
      return true
    } catch (_error) {
      const revision = scope && typeof scope.getSnapshot === 'function' ? scope.getSnapshot()?.revision : undefined
      if (revision !== undefined) baselineRevision.current = revision
      setFailed(true)
      return false
    } finally {
      setSaving(false)
    }
  }, [raw.revision, saving, scope, staged])

  const discard = useCallback(() => {
    setStaged(new Map())
    baselineRevision.current = null
    setFailed(false)
  }, [])

  return {
    snapshot,
    scope: draftScope,
    state: {
      available: raw.status === 'ready',
      writable: raw.writable === true,
      dirty: staged.size > 0,
      invalid: false,
      saving,
      failed,
    },
    save,
    discard,
  }
}
