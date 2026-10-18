import { useEffect, useRef } from 'react'
import { installNativeFilesBridge } from './native-files-bridge.js'

/**
 * Publish this composer's native-file intake while the tray is mounted.
 *
 * `attachments`, `onAddFiles` and `canAcceptDrop` change every render (the host
 * passes fresh props); keeping them in a ref means the registry entry installs
 * once per session instead of churning on every keystroke, while the bridge
 * still reads the live values when a file is added.
 *
 * @param {any} windowObject
 * @param {{
 *   sessionId?: string,
 *   attachments?: readonly any[],
 *   canAcceptDrop?: boolean,
 *   onAddFiles?: (files: readonly File[]) => void,
 * }} options
 */
export function useNativeFilesBridge(windowObject, options = {}) {
  const latest = useRef({
    attachments: options.attachments,
    canAcceptDrop: options.canAcceptDrop,
    onAddFiles: options.onAddFiles,
  })
  latest.current = {
    attachments: options.attachments,
    canAcceptDrop: options.canAcceptDrop,
    onAddFiles: options.onAddFiles,
  }
  const sessionId = typeof options.sessionId === 'string' ? options.sessionId : ''

  useEffect(() => {
    if (!windowObject || !sessionId) return undefined
    return installNativeFilesBridge(windowObject, {
      sessionId,
      canAcceptDrop: () => Boolean(latest.current.canAcceptDrop),
      getAttachments: () => latest.current.attachments,
      // Void by the official slot contract; the bridge confirms the add by
      // watching the attachment list instead of trusting this return value.
      addFiles: files => {
        const onAddFiles = latest.current.onAddFiles
        if (typeof onAddFiles !== 'function') throw new Error('native-files-unavailable')
        onAddFiles(files)
      },
    })
  }, [windowObject, sessionId])
}
