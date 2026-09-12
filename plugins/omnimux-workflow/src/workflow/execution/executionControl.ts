import { ExecutionContext, ExecutionStatus } from './ExecutionContext';
import {
  CANCELABLE_STATUSES,
  type ControlResult,
  type ExecutionEntry,
  type ExecutionEventLogEntry,
} from './executionTypes';

export interface ExecutionControlDeps {
  entries: Map<string, ExecutionEntry>;
  recoverExecution: (executionId: string) => Promise<ExecutionEntry | null>;
  continueLoop: (entry: ExecutionEntry, opts?: { isRecovery?: boolean }) => void;
}

export async function pauseExecution(
  entries: Map<string, ExecutionEntry>,
  executionId: string,
): Promise<ControlResult> {
  const entry = entries.get(executionId);
  if (!entry) {
    return { ok: false, message: '执行不存在' };
  }
  if (entry.context.status !== ExecutionStatus.RUNNING) {
    return { ok: false, message: `无法暂停 ${entry.context.status} 状态的执行` };
  }
  entry.scheduler.pause();
  return { ok: true };
}

export async function resumeExecution(
  deps: ExecutionControlDeps,
  executionId: string,
): Promise<ControlResult> {
  let entry = deps.entries.get(executionId) ?? null;
  if (!entry) {
    entry = await deps.recoverExecution(executionId);
    if (!entry) {
      return { ok: false, message: '执行不存在或不可恢复' };
    }
  }

  const status = entry.context.status;
  const isResumable = status === ExecutionStatus.PAUSED || status === ExecutionStatus.RUNNING;
  if (!isResumable) {
    return { ok: false, message: `只能恢复暂停状态的执行（当前 ${status}）` };
  }

  entry.scheduler.resume();
  if (!entry.loopRunning) {
    deps.continueLoop(entry, { isRecovery: true });
  }
  return { ok: true };
}

export async function cancelExecution(
  entries: Map<string, ExecutionEntry>,
  executionId: string,
): Promise<ControlResult> {
  const entry = entries.get(executionId);
  if (!entry) {
    return { ok: false, message: '执行不存在' };
  }
  if (!CANCELABLE_STATUSES.has(entry.context.status)) {
    return { ok: false, message: `无法取消 ${entry.context.status} 状态的执行` };
  }
  entry.scheduler.cancel();
  entry.abortController.abort();
  // Cancel the context here as well: the scheduler loop only reaches its own
  // cancel() once the abort has unwound the in-flight executors, while the
  // record persisted on the execution_cancelled event must already carry the
  // converged node states (cancel() is idempotent, the loop's call is a no-op).
  entry.context.cancel();
  return { ok: true };
}

export async function openEventStream(
  deps: ExecutionControlDeps,
  executionId: string,
): Promise<{ context: ExecutionContext; eventLog: ExecutionEventLogEntry[] } | null> {
  const existing = deps.entries.get(executionId);
  if (existing) {
    if (!existing.loopRunning && existing.context.status === ExecutionStatus.RUNNING) {
      deps.continueLoop(existing, { isRecovery: true });
    }
    return { context: existing.context, eventLog: existing.eventLog };
  }

  const recovered = await deps.recoverExecution(executionId);
  if (!recovered) return null;

  if (recovered.context.status === ExecutionStatus.RUNNING) {
    deps.continueLoop(recovered, { isRecovery: true });
  }
  return { context: recovered.context, eventLog: recovered.eventLog };
}
