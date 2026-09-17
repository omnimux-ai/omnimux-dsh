import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, EmptyState } from 'dsh-ui-kit'
import { CheckIcon, CopyIcon, ChatIcon, PlayIcon, AudioIcon } from './icons.jsx'
import { listArtifacts, artifactPreviewUrl } from './api.js'
import { formatRelative, formatBytes } from './format.js'
import { addMediaToConversation } from './add-to-chat.js'
import {
  GENERATION_SOURCES,
  GENERATION_TYPES,
  resolveArtifactSource,
  getSourceBadgeText,
} from './generations-helpers.js'

export {
  GENERATION_SOURCES,
  GENERATION_TYPES,
  resolveArtifactSource,
  getSourceBadgeText,
}

/**
 * 二级分类与格式胶囊导航组件。
 * 挂载在顶层 FilterBar 正下方，与本地/产品库保持同构的吸附与左对齐排版。
 *
 * @param {{
 *   t: (key: string) => string,
 *   filterSource: string,
 *   onSourceChange: (source: string) => void,
 *   filterType: string,
 *   onTypeChange: (type: string) => void,
 *   counts?: { sources: Record<string, number>, types: Record<string, number> },
 * }} props
 */
export function GenerationsCategoryNav(props) {
  const {
    t,
    filterSource = 'all',
    onSourceChange,
    filterType = 'all',
    onTypeChange,
    counts,
  } = props

  return (
    <div className="omnimux-assets-local-nav" role="group" aria-label={t('generations.nav.label') || '生成素材分类'}>
      <div className="omnimux-assets-local-nav-row">
        {GENERATION_SOURCES.map((item) => {
          const count = counts?.sources?.[item.id]
          const label = t(item.labelKey) || item.defaultLabel
          return (
            <Button
              key={item.id}
              variant="ghost"
              size="sm"
              className="omnimux-assets-cloud-chip"
              aria-pressed={filterSource === item.id ? 'true' : 'false'}
              onClick={() => onSourceChange?.(item.id)}
            >
              {label}
              {typeof count === 'number' ? <span className="omnimux-assets-cloud-count">{count}</span> : null}
            </Button>
          )
        })}

        <div className="omnimux-generations-nav-divider" role="separator" />

        {GENERATION_TYPES.map((item) => {
          const count = counts?.types?.[item.id]
          const label = t(item.labelKey) || item.defaultLabel
          return (
            <Button
              key={item.id}
              variant="ghost"
              size="sm"
              className="omnimux-assets-cloud-chip"
              aria-pressed={filterType === item.id ? 'true' : 'false'}
              onClick={() => onTypeChange?.(item.id)}
            >
              {label}
              {typeof count === 'number' ? <span className="omnimux-assets-cloud-count">{count}</span> : null}
            </Button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * 单个生成物卡片组件
 * 采用原生自适应比例瀑布流布局，带有沉浸式悬浮遮罩和快速工具栏。
 */
export function GenerationCard({ artifact, t, onPreview, onCopied, isCopied }) {
  const sourceKey = resolveArtifactSource(artifact)
  const sourceLabel = getSourceBadgeText(sourceKey, t)
  const preview = artifactPreviewUrl(artifact.id)
  const isVideo = artifact.type === 'video'
  const isAudio = artifact.type === 'audio'

  const handleCopy = (e) => {
    e.stopPropagation()
    const cite = `@产物/${artifact.title || artifact.id}`
    try {
      navigator.clipboard.writeText(cite)
      onCopied?.(artifact.id)
    } catch {
      // ignore
    }
  }

  const handleAddToChat = (e) => {
    e.stopPropagation()
    addMediaToConversation({
      id: artifact.id,
      title: artifact.title,
      type: artifact.type,
      mime: artifact.mime,
      previewUrl: preview,
      mediaUrl: preview,
    })
  }

  const handleCardClick = () => {
    if (typeof onPreview === 'function') {
      onPreview({
        id: artifact.id,
        title: artifact.title,
        type: artifact.type,
        mime: artifact.mime,
        previewUrl: preview,
        mediaUrl: preview,
        size: artifact.size,
        source: artifact.source,
      })
    }
  }

  return (
    <div
      className="omnimux-assets-card omnimux-generation-card omnimux-assets-focusable"
      role="button"
      tabIndex={0}
      aria-label={artifact.title}
      onClick={handleCardClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleCardClick()
        }
      }}
    >
      <div className="omnimux-generation-card-thumb">
        {isVideo ? (
          <div className="omnimux-generation-video-placeholder">
            <video
              src={preview}
              muted
              playsInline
              preload="metadata"
              className="omnimux-generation-video-preview"
            />
            <div className="omnimux-generation-play-badge">
              <PlayIcon />
            </div>
          </div>
        ) : isAudio ? (
          <div className="omnimux-generation-audio-placeholder">
            <AudioIcon size={24} />
            <span>{artifact.title || '音频素材'}</span>
          </div>
        ) : (
          <img
            src={preview}
            alt={artifact.title}
            loading="lazy"
            className="omnimux-generation-image-thumb"
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
          />
        )}
        <span className={`omnimux-generation-badge omnimux-generation-badge-${sourceKey}`}>
          {sourceLabel}
        </span>
      </div>

      <div className="omnimux-generation-card-meta">
        <h4 className="omnimux-generation-card-title" title={artifact.title}>
          {artifact.title || '未命名生成物'}
        </h4>
        <div className="omnimux-generation-card-footer">
          <span className="omnimux-generation-time">
            {formatRelative(artifact.created_at)}
          </span>
          <div className="omnimux-generation-actions" onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="sm"
              className="omnimux-generation-action-btn"
              title={isCopied ? t('generations.copied') : t('generations.copyCite')}
              onClick={handleCopy}
            >
              {isCopied ? <CheckIcon /> : <CopyIcon />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="omnimux-generation-action-btn"
              title={t('generations.addToChat') || '加入对话'}
              onClick={handleAddToChat}
            >
              <ChatIcon />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * 生成物标签页主视图组件
 *
 * @param {{
 *   t: (key: string) => string,
 *   open?: boolean,
 *   query?: string,
 *   filterSource?: string,
 *   filterType?: string,
 *   onPreview?: (item: object) => void,
 *   onCountsChange?: (counts: object) => void,
 * }} props
 */
export function GenerationsView(props) {
  const {
    t,
    open = true,
    query = '',
    filterSource = 'all',
    filterType = 'all',
    onPreview,
    onCountsChange,
  } = props

  const [artifacts, setArtifacts] = useState([])
  const [loading, setLoading] = useState(false)
  const [copiedId, setCopiedId] = useState(null)

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const res = await listArtifacts()
      if (res?.ok && Array.isArray(res?.body?.artifacts)) {
        setArtifacts(res.body.artifacts)
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) {
      loadData()
    }
  }, [open, loadData])

  // 统计每个来源与格式的数据量
  useEffect(() => {
    const sources = { all: artifacts.length, agent: 0, image: 0, canvas: 0 }
    const types = { all: artifacts.length, image: 0, video: 0, audio: 0 }

    for (const art of artifacts) {
      const s = resolveArtifactSource(art)
      if (sources[s] !== undefined) sources[s] += 1

      const typ = art.type
      if (types[typ] !== undefined) types[typ] += 1
    }

    onCountsChange?.({ sources, types })
  }, [artifacts, onCountsChange])

  // 综合过滤（来源 + 格式 + 搜索词）
  const visibleArtifacts = useMemo(() => {
    const q = query.trim().toLowerCase()
    return artifacts.filter((art) => {
      // 来源过滤
      if (filterSource !== 'all') {
        const s = resolveArtifactSource(art)
        if (s !== filterSource) return false
      }
      // 格式过滤
      if (filterType !== 'all') {
        if (art.type !== filterType) return false
      }
      // 关键词过滤
      if (q !== '') {
        const title = String(art.title || '').toLowerCase()
        const agent = String(art.source?.agent || '').toLowerCase()
        const model = String(art.source?.model || '').toLowerCase()
        if (!title.includes(q) && !agent.includes(q) && !model.includes(q)) {
          return false
        }
      }
      return true
    })
  }, [artifacts, filterSource, filterType, query])

  const handleCopied = (id) => {
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  if (artifacts.length === 0 && !loading) {
    return (
      <div className="omnimux-assets-empty-wrap">
        <EmptyState
          title={t('generations.empty.title') || '暂无生成的素材'}
          description={t('generations.empty.desc') || '来自智能体助手、独立生图与创作画布的生成物将自动收敛到这里。'}
        />
      </div>
    )
  }

  if (visibleArtifacts.length === 0 && !loading) {
    return (
      <div className="omnimux-assets-empty-wrap">
        <EmptyState
          title={t('generations.empty.search') || '未找到匹配的生成素材'}
          description={t('generations.empty.searchDesc') || '换个提示词或关键词试试。'}
        />
      </div>
    )
  }

  return (
    <div className="omnimux-generations-container">
      <div className="omnimux-assets-grid omnimux-generations-grid">
        {visibleArtifacts.map((artifact) => (
          <GenerationCard
            key={artifact.id}
            artifact={artifact}
            t={t}
            onPreview={onPreview}
            onCopied={handleCopied}
            isCopied={copiedId === artifact.id}
          />
        ))}
      </div>
    </div>
  )
}
