export type VideoParamWriteKey =
  | 'operation' | 'aspectRatio' | 'resolution' | 'duration' | 'sound'
  | 'seed' | 'watermark' | 'outputFormat' | 'referenceTaskType' | 'generationType'
  | 'returnLastFrame' | 'webSearch' | 'nsfwCheck' | 'fileUrl' | 'linkUrl';
export type ParamLayer = 'trigger' | 'popover' | 'advanced' | 'hidden';
export interface ParamControlPolicy {
  trigger: readonly string[];
  popover: readonly string[];
  advanced: readonly string[];
  hidden: readonly string[];
  writeAllowlist: readonly VideoParamWriteKey[];
}

/** Visibility policy only; consumers must intersect these keys with catalog support. */
export const DEFAULT_PARAM_CONTROL_POLICY: ParamControlPolicy = Object.freeze({
  trigger: Object.freeze(['operation', 'aspectRatio', 'resolution', 'duration']),
  popover: Object.freeze(['operation', 'aspectRatio', 'resolution', 'duration', 'sound']),
  advanced: Object.freeze(['seed', 'watermark', 'outputFormat', 'referenceTaskType', 'generationType',
    'returnLastFrame', 'webSearch', 'nsfwCheck', 'fileUrl', 'linkUrl']),
  hidden: Object.freeze(['generationMode']),
  writeAllowlist: Object.freeze<VideoParamWriteKey[]>(['operation', 'aspectRatio', 'resolution', 'duration', 'sound',
    'seed', 'watermark', 'outputFormat', 'referenceTaskType', 'generationType',
    'returnLastFrame', 'webSearch', 'nsfwCheck', 'fileUrl', 'linkUrl']),
});

/** Open operation ids, not a second model allowlist. */
export const PARAM_CONTROL_TABLE: Readonly<Record<string, ParamControlPolicy>> = Object.freeze({
  text_to_video: DEFAULT_PARAM_CONTROL_POLICY,
  first_frame: DEFAULT_PARAM_CONTROL_POLICY,
  first_last_frame: DEFAULT_PARAM_CONTROL_POLICY,
  video_multi_ref: DEFAULT_PARAM_CONTROL_POLICY,
  digital_human: DEFAULT_PARAM_CONTROL_POLICY,
});
