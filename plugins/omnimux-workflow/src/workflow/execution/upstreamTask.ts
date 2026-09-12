/**
 * #1382: reading and validating a persisted upstream task reference.
 *
 * The reference lives in `nodeStates[<nodeId>].upstreamTask` and travels through
 * `toJSON` / `fromJSON` / `buildExecutionRecord` / `loadExecutionRecord` with no
 * extra plumbing. What those paths carry is unchecked JSON, so this module is
 * the one place that decides what a *usable* reference is: a missing or
 * malformed field means "no reference", which routes the node back to the
 * pre-#1382 behavior (resubmit) instead of reconciling against garbage.
 *
 * The read/write operations themselves live on `ExecutionContext`, which owns
 * the node-state map and the persistence hook.
 */
import type { GenerationCapability, UpstreamTaskRef } from '../seam/gateway.ts';

const CAPABILITIES: ReadonlySet<string> = new Set(['text', 'image', 'video', 'audio']);

/**
 * Normalize one persisted value into a reference, or `undefined` when it cannot
 * be used.
 *
 * A record written before #1382 has no such field at all, and one written by a
 * newer build may be read by an older one: both directions ignore the field
 * rather than failing the load, which is why `schemaVersion` stays `1` and no
 * migration step exists.
 *
 * @param value Raw value from a persisted node state.
 */
export function readUpstreamTaskRef(value: unknown): UpstreamTaskRef | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as { taskId?: unknown; capability?: unknown; submittedAt?: unknown };
  if (typeof candidate.taskId !== 'string' || candidate.taskId.trim() === '') return undefined;
  if (typeof candidate.capability !== 'string' || !CAPABILITIES.has(candidate.capability)) return undefined;
  if (typeof candidate.submittedAt !== 'number' || !Number.isFinite(candidate.submittedAt)) return undefined;
  return {
    taskId: candidate.taskId.trim(),
    capability: candidate.capability as GenerationCapability,
    submittedAt: Math.max(0, Math.trunc(candidate.submittedAt)),
  };
}
