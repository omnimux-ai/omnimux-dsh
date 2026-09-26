import { useEffect, useRef, useState } from 'react'
import { useHostLocale } from './useHostLocale.js'
import OpenReelApp from './openreel/web/App.tsx'
import { useProjectStore } from './openreel/web/stores/project-store.ts'
import { useEngineStore } from './openreel/web/stores/engine-store.ts'
import { applyOpenReelTheme } from './openreel/web/stores/theme-store.ts'
import { resetOpenReelRouter } from './openreel/web/hooks/use-router.ts'
import { putClipProject } from './host/projectApi.js'
import './openreel/web/index.css'
import './theme/dsw-map.css'

const PRESET_OPTIONS = [
  { value: '1920x1080', directionKey: 'tab.landscape' },
  { value: '1080x1920', directionKey: 'tab.portrait' },
  { value: '1080x1080', directionKey: 'tab.square' },
  { value: '1280x720', directionKey: 'tab.landscape' },
]

const FPS_OPTIONS = [
  { value: '24', label: '24 fps' },
  { value: '25', label: '25 fps' },
  { value: '30', label: '30 fps' },
  { value: '60', label: '60 fps' },
]

function parsePreset(value) {
  const [width, height] = String(value || '1920x1080').split('x').map((n) => Number(n))
  return {
    width: Number.isFinite(width) ? width : 1920,
    height: Number.isFinite(height) ? height : 1080,
  }
}

function StudioCreateForm({ t, onCreated }) {
  const createNewProject = useProjectStore((state) => state.createNewProject)
  const [name, setName] = useState('')
  const [preset, setPreset] = useState('1920x1080')
  const [fps, setFps] = useState('30')

  const submit = () => {
    const { width, height } = parsePreset(preset)
    const frameRate = Number(fps) || 30
    const title = name.trim() || t('tab.untitled')
    createNewProject(title, { width, height, frameRate })
    resetOpenReelRouter({ route: 'editor', params: {} })
    onCreated?.()
  }

  const inputStyle = {
    width: '100%',
    height: 36,
    padding: '0 12px',
    borderRadius: 8,
    border: '1px solid var(--dsw-alias-border-subtle, rgba(255, 255, 255, 0.12))',
    backgroundColor: 'var(--dsw-alias-bg-control, rgba(255, 255, 255, 0.04))',
    color: 'var(--dsw-alias-label-primary, #ffffff)',
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box',
  }

  const btnSecondary = {
    padding: '8px 16px',
    borderRadius: 8,
    border: '1px solid var(--dsw-alias-border-subtle, rgba(255, 255, 255, 0.12))',
    backgroundColor: 'transparent',
    color: 'var(--dsw-alias-label-primary, #ffffff)',
    fontSize: 14,
    cursor: 'pointer',
  }

  const btnPrimary = {
    padding: '8px 16px',
    borderRadius: 8,
    border: 'none',
    backgroundColor: 'var(--dsw-alias-button-primary-fill, #ffffff)',
    color: 'var(--dsw-alias-label-primary-foreground, #111113)',
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
  }

  return (
    <div className="openreel-studio-fallback" style={{ padding: 24, gap: 16, display: 'flex', flexDirection: 'column', alignItems: 'stretch', maxWidth: 420, margin: '0 auto' }}>
      <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--dsw-alias-label-primary)' }}>
        {t('tab.createTitle')}
      </div>
      <div>
        <div style={{ marginBottom: 6, fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }}>
          {t('tab.nameLabel')}
        </div>
        <input
          id="omnimux-clip-project-name"
          style={inputStyle}
          value={name}
          placeholder={t('tab.namePlaceholder')}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              submit()
            }
          }}
        />
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ marginBottom: 6, fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }}>
            {t('tab.sizeLabel')}
          </div>
          <select
            id="omnimux-clip-preset"
            style={inputStyle}
            value={preset}
            onChange={(event) => setPreset(event.target.value)}
          >
            {PRESET_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {t(opt.directionKey)} {opt.value.replace('x', '×')}
              </option>
            ))}
          </select>
        </div>
        <div style={{ width: 120 }}>
          <div style={{ marginBottom: 6, fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }}>
            {t('tab.fpsLabel')}
          </div>
          <select
            id="omnimux-clip-fps"
            style={inputStyle}
            value={fps}
            onChange={(event) => setFps(event.target.value)}
          >
            {FPS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
        <button
          type="button"
          style={{ ...btnSecondary, flex: 1 }}
          onClick={() => {
            resetOpenReelRouter({ route: 'welcome', params: {} })
            onCreated?.()
          }}
        >
          {t('tab.openOfficial')}
        </button>
        <button
          type="button"
          style={{ ...btnPrimary, flex: 1 }}
          onClick={submit}
        >
          {t('tab.create')}
        </button>
      </div>
    </div>
  )
}

/**
 * OmniMux Clip Studio Tab component mounted in dsh-better-sidebar.
 * Wraps OpenReel with an OmniMux top action row (project name + save status + save button).
 * @param {{ t?: (key: string) => string, store?: { reduce?: Function, getSnapshot?: Function } }} props
 */
export function OpenReelStudioTab({ t: tProp, store, locale }) {
  useHostLocale(locale)
  const t = (key) => {
    if (typeof tProp === 'function') {
      try {
        const value = tProp(key)
        if (value && value !== key) return value
      } catch { /* fall through */ }
    }
    const fallback = {
      'tab.title': '视频剪辑',
      'tab.untitled': '未命名剪辑',
      'tab.createTitle': '新建剪辑项目',
      'tab.nameLabel': '项目名称',
      'tab.namePlaceholder': '我的短视频',
      'tab.sizeLabel': '分辨率',
      'tab.landscape': '横屏',
      'tab.portrait': '竖屏',
      'tab.square': '方形',
      'tab.fpsLabel': '帧率',
      'tab.create': '创建并进入编辑器',
      'tab.openOfficial': '进入官方欢迎页',
      'tab.save': '保存',
      'tab.saved': '已保存',
      'tab.saving': '保存中…',
      'tab.saveFailed': '保存失败',
    }
    return fallback[key] || key
  }

  const project = useProjectStore((state) => state.project)
  const hasOpenProject = useProjectStore((state) => state.hasOpenProject)
  const [forceWelcome, setForceWelcome] = useState(!hasOpenProject)
  const [saveStatus, setSaveStatus] = useState('')
  const saveTimer = useRef(null)

  useEffect(() => {
    applyOpenReelTheme(true)
    return () => {
      try {
        useEngineStore.getState().dispose?.()
      } catch { /* already torn down */ }
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [])

  useEffect(() => {
    const api = typeof window !== 'undefined' ? window.__omnimuxWorkbench : undefined
    if (!api || typeof api.attachStore !== 'function' || !store) return undefined
    api.attachStore(store)
    return () => { api.detachStore?.(store) }
  }, [store])

  useEffect(() => {
    if (!hasOpenProject || !project?.id) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      setSaveStatus('saving')
      putClipProject(project.id, { title: project.name, openreel: project })
        .then(() => setSaveStatus('saved'))
        .catch(() => setSaveStatus('saveFailed'))
    }, 1200)
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [hasOpenProject, project])

  useEffect(() => {
    let lastInsertTimestamp = 0
    let lastInsertKey = ''

    const broadcastStatus = (overrideStatus = null) => {
      let storeState = null
      try {
        if (typeof useProjectStore?.getState === 'function') {
          storeState = useProjectStore.getState()
        }
      } catch {}

      const fallbackProject = storeState?.project !== undefined ? storeState.project : project
      const fallbackHasOpen = storeState?.hasOpenProject !== undefined ? storeState.hasOpenProject : hasOpenProject

      const currentProject = overrideStatus?.project !== undefined ? overrideStatus.project : fallbackProject
      const currentHasOpen = overrideStatus?.hasOpenProject !== undefined ? overrideStatus.hasOpenProject : fallbackHasOpen

      const isEditorReady = Boolean(
        overrideStatus && typeof overrideStatus.isEditorReady === 'boolean'
          ? overrideStatus.isEditorReady
          : currentHasOpen && currentProject?.id
      )
      const detail = {
        isEditorReady,
        projectId: currentProject?.id || null,
        projectName: currentProject?.name || null,
      }
      try {
        if (typeof window !== 'undefined') {
          window.__omnimuxClipStatus = detail
          window.dispatchEvent(new CustomEvent('omnimux-clip:editor-status', { detail }))
        }
      } catch {}
    }

    broadcastStatus()

    const onRequestStatus = () => {
      broadcastStatus()
    }

    const onNewProject = (event) => {
      setForceWelcome(false)
      const createNewProject = typeof useProjectStore?.getState === 'function'
        ? useProjectStore.getState()?.createNewProject
        : null
      if (typeof createNewProject === 'function') {
        const title = event?.detail?.title || t('tab.untitled')
        createNewProject(title, { width: 1280, height: 720, frameRate: 30 })
        resetOpenReelRouter({ route: 'editor', params: {} })
      }
      broadcastStatus()
    }

    const onInsertClip = async (event) => {
      const detail = event?.detail || {}
      if (!detail.url && !detail.videoUrl) return

      const mediaUrl = detail.url || detail.videoUrl
      const dedupeKey = `${mediaUrl}_${detail.duration || detail.durationSec || ''}_${detail.title || ''}`
      const now = Date.now()
      if (now - lastInsertTimestamp < 350 && lastInsertKey === dedupeKey) {
        return
      }
      lastInsertTimestamp = now
      lastInsertKey = dedupeKey

      const store = typeof useProjectStore?.getState === 'function' ? useProjectStore.getState() : null
      let currProject = store?.project || project
      const currentHasOpen = store?.hasOpenProject !== undefined ? store.hasOpenProject : hasOpenProject

      if (!currentHasOpen || !currProject?.id) {
        if (typeof store?.createNewProject === 'function') {
          store.createNewProject(t('tab.untitled'), { width: 1280, height: 720, frameRate: 30 })
          resetOpenReelRouter({ route: 'editor', params: {} })
          currProject = typeof useProjectStore?.getState === 'function' ? useProjectStore.getState()?.project : currProject
        }
      }

      if (!currProject) return

      const durationSec = Number(detail.duration || detail.durationSec) || 10
      const mediaId = `media_gvids_${Date.now()}`
      const clipId = `clip_gvids_${Date.now()}`

      const mediaItem = {
        id: mediaId,
        name: detail.title || 'Google Vids 成片',
        type: 'video',
        url: mediaUrl,
        duration: durationSec,
        metadata: {
          width: detail.resolution === '1080p' ? 1920 : 1280,
          height: detail.resolution === '1080p' ? 1080 : 720,
          duration: durationSec,
        },
      }

      const updatedProject = structuredClone(currProject)
      if (!updatedProject.mediaLibrary) updatedProject.mediaLibrary = { items: [] }
      if (!Array.isArray(updatedProject.mediaLibrary.items)) updatedProject.mediaLibrary.items = []
      updatedProject.mediaLibrary.items.push(mediaItem)

      if (!updatedProject.timeline) updatedProject.timeline = { tracks: [] }
      if (!Array.isArray(updatedProject.timeline.tracks)) updatedProject.timeline.tracks = []

      let v1Track = updatedProject.timeline.tracks.find((t) => t.type === 'video')
      if (!v1Track) {
        v1Track = {
          id: `track_video_${Date.now()}`,
          name: 'V1',
          type: 'video',
          clips: [],
          visible: true,
          locked: false,
          muted: false,
        }
        updatedProject.timeline.tracks.unshift(v1Track)
      }

      let insertStartTime = 0
      if (Array.isArray(v1Track.clips) && v1Track.clips.length > 0) {
        for (const c of v1Track.clips) {
          const end = (Number(c.startTime) || 0) + (Number(c.duration) || 0)
          if (end > insertStartTime) insertStartTime = end
        }
      }

      const newClip = {
        id: clipId,
        trackId: v1Track.id,
        mediaId: mediaId,
        name: detail.title || 'Google Vids 成片',
        type: 'video',
        startTime: insertStartTime,
        duration: durationSec,
        inPoint: 0,
        outPoint: durationSec,
        volume: 1,
        playbackRate: 1,
        visible: true,
      }

      if (!Array.isArray(v1Track.clips)) {
        v1Track.clips = []
      }
      v1Track.clips.push(newClip)
      updatedProject.modifiedAt = Date.now()

      if (typeof useProjectStore?.setState === 'function') {
        useProjectStore.setState({ project: updatedProject, hasOpenProject: true })
      }

      try {
        useEngineStore.getState()?.seek?.(insertStartTime)
      } catch {}

      broadcastStatus()
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('omnimux-clip:request-status', onRequestStatus)
      window.addEventListener('omnimux-clip:new-project', onNewProject)
      window.addEventListener('omnimux-clip:insert', onInsertClip)
      window.addEventListener('omnimux:clip:insert-clip', onInsertClip)
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('omnimux-clip:request-status', onRequestStatus)
        window.removeEventListener('omnimux-clip:new-project', onNewProject)
        window.removeEventListener('omnimux-clip:insert', onInsertClip)
        window.removeEventListener('omnimux:clip:insert-clip', onInsertClip)
      }
    }
  }, [hasOpenProject, project, t])

  const showCreate = forceWelcome && !hasOpenProject

  return (
    <div className="openreel-studio-root dark" data-theme="dark">
      <div className="openreel-studio-hostbar">
        <div className="openreel-studio-hostbar-title">
          {project?.name || t('tab.title')}
        </div>
        <div className="openreel-studio-hostbar-status">{saveStatus ? t(`tab.${saveStatus}`) : ''}</div>
        <button
          type="button"
          disabled={!hasOpenProject}
          className="omnimux-clip-stage-save-btn"
          onClick={() => {
            if (!project?.id) return
            setSaveStatus('saving')
            putClipProject(project.id, { title: project.name, openreel: project })
              .then(() => setSaveStatus('saved'))
              .catch(() => setSaveStatus('saveFailed'))
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M12.667 14H3.333A1.333 1.333 0 0 1 2 12.667V3.333C2 2.597 2.597 2 3.333 2h7.334L14 5.333v7.334A1.333 1.333 0 0 1 12.667 14Z" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M11.333 14V9.333H4.667V14M4.667 2v3.333h5.333" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span>{t('tab.save')}</span>
        </button>
      </div>
      <div className="openreel-studio-body">
        {showCreate ? (
          <StudioCreateForm t={t} onCreated={() => setForceWelcome(false)} />
        ) : (
          <OpenReelApp />
        )}
      </div>
    </div>
  )
}

export default OpenReelStudioTab
