import { useEffect } from 'react'
import type { AttachmentTrayProps } from './AttachmentTray.tsx'
import { publishNativeComposer } from './nativeComposerBridge.ts'

/**
 * Occupies the official inner composer attachment seat so the Host still
 * delivers native uploads, then forwards them to the tray above the composer.
 */
export function NativeComposerBridge(props: AttachmentTrayProps) {
  useEffect(() => {
    publishNativeComposer({
      attachments: Array.isArray(props.attachments) ? props.attachments : [],
      uploads: props.uploads,
      onRemoveAttachment: props.onRemoveAttachment,
      onRetryFile: props.onRetryFile,
      onAddFiles: props.onAddFiles,
      canAcceptDrop: props.canAcceptDrop,
      dropLimits: props.dropLimits,
    })
    return () => {
      publishNativeComposer(null)
    }
  }, [
    props.attachments,
    props.uploads,
    props.onRemoveAttachment,
    props.onRetryFile,
    props.onAddFiles,
    props.canAcceptDrop,
    props.dropLimits,
  ])
  return null
}
