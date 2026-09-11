/**
 * Pure-function validator with parity against model-capability.schema.json
 * and operation-registry.json / adapter-profiles.json. No Ajv/Zod.
 *
 * Facade entrypoint aggregating modular domain schemas from ./schemas/
 */

export {
  EXPECTED_OPERATION_COUNT,
  CANONICAL_SCHEMA_VERSION,
  PROMPT_POLICIES,
  OUTPUT_TYPES,
  MEDIA_TYPES,
  LIMIT_KINDS,
  SLOT_SOURCES,
  PROFILE_STATUSES,
  loadOperationRegistry,
  loadAdapterProfiles,
  loadJsonSchema,
  resetSchemaCaches,
  operationIdSet,
  promptPolicyFor,
  issue,
  validateAllowedMimes,
  validateMinMaxPair,
  validateSlotMinMax,
  validateLimitSource,
  validateAliasesArray,
} from './schemas/commonSchema.js';

export {
  VIDEO_DURATION_FIELDS,
  VIDEO_EXCLUSIVE_FIELDS,
  validateSlotDurations,
  hasVideoDurationFields,
} from './schemas/videoSchema.js';

export {
  validateSlotSizes,
  hasSizeLimitFields,
} from './schemas/imageSchema.js';

export {
  validatePromptPolicy,
  validateInputGroups,
} from './schemas/textSchema.js';

export {
  AUDIO_OUTPUT_FORMATS,
  validateAudioOutputParams,
} from './schemas/audioSchema.js';

export {
  validateResearch,
  validateExecution,
  validateImplementation,
} from './schemas/statusSchema.js';

export {
  validateSlot,
  validateOperation,
} from './schemas/operationSchema.js';

export {
  validateAdapterProfiles,
  validateOperationRegistry,
} from './schemas/registrySchema.js';

export {
  validateModel,
  validateDoc,
  validateCrossModelAliases,
} from './schemas/modelSchema.js';
