/**
 * @file plugins/omnimux-video-preview/src/breakdown.js
 * Video breakdown & shots analysis engine (Hub facade).
 * 100% backward-compatible facade re-exporting domain submodules.
 */

export {
  BUNDLED_STRUCTURE_PROMPT,
  METADATA_HEADING_REGEX,
  STAGE_I18N,
  STAGE_NAME_MAP,
  DEFAULT_CAMERA_TAGS,
  CANONICAL_STAGE_KEYS,
  HEADER_KEYWORD_REGEX,
  STAGE_STRATEGY_TEMPLATES,
  SECTION_MATCH_RULES,
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

export {
  detectSocialPlatform,
  normalizeSocialMetadata,
  fetchRealSocialMetadata,
} from './breakdown/socialMetadata.js'

export {
  generateAdaptiveShotsAndStructure,
} from './breakdown/adaptiveGenerator.js'

export {
  resolveWorkspaceDirectory,
  saveVideoBreakdownArtifacts,
} from './breakdown/artifactStorage.js'

export {
  executeDedicatedStructureAnalyze,
  extractVideoBreakdown,
} from './breakdown/analyzerPipeline.js'
