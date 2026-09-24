import React, { useEffect, useRef, useState } from 'react'
import { browseProjectDirectory } from '../api.js'
import { MAX_PROJECT_TITLE_LENGTH } from './limits.js'
import { extractFolderName } from './pickDirectory.js'

function CloseGlyph({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 4L4 12M4 4l8 8" />
    </svg>
  )
}

function FolderGlyph({ size = 16 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2h8.5A1.5 1.5 0 0 1 21 9.5v7A1.5 1.5 0 0 1 19.5 18h-15A1.5 1.5 0 0 1 3 16.5v-9Z" />
    </svg>
  )
}

function FolderPlusGlyph({ size = 14 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2h8.5A1.5 1.5 0 0 1 21 9.5v7A1.5 1.5 0 0 1 19.5 18h-15A1.5 1.5 0 0 1 3 16.5v-9Z" />
      <path d="M12 11v5M9.5 13.5H14.5" />
    </svg>
  )
}

function ComputerGlyph({ size = 14 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="12" rx="2" />
      <path d="M8 19h8" />
    </svg>
  )
}

function ChevronGlyph({ size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ChevronLeftGlyph({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/**
 * 「编辑应用创建副本」轻量弹窗。
 * 遵循极简本地化设计规范，官方模板只读不可变，引导用户生成副本以供自由编辑。
 * 完全自包含，不引入外部组件库，避免打包及 Node 测试扩展名冲突。
 *
 * @param {{
 *   manifest: object,
 *   hostProject?: object | null,
 *   initialPath?: string,
 *   busy?: boolean,
 *   error?: string,
 *   t?: (key: string) => string,
 *   onCancel: () => void,
 *   onSubmit: (payload: { mode: 'page' | 'project', title: string, projectRoot?: string }) => void | Promise<unknown>,
 *   onBrowseDirectory?: (path?: string) => Promise<unknown>,
 * }} props
 */
export function ForkAppProjectDialog({
  manifest,
  hostProject = null,
  initialPath = '',
  busy = false,
  error = '',
  t,
  onCancel,
  onSubmit,
  onBrowseDirectory,
}) {
  const appName = manifest?.metadata?.name || 'AI 应用'
  const hasHostProject = Boolean(hostProject?.id)

  // 模式：已有项目时默认在当前项目创建创作页 ('page')，否则新建独立项目 ('project')
  const [mode, setMode] = useState(hasHostProject ? 'page' : 'project')

  const defaultPageTitle = `${appName}_副本`
  const defaultProjectTitle = `${appName} (副本)`
  const [name, setName] = useState(hasHostProject ? defaultPageTitle : defaultProjectTitle)
  const [nameTouched, setNameTouched] = useState(false)

  const [path, setPath] = useState(initialPath || '')
  const [browsing, setBrowsing] = useState(false)
  const [browsePath, setBrowsePath] = useState('')
  const [browseParent, setBrowseParent] = useState(null)
  const [browseEntries, setBrowseEntries] = useState([])
  const [browseBusy, setBrowseBusy] = useState(false)
  const [browseError, setBrowseError] = useState('')

  const nameRef = useRef(null)

  useEffect(() => {
    nameRef.current?.focus()
  }, [])

  // 模式切换时，若用户未手动修改过名称，则自动切换默认名称
  const handleModeChange = (nextMode) => {
    if (nextMode === mode) return
    setMode(nextMode)
    setBrowseError('')
    if (!nameTouched) {
      setName(nextMode === 'page' ? defaultPageTitle : defaultProjectTitle)
    }
  }

  const trimmed = name.trim()
  const trimmedPath = path.trim()
  const canSubmit = trimmed !== '' && trimmed.length <= MAX_PROJECT_TITLE_LENGTH && !busy && !browsing

  const submit = () => {
    if (!canSubmit) return
    void Promise.resolve(onSubmit({
      mode,
      title: trimmed,
      ...(mode === 'project' && trimmedPath !== '' ? { projectRoot: trimmedPath } : {}),
    })).catch(() => {})
  }

  const applyPickedPath = (nextPath) => {
    const next = typeof nextPath === 'string' ? nextPath.trim() : ''
    if (next === '') return
    setPath(next)
    setBrowsing(false)
  }

  const loadBrowse = async (nextPath) => {
    setBrowseBusy(true)
    setBrowseError('')
    try {
      const loader = typeof onBrowseDirectory === 'function' ? onBrowseDirectory : browseProjectDirectory
      const result = await loader(nextPath)
      const body = result && typeof result === 'object' && 'body' in result ? result.body : result
      if (!result || result.ok === false || !body || typeof body.path !== 'string') {
        setBrowseError('浏览目录失败，请重试')
        return
      }
      setBrowsePath(body.path)
      setBrowseParent(typeof body.parent === 'string' ? body.parent : null)
      setBrowseEntries(Array.isArray(body.entries) ? body.entries : [])
      setBrowsing(true)
    } catch {
      setBrowseError('浏览目录失败，请重试')
    } finally {
      setBrowseBusy(false)
    }
  }

  const openBrowse = () => {
    if (busy || browseBusy) return
    void loadBrowse(trimmedPath || '')
  }

  const folderName = extractFolderName(trimmedPath)

  const sourcePane = browsing ? (
    <div className="omnimux-new-project-browse" data-omnimux-new-project-browse="">
      <div className="omnimux-new-project-browse-bar">
        <button // exempt-ui01 ai-app-ui-spec
          type="button"
          className="omx-apptab-modal-close"
          disabled={browseBusy || !browseParent}
          aria-label="返回上一层"
          data-omnimux-new-project-up=""
          onClick={() => { if (browseParent) void loadBrowse(browseParent) }}
        >
          <ChevronLeftGlyph />
        </button>
        <span className="omnimux-new-project-browse-path" title={browsePath}>{browsePath}</span>
        <button // exempt-ui01 ai-app-ui-spec
          type="button"
          className="omx-apptab-modal-close"
          disabled={browseBusy}
          aria-label="关闭浏览"
          data-omnimux-new-project-browse-close=""
          onClick={() => { setBrowsing(false); setBrowseError('') }}
        >
          <CloseGlyph size={14} />
        </button>
      </div>
      <div className="omnimux-new-project-browse-list">
        {browseEntries.map((entry) => (
          <button // exempt-ui01 ai-app-ui-spec
            key={entry.path}
            type="button"
            className="omnimux-new-project-folder-row"
            data-omnimux-new-project-folder=""
            disabled={browseBusy}
            onClick={() => { void loadBrowse(entry.path) }}
          >
            <FolderGlyph size={14} />
            <span>{entry.name}</span>
          </button>
        ))}
        {browseEntries.length === 0 && !browseBusy ? (
          <p className="omnimux-new-project-browse-empty">当前文件夹为空</p>
        ) : null}
      </div>
      <div className="omnimux-new-project-browse-actions">
        <button // exempt-ui01 ai-app-ui-spec
          type="button"
          className="omx-apptab-btn-ghost"
          disabled={browseBusy}
          onClick={() => { setBrowsing(false); setBrowseError('') }}
        >
          取消
        </button>
        <button // exempt-ui01 ai-app-ui-spec
          type="button"
          className="omx-apptab-btn-primary"
          disabled={browseBusy || !browsePath}
          data-omnimux-new-project-choose=""
          onClick={() => { applyPickedPath(browsePath) }}
        >
          选择此文件夹
        </button>
      </div>
    </div>
  ) : trimmedPath ? (
    <div className="omnimux-new-project-picked" data-omnimux-new-project-picked="">
      <span className="omnimux-new-project-picked-icon" aria-hidden="true">
        <FolderGlyph />
      </span>
      <span className="omnimux-new-project-picked-name" title={trimmedPath}>{folderName || trimmedPath}</span>
      <button // exempt-ui01 ai-app-ui-spec
        type="button"
        className="omx-apptab-modal-close"
        disabled={busy}
        aria-label="移除文件夹"
        data-omnimux-new-project-remove=""
        onClick={() => setPath('')}
      >
        <CloseGlyph size={14} />
      </button>
    </div>
  ) : (
    <button // exempt-ui01 ai-app-ui-spec
      type="button"
      className="omnimux-new-project-drop"
      data-omnimux-new-project-drop=""
      disabled={busy || browseBusy}
      onClick={openBrowse}
    >
      <span className="omnimux-new-project-drop-title">
        选择存放的工作区文件夹
        <ChevronGlyph />
      </span>
      <span className="omnimux-new-project-add-pill">
        <FolderPlusGlyph />
        浏览
      </span>
    </button>
  )

  return (
    <div className="omx-apptab-modal-mask">
      <div className="omx-apptab-modal is-wide">
        <div className="omx-apptab-modal-header">
          <div className="omx-apptab-modal-title">创建应用编辑副本</div>
          <button // exempt-ui01 ai-app-ui-spec
            type="button"
            className="omx-apptab-modal-close"
            disabled={busy}
            aria-label="关闭"
            onClick={() => { if (!busy) onCancel() }}
          >
            <CloseGlyph size={14} />
          </button>
        </div>

        <div className="omx-apptab-modal-body">
          <div className="omx-fork-dialog-desc">
            官方预设应用为受保护模板。将为你生成独立副本，以便自由调整工作流并重新发布。
          </div>

          {/* 存放模式选择：仅在当前已有项目时提供选项 */}
          {hasHostProject && (
            <div className="omx-fork-mode-section">
              <div className="omx-fork-mode-label" id="omx-fork-mode-label">
                存放方式
              </div>
              <div className="omx-fork-mode-grid" role="radiogroup" aria-labelledby="omx-fork-mode-label">
                <div
                  role="radio"
                  aria-checked={mode === 'page'}
                  tabIndex={0}
                  className={`omx-fork-mode-card ${mode === 'page' ? 'is-active' : ''}`}
                  onClick={() => handleModeChange('page')}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleModeChange('page') }}
                >
                  <div className="omx-fork-mode-title">
                    加入当前项目
                  </div>
                  <div className="omx-fork-mode-sub">
                    作为新创作页追加（推荐）
                  </div>
                </div>

                <div
                  role="radio"
                  aria-checked={mode === 'project'}
                  tabIndex={0}
                  className={`omx-fork-mode-card ${mode === 'project' ? 'is-active' : ''}`}
                  onClick={() => handleModeChange('project')}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleModeChange('project') }}
                >
                  <div className="omx-fork-mode-title">
                    新建独立项目
                  </div>
                  <div className="omx-fork-mode-sub">
                    在工作区创建新工程包
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 副本名称输入 */}
          <div className="omnimux-new-project-name">
            <span className="omnimux-new-project-name-prefix" aria-hidden="true">
              <FolderGlyph />
            </span>
            <input
              ref={nameRef}
              id="omnimux-fork-app-name"
              className="omnimux-new-project-name-field"
              value={name}
              maxLength={MAX_PROJECT_TITLE_LENGTH}
              placeholder={mode === 'page' ? '输入创作页名称' : '输入项目名称'}
              disabled={busy}
              aria-label={mode === 'page' ? '创作页名称' : '项目名称'}
              onChange={(event) => {
                setName(event.target.value)
                setNameTouched(true)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && canSubmit) {
                  event.preventDefault()
                  submit()
                }
              }}
            />
          </div>

          {/* 新建独立项目模式下选择工作区文件夹 */}
          {mode === 'project' && (
            <>
              <div className="omnimux-new-project-source-head omx-fork-source-head">
                <span className="omnimux-new-project-source-label">工作区位置</span>
                {trimmedPath && !browsing ? (
                  <span className="omnimux-new-project-device">
                    <ComputerGlyph />
                    本机电脑
                  </span>
                ) : null}
              </div>
              {sourcePane}
              {browseError && <p className="omnimux-new-project-error">{browseError}</p>}
            </>
          )}

          {error && (
            <p className="omnimux-new-project-error omx-fork-error-text">
              {error}
            </p>
          )}
        </div>

        <div className="omx-apptab-modal-footer">
          <button // exempt-ui01 ai-app-ui-spec
            type="button"
            className="omx-apptab-btn-ghost"
            disabled={busy}
            onClick={onCancel}
          >
            取消
          </button>
          <button // exempt-ui01 ai-app-ui-spec
            type="button"
            className="omx-apptab-btn-primary"
            disabled={!canSubmit || busy}
            onClick={submit}
          >
            {busy ? '正在处理...' : '确认并进入画布'}
          </button>
        </div>
      </div>
    </div>
  )
}
export default ForkAppProjectDialog
