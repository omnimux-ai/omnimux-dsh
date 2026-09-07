import { useLayoutEffect, useMemo } from 'react';
import { createAsyncInstanceGate } from '../utils/asyncInstanceGate.ts';

/** Identity changes retire the old gate, including callbacks retained by a picker. */
export function useAsyncInstanceGuard(identity: unknown) {
  const gate = useMemo(() => createAsyncInstanceGate(), [identity]);
  useLayoutEffect(() => {
    gate.activate();
    return () => gate.deactivate();
  }, [gate]);
  return gate;
}
