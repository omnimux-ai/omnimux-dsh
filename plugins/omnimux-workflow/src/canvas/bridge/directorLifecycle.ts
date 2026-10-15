export interface DirectorCloseGuard {
  /** Only an explicit true permits disposal of the owner root. */
  prepareClose(): Promise<boolean>;
}

export interface DirectorLifecycle {
  registerCloseGuard(guard: DirectorCloseGuard): () => void;
  prepareClose(): Promise<boolean>;
  transition(action: () => void | Promise<void>, needsClose?: () => boolean): Promise<boolean>;
}

/** Owned independently of React so an unavoidable host detach cannot dispose a failed draft. */
export function createDirectorLifecycle(): DirectorLifecycle {
  const guards = new Set<DirectorCloseGuard>();
  let registrationVersion = 0;
  let tail: Promise<unknown> = Promise.resolve();
  let pendingTransitions = 0;
  const registerCloseGuard = (guard: DirectorCloseGuard): (() => void) => {
    guards.add(guard);
    registrationVersion++;
    let registered = true;
    return () => {
      if (!registered) return;
      registered = false;
      guards.delete(guard);
      registrationVersion++;
    };
  };
  let preparing: Promise<boolean> | null = null;
  const prepareClose = (): Promise<boolean> => {
    if (preparing) return preparing;
    const pending = (async () => {
      let version: number;
      do {
        version = registrationVersion;
        for (const guard of [...guards]) {
          if (await guard.prepareClose() !== true) return false;
        }
      } while (version !== registrationVersion);
      return true;
    })();
    preparing = pending;
    const clear = () => { if (preparing === pending) preparing = null; };
    void pending.then(clear, clear);
    return pending;
  };
  const transition = (action: () => void | Promise<void>, needsClose: () => boolean = () => true): Promise<boolean> => {
    if (pendingTransitions === 0 && !preparing && (guards.size === 0 || !needsClose())) {
      pendingTransitions++;
      let release!: () => void;
      tail = new Promise<void>(resolve => { release = resolve; });
      const finish = () => { pendingTransitions--; release(); };
      try {
        const result = action();
        if (!result) {
          finish();
          return Promise.resolve(true);
        }
        return Promise.resolve(result).then(() => { finish(); return true; }, error => { finish(); throw error; });
      } catch (error) {
        finish();
        return Promise.reject(error);
      }
    }
    pendingTransitions++;
    const pending = tail.then(async () => {
      if (needsClose() && !await prepareClose()) return false;
      await action();
      return true;
    }).then(confirmed => { pendingTransitions--; return confirmed; }, error => { pendingTransitions--; throw error; });
    tail = pending.catch(() => undefined);
    return pending;
  };
  return { registerCloseGuard, prepareClose, transition };
}

const canvasDirectorLifecycle = createDirectorLifecycle();
export const registerDirectorCloseGuard = canvasDirectorLifecycle.registerCloseGuard;
export const prepareDirectorClose = canvasDirectorLifecycle.prepareClose;
export const transitionDirectorCanvas = canvasDirectorLifecycle.transition;
