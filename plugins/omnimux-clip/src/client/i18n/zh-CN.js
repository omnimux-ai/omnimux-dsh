import { zhWelcome } from './zh/welcome.js'
import { zhChrome } from './zh/chrome.js'
import { zhTimeline } from './zh/timeline.js'
import { zhPreview } from './zh/preview.js'
import { zhInspector } from './zh/inspector.js'
import { zhEditorChrome } from './zh/editorChrome.js'
import { zhMotion } from './zh/motion.js'

/**
 * zh dictionary, keyed by English source literal.
 * Split by surface so each area can be extended independently.
 */
export const zh = {
  ...zhWelcome,
  ...zhChrome,
  ...zhTimeline,
  ...zhPreview,
  ...zhInspector,
  ...zhEditorChrome,
  ...zhMotion,
}
