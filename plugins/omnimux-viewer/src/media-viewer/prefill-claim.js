/**
 * Decides which image/video composer takes a chat prompt handoff.
 *
 * The host can mount the generation page twice (a visible tab and a hidden
 * bottom panel). Both subscribe to the same queue, so only a composer the user
 * can see may take the request. A composer that is not visible yet keeps
 * waiting until it shows, the request is replaced or taken, or it unmounts.
 */

import { peekComposerPrefill, takeComposerPrefill } from '../../../omnimux/src/client/media-viewer/composer-prefill.js';

// A freshly opened tab normally shows within a few frames: check every frame
// for about 1.5 s at 60 fps, then fall back to a slow check so a panel that
// shows much later still receives the request without spinning per frame.
const FAST_FRAMES = 90;
const SLOW_INTERVAL_MS = 250;

/** No node means not shown; an environment without checkVisibility counts as shown. */
export function isElementShown(node) {
  if (!node) return false;
  if (typeof node.checkVisibility !== 'function') return true;
  return node.checkVisibility({ visibilityProperty: true, checkOpacity: true });
}

/**
 * Take `request` once `isVisible()` is true, then call `onClaim` with it.
 * Stops when the queue no longer holds this request. Returns a cancel function.
 */
export function claimPrefillWhenVisible(request, {
  isVisible,
  onClaim,
  raf = globalThis.requestAnimationFrame?.bind(globalThis),
  caf = globalThis.cancelAnimationFrame?.bind(globalThis),
  setTimer = globalThis.setTimeout?.bind(globalThis),
  clearTimer = globalThis.clearTimeout?.bind(globalThis),
} = {}) {
  if (!request) return () => {};
  let frame = null;
  let timer = null;
  let fastLeft = FAST_FRAMES;
  let done = false;

  const attempt = () => {
    frame = null;
    timer = null;
    if (done) return;
    if (peekComposerPrefill()?.token !== request.token) { done = true; return; }
    if (isVisible()) {
      done = true;
      const taken = takeComposerPrefill(request.token);
      if (taken) onClaim(taken);
      return;
    }
    if (fastLeft > 0 && typeof raf === 'function') {
      fastLeft -= 1;
      frame = raf(attempt);
      return;
    }
    if (typeof setTimer === 'function') {
      timer = setTimer(attempt, SLOW_INTERVAL_MS);
      return;
    }
    done = true;
  };

  attempt();
  return () => {
    done = true;
    if (frame !== null && typeof caf === 'function') caf(frame);
    if (timer !== null && typeof clearTimer === 'function') clearTimer(timer);
    frame = null;
    timer = null;
  };
}
