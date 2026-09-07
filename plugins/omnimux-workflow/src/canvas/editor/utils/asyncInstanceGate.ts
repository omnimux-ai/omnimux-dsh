export interface AsyncInstanceToken { readonly generation: symbol }

/** Tickets belong to one mounted UI instance and are invalidated on cancellation. */
export function createAsyncInstanceGate() {
  let generation = Symbol('async-instance');
  let active = true;
  return {
    capture: (): AsyncInstanceToken => ({ generation }),
    invalidate: () => { generation = Symbol('async-instance'); },
    activate: () => { active = true; },
    deactivate: () => { active = false; generation = Symbol('async-instance'); },
    isCurrent: (token: AsyncInstanceToken) => active && token.generation === generation,
  };
}
