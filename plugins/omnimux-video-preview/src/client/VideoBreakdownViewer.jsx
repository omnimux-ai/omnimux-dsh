import React, { useState, useMemo, useRef, useEffect } from 'react'
import { ensureBreakdownStyles } from './styles.js'
import {
  useIsZh,
  cleanShots,
  cleanStructure,
  cleanPipeline,
  computeShotsCopyText,
  computeScriptCopyText,
  useVideoPlayback,
  useTranslation,
  BreakdownHeader,
  VideoPlayerCard,
  VideoMetadataBox,
  ShotListPanel,
  StructurePipelineView,
  BreakdownFooter,
} from './viewer/index.js'

function requestFullscreenSafe(el) {
  if (el && typeof el.requestFullscreen === 'function') {
    el.requestFullscreen().catch(() => {})
  }
}

function exitFullscreenSafe() {
  if (typeof document.exitFullscreen === 'function') {
    document.exitFullscreen().catch(() => {})
  }
}

function toggleContainerFullscreen(containerEl) {
  if (typeof document === 'undefined') return
  if (document.fullscreenElement) {
    exitFullscreenSafe()
    return
  }
  requestFullscreenSafe(containerEl)
}

function parseBreakdownData(content) {
  if (!content) return null
  try {
    if (typeof content === 'object') return content
    return JSON.parse(content)
  } catch {
    return null
  }
}

function extractBreakdownContext(data, path) {
  const video = data?.video || {}
  const streamUrl = video.stream_url || video.video_url || ''
  const coverUrl = video.cover_url || ''
  const filePath = path || data?.filePath || ''
  return { video, streamUrl, coverUrl, filePath }
}

function useBreakdownParsedModel(data) {
  const shots = useMemo(() => cleanShots(data?.shots), [data?.shots])
  const structure = useMemo(() => cleanStructure(data?.structure, shots), [data?.structure, shots])
  const pipeline = useMemo(() => cleanPipeline(structure, data?.pipeline), [structure, data?.pipeline])
  return { shots, structure, pipeline }
}

function useBreakdownCopyTexts(shots, isZh, translation) {
  const shotsCopy = useMemo(() => {
    return computeShotsCopyText(shots, isZh, translation.selectedLang, translation.translations)
  }, [shots, isZh, translation.selectedLang, translation.translations])

  const scriptCopy = useMemo(() => {
    return computeScriptCopyText(shots, isZh, translation.selectedLang, translation.translations)
  }, [shots, isZh, translation.selectedLang, translation.translations])

  return { shotsCopy, scriptCopy }
}

function SegmentedTabsBar({ activeTab, setActiveTab, isZh }) {
  const tabs = [
    { id: 'shots', label: isZh ? '分镜' : 'Shots' },
    { id: 'structure', label: isZh ? '结构拆解' : 'Structure' },
  ]

  return (
    <div className="omnimux-video-breakdown-tabs-bar">
      <div className="omnimux-video-breakdown-tabs-container">
        {tabs.map((tab) => (
          <button // exempt-ui01 segmented tab pill button
            key={tab.id}
            type="button"
            className={`omnimux-video-breakdown-tab-btn${activeTab === tab.id ? ' is-active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function BreakdownEmptyState({ isZh }) {
  const text = isZh ? '正在加载或未找到有效视频拆解数据' : 'Loading or no valid video breakdown data found'
  return (
    <div className="omnimux-video-breakdown-empty">
      <span>{text}</span>
    </div>
  )
}

function buildPlayerCardProps(video, streamUrl, coverUrl, playback) {
  return {
    video,
    streamUrl,
    coverUrl,
    embedUrl: playback.embedUrl,
    playerMode: playback.playerMode,
    setPlayerMode: playback.setPlayerMode,
    videoRef: playback.videoRef,
    isPlaying: playback.isPlaying,
    setIsPlaying: playback.setIsPlaying,
    isMuted: playback.isMuted,
    currentTime: playback.currentTime,
    setCurrentTime: playback.setCurrentTime,
    duration: playback.duration,
    setDuration: playback.setDuration,
    onTogglePlay: playback.togglePlay,
    onToggleMute: playback.toggleMute,
  }
}

function buildViewerLayoutProps(state) {
  const playerCardProps = buildPlayerCardProps(state.ctx.video, state.ctx.streamUrl, state.ctx.coverUrl, state.playback)
  const mainProps = {
    activeTab: state.activeTab,
    setActiveTab: state.setActiveTab,
    isZh: state.isZh,
    playback: state.playback,
    translation: state.translation,
    shots: state.model.shots,
    structure: state.model.structure,
    pipeline: state.model.pipeline,
    scriptCopyContent: state.copyTexts.scriptCopy,
    shotsCopyContent: state.copyTexts.shotsCopy,
  }
  return { playerCardProps, mainProps }
}

function BreakdownMainContent(props) {
  const { activeTab, setActiveTab, isZh, playback, translation, shots, structure, pipeline, scriptCopyContent, shotsCopyContent } = props
  return (
    <main className="omnimux-video-breakdown-right">
      <SegmentedTabsBar activeTab={activeTab} setActiveTab={setActiveTab} isZh={isZh} />
      <div className="omnimux-video-breakdown-scroll-area">
        {activeTab === 'shots' ? (
          <ShotListPanel
            shots={shots}
            currentPlayingShotIndex={playback.currentPlayingShotIndex}
            isPlaying={playback.isPlaying}
            isZh={isZh}
            selectedLang={translation.selectedLang}
            translations={translation.translations}
            isTranslating={translation.isTranslating}
            onSeekShot={playback.handleSeek}
          />
        ) : (
          <StructurePipelineView pipeline={pipeline} structure={structure} isZh={isZh} />
        )}
      </div>
      {activeTab === 'shots' ? (
        <BreakdownFooter
          isZh={isZh}
          selectedLang={translation.selectedLang}
          isLangMenuOpen={translation.isLangMenuOpen}
          onToggleLangMenu={() => translation.setIsLangMenuOpen(!translation.isLangMenuOpen)}
          onSelectLang={translation.handleSelectLanguage}
          translateMenuRef={translation.translateMenuRef}
          scriptCopyContent={scriptCopyContent}
          shotsCopyContent={shotsCopyContent}
        />
      ) : null}
    </main>
  )
}

export function VideoBreakdownViewer({ content, path, title, onClose }) {
  const isZh = useIsZh()
  const [activeTab, setActiveTab] = useState('shots')
  const containerRef = useRef(null)

  useEffect(() => {
    ensureBreakdownStyles()
  }, [])

  const data = useMemo(() => parseBreakdownData(content), [content])
  const model = useBreakdownParsedModel(data)
  const ctx = useMemo(() => extractBreakdownContext(data, path), [data, path])

  const playback = useVideoPlayback({ video: ctx.video, shots: model.shots, activeTab, streamUrl: ctx.streamUrl })
  const translation = useTranslation({ shots: model.shots, initialTranslations: data?.translations, filePath: ctx.filePath })
  const copyTexts = useBreakdownCopyTexts(model.shots, isZh, translation)

  if (!data) {
    return <BreakdownEmptyState isZh={isZh} />
  }

  const { playerCardProps, mainProps } = buildViewerLayoutProps({
    activeTab,
    setActiveTab,
    isZh,
    playback,
    translation,
    model,
    copyTexts,
    ctx,
  })

  return (
    <div ref={containerRef} className="omnimux-video-breakdown-root">
      <BreakdownHeader
        isZh={isZh}
        onToggleFullscreen={() => toggleContainerFullscreen(containerRef.current)}
        onClose={onClose}
      />
      <div className="omnimux-video-breakdown-body">
        <aside className="omnimux-video-breakdown-left">
          <VideoPlayerCard {...playerCardProps} />
          <VideoMetadataBox video={ctx.video} shotsCount={model.shots.length} isZh={isZh} />
        </aside>
        <BreakdownMainContent {...mainProps} />
      </div>
    </div>
  )
}
