/**
 * Automatic model routing for `session.prompt`.
 *
 * When the extension panel enables auto mode (`bridge.modelMode`), every prompt
 * is preceded by one bounded Jev decision (`decisions` seam) that picks a model
 * from the host's known candidate set; the winner is applied through
 * `session.selectModel` before the prompt is forwarded. Routing is fail-open:
 * a missing seam, a thrown evaluation, an exhausted timeout, a decision outside
 * the candidate set, or a failed selectModel never blocks the prompt — the call
 * passes through on the session's current model.
 *
 * @module @yuxianglin/dsh-bridge-browser/src/auto-model
 */

import type { BrowserHostApi, HostRpcCall, HostRpcResult } from './host-api.ts'
import { isRecord } from './host-api.ts'

/** Default decision budget; routing never stalls a prompt longer than this. */
export const AUTO_MODEL_EVALUATE_TIMEOUT_MS = 8_000

/** One routable conversation model. */
export interface AutoModelCandidate {
  readonly id: string
  readonly name?: string
  /** Gateway-side provider id expected by `session.selectModel`. */
  readonly provider?: string
}

/** What a single routing pass concluded; consumed by the host info log. */
export interface AutoModelRouteInfo {
  readonly sessionId: string
  /** Selected model when the pass routed; absent on fallback. */
  readonly model?: string
  readonly provider?: string
  readonly outcome: 'routed' | 'fallback'
  /** Why the pass fell back (missing seam, timeout, off-candidate decision…). */
  readonly reason?: string
}

/** One Jev evaluation; `decision` names the chosen candidate id when present. */
export type AutoModelEvaluate = (
  args: {
    state: string
    choices: Record<string, string>
    instructions: string
  },
  options?: { signal?: AbortSignal },
) => Promise<{ readonly decision?: string } | undefined>

/** Apply a model to a session (bridges to `session.selectModel`). */
export type AutoModelSelectModel = (input: {
  readonly sessionId: string
  readonly model: string
  readonly provider?: string
}) => Promise<void>

/** Dependencies the routing wrapper needs from the host. */
export interface AutoModelRoutingDeps {
  /** Jev evaluation seam; undefined on hosts without it (routes pass through). */
  readonly evaluate?: AutoModelEvaluate
  readonly selectModel: AutoModelSelectModel
  /** Current candidate models; a decision outside this set is a fallback. */
  readonly candidates: () => readonly AutoModelCandidate[]
  /** Current panel mode; anything other than `{auto: true}` passes through. */
  readonly getMode: () => { readonly auto: boolean }
  /** Post-pass notification for the host log; never blocks routing. */
  readonly onRouted?: (info: AutoModelRouteInfo) => void
  /** Evaluation budget override; defaults to {@link AUTO_MODEL_EVALUATE_TIMEOUT_MS}. */
  readonly timeoutMs?: number
}

/**
 * Concatenate the text blocks of a `session.prompt` payload. Non-text parts
 * (images, files) contribute nothing; absent or malformed input is empty.
 * @param payload - decoded prompt payload.
 * @returns the plain message text (may be empty).
 */
export function extractPromptText(payload: unknown): string {
  if (!isRecord(payload) || !Array.isArray(payload.content)) return ''
  const texts: string[] = []
  for (const part of payload.content) {
    if (isRecord(part) && part.type === 'text' && typeof part.text === 'string') {
      texts.push(part.text)
    }
  }
  return texts.join('\n')
}

/**
 * Normalize a stored or wire-supplied mode to the internal `{auto}` shape.
 * Anything unreadable defaults to auto so an unknown value cannot silently pin
 * a manual choice the user never confirmed.
 * @param input - raw mode value (`{auto}` record, 'auto'/'manual', or garbage).
 * @returns the normalized mode.
 */
export function normalizeMode(input: unknown): { auto: boolean } {
  if (isRecord(input) && typeof input.auto === 'boolean') return { auto: input.auto }
  if (input === 'manual') return { auto: false }
  return { auto: true }
}

/** Subscription group row as served by `/ext/bridge-config`. */
export interface SubscriptionModelGroup {
  /** Display group name (e.g. 'ChatGPT (Codex)'). */
  readonly group?: string
  /** Optional machine id; doubles as the provider fallback. */
  readonly id?: string
  /** Provider the group itself declares; wins over name-based mapping. */
  readonly provider?: string
  readonly models?: readonly {
    readonly id?: unknown
    readonly name?: unknown
    /** Reasoning effort support carried through for the panel; opaque here. */
    readonly reasoning?: unknown
  }[]
}

/**
 * Flatten subscription model groups into routing candidates.
 *
 * Provider mapping follows the host catalog vocabulary: the two subscription
 * groups own their own providers; every other group's provider is its id (or
 * its display name when no id exists). Malformed rows contribute nothing.
 * @param groups - subscription groups from {@link loadSubscriptionModelGroups}.
 * @returns flat candidate list in declaration order.
 */
export function flattenModelCandidates(
  groups: readonly SubscriptionModelGroup[],
): AutoModelCandidate[] {
  const candidates: AutoModelCandidate[] = []
  for (const group of groups) {
    if (!isRecord(group) || !Array.isArray(group.models)) continue
    const provider = groupProvider(group)
    for (const model of group.models) {
      if (!isRecord(model) || typeof model.id !== 'string' || model.id === '') continue
      candidates.push({
        id: model.id,
        ...(typeof model.name === 'string' && model.name !== '' ? { name: model.name } : {}),
        ...(provider === undefined ? {} : { provider }),
      })
    }
  }
  return candidates
}

/**
 * Wrap a Host API so `session.prompt` routes through Jev auto-selection first.
 *
 * Order contract: this wrapper sits INSIDE session deferral, so a provisional
 * session is materialized before selectModel runs; selectModel always settles
 * before the prompt is forwarded, and any failure falls back to forwarding.
 * @param api - inner Host API implementation.
 * @param deps - routing seams supplied by the plugin mount.
 * @returns an API whose prompts are auto-routed when the panel enabled it.
 */
export function withAutoModelRouting(
  api: BrowserHostApi,
  deps: AutoModelRoutingDeps,
): BrowserHostApi {
  const timeoutMs = deps.timeoutMs ?? AUTO_MODEL_EVALUATE_TIMEOUT_MS
  return {
    async call(call: HostRpcCall): Promise<HostRpcResult> {
      if (call.method !== 'session.prompt') return api.call(call)
      const sessionId = isRecord(call.payload) && typeof call.payload.sessionId === 'string'
        && call.payload.sessionId !== ''
        ? call.payload.sessionId
        : undefined
      if (sessionId === undefined) return api.call(call)
      if (deps.getMode().auto !== true) return api.call(call)

      const info = await route(deps, sessionId, extractPromptText(call.payload), timeoutMs)
      try {
        deps.onRouted?.(info)
      } catch {
        // Logging must never break the send path.
      }
      return api.call(call)
    },
    events: signal => api.events(signal),
    respond: (rpcId, result, signal) => api.respond(rpcId, result, signal),
  }
}

/**
 * Run one bounded routing pass. Every failure path resolves to a fallback
 * descriptor instead of throwing, so callers can always forward the prompt.
 */
async function route(
  deps: AutoModelRoutingDeps,
  sessionId: string,
  text: string,
  timeoutMs: number,
): Promise<AutoModelRouteInfo> {
  const evaluate = deps.evaluate
  if (evaluate === undefined) {
    return { sessionId, outcome: 'fallback', reason: 'decisions seam unavailable' }
  }
  const candidates = deps.candidates()
  if (candidates.length === 0) {
    return { sessionId, outcome: 'fallback', reason: 'no candidate models' }
  }
  const signal = AbortSignal.timeout(timeoutMs)
  let decision: unknown
  try {
    const choices: Record<string, string> = {}
    for (const candidate of candidates) choices[candidate.id] = candidate.name ?? candidate.id
    // Routing only needs the gist of the request: bound the evaluated state so a
    // pasted document does not become a full-message decision call.
    const state = text.length > 4000 ? `${text.slice(0, 4000)}…` : text
    const verdict = await Promise.race([
      evaluate(
        {
          state,
          choices,
          instructions: 'Pick the single best conversation model id for the user message in `state`. Answer with the candidate key only.',
        },
        { signal },
      ),
      // A seam that ignores the provided signal would otherwise stall the
      // prompt past the routing budget; the deadline is enforced locally.
      new Promise<never>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('evaluate timeout')), { once: true })
      }),
    ])
    decision = verdict?.decision
  } catch {
    return { sessionId, outcome: 'fallback', reason: 'evaluate failed' }
  }
  if (typeof decision !== 'string' || decision === '') {
    return { sessionId, outcome: 'fallback', reason: 'no decision' }
  }
  const selected = candidates.find(candidate => candidate.id === decision)
  if (selected === undefined) {
    return { sessionId, outcome: 'fallback', reason: 'decision outside candidates' }
  }
  try {
    await deps.selectModel({
      sessionId,
      model: selected.id,
      ...(selected.provider === undefined ? {} : { provider: selected.provider }),
    })
  } catch {
    return { sessionId, outcome: 'fallback', reason: 'selectModel failed' }
  }
  return {
    sessionId,
    model: selected.id,
    ...(selected.provider === undefined ? {} : { provider: selected.provider }),
    outcome: 'routed',
  }
}

/**
 * Provider id for one subscription group. The two first-party subscription
 * sources have dedicated provider ids; every other group is its own provider
 * (group id preferred, display name as fallback).
 */
function groupProvider(group: SubscriptionModelGroup): string | undefined {
  if (typeof group.provider === 'string' && group.provider !== '') return group.provider
  if (group.group === 'ChatGPT (Codex)') return 'chatgpt'
  if (group.group === 'Grok (Subscription)') return 'grok'
  if (typeof group.id === 'string' && group.id !== '') return group.id
  return typeof group.group === 'string' && group.group !== '' ? group.group : undefined
}
