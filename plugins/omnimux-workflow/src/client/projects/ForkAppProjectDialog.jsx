import React, { useEffect, useRef, useState } from 'react'
import { pickProjectDirectory } from '../api.js'
import { MAX_PROJECT_TITLE_LENGTH } from './limits.js'
import { extractFolderName, firstPickedDirectory } from './pickDirectory.js'

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

/**
 * 「创建应用副本」轻量极简弹窗。
 * 遵循现代 SaaS 极简规范，纯粹实体表述与动词律，系统原生文件夹打开窗口。
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
 *   onPickDirectory?: () => Promise<unknown>,
 *   onBrowseDirectory?: (path?: string) => Promise<unknown>,
 * }} props
 */
export function ForkAppProjectDialog({
  manifest,
  hostProject = null,
  initialPath = '',
  busy = false,
  error = '',
  onCancel,
  onSubmit,
  onPickDirectory,
  onBrowseDirectory,
}) {
  const appName = manifest?.metadata?.name || 'AI 应用'
  const hasHostProject = Boolean(hostProject?.id)

  const [mode, setMode] = useState(hasHostProject ? 'page' : 'project')

  const defaultPageTitle = `${appName}_副本`
  const defaultProjectTitle = `${appName} (副本)`
  const [name, setName] = useState(hasHostProject ? defaultPageTitle : defaultProjectTitle)
  const [nameTouched, setNameTouched] = useState(false)

  const [path, setPath] = useState(initialPath || '')
  const [picking, setPicking] = useState(false)
  const [pickError, setPickError] = useState('')

  const nameRef = useRef(null)

  useEffect(() => {
    nameRef.current?.focus()
  }, [])

  const handleModeChange = (nextMode) => {
    if (nextMode === mode) return
    setMode(nextMode)
    setPickError('')
    if (!nameTouched) {
      setName(nextMode === 'page' ? defaultPageTitle : defaultProjectTitle)
    }
  }

  const trimmed = name.trim()
  const trimmedPath = path.trim()
  const canSubmit = trimmed !== '' && trimmed.length <= MAX_PROJECT_TITLE_LENGTH && !busy && !picking

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
    if (!nameTouched && mode === 'project') {
      const fromFolder = extractFolderName(next)
      if (fromFolder) setName(fromFolder)
    }
  }

  const handlePickDirectory = async () => {
    if (busy || picking) return
    setPicking(true)
    setPickError('')
    try {
      const picker = typeof onPickDirectory === 'function'
        ? onPickDirectory
        : typeof onBrowseDirectory === 'function'
          ? onBrowseDirectory
          : pickProjectDirectory
      const result = await picker()
      const chosen = firstPickedDirectory(result)
      if (chosen) {
        applyPickedPath(chosen)
      }
    } catch {
      setPickError('操作失败，请重试。')
    } finally {
      setPicking(false)
    }
  }

  const folderName = extractFolderName(trimmedPath)

  const sourcePane = trimmedPath ? (
    <div className="omnimux-new-project-picked" data-omnimux-new-project-picked="">
      <span className="omnimux-new-project-picked-icon" aria-hidden="true">
        <FolderGlyph />
      </span>
      <span className="omnimux-new-project-picked-name" title={trimmedPath}>
        {folderName || trimmedPath}
      </span>
      <div className="omnimux-new-project-picked-actions">
        <button // exempt-ui01 ai-app-ui-spec
          type="button"
          className="omnimux-new-project-change-btn"
          disabled={busy || picking}
          data-omnimux-new-project-change=""
          onClick={handlePickDirectory}
        >
          更改
        </button>
        <button // exempt-ui01 ai-app-ui-spec
          type="button"
          className="omx-apptab-modal-close"
          disabled={busy || picking}
          aria-label="移除文件夹"
          data-omnimux-new-project-remove=""
          onClick={() => setPath('')}
        >
          <CloseGlyph size={14} />
        </button>
      </div>
    </div>
  ) : (
    <button // exempt-ui01 ai-app-ui-spec
      type="button"
      className="omnimux-new-project-drop"
      data-omnimux-new-project-drop=""
      disabled={busy || picking}
      onClick={handlePickDirectory}
    >
      <FolderPlusGlyph />
      <span>选择文件夹</span>
    </button>
  )

  return (
    <div className="omx-apptab-modal-mask">
      <div className="omx-apptab-modal is-wide">
        <div className="omx-apptab-modal-header">
          <div className="omx-apptab-modal-title">创建副本</div>
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
          {/* 副本类型选择：仅在当前已有项目时提供选项 */}
          {hasHostProject && (
            <div className="omx-fork-mode-section">
              <div className="omx-fork-mode-label" id="omx-fork-mode-label">
                副本类型
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
                    当前项目创作页
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
                    独立项目
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 副本名称输入 */}
          <div className="omx-fork-input-group">
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
                placeholder="副本名称"
                disabled={busy}
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
          </div>

          {/* 独立项目模式下展示存放位置 */}
          {mode === 'project' && (
            <>
              <div className="omnimux-new-project-source-head omx-fork-source-head">
                <span className="omnimux-new-project-source-label">存放位置</span>
              </div>
              {sourcePane}
              {pickError && <p className="omnimux-new-project-error">{pickError}</p>}
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
            {busy ? '创建中...' : '创建副本'}
          </button>
        </div>
      </div>
    </div>
  )
}
export default ForkAppProjectDialog
