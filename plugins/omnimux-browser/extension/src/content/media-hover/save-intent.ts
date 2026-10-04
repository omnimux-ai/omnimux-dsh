/**
 * Save-intent resolution for the primary capsule action.
 *
 * The primary slot means different things depending on the hovered work: a
 * confirmed image goes to the host asset library, a video keeps the
 * inspiration-library path, and anything ambiguous must not be written
 * anywhere. This is a separate derivation from the shared payload so the copy
 * and attach actions keep their payload semantics untouched — the first
 * action consults this resolver both when the button is painted and when it
 * is pressed.
 *
 * V1 scope: the hover detector only produces `image` or `video` payloads, so
 * a real image resolves to the asset save and a real video stays on
 * inspiration — including poster/frame/blob video sources, which are video
 * previews, not images. Element-level ambiguity (an `<img>` that is actually a
 * `/video/` work cover) is handled by the work-card semantics introduced with
 * the corner toolbar in V2; this resolver already refuses to guess for
 * anything it cannot classify. A picture the host cannot fetch (blob:, data:,
 * empty src) is still an image intent — its click fails honestly with the
 * unavailable feedback instead of a write.
 *
 * @module
 */

import type { HoveredMedia } from './types.ts'

/** Where the primary action sends the current media. */
export type SaveIntent = 'image-asset' | 'video-inspiration' | 'unknown'

/**
 * Resolves the save destination for one payload.
 *
 * @param payload - The hovered media as produced by `normalizeMedia`.
 * @returns `'image-asset'` for an image work, `'video-inspiration'` for a
 *   video work (a poster or captured frame is a video preview, not an image),
 *   and `'unknown'` for anything that cannot be classified — which must never
 *   be written to either library.
 */
export function resolveSaveIntent(payload: HoveredMedia): SaveIntent {
  if (payload.type === 'image') return 'image-asset'
  if (payload.type === 'video') return 'video-inspiration'
  return 'unknown'
}
