import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Button } from 'dsh-ui-kit'
import { ChatIcon, CheckIcon, FileIcon, PlusIcon } from './icons.jsx'
import { addMediaToConversation } from './add-to-chat.js'
import { isOfficialVoicePreviewAsset, voicePreviewCandidateUrls } from './cloud-feed-helpers.js'

/**
 * Tab-internal zoomed modal preview for creative media items and files.
 * Aligns with the InspirationPreviewModal paradigm.
 *
 * The footer is where an item leaves the preview: into the conversation, or —
 * for a cloud row that can still be saved — into the local library. The save
 * half only renders when the caller can honour it, so a library item, which is
 * already local, never offers to become local twice.
 *
 * @param {{
 *   item: {
 *     id?: string,
 *     title?: string,
 *     extension?: string,
 *     kind?: 'folder' | 'image' | 'video' | 'audio' | 'file',
 *     previewUrl?: string,
 *     text?: string,
 *     pathInfo?: string,
 *     sourceAssetId?: string,
 *     sourceAsset?: any,
 *     rawItem?: any,
 *   } | null,
 *   t: (key: string) => string,
 *   onClose: () => void,
 *   onAddToConversation?: (item: any) => void,
 *   saved?: boolean,
 *   saving?: boolean,
 *   onSaveToLocal?: (item: any) => void,
 * }} props
 */
export function AssetPreviewModal({ item, t, onClose, onAddToConversation, saved = false, saving = false, onSaveToLocal }) {
  const [added, setAdded] = useState(false)
  const [broken, setBroken] = useState(false)
  const timerRef = useRef(null)
  const videoRef = useRef(null)
  /**
   * Issue #3058（OCR closure F1/F2）：官方试听详情共享 DTO 候选回退。
   * mediaRequestRef：换 item / 关闭后作废旧回调令牌，防旧 onerror/play 闭包
   * 影响新 item；armedCandidate：当前提交的候选（itemKey + 下标 + URL），
   * setState 驱动 <source> key 化替换；settledAttemptsRef：同候选 error
   * 只结算一次；playbackIntentRef：当前挂载元素经原生 play/pause/ended
   * 事件维护的播放意图（OCR last-rereview M4）；resumeRef：仅做跨 commit
   * 的意图交接——error 结算时从 playbackIntentRef 读入，commit 后的
   * useLayoutEffect 消费即复位。两者必须分离：layout effect 消费后复位
   * resumeRef，而活体意图继续由事件驱动，若共享同一 ref 会被复位覆盖。
   *
   * F2：令牌不在 render 期改——递增/结算集重置全部移入 commit 后执行的
   * useLayoutEffect；未提交的 render 触不到它们，可见 item 的回调不会
   * 被未提交渲染误作废。
   */
  const mediaRequestRef = useRef(0)
  const settledAttemptsRef = useRef(new Set())
  const playbackIntentRef = useRef(false)
  const resumeRef = useRef(false)

  /**
   * OCR round2 F2：清理绑定实际挂载的媒体实例，不按 itemKey effect 捕获。
   * 旧路径在「A 穷尽 broken → 切 B」时，itemKey effect 的 cleanup 在 B 的
   * audio 尚未挂载的提交里捕获 null，之后 reset 再挂载的实例永远没有
   * 登记清理。callback ref 在每次真实 attach/detach 时执行：detach（换
   * item、换候选 key、卸载、broken 撤掉）直接 pause + 归零刚卸下的旧
   * 实例；未提交的 render 不会触发 ref 回调，不触碰任何状态。
   * ref identity 稳定（useCallback 空依赖）→ 非 key 重渲染不会无意义 detach。
   *
   * OCR last-rereview M4：播放意图由当前挂载元素的原生事件维护，不能事后
   * 从 paused 采样——fatal decode/network error 时浏览器在派发 error 之前
   * 已把 paused 置 true，事后采样会把「正在播放」误记为「用户已暂停」。
   * 'play' 置意图 true；'pause'/'ended' 置 false——但元素已置 error 的
   * pause 是失败副作用而非用户动作，不算意图翻转。detach 先摘监听再
   * pause/归零：清理产生的 pause 事件不得污染意图。意图随每个新挂载
   * element 重新由事件建立，旧 item/attempt 的迟到事件已随监听摘除短路。
   */
  const handleMediaElement = useCallback((node) => {
    const previous = videoRef.current
    if (previous !== null && previous !== node) {
      const bound = previous.__playbackIntentHandlers
      if (bound) {
        previous.removeEventListener('play', bound.onPlay)
        previous.removeEventListener('pause', bound.onPause)
        previous.removeEventListener('ended', bound.onEnded)
        previous.__playbackIntentHandlers = null
      }
      try {
        previous.pause()
        previous.currentTime = 0
      } catch {
        // ignore media cleanup error
      }
    }
    videoRef.current = node
    if (node !== null) {
      // 新挂载元素起步即 paused：意图种子为 false，之后只由它自己的事件
      // 推进——旧 item/attempt 的意图不得漂进新 element（回退意图走
      // resumeRef 交接，不经这里，不会被种子覆盖）。
      playbackIntentRef.current = false
      const onPlay = () => { playbackIntentRef.current = true }
      const onPause = () => {
        // error 已置位的 pause 是失败副作用，不是用户暂停。
        if (node.error == null) playbackIntentRef.current = false
      }
      const onEnded = () => { playbackIntentRef.current = false }
      node.addEventListener('play', onPlay)
      node.addEventListener('pause', onPause)
      node.addEventListener('ended', onEnded)
      node.__playbackIntentHandlers = { onPlay, onPause, onEnded }
    }
  }, [])

  const itemKey = `${item?.id ?? ''}|${item?.previewUrl ?? ''}`
  const [armedCandidate, setArmedCandidate] = useState({ itemKey: '', index: 0 })
  const armedIndex = armedCandidate.itemKey === itemKey ? armedCandidate.index : 0

  /**
   * 音频播放地址序列：官方试听走 DTO 候选序（primary 置顶、不重发同 URL），
   * 再以 previewUrl 兜底去重；普通音频无 DTO，退化为单一 previewUrl——
   * 旧语义不变。前端不拼 URL，顺序由 hub DTO 唯一决定。
   */
  const audioCandidates = useMemo(() => {
    const previewDto = item?.preview ?? item?.sourceAsset?.preview
    const urls = isOfficialVoicePreviewAsset({ preview: previewDto })
      ? voicePreviewCandidateUrls({ preview: previewDto })
      : []
    const seen = new Set(urls)
    const previewUrl = typeof item?.previewUrl === 'string' ? item.previewUrl : ''
    if (previewUrl !== '' && !seen.has(previewUrl)) urls.push(previewUrl)
    return urls
  }, [item])

  useEffect(() => {
    setBroken(false)
  }, [item?.id, item?.previewUrl])

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose?.()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      // 媒体实例的停止已由 handleMediaElement 的 detach 路径负责（卸载同样
      // 触发 ref(null)）；这里只兜底 ref 还指向有效实例的边角场景。
      if (videoRef.current) {
        try {
          videoRef.current.pause()
        } catch {
          // ignore video pause error
        }
      }
    }
  }, [])

  /**
   * OCR closure F1/F2：itemKey/候选提交后的同步（commit 后执行，render 期
   * 零 ref 变更）。
   * - 令牌递增与 settled 集重置只发生在 commit 之后：上一 item/上一候选的
   *   play().catch 与 source error 闭包携带旧令牌被短路；未提交的 render
   *   触不到令牌，不会误作废可见 item 的回调；
   * - 回退（armedIndex > 0）后 <audio>/<source> 均按候选 key 重建，新元素
   *   自动开始加载；这里显式 load() 兜底不自动重扫的实现；回退前仍在播放的
   *   按 resumeRef 延续手势播放，play() 拒绝仅 NotAllowedError 静默
   *   （自动播放被拦 ≠ 文件失败）。
   */
  useLayoutEffect(() => {
    mediaRequestRef.current += 1
    settledAttemptsRef.current = new Set()
    if (armedIndex > 0) {
      const media = videoRef.current
      if (media) {
        media.load()
        if (resumeRef.current) {
          const attemptToken = mediaRequestRef.current
          void media.play().catch((error) => {
            if (mediaRequestRef.current !== attemptToken) return
            if (error?.name === 'NotAllowedError') return
            // 延续播放的其他拒绝同样不出文件失败文案：后续 source error 仍走回退管线
          })
        }
      }
    }
    resumeRef.current = false
  }, [itemKey, armedIndex])

  if (!item) return null

  // Issue #3058：官方音色详情 preview-only——整簇动作（加入对话 / 保存到本地）
  // 不渲染也不调用；用途只读 DTO，不凭名称或 id 判定。
  const isOfficialVoicePreview = isOfficialVoicePreviewAsset({
    preview: item.preview ?? item.sourceAsset?.preview,
  })

  const handleAdd = (event) => {
    event?.stopPropagation()
    // 防御性早退：preview-only 用途不进入会话投递。
    if (isOfficialVoicePreview) return
    if (added) return
    if (typeof onAddToConversation === 'function') {
      onAddToConversation(item)
    } else {
      addMediaToConversation(item)
    }
    setAdded(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      setAdded(false)
    }, 1800)
  }

  const isImage = item.kind === 'image' && Boolean(item.previewUrl) && !broken
  const isVideo = item.kind === 'video' && Boolean(item.previewUrl) && !broken
  const isAudio = item.kind === 'audio' && Boolean(item.previewUrl) && !broken
  const text = typeof item.text === 'string' ? item.text : ''
  // Issue #3058（PM copy fix + OCR closure F5）：官方音色 preview 失败
  // （audio onError broken，或未验证空描述）走核定失败文案，绝不落
  // modal.unsupportedMedia 格式错误空态。broken 时即使 description 非空也
  // 显示核定文案——失败态不能被描述文本吞掉。
  const officialPreviewFailed = isOfficialVoicePreview && !isImage && !isVideo && !isAudio && (broken || text === '')

  /**
   * 官方试听：候选失败推进下一 URL。OCR round2 F1——decode 失败与播放期
   * 网络失败发生在 <audio> 元素而非 <source>，因此 source 级与元素级
   * onError 共走此同一结算：<audio>/<source> 均按 `itemKey:候选下标`
   * key 化为独立节点，旧 item/旧候选已卸载元素的迟到 error 到不了这里；
   * 同一候选的两路 error 任意到达顺序由 settled 集去重，只推进一次。
   * 回退经 setArmedCandidate 提交，load()/延续播放在 commit 后的
   * useLayoutEffect 完成（见上）。
   */
  const handleAudioSourceError = (failedIndex) => {
    if (!isAudio) return
    if (settledAttemptsRef.current.has(failedIndex)) return
    if (failedIndex !== armedIndex) return
    settledAttemptsRef.current.add(failedIndex)
    if (isOfficialVoicePreview) {
      const nextIndex = failedIndex + 1
      if (nextIndex < audioCandidates.length) {
        // M4：回退携带事件维护的播放意图（见 handleMediaElement），不在这里
        // 读 media.paused——error 派发前浏览器可能已置 paused=true，事后采样
        // 会把「正在播放」误记为「用户已暂停」而静默停播。意图抄进 resumeRef
        // 交接给 commit 后的 layout effect；用户主动 pause 后回退不起播。
        resumeRef.current = playbackIntentRef.current
        setArmedCandidate({ itemKey, index: nextIndex })
        return
      }
    }
    // 普通音频或无候选可退：维持旧 broken 语义。
    setBroken(true)
  }

  const handleSave = (event) => {
    event?.stopPropagation()
    if (isOfficialVoicePreview) return
    if (saved || saving) return
    onSaveToLocal?.(item)
  }

  return (
    <div
      className="omnimux-assets-modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={item.title || 'Preview'}
    >
      <div
        className="omnimux-assets-modal-wrapper"
        onClick={(event) => event.stopPropagation()}
      >
        <button // exempt-ui01: modal close icon button
          type="button"
          className="omnimux-modal-close-btn is-external omnimux-assets-modal-close-external"
          aria-label={t('modal.close') || t('stage.close') || '关闭预览'}
          title={t('modal.close') || t('stage.close') || '关闭预览'}
          onClick={(e) => {
            e.stopPropagation()
            onClose?.()
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div
          className="omnimux-assets-modal-container"
        >
          <header className="omnimux-assets-modal-header">
            <div className="omnimux-assets-modal-header-left">
              <h3 className="omnimux-assets-modal-title" title={item.title}>
                {item.title}
              </h3>
              {item.extension ? (
                <span className="omnimux-assets-modal-badge">
                  {String(item.extension).toUpperCase()}
                </span>
              ) : null}
            </div>
          </header>

        <main className="omnimux-assets-modal-body">
          {isImage ? (
            <div className="omnimux-assets-modal-media-wrap">
              <img
                src={item.previewUrl}
                alt={item.title || ''}
                className="omnimux-assets-modal-image"
                onError={() => setBroken(true)}
              />
            </div>
          ) : isVideo ? (
            <div className="omnimux-assets-modal-media-wrap">
              <video
                ref={handleMediaElement}
                src={item.previewUrl}
                controls
                playsInline
                autoPlay={false}
                preload="metadata"
                className="omnimux-assets-modal-video"
                onError={() => setBroken(true)}
              />
            </div>
          ) : isAudio ? (
            <div className="omnimux-assets-modal-media-wrap">
              <audio
                key={`${itemKey}:${armedIndex}`}
                ref={handleMediaElement}
                controls
                autoPlay={false}
                preload="metadata"
                className="omnimux-assets-modal-audio"
                onError={() => handleAudioSourceError(armedIndex)}
              >
                <source
                  key={`${itemKey}:${armedIndex}`}
                  src={audioCandidates[armedIndex] ?? item.previewUrl}
                  onError={() => handleAudioSourceError(armedIndex)}
                />
              </audio>
            </div>
          ) : officialPreviewFailed ? (
            // Official voice preview: verified audio onError or an unverified
            // row with an empty description shows the approved failure copy,
            // never the format-unsupported placeholder (Issue #3058). 该分支
            // 须在 text 分支之前：预览全候选失败时描述文本不得吞掉核定文案。
            <div className="omnimux-assets-modal-text-wrap">
              <p className="omnimux-assets-modal-text">{t('cloud.preview.failed')}</p>
            </div>
          ) : text !== '' ? (
            // A text row has nothing to stream, so its whole body is the preview.
            <div className="omnimux-assets-modal-text-wrap">
              <p className="omnimux-assets-modal-text">{text}</p>
            </div>
          ) : (
            <div className="omnimux-assets-modal-unsupported">
              <div className="omnimux-assets-modal-unsupported-icon">
                <FileIcon size={48} />
              </div>
              <p className="omnimux-assets-modal-unsupported-text">
                {t('modal.unsupportedMedia')}
              </p>
              <div className="omnimux-assets-modal-unsupported-filename">
                {item.title}
              </div>
            </div>
          )}
        </main>

        {isOfficialVoicePreview ? null : (
        <footer className="omnimux-assets-modal-footer">
          <div className="omnimux-assets-modal-path" title={item.pathInfo || ''}>
            {item.pathInfo ? (
              <>
                <span className="omnimux-assets-modal-path-label">{t('modal.path') || '路径'}:</span>
                <span className="omnimux-assets-modal-path-text">{item.pathInfo}</span>
              </>
            ) : <span />}
          </div>
          <div className="omnimux-assets-modal-actions">
            <Button
              variant="primary"
              size="sm"
              leadingIcon={<ChatIcon size={14} />}
              disabled={added}
              onClick={handleAdd}
            >
              {added ? t('modal.addedToConversation') : t('modal.addToConversation')}
            </Button>
            {typeof onSaveToLocal === 'function' ? (
              <Button
                variant="outline"
                size="sm"
                className="omnimux-assets-modal-save"
                leadingIcon={saved ? <CheckIcon size={14} /> : <PlusIcon size={14} />}
                aria-pressed={saved ? 'true' : 'false'}
                disabled={saved || saving}
                onClick={handleSave}
              >
                {saved ? t('modal.savedToLocal') : t('modal.saveToLocal')}
              </Button>
            ) : null}
          </div>
        </footer>
        )}
      </div>
      </div>
    </div>
  )
}
