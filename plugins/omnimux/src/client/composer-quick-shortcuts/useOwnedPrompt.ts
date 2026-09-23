import { useLayoutEffect, useRef } from 'react';
import { detectOffset, type LinkInputState } from '../attachments/linkReference.ts';

type Span = { start: number; end: number; draftRev: number };
type Mutation = (text: string, span: Span) => unknown;
interface Snapshot { draft: string; revision: number; occurrences: string }
interface Owned extends Snapshot { start: number; text: string }
interface Pending { before: Snapshot; after: Owned }

function snapshot(input: LinkInputState): Snapshot {
  return { draft: input.draft, revision: input.draftRev, occurrences: JSON.stringify(input.occurrences) };
}

function sameSnapshot(left: Snapshot, right: Snapshot): boolean {
  return left.revision === right.revision && left.draft === right.draft && left.occurrences === right.occurrences;
}

/** Only unchanged, observed text ranges remain eligible for removal. */
export function useOwnedPrompt(input: LinkInputState | undefined, sessionId: string, mutate?: Mutation) {
  const owned = useRef<Owned | null>(null);
  const pending = useRef<Pending | null>(null);
  const calling = useRef(false);
  const session = useRef(sessionId);
  const latest = useRef<{ input: LinkInputState | undefined; snapshot: Snapshot | null }>({ input: undefined, snapshot: null });
  const highestRevision = useRef(-1);
  const blockedThrough = useRef(-1);

  function invalidate() {
    owned.current = null;
    pending.current = null;
    // A returning old snapshot is not evidence that the editor has refreshed.
    blockedThrough.current = highestRevision.current;
  }

  function settle(current: Snapshot) {
    const operation = pending.current;
    if (operation) {
      if (sameSnapshot(current, operation.before)) return;
      owned.current = sameSnapshot(current, operation.after) && operation.after.text ? operation.after : null;
      pending.current = null;
    } else if (owned.current && !sameSnapshot(current, owned.current)) {
      owned.current = null;
    }
  }

  // Inspect content on every committed render, not input object identity. Host
  // publishes phase changes as well as new projections; either can revoke ownership.
  useLayoutEffect(() => {
    if (session.current !== sessionId) {
      session.current = sessionId;
      owned.current = null;
      pending.current = null;
      latest.current = { input: undefined, snapshot: null };
      highestRevision.current = -1;
      blockedThrough.current = -1;
    }
    const previous = latest.current.snapshot;
    const current = input ? snapshot(input) : null;
    latest.current = { input, snapshot: current };
    if (!current || !Number.isSafeInteger(current.revision) || current.revision < 0) {
      invalidate();
      return;
    }
    const rollback = current.revision < highestRevision.current;
    highestRevision.current = Math.max(highestRevision.current, current.revision);
    if (input?.phase !== 'plain' || rollback
      || (previous && previous.revision === current.revision && !sameSnapshot(previous, current))) {
      invalidate();
      return;
    }
    if (!calling.current) settle(current);
  });

  return (prompt: string): boolean => {
    const current = latest.current.snapshot;
    if (!input || !mutate || !sessionId || session.current !== sessionId || calling.current || pending.current
      || input.phase !== 'plain' || latest.current.input?.phase !== 'plain' || !current
      || current.revision <= blockedThrough.current || !sameSnapshot(snapshot(input), current)) return false;
    const previous = owned.current;
    const reliable = previous && sameSnapshot(previous, current);
    if (!prompt && !reliable) return true;
    const start = reliable ? previous.start : input.draft.length;
    const end = reliable ? start + previous.text.length : start;
    if (input.occurrences.some(item => item.length === 0
      ? start !== end && item.offset >= start && item.offset <= end
      : item.offset < end && item.offset + item.length > start)) return false;
    const from = detectOffset(input, start);
    const to = detectOffset(input, end);
    if (from === null || to === null) return false;
    const text = prompt ? `${!reliable && input.draft && !input.draft.endsWith('\n') ? '\n' : ''}${prompt}\n` : '';
    const expected = input.draft.slice(0, start) + text + input.draft.slice(end);
    if (expected === input.draft) return true;
    const delta = text.length - (end - start);
    const operation: Pending = {
      before: current,
      after: {
        draft: expected, start, text, revision: current.revision + 1,
        // Preserve every public occurrence field, including identity and display
        // metadata; only references after the edited range may move.
        occurrences: JSON.stringify(input.occurrences.map(item => ({
          ...item,
          offset: item.offset > end || (item.offset === end && (item.length > 0 || start !== end))
            ? item.offset + delta
            : item.offset,
        }))),
      },
    };
    // Guard before the host call: it can publish synchronously or re-enter.
    calling.current = true;
    pending.current = operation;
    owned.current = null;
    try {
      if (mutate(text, { start: from, end: to, draftRev: current.revision }) !== true) {
        invalidate();
        return false;
      }
      // A synchronous publication may already have invalidated this operation.
      if (session.current === sessionId && pending.current === operation && latest.current.snapshot) {
        settle(latest.current.snapshot);
      }
      return true;
    } catch {
      invalidate();
      return false;
    } finally {
      calling.current = false;
    }
  };
}
