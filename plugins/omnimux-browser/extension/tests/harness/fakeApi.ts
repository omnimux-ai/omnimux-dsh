/**
 * Fake `PanelApi` for the harness: the real gallery component talks to a real
 * `session.attachment` call shape, but the bytes come from the harness's own
 * static media instead of a dsh host. No host, no extension, no network beyond
 * the harness origin.
 */

import type { PanelApi } from '../../src/panel/api.ts'
import type { MediaAttachmentRef } from '../../src/panel/attachments.ts'
import type { HarnessAttachment } from './fixtures.ts'

export interface HarnessApiOptions {
  /** Latency before every response, so the loading placeholder is observable. */
  readonly delayMs?: number
}

/** Attachment ids the harness was asked for, in call order. */
export const rpcLog: string[] = []

async function readBase64(file: string): Promise<string> {
  const response = await fetch(file)
  if (!response.ok) throw new Error(`harness: ${file} → HTTP ${response.status}`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  let binary = ''
  const chunk = 0x8000
  for (let at = 0; at < bytes.length; at += chunk) {
    binary += String.fromCharCode(...bytes.subarray(at, at + chunk))
  }
  return btoa(binary)
}

/** Strip the harness-only fields, leaving the exact wire shape the panel sees. */
function toRef(attachment: HarnessAttachment): MediaAttachmentRef {
  const { file: _file, failFirst: _failFirst, ...ref } = attachment
  return ref
}

export function createHarnessApi(
  attachments: readonly HarnessAttachment[],
  options: HarnessApiOptions = {},
): PanelApi {
  const byId = new Map(attachments.map((attachment) => [attachment.attachmentId, attachment]))
  const encoded = new Map<string, Promise<string>>()
  const attempts = new Map<string, number>()
  const delayMs = options.delayMs ?? 0

  const rpc = async (method: string, payload?: unknown): Promise<unknown> => {
    if (method !== 'session.attachment') throw new Error(`harness: unexpected rpc ${method}`)
    const attachmentId = String((payload as { attachmentId?: unknown } | null)?.attachmentId ?? '')
    const attachment = byId.get(attachmentId)
    if (attachment === undefined) throw new Error(`harness: unknown attachment ${attachmentId}`)
    rpcLog.push(attachmentId)

    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs))
    if (attachment.failFirst === true) {
      const seen = (attempts.get(attachmentId) ?? 0) + 1
      attempts.set(attachmentId, seen)
      if (seen === 1) throw new Error(`harness: simulated attachment failure for ${attachmentId}`)
    }

    let pending = encoded.get(attachment.file)
    if (pending === undefined) {
      pending = readBase64(attachment.file)
      encoded.set(attachment.file, pending)
    }
    return { attachment: toRef(attachment), data: await pending }
  }

  return { rpc } as unknown as PanelApi
}
