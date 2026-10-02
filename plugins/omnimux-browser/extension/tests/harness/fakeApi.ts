/**
 * Fake `PanelApi` for the harness: the real gallery component talks to a real
 * `session.attachment` / `omnimux.producedMedia` call shape, but the bytes come
 * from the harness's own static media instead of a dsh host. No host, no
 * extension, no network beyond the harness origin.
 */

import type { PanelApi } from '../../src/panel/api.ts'
import type { MediaAttachmentRef } from '../../src/panel/attachments.ts'
import type { HarnessAttachment, HarnessMedia, HarnessPathMedia } from './fixtures.ts'

export interface HarnessApiOptions {
  /** Latency before every response, so the loading placeholder is observable. */
  readonly delayMs?: number
}

/** Attachment ids and produced paths the harness was asked for, in call order. */
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
  items: readonly HarnessMedia[],
  options: HarnessApiOptions = {},
): PanelApi {
  const byId = new Map<string, HarnessAttachment>()
  const byPath = new Map<string, HarnessPathMedia>()
  for (const item of items) {
    if (item.source === 'path') byPath.set(item.path, item)
    else byId.set(item.attachmentId, item)
  }
  const encoded = new Map<string, Promise<string>>()
  const attempts = new Map<string, number>()
  const delayMs = options.delayMs ?? 0

  const wait = async (): Promise<void> => {
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs))
  }

  const bytesOf = async (file: string): Promise<string> => {
    let pending = encoded.get(file)
    if (pending === undefined) {
      pending = readBase64(file)
      encoded.set(file, pending)
    }
    return pending
  }

  const rpc = async (method: string, payload?: unknown): Promise<unknown> => {
    if (method === 'session.attachment') {
      const attachmentId = String((payload as { attachmentId?: unknown } | null)?.attachmentId ?? '')
      const attachment = byId.get(attachmentId)
      if (attachment === undefined) throw new Error(`harness: unknown attachment ${attachmentId}`)
      rpcLog.push(attachmentId)
      await wait()
      if (attachment.failFirst === true) {
        const seen = (attempts.get(attachmentId) ?? 0) + 1
        attempts.set(attachmentId, seen)
        if (seen === 1) throw new Error(`harness: simulated attachment failure for ${attachmentId}`)
      }
      return { attachment: toRef(attachment), data: await bytesOf(attachment.file) }
    }
    if (method === 'omnimux.producedMedia') {
      const path = String((payload as { path?: unknown } | null)?.path ?? '')
      const item = byPath.get(path)
      if (item === undefined) throw new Error(`harness: unregistered produced path ${path}`)
      rpcLog.push(path)
      await wait()
      return { mediaType: item.mediaType, bytes: item.bytes ?? 0, data: await bytesOf(item.file) }
    }
    throw new Error(`harness: unexpected rpc ${method}`)
  }

  return { rpc } as unknown as PanelApi
}
