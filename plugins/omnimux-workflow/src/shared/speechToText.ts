/** Workflow HTTP DTOs; provider protocol details remain in the hub. */
export const TRANSCRIPTION_FORMATS = ['json', 'text', 'verbose_json', 'srt', 'vtt'] as const;
export type TranscriptionFormat = typeof TRANSCRIPTION_FORMATS[number];

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
