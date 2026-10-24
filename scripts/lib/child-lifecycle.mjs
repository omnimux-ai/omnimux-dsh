/**
 * Owned-child process lifecycle for the test-environment and browser drivers.
 *
 * The stop verdict must come from the process actually exiting. It must NOT require the stdio
 * `close` event: `close` fires only after every stdio stream is closed, and helper processes the
 * child spawns (Chrome's crashpad / GPU / renderer helpers) inherit those pipes. A child that has
 * already exited can therefore keep `close` pending well past any sane timeout, which used to be
 * reported as "cleanup failed" for a process that was demonstrably gone.
 *
 * `close` stays useful as telemetry, so callers keep observing it separately.
 */

/** Node sets one of these once the child is gone, so no event bookkeeping is needed. */
export function hasChildExited(child) {
  if (!child) return true;
  const code = child.exitCode;
  const signal = child.signalCode;
  return (code !== null && code !== undefined) || (signal !== null && signal !== undefined);
}

/**
 * Resolve `true` once the child has exited, `false` when the timeout elapses first.
 * Never rejects and never waits unbounded.
 */
export function waitForChildExit(child, { timeoutMs = 5000, isExited = hasChildExited, timers = {} } = {}) {
  const setTimer = timers.setTimeout ?? setTimeout;
  const clearTimer = timers.clearTimeout ?? clearTimeout;
  if (!child || isExited(child)) return Promise.resolve(true);
  return new Promise(resolve => {
    let settled = false;
    let timer = null;
    const finish = value => {
      if (settled) return;
      settled = true;
      if (timer !== null) clearTimer(timer);
      child.off('exit', check);
      resolve(value);
    };
    const check = () => { if (isExited(child)) finish(true); };
    timer = setTimer(() => finish(false), timeoutMs);
    child.on('exit', check);
    check();
  });
}

/**
 * Stop an owned child: SIGTERM, wait, escalate to SIGKILL, wait again.
 * Returns the verdict plus the signals attempted, so reports can explain what was tried.
 * Kill failures are returned rather than swallowed; they never mask a child that did exit.
 */
export async function stopOwnedChild(child, {
  timeoutMs = 5000,
  isExited = hasChildExited,
  kill = (target, signal) => target.kill(signal),
  wait = waitForChildExit,
} = {}) {
  if (!child) return { stopped: true, signals: [], killErrors: [] };
  const signals = [];
  const killErrors = [];
  const signalOnce = name => {
    signals.push(name);
    try {
      kill(child, name);
    } catch (error) {
      killErrors.push({ signal: name, message: String(error?.message ?? error) });
    }
  };
  if (!isExited(child)) signalOnce('SIGTERM');
  let stopped = await wait(child, { timeoutMs, isExited });
  if (!stopped) {
    signalOnce('SIGKILL');
    stopped = await wait(child, { timeoutMs, isExited });
  }
  return { stopped, signals, killErrors };
}
