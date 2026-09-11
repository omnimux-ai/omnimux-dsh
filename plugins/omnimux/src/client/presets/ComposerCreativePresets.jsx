import React from 'react'
import { ComposerPresetsTriggers } from './ComposerPresetsTriggers.jsx'
import { ComposerPresetsChips } from './ComposerPresetsChips.jsx'

/**
 * 营销视频三大创意预设复合包装组件（向下兼容）
 */
export function ComposerCreativePresets({ sessionId = 'default', className = '' }) {
  return (
    <div className={`omnimux-composer-presets-wrapper ${className}`}>
      <ComposerPresetsChips sessionId={sessionId} />
      <ComposerPresetsTriggers sessionId={sessionId} />
    </div>
  )
}
