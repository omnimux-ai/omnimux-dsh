import React from 'react'
import { MicIcon, TranslateIcon } from '../icons.jsx'
import { renderTagIcon } from './tagIcons.jsx'
import { cleanTagText } from './breakdownDataUtils.js'
import { mapToCanonicalStage } from '../../breakdown-parser.js'

function ShotPlayingBadge({ isZh }) {
  return (
    <span className="omnimux-video-shot-playing-badge">
      <span className="omnimux-video-shot-playing-dot" />
      {isZh ? '播放中' : 'Playing'}
    </span>
  )
}

function ShotTagsRow({ tags }) {
  if (!Array.isArray(tags) || tags.length === 0) return null
  return (
    <div className="omnimux-video-breakdown-pills-row">
      {tags.map((tag, tIdx) => (
        <span key={tIdx} className="omnimux-video-breakdown-pill">
          {renderTagIcon(tag)}
          <span>{cleanTagText(tag)}</span>
        </span>
      ))}
    </div>
  )
}

function resolveTranslationText(translatedText, isTranslating, isZh) {
  if (translatedText) return translatedText
  if (isTranslating) {
    return isZh ? '翻译中...' : 'Translating...'
  }
  return ''
}

function ShotSpeechContainer(props) {
  const { speech, showTranslation, translatedText, isTranslating, isZh } = props
  if (!speech) return null
  const transContent = resolveTranslationText(translatedText, isTranslating, isZh)

  return (
    <div className="omnimux-video-breakdown-shot-speech-container">
      <div className="omnimux-video-breakdown-shot-speech">
        <span className="omnimux-video-shot-speech-icon">
          <MicIcon size={13} />
        </span>
        <span className="omnimux-video-shot-speech-text">{speech}</span>
      </div>

      {showTranslation ? (
        <div className="omnimux-video-breakdown-shot-translated-speech">
          <span className="omnimux-video-shot-speech-icon">
            <TranslateIcon size={13} />
          </span>
          <span className="omnimux-video-shot-speech-text">{transContent}</span>
        </div>
      ) : null}
    </div>
  )
}

function ShotCardHeader(props) {
  const showPlaying = props.isCurrent && props.isPlaying
  return (
    <div className="omnimux-video-breakdown-shot-header">
      <div className="omnimux-video-breakdown-shot-title-box">
        <span className="omnimux-video-breakdown-shot-time">{props.timeRange}</span>
        <span className="omnimux-video-breakdown-shot-title">{props.title}</span>
        {showPlaying ? <ShotPlayingBadge isZh={props.isZh} /> : null}
      </div>
      {props.stageName ? (
        <div className="omnimux-video-breakdown-stage-pill">{props.stageName}</div>
      ) : null}
    </div>
  )
}

export function ShotCard(props) {
  const { shot, index, isCurrent, isPlaying, isZh, selectedLang, translatedSpeech, isTranslating, onSeekShot } = props
  const defaultTitle = isZh ? `分镜 ${index + 1}` : `Shot ${index + 1}`
  const cardTitle = isZh ? '点击跳转并从该分镜开始播放' : 'Click to seek and play from this shot'
  const timeRange = shot.time_range || '0:00 - 0:00'
  const stageName = shot.stage ? mapToCanonicalStage(shot.stage, index) : null
  const headerProps = { timeRange, title: shot.title || defaultTitle, isCurrent, isPlaying, isZh, stageName }

  return (
    <div
      id={`omnimux-shot-card-${index}`}
      className={`omnimux-video-breakdown-shot-card${isCurrent ? ' is-active' : ''}`}
      onClick={() => onSeekShot(shot.start_seconds || 0)}
      title={cardTitle}
    >
      <ShotCardHeader {...headerProps} />
      <ShotTagsRow tags={shot.tags} />
      {shot.description ? <div className="omnimux-video-breakdown-shot-desc">{shot.description}</div> : null}
      <ShotSpeechContainer
        speech={shot.speech}
        showTranslation={selectedLang !== 'original'}
        translatedText={translatedSpeech}
        isTranslating={isTranslating}
        isZh={isZh}
      />
    </div>
  )
}
