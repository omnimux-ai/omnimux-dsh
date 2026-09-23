import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { createLinkReference, detectOffset, hasLinkReference, validLinkUrl, type LinkInputState, type LinkKind } from './linkReference.ts';

type InsertRequest = { reference: ReturnType<typeof createLinkReference>; span: { start: number; end: number; draftRev: number } };
export type InsertLinkRequest = (request: InsertRequest) => boolean;
interface Pending {
  kind: LinkKind;
  url: string;
  revision: number;
  accepted: boolean;
  sessionId: string;
  finish: (ok: boolean) => void;
}

/** Focus is best-effort and cannot invalidate a confirmed native insertion. */
function restoreFocus(focus?: () => void): void {
  try { focus?.(); } catch { /* A missing or detached focus target must not reject the insertion. */ }
}

/** Insertion receipt and a subsequent public snapshot jointly establish success. */
export function useLinkReference(input: LinkInputState | undefined, sessionId: string, insert?: InsertLinkRequest, focus?: () => void) {
  const live = useRef({ input, insert, focus, sessionId });
  live.current = { input, insert, focus, sessionId };
  const pending = useRef<Pending | null>(null);
  useLayoutEffect(() => {
    const operation = pending.current;
    if (operation && operation.sessionId !== sessionId) operation.finish(false);
    else if (operation?.accepted && input && input.draftRev > operation.revision && hasLinkReference(input, operation.kind, operation.url)) operation.finish(true);
  }, [input, sessionId]);
  useEffect(() => () => { pending.current?.finish(false); }, [sessionId]);
  return useCallback((kind: LinkKind, value: string): Promise<boolean> => {
    if (pending.current || live.current.sessionId !== sessionId) return Promise.resolve(false);
    const { input: state, insert: submit } = live.current;
    const url = validLinkUrl(value);
    if (!state || !url || !submit || !['plain', 'claimed'].includes(state.phase)) return Promise.resolve(false);
    if (hasLinkReference(state, kind, url)) {
      restoreFocus(live.current.focus);
      return Promise.resolve(true);
    }
    const end = detectOffset(state, state.draft.length);
    if (end === null) return Promise.resolve(false);
    return new Promise(resolve => {
      const timer = setTimeout(() => operation.finish(false), 2000);
      const operation: Pending = {
        kind, url, sessionId, revision: state.draftRev, accepted: false,
        finish(ok) {
          if (pending.current !== operation) return;
          clearTimeout(timer);
          pending.current = null;
          if (ok) restoreFocus(live.current.focus);
          resolve(ok);
        },
      };
      pending.current = operation;
      try {
        operation.accepted = submit({ reference: createLinkReference(kind, url), span: { start: end, end, draftRev: state.draftRev } }) === true;
        if (!operation.accepted) operation.finish(false);
        else {
          const observed = live.current.input;
          if (observed && observed.draftRev > operation.revision && hasLinkReference(observed, kind, url)) operation.finish(true);
        }
      } catch {
        operation.finish(false);
      }
    });
  }, [sessionId]);
}
