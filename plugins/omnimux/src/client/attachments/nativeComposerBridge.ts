import type { DraftFileUpload } from './types.ts'
import type { NativeComposerAttachment } from './NativeAttachmentCard.tsx'

export interface NativeComposerSnapshot {
  attachments: readonly NativeComposerAttachment[]
  uploads?: Readonly<Record<string, DraftFileUpload>>
  onRemoveAttachment?: (id: string) => void
  onRetryFile?: (id: string) => void
  onAddFiles?: (files: readonly File[]) => void
  canAcceptDrop?: boolean
  dropLimits?: { readonly count: number; readonly size: string }
}

const EMPTY: NativeComposerSnapshot = { attachments: [] }

let snapshot: NativeComposerSnapshot = EMPTY
const listeners = new Set<() => void>()

export function publishNativeComposer(next: NativeComposerSnapshot | null): void {
  snapshot = next && Array.isArray(next.attachments) ? next : EMPTY
  for (const listener of listeners) listener()
}

export function subscribeNativeComposer(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getNativeComposerSnapshot(): NativeComposerSnapshot {
  return snapshot
}
