import { assertCapabilityEnabled, isModelEnabled, isToolEnabled } from '../gate/guard.js'
import { OmnimuxError } from '../media/errors.js'
import { objectParams } from '../tools/schema.js'
import { enabledTextModels } from './catalog.js'
import { executeOmnimuxText } from './execute.js'

/**
 * @param {{
 *   tools: { register: (tool: object) => unknown },
 *   provide?: (name: string, value: unknown) => void,
 *   get?: (name: string) => unknown,
 * }} ctx
 * @param {{ text: object, gate?: object }} hub
 * @param {object} jsonOut
 * @param {(error: unknown) => never} onError
 */
export function mountTextComplete(ctx, hub, jsonOut, onError) {
  const gate = hub.gate ?? ctx.get?.('gate')

  const api = {
    /**
     * @param {{ prompt: string, model?: string, operation?: string, references?: import('./references.js').TextReference[], image?: string, video?: string, audio?: string, audioTrack?: object, assetMeta?: object, system?: string, maxTokens?: number, signal?: AbortSignal }} req
     */
    execute(req) {
      assertCapabilityEnabled(gate, 'omnimux_text_complete', 'tool')
      if (req.model) {
        assertCapabilityEnabled(gate, req.model, 'model')
      }
      return executeOmnimuxText({
        ...req,
        text: hub.text,
        gate,
        llm: ctx.get?.('llm'),
        attachments: ctx.get?.('attachments'),
        credentials: ctx.get?.('credentials'),
        settings: ctx.get?.('settings'),
        env: process.env,
      })
    },
  }

  if (!isToolEnabled(gate, 'omnimux_text_complete')) {
    return
  }

  if (typeof ctx.provide === 'function') {
    ctx.provide('textComplete', api)
  }

  const enabled = enabledTextModels(hub.text, gate)
  const modelIds = enabled.map((row) => row.id)

  ctx.tools.register({
    name: 'omnimux_text_complete',
    description:
      'Run one one-shot completion on an enabled OmniMux whitelist model. The expert receives no parent conversation or tools. Call only when the current model cannot do the work, or the user / contract names that model. Omit model to use the configured default. Pass ordered references for multiple images or a single video; the model contract must accept every reference. Current text routes reject audio and mixed image/video input. Legacy image and video fields remain accepted and do not duplicate matching references. Video bypasses the harness image store and packs as image_url(data:video). Do not use this to continue the conversation.',
    parameters: objectParams({
      model: {
        type: 'string',
        ...(modelIds.length > 0 ? { enum: modelIds } : {}),
        description: 'Whitelist model id. Omit to use the configured default.',
      },
      operation: {
        type: 'string',
        description: 'Contract operation id (chat | vision_chat | document_analyze). Optional when uniquely inferable from inputs.',
      },
      prompt: { type: 'string', required: true, description: 'Self-contained prompt. The expert cannot see the parent chat.' },
      references: {
        type: 'array',
        description: 'Ordered media references. Every item must satisfy the selected model and operation contract.',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['image', 'video', 'audio'] },
            pathOrUrl: { type: 'string' },
            role: { type: 'string' },
            targetSlot: { type: 'string' },
            mime: { type: 'string' },
            sizeBytes: { type: 'number' },
            durationSec: { type: 'number' },
          },
          required: ['type', 'pathOrUrl'],
          additionalProperties: false,
        },
      },
      image: { type: 'string', description: 'Absolute path, http(s) URL, or data URI. Model must accept image input. Mutually exclusive with video.' },
      video: { type: 'string', description: 'Absolute path (.mp4/.webm/.mov) or data:video URI. Model must accept video input. Mutually exclusive with image.' },
      reason: { type: 'string', required: true, description: 'Which missing capability, or which user / contract line authorizes this call.' },
      system: { type: 'string', description: 'Optional system text for this one request only.' },
      max_tokens: { type: 'number', description: 'Optional output cap. Defaults to Config.text.maxTokens.' },
    }),
    output: jsonOut,
    async execute(args, exec) {
      const reason = typeof args.reason === 'string' ? args.reason.trim() : ''
      if (!reason) {
        throw new OmnimuxError('omnimux-invalid-request', 'reason is required')
      }
      try {
        assertCapabilityEnabled(gate, 'omnimux_text_complete', 'tool')
        if (args.model) {
          assertCapabilityEnabled(gate, args.model, 'model')
        }
        return await executeOmnimuxText({
          prompt: args.prompt,
          model: args.model,
          operation: args.operation,
          references: args.references,
          image: args.image,
          video: args.video,
          system: args.system,
          maxTokens: args.max_tokens,
          signal: exec?.signal,
          sessionId: exec?.agent?.session?.id,
          text: hub.text,
          gate,
          llm: ctx.get?.('llm'),
          attachments: ctx.get?.('attachments'),
          credentials: ctx.get?.('credentials'),
          settings: ctx.get?.('settings'),
          env: process.env,
        })
      } catch (error) {
        if (error instanceof OmnimuxError) throw error
        return onError(error)
      }
    },
  })
}
