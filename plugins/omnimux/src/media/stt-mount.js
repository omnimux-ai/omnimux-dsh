import { assertCapabilityEnabled, isToolEnabled } from '../gate/guard.js'
import { OmnimuxError } from './errors.js'
import { objectParams, rethrow } from '../tools/schema.js'

/** Official tool over the speechToText seam. */
export const STT_TOOL_NAME = 'omnimux_speech_to_text'

/**
 * Mount the speechToText seam (audio in → text out). Same shape as the
 * mediaGenerate mounts: a neutral `ctx.provide('speechToText')` seam plus one
 * official tool, both gated by `gate.tools.omnimux_speech_to_text`.
 *
 * @param {{
 *   tools: { register: (tool: object) => unknown },
 *   provide?: (name: string, value: unknown) => void,
 *   get?: (name: string) => unknown,
 * }} ctx
 * @param {{
 *   execute: (req: object) => Promise<unknown>,
 *   media: unknown,
 *   gate?: object,
 *   hub?: { gate?: object },
 *   store?: { resolve: () => Promise<string | undefined> },
 *   jsonOut: object,
 * }} opts
 */
export function mountSpeechToText(ctx, opts) {
  const { execute, media, jsonOut, store } = opts
  const gate = opts.gate ?? opts.hub?.gate ?? ctx.get?.('gate')

  const api = {
    /**
     * @param {{ audio: string, model?: string, provider?: string, language?: string, response_format?: string, signal?: AbortSignal }} req
     */
    execute(req) {
      assertCapabilityEnabled(gate, STT_TOOL_NAME, 'tool')
      return execute({
        ...req,
        media,
        store,
        credentials: ctx.get?.('credentials'),
      })
    },
  }

  if (!isToolEnabled(gate, STT_TOOL_NAME)) {
    return
  }

  if (typeof ctx.provide === 'function') {
    ctx.provide('speechToText', api)
  }

  ctx.tools.register({
    name: STT_TOOL_NAME,
    description:
      'Transcribe one audio file to text with an OmniMux speech-to-text model (default doubao-asr-bigmodel). audio is an absolute path, http(s) URL, or data:audio URI. Returns { mode: "live", model, text }. Uses OMNIMUX_API_KEY / OMNIMUX_TOKEN.',
    parameters: objectParams({
      audio: { type: 'string', required: true, description: 'Absolute path, http(s) URL, or data:audio URI of the source audio' },
      model: { type: 'string', description: 'Model ID (e.g. doubao-asr-bigmodel). Omit to use the configured default.' },
      operation: {
        type: 'string',
        description: 'Contract operation id (default speech_to_text). Draft/unlisted models are rejected by SubmitGuard.',
      },
      language: { type: 'string', description: 'ISO language hint (e.g. zh, en). Optional.' },
      response_format: {
        type: 'string', enum: ['json', 'text', 'verbose_json', 'srt', 'vtt'],
        description: 'Transcript output format. Defaults to json; srt/vtt retain subtitle timestamps.',
      },
    }),
    output: jsonOut,
    async execute(args, exec) {
      try {
        assertCapabilityEnabled(gate, STT_TOOL_NAME, 'tool')
        return await api.execute({
          audio: args.audio,
          model: args.model,
          operation: args.operation,
          language: args.language,
          response_format: args.response_format,
          signal: exec?.signal,
        })
      } catch (error) {
        if (error instanceof OmnimuxError) throw error
        return rethrow(error)
      }
    },
  })
}
