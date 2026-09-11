import React from 'react'
import { ShotCard } from './ShotCard.jsx'

function getShotTranslation(translations, selectedLang, shotId) {
  if (selectedLang === 'original') return null
  if (!translations || typeof translations !== 'object') return null
  const langMap = translations[selectedLang]
  if (!langMap) return null
  return langMap[shotId] || null
}

export function ShotListPanel(props) {
  const {
    shots = [],
    currentPlayingShotIndex = -1,
    isPlaying = false,
    isZh = true,
    selectedLang = 'original',
    translations = {},
    isTranslating = false,
    onSeekShot,
  } = props

  return (
    <div className="omnimux-video-breakdown-shots-list">
      {shots.map((shot, idx) => {
        const isCurrent = idx === currentPlayingShotIndex
        const translatedSpeech = getShotTranslation(translations, selectedLang, shot.id)

        return (
          <ShotCard
            key={shot.id || idx}
            shot={shot}
            index={idx}
            isCurrent={isCurrent}
            isPlaying={isPlaying}
            isZh={isZh}
            selectedLang={selectedLang}
            translatedSpeech={translatedSpeech}
            isTranslating={isTranslating}
            onSeekShot={onSeekShot}
          />
        )
      })}
    </div>
  )
}
