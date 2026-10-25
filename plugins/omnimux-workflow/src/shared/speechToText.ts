/** Workflow HTTP DTOs; provider protocol details remain in the hub. */
export const TRANSCRIPTION_FORMATS = ['json', 'text', 'verbose_json', 'srt', 'vtt'] as const;
export type TranscriptionFormat = typeof TRANSCRIPTION_FORMATS[number];

/**
 * Default transcription model for an omitted `model` on the workflow request.
 *
 * #3763: the speech-to-text default is declared in four places that no canvas
 * whitelist covers — the hub's `catalog-defaults.json`, the hub media route, this
 * schema and the hub's file-upload fallback. They must agree; the cross-plugin
 * alignment gate (`scripts/verify-cross-plugin-model-alignment.mjs`) reads all
 * four and fails when one drifts. The anonymous bundled gateway snapshot
 * publishes no transcription model, so the shipped default is admitted through
 * the manifest's explicit `gatewayMembershipExempt` declaration instead.
 */
export const DEFAULT_SPEECH_TO_TEXT_MODEL = 'whisper-1';

export interface SpeechToTextRequest {
  nodeId: string;
  audioPath: string;
  model?: string;
  responseFormat?: TranscriptionFormat;
}

export interface SpeechToTextResult {
  text: string;
  model: string;
}

export interface SpeechToTextResponse extends SpeechToTextResult {
  ok: true;
  code: 0;
  data: SpeechToTextResult;
  message: string;
}

export interface SpeechToTextSeam {
  execute(input: {
    model: string;
    audio: string;
    response_format: TranscriptionFormat;
  }): Promise<{ mode: 'live'; model: string; text: string }>;
}
