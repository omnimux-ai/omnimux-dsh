/**
 * 非 React 入口（侧栏 button click / 折叠加号 click 原按钮）挂 overlay。
 * 不用 react-dom：apply() 测试与侧栏加载路径不能多一个 ModuleLoader 依赖。
 * 视觉对齐 NewLocalProjectDialog（--dsw-alias-*）。
 *
 * 提交后 overlay 保持到 create 结束：失败把错误画在弹窗里，成功才关。
 */
import { pickProjectDirectory } from '../api.js'
import { injectWorkflowStyles } from '../styles.js'
import { MAX_PROJECT_TITLE_LENGTH } from './limits.js'
import { extractFolderName, firstPickedDirectory } from './pickDirectory.js'

function css(el, styles) {
  Object.assign(el.style, styles)
}

function formatCreateError(error, t) {
  const code = String(error || '')
  if (code === 'no-workspace') return t('projects.noWorkspace')
  if (code === 'title-required' || code === 'title-invalid' || code === 'title-too-long') {
    return t('projects.genericError')
  }
  if (code === 'project-exists') return t('projects.existingConfirm')
  return t('projects.createFailed').replace('{error}', code)
}

const folderNameOf = extractFolderName

const FOLDER_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2h8.5A1.5 1.5 0 0 1 21 9.5v7A1.5 1.5 0 0 1 19.5 18h-15A1.5 1.5 0 0 1 3 16.5v-9Z"/></svg>'
const FOLDER_PLUS_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2h8.5A1.5 1.5 0 0 1 21 9.5v7A1.5 1.5 0 0 1 19.5 18h-15A1.5 1.5 0 0 1 3 16.5v-9Z"/><path d="M12 11v5M9.5 13.5H14.5"/></svg>'
const CLOSE_SVG = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>'

/**
 * @param {(key: string) => string} t
 * @param {{
 *   submit?: (title: string, extra?: { projectRoot?: string }) => Promise<{ ok: boolean, error?: string }>,
 *   pickDirectory?: () => Promise<unknown>,
 *   browseDirectory?: (path?: string) => Promise<unknown>,
 * }} [opts]
 * @returns {Promise<string | null>}
 */
export function promptNewProjectName(t, opts = {}) {
  injectWorkflowStyles()
  return new Promise((resolve) => {
    const overlay = document.createElement('div')
    overlay.dataset.omnimuxNewLocalProject = ''
    overlay.setAttribute('role', 'presentation')
    css(overlay, {
      position: 'fixed',
      inset: '0',
      zIndex: '320',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--dsw-alias-bg-mask-1)',
    })

    const sheet = document.createElement('div')
    sheet.setAttribute('role', 'dialog')
    sheet.setAttribute('aria-modal', 'true')
    sheet.setAttribute('aria-labelledby', 'omnimux-new-local-project-title')
    css(sheet, {
      width: '480px',
      maxWidth: 'calc(100vw - 48px)',
      overflow: 'auto',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--dsw-alias-bg-elevated, var(--dsw-alias-bg-base))',
      color: 'var(--dsw-alias-label-primary)',
      borderRadius: '16px',
      border: '1px solid var(--dsw-alias-border-l2)',
    })

    const header = document.createElement('div')
    css(header, { display: 'flex', alignItems: 'center', gap: '8px', padding: '16px 20px 8px' })
    const titleEl = document.createElement('h2')
    titleEl.id = 'omnimux-new-local-project-title'
    titleEl.textContent = t('projects.dialog.title')
    css(titleEl, { margin: '0', flex: '1', fontSize: '18px', fontWeight: '600', lineHeight: '28px' })
    const closeBtn = document.createElement('button') // exempt-ui01: 非 React overlay 无 dsh-ui-kit 运行时
    closeBtn.type = 'button'
    closeBtn.setAttribute('aria-label', t('projects.close'))
    closeBtn.innerHTML = CLOSE_SVG
    css(closeBtn, {
      border: 'none', background: 'transparent', cursor: 'pointer',
      width: '28px', height: '28px', borderRadius: '8px', color: 'inherit',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    })
    header.append(titleEl, closeBtn)

    const body = document.createElement('div')
    css(body, { padding: '8px 20px 8px', display: 'flex', flexDirection: 'column', gap: '16px' })

    const nameRow = document.createElement('div')
    nameRow.className = 'omnimux-new-project-name'
    const prefix = document.createElement('span')
    prefix.className = 'omnimux-new-project-name-prefix'
    prefix.innerHTML = FOLDER_SVG
    const input = document.createElement('input')
    input.id = 'omnimux-new-local-project-name'
    input.className = 'omnimux-new-project-name-input'
    input.maxLength = MAX_PROJECT_TITLE_LENGTH
    input.placeholder = t('projects.dialog.namePlaceholder')
    input.setAttribute('aria-label', t('projects.dialog.nameLabel'))
    css(input, {
      flex: '1',
      minWidth: '0',
      height: '40px',
      border: 'none',
      outline: 'none',
      background: 'transparent',
      color: 'inherit',
      fontSize: '14px',
      padding: '0 12px',
      fontFamily: 'inherit',
    })
    nameRow.append(prefix, input)

    const sourceHead = document.createElement('div')
    sourceHead.className = 'omnimux-new-project-source-head'
    const sourceLabel = document.createElement('span')
    sourceLabel.className = 'omnimux-new-project-source-label'
    sourceLabel.textContent = t('projects.dialog.pathLabel')
    sourceHead.append(sourceLabel)

    const drop = document.createElement('button') // exempt-ui01: 非 React overlay 无 dsh-ui-kit 运行时
    drop.type = 'button'
    drop.className = 'omnimux-new-project-drop'
    drop.dataset.omnimuxNewProjectDrop = ''
    drop.innerHTML = `${FOLDER_PLUS_SVG}<span>${t('projects.dialog.addFolder')}</span>`

    const picked = document.createElement('div')
    picked.className = 'omnimux-new-project-picked'
    picked.dataset.omnimuxNewProjectPicked = ''
    picked.style.display = 'none'
    const pickedIcon = document.createElement('span')
    pickedIcon.className = 'omnimux-new-project-picked-icon'
    pickedIcon.innerHTML = FOLDER_SVG
    const pickedName = document.createElement('span')
    pickedName.className = 'omnimux-new-project-picked-name'

    const pickedActions = document.createElement('div')
    pickedActions.className = 'omnimux-new-project-picked-actions'
    const changeBtn = document.createElement('button') // exempt-ui01: 非 React overlay 无 dsh-ui-kit 运行时
    changeBtn.type = 'button'
    changeBtn.className = 'omnimux-new-project-change-btn'
    changeBtn.dataset.omnimuxNewProjectChange = ''
    changeBtn.textContent = t('projects.dialog.change')
    css(changeBtn, {
      border: 'none', background: 'transparent', cursor: 'pointer',
      height: '24px', padding: '0 8px', borderRadius: '6px', color: 'inherit',
      fontSize: '12px',
    })

    const removeBtn = document.createElement('button') // exempt-ui01: 非 React overlay 无 dsh-ui-kit 运行时
    removeBtn.type = 'button'
    removeBtn.dataset.omnimuxNewProjectRemove = ''
    removeBtn.setAttribute('aria-label', t('projects.dialog.removeFolder'))
    removeBtn.innerHTML = CLOSE_SVG
    css(removeBtn, {
      border: 'none', background: 'transparent', cursor: 'pointer',
      width: '28px', height: '28px', borderRadius: '8px', color: 'inherit',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    })
    pickedActions.append(changeBtn, removeBtn)
    picked.append(pickedIcon, pickedName, pickedActions)

    const errorEl = document.createElement('p')
    css(errorEl, { margin: '0', fontSize: '12px', color: 'var(--dsw-alias-state-error-primary, var(--dsw-alias-label-error))', display: 'none' })
    body.append(nameRow, sourceHead, drop, picked, errorEl)

    const footer = document.createElement('div')
    css(footer, { display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: '12px 20px 18px' })
    const cancelBtn = document.createElement('button') // exempt-ui01: 非 React overlay 无 dsh-ui-kit 运行时
    cancelBtn.type = 'button'
    cancelBtn.textContent = t('projects.dialog.cancel')
    css(cancelBtn, {
      border: '1px solid var(--dsw-alias-border-l2)',
      background: 'transparent',
      color: 'inherit',
      borderRadius: '8px',
      padding: '0 16px',
      height: '32px',
      fontSize: '13px',
      cursor: 'pointer',
    })
    const submitBtn = document.createElement('button') // exempt-ui01: 非 React overlay 无 dsh-ui-kit 运行时
    submitBtn.type = 'button'
    submitBtn.textContent = t('projects.dialog.submit')
    submitBtn.disabled = true

    let busy = false
    let picking = false
    let folderPath = ''
    let nameTouched = false

    const paintFolder = () => {
      const has = folderPath.trim() !== ''
      drop.style.display = has ? 'none' : 'flex'
      picked.style.display = has ? 'flex' : 'none'
      if (has) {
        pickedName.textContent = folderNameOf(folderPath) || folderPath
        pickedName.title = folderPath
      }
    }

    const paintSubmit = () => {
      const ok = !busy && !picking && input.value.trim() !== '' && input.value.trim().length <= MAX_PROJECT_TITLE_LENGTH
      submitBtn.disabled = !ok
      css(submitBtn, {
        border: 'none',
        background: ok ? 'var(--dsw-alias-button-primary-fill)' : 'var(--dsw-alias-border-l2)',
        color: 'var(--dsw-alias-label-primary-foreground)',
        borderRadius: '8px',
        padding: '0 16px',
        height: '32px',
        fontSize: '13px',
        fontWeight: '500',
        cursor: ok ? 'pointer' : 'default',
        opacity: busy ? '0.7' : '1',
      })
      input.disabled = busy
      cancelBtn.disabled = busy
      drop.disabled = busy || picking
      changeBtn.disabled = busy || picking
      removeBtn.disabled = busy
      css(cancelBtn, { cursor: busy ? 'default' : 'pointer' })
    }
    paintSubmit()
    paintFolder()
    footer.append(cancelBtn, submitBtn)

    sheet.append(header, body, footer)
    overlay.append(sheet)

    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      overlay.remove()
      resolve(value)
    }

    const setError = (text) => {
      if (!text) {
        errorEl.textContent = ''
        errorEl.style.display = 'none'
        return
      }
      errorEl.textContent = text
      errorEl.style.display = 'block'
    }

    let confirmedExisting = false
    const runSubmit = async () => {
      const title = input.value.trim()
      if (busy || title === '' || title.length > MAX_PROJECT_TITLE_LENGTH) return
      const extra = {
        ...(folderPath.trim() !== '' ? { projectRoot: folderPath.trim() } : {}),
        ...(confirmedExisting ? { confirmedExisting: true } : {}),
      }
      if (typeof opts.submit !== 'function') {
        finish(title)
        return
      }
      busy = true
      setError('')
      paintSubmit()
      try {
        const result = await opts.submit(title, extra)
        if (result?.ok) {
          finish(title)
          return
        }
        if (result?.existing) {
          confirmedExisting = true
          setError(t('projects.existingConfirm'))
          return
        }
        confirmedExisting = false
        setError(formatCreateError(result?.error, t))
      } catch (error) {
        setError(formatCreateError(error instanceof Error ? error.message : String(error), t))
      } finally {
        busy = false
        paintSubmit()
      }
    }

    const runPick = async () => {
      if (busy || picking) return
      picking = true
      setError('')
      paintSubmit()
      try {
        const picker = typeof opts.pickDirectory === 'function'
          ? opts.pickDirectory
          : typeof opts.browseDirectory === 'function'
            ? opts.browseDirectory
            : pickProjectDirectory
        const result = await picker()
        const chosen = firstPickedDirectory(result)
        if (chosen) {
          folderPath = chosen
          if (!nameTouched && !input.value.trim()) {
            input.value = folderNameOf(chosen)
          }
          confirmedExisting = false
        }
      } catch {
        setError(t('projects.dialog.browseFailed'))
      } finally {
        picking = false
        paintFolder()
        paintSubmit()
      }
    }

    drop.addEventListener('click', () => { void runPick() })
    changeBtn.addEventListener('click', () => { void runPick() })
    removeBtn.addEventListener('click', () => {
      if (picking) return
      folderPath = ''
      confirmedExisting = false
      paintFolder()
      paintSubmit()
    })

    overlay.addEventListener('mousedown', (event) => {
      if (event.target === overlay && !busy) finish(null)
    })
    sheet.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !busy) {
        event.preventDefault()
        finish(null)
      }
      if (event.key === 'Enter' && !submitBtn.disabled) {
        event.preventDefault()
        void runSubmit()
      }
    })
    closeBtn.addEventListener('click', () => { if (!busy) finish(null) })
    cancelBtn.addEventListener('click', () => { if (!busy) finish(null) })
    submitBtn.addEventListener('click', () => { void runSubmit() })
    input.addEventListener('input', () => {
      nameTouched = input.value.trim() !== ''
      setError('')
      paintSubmit()
    })

    document.body.appendChild(overlay)
    input.focus()
  })
}
