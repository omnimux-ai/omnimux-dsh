import { assertCapabilityEnabled, isMediaEnabled, isToolEnabled } from '../gate/guard.js';
import { OmnimuxError } from './errors.js';
import { objectParams, rethrow } from '../tools/schema.js';
import { searchVoices } from './voices.js';

export const VOICES_TOOL_NAME = 'omnimux_audio_voices';

/**
 * Mount the audio voice catalog query tool.
 *
 * @param {{
 *   tools: { register: (tool: object) => unknown },
 *   get?: (name: string) => unknown,
 * }} ctx
 * @param {{
 *   gate?: object,
 *   hub?: { gate?: object },
 *   jsonOut: object,
 * }} opts
 */
export function mountAudioVoices(ctx, opts) {
  const gate = opts.gate ?? opts.hub?.gate ?? ctx.get?.('gate');

  if (!isToolEnabled(gate, VOICES_TOOL_NAME)) {
    return;
  }

  ctx.tools.register({
    name: 'omnimux_audio_voices',
    description:
      'Query available voices for speech synthesis models (default seed-audio-1.0, 509+ voices). Supports filtering by keyword query (name/display_name/voice_type), category, gender, tag (e.g. 剪映同款, 抖音同款, 豆包同款), and pagination.',
    parameters: objectParams({
      model: { type: 'string', description: 'Model ID (default seed-audio-1.0)' },
      query: { type: 'string', description: 'Search keyword matching voice name, display name, voice_type, category, or accent' },
      category: { type: 'string', description: 'Scene category filter (e.g. 通用场景, 角色扮演, 有声阅读, 外语音色)' },
      gender: { type: 'string', enum: ['male', 'female'], description: 'Voice gender filter' },
      tag: { type: 'string', description: 'Popularity tag filter (e.g. 剪映同款, 抖音同款, 豆包同款)' },
      language: { type: 'string', description: 'Language filter (e.g. 中文, 英语)' },
      limit: { type: 'number', description: 'Maximum number of items to return (default 20, max 100)' },
      offset: { type: 'number', description: 'Pagination offset (default 0)' },
    }),
    output: opts.jsonOut,
    async execute(args) {
      try {
        assertCapabilityEnabled(gate, VOICES_TOOL_NAME, 'tool');
        return searchVoices(args);
      } catch (error) {
        if (error instanceof OmnimuxError) throw error;
        return rethrow(error);
      }
    },
  });
}
