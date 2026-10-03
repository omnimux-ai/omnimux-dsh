/**
 * Decides which image/video composer takes a chat prompt handoff.
 *
 * The host can mount the generation page twice (a visible tab and a hidden
 * bottom panel). Both subscribe to the same queue, so only a composer the user
 * can see may take the request. A composer that is still appearing retries for
 * a short while before giving up.
 */

import { peekComposerPrefill, takeComposerPrefill } from '../../../omnimux/src/client/media-viewer/composer-prefill.js';

const MAX_FRAMES = 90;

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
  maxFrames = MAX_FRAMES,
} = {}) {
  if (!request) return () => {};
  let frame = null;
  let left = maxFrames;
  let done = false;

  const attempt = () => {
    frame = null;
    if (done) return;
    if (peekComposerPrefill()?.token !== request.token) { done = true; return; }
    if (isVisible()) {
      done = true;
      const taken = takeComposerPrefill(request.token);
      if (taken) onClaim(taken);
      return;
    }
    if (left <= 0 || typeof raf !== 'function') { done = true; return; }
    left -= 1;
    frame = raf(attempt);
  };

  attempt();
  return () => {
    done = true;
    if (frame != null && typeof caf === 'function') caf(frame);
    frame = null;
  };
}
