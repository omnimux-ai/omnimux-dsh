/**
 * @file plugins/omnimux-video-preview/src/breakdown-parser.js
 * Video breakdown parser & formatting engine (Hub facade).
 * 100% backward-compatible facade re-exporting domain submodules.
 */

export {
  METADATA_HEADING_REGEX,
  STAGE_I18N,
  CANONICAL_STAGE_KEYS,
  STAGE_NAME_MAP,
  DEFAULT_CAMERA_TAGS,
  HEADER_KEYWORD_REGEX,
} from './breakdown/constants.js'

export {
  formatTime,
  formatTimeRange,
  extractTimeRange,
} from './breakdown/timeUtils.js'

export {
  localizeStage,
  mapToCanonicalStage,
  canonicalizeCameraTags,
} from './breakdown/tagNormalizer.js'

export {
  formatShotsCopyText,
  formatScriptCopyText,
  extractSpeechFromDesc,
  isTableHeaderRow,
  parseShotsFromAnalyzeMarkdown,
} from './breakdown/shotsParser.js'

export {
  extractQuoteAndDesc,
  parseStructureFromAnalyzeMarkdown,
  parsePipelineAndStructureFromMarkdown,
} from './breakdown/structureParser.js'
