/**
 * #1382: reconciling an upstream task after a restart.
 *
 * Before this, recovery re-pended every in-flight node and the executor
 * resubmitted it, because the only knowledge that a task existed lived in the
 * seam client's in-memory map (`omnimuxGateway.tasks`) and died with the
 * process. A task the hub had already finished was therefore regenerated — the
 * finished artifact discarded, the work (and often the bill) repeated.
 *
 * With the reference persisted, recovery asks the hub about the same task
 * instead. The hub path is the pre-existing `{ taskId, dest }` form, which reads
 * no process-local state; #1382 only made it bounded (deadline + per-request
 * timeout) and gave it a persisted anchor.
 */
import type { AwaitTaskResult, GenerationGateway, UpstreamTaskRef } from '../seam/gateway.ts';
import { SeamGatewayError } from '../seam/SeamGatewayError.ts';

/**
 * Poll window for one upstream task, in the caller's words.
 *
 * The hub applies the same 20-minute default when no override is sent, so this
 * is the caller-side half of one shared policy rather than a second source of
 * truth: it only decides when the *local* reconcile is pointless. Both sides
 * assert the invariant below in their own tests — the hub cannot import this
 * constant across the hub/domain boundary.
 *
 * INVARIANT (single-node runs only): strictly shorter than
 * `EXECUTION_TIMEOUT_MS` (30 minutes), so on a run with one node a stuck task
 * fails as a task-level timeout before the whole run ends and the real cause is
 * replaced by a weaker one.
 *
 * The 30-minute budget is per *run*, not per task, so this does not extend to
 * multi-node graphs — see `WORKFLOW_EXECUTION_TIMEOUT_MS` in the hub's
 * `task-deadline.js` for the full statement of what the comparison covers. The
 * assertion here covers the single-node case, mirroring the hub's own test.
 */
export const UPSTREAM_TASK_DEADLINE_MS = 20 * 60 * 1000;

/** Absolute deadline of a reference; the anchor is the persisted submit time. */
export function upstreamTaskDeadlineAt(
  ref: UpstreamTaskRef,
  deadlineMs: number = UPSTREAM_TASK_DEADLINE_MS,
): number {
  return ref.submittedAt + deadlineMs;
}

/** What a reconcile decided. */
export type ReconcileOutcome =
  /** Upstream completed; the artifact is at `dest`. */
  | { kind: 'downloaded'; result: AwaitTaskResult }
  /** The upstream task failed (or its window closed); the node must error. */
  | { kind: 'failed'; error: Error }
  /** No usable reference, or the hub does not know the task: resubmit. */
  | { kind: 'not-reconcilable'; reason: string };

/**
 * Is this error "the hub cannot tell us about that task"?
 *
 * A 404 from the task endpoint is the honest answer for a task the upstream has
 * forgotten or never had; the seam's own "unknown task" error is the in-process
 * equivalent; the mock gateway declares itself not reconcilable by design.
 * Everything else (quota, upstream failure, the poll deadline) is a real
 * outcome that must be reported rather than papered over with a resubmit.
 */
export function isNotReconcilableError(error: unknown): boolean {
  if (error instanceof SeamGatewayError) {
    return error.code === 'omnimux-invalid-request';
  }
  if (!error || typeof error !== 'object') return false;
  const coded = error as { code?: unknown; status?: unknown };
  if (coded.code === 'omnimux-invalid-request') return true;
  // 404 / 410 on the task resource: the task is gone, so there is nothing to
  // reconcile and resubmitting is the only way forward.
  return coded.code === 'omnimux-request-failed' && (coded.status === 404 || coded.status === 410);
}

/**
 * Reconcile a node's upstream task, skipping the submit entirely when the
 * upstream already holds the work.
 *
 * A reference whose window has already closed settles immediately as a timeout
 * without contacting the hub: waiting again would hand the task a second window
 * and let a stuck task live twice as long as its deadline.
 *
 * @param input.ref The persisted reference; `undefined` means "resubmit".
 */
export async function reconcileUpstreamTask(input: {
  gateway: GenerationGateway;
  ref: UpstreamTaskRef | undefined;
  dest: string;
  signal: AbortSignal;
  capability: UpstreamTaskRef['capability'];
  deadlineMs?: number;
}): Promise<ReconcileOutcome> {
  const { ref } = input;
  if (!ref) return { kind: 'not-reconcilable', reason: 'no persisted upstream task reference' };
  if (ref.capability !== input.capability) {
    // The node's material type changed since the submit; the old task no longer
    // describes what this node produces.
    return {
      kind: 'not-reconcilable',
      reason: `reference capability ${ref.capability} does not match node capability ${input.capability}`,
    };
  }
  const deadlineMs = input.deadlineMs ?? UPSTREAM_TASK_DEADLINE_MS;
  const deadlineAt = upstreamTaskDeadlineAt(ref, deadlineMs);
  if (Date.now() >= deadlineAt) {
    return {
      kind: 'failed',
      error: new SeamGatewayError(
        'omnimux-task-timeout',
        `${ref.capability} task ${ref.taskId} exceeded its ${deadlineMs}ms poll deadline before the restart`,
      ),
    };
  }
  try {
    const result = await input.gateway.reconcileTask(ref, input.dest, input.signal);
    return { kind: 'downloaded', result };
  } catch (error) {
    if (isNotReconcilableError(error)) {
      return {
        kind: 'not-reconcilable',
        reason: error instanceof Error ? error.message : String(error),
      };
    }
    return { kind: 'failed', error: error instanceof Error ? error : new Error(String(error)) };
  }
}
