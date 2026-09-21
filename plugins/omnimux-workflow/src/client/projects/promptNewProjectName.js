/**
 * 非 React 入口（侧栏 button click / 折叠加号 click 原按钮）挂 overlay。
 * 不用 react-dom：apply() 测试与侧栏加载路径不能多一个 ModuleLoader 依赖。
 * 视觉对齐 NewLocalProjectDialog（--dsw-alias-*）。
 *
 * 提交后 overlay 保持到 create 结束：失败把错误画在弹窗里，成功才关。
 */
import { browseProjectDirectory } from '../api.js'
import { injectWorkflowStyles } from '../styles.js'
import { MAX_PROJECT_TITLE_LENGTH } from './limits.js'
import { extractFolderName } from './pickDirectory.js'

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
const COMPUTER_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 19h8"/></svg>'
const CHEVRON_SVG = '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
const CHEVRON_LEFT_SVG = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'

/**
 * @param {(key: string) => string} t
 * @param {{
 *   submit?: (title: string, extra?: { projectRoot?: string }) => Promise<{ ok: boolean, error?: string }>,
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
    const deviceChip = document.createElement('span')
    deviceChip.className = 'omnimux-new-project-device'
    deviceChip.innerHTML = `${COMPUTER_SVG}<span>${t('projects.dialog.thisComputer')}</span>`
    deviceChip.style.display = 'none'
    sourceHead.append(sourceLabel, deviceChip)

    const drop = document.createElement('button') // exempt-ui01: 非 React overlay 无 dsh-ui-kit 运行时
    drop.type = 'button'
    drop.className = 'omnimux-new-project-drop'
    drop.dataset.omnimuxNewProjectDrop = ''
    drop.innerHTML = `<span class="omnimux-new-project-drop-title">${t('projects.dialog.addFolder')}${CHEVRON_SVG}</span><span class="omnimux-new-project-add-pill">${FOLDER_PLUS_SVG}${t('projects.dialog.add')}</span>`

    const picked = document.createElement('div')
    picked.className = 'omnimux-new-project-picked'
    picked.dataset.omnimuxNewProjectPicked = ''
    picked.style.display = 'none'
    const pickedIcon = document.createElement('span')
    pickedIcon.className = 'omnimux-new-project-picked-icon'
    pickedIcon.innerHTML = FOLDER_SVG
    const pickedName = document.createElement('span')
    pickedName.className = 'omnimux-new-project-picked-name'
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
    picked.append(pickedIcon, pickedName, removeBtn)

    const browse = document.createElement('div')
    browse.className = 'omnimux-new-project-browse'
    browse.dataset.omnimuxNewProjectBrowse = ''
    browse.style.display = 'none'
    const browseBar = document.createElement('div')
    browseBar.className = 'omnimux-new-project-browse-bar'
    const upBtn = document.createElement('button') // exempt-ui01: 非 React overlay 无 dsh-ui-kit 运行时
    upBtn.type = 'button'
    upBtn.dataset.omnimuxNewProjectUp = ''
    upBtn.setAttribute('aria-label', t('projects.dialog.goUp'))
    upBtn.innerHTML = CHEVRON_LEFT_SVG
    css(upBtn, {
      border: 'none', background: 'transparent', cursor: 'pointer',
      width: '28px', height: '28px', borderRadius: '8px', color: 'inherit',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    })
    const browsePathEl = document.createElement('span')
    browsePathEl.className = 'omnimux-new-project-browse-path'
    const browseClose = document.createElement('button') // exempt-ui01: 非 React overlay 无 dsh-ui-kit 运行时
    browseClose.type = 'button'
    browseClose.dataset.omnimuxNewProjectBrowseClose = ''
    browseClose.setAttribute('aria-label', t('projects.dialog.closeBrowse'))
    browseClose.innerHTML = CLOSE_SVG
    css(browseClose, {
      border: 'none', background: 'transparent', cursor: 'pointer',
      width: '28px', height: '28px', borderRadius: '8px', color: 'inherit',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    })
    browseBar.append(upBtn, browsePathEl, browseClose)
    const browseList = document.createElement('div')
    browseList.className = 'omnimux-new-project-browse-list'
    const browseActions = document.createElement('div')
    browseActions.className = 'omnimux-new-project-browse-actions'
    const browseCancel = document.createElement('button') // exempt-ui01: 非 React overlay 无 dsh-ui-kit 运行时
    browseCancel.type = 'button'
    browseCancel.textContent = t('projects.dialog.cancel')
    css(browseCancel, {
      border: '1px solid var(--dsw-alias-border-l2)', background: 'transparent', color: 'inherit',
      borderRadius: '8px', padding: '0 16px', height: '32px', fontSize: '13px', cursor: 'pointer',
    })
    const chooseBtn = document.createElement('button') // exempt-ui01: 非 React overlay 无 dsh-ui-kit 运行时
    chooseBtn.type = 'button'
    chooseBtn.dataset.omnimuxNewProjectChoose = ''
    chooseBtn.textContent = t('projects.dialog.chooseHere')
    css(chooseBtn, {
      border: 'none', background: 'var(--dsw-alias-button-primary-fill)',
      color: 'var(--dsw-alias-label-primary-foreground)',
      borderRadius: '8px', padding: '0 16px', height: '32px', fontSize: '13px', cursor: 'pointer',
    })
    browseActions.append(browseCancel, chooseBtn)
    browse.append(browseBar, browseList, browseActions)

    const errorEl = document.createElement('p')
    css(errorEl, { margin: '0', fontSize: '12px', color: 'var(--dsw-alias-state-error-primary, var(--dsw-alias-label-error))', display: 'none' })
    body.append(nameRow, sourceHead, drop, picked, browse, errorEl)

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
    let browsing = false
    let folderPath = ''
    let nameTouched = false
    let browsePath = ''
    let browseParent = null

    const paintFolder = () => {
      const has = folderPath.trim() !== ''
      drop.style.display = browsing || has ? 'none' : 'flex'
      picked.style.display = !browsing && has ? 'flex' : 'none'
      browse.style.display = browsing ? 'flex' : 'none'
      deviceChip.style.display = !browsing && has ? 'inline-flex' : 'none'
      if (has) {
        pickedName.textContent = folderNameOf(folderPath) || folderPath
        pickedName.title = folderPath
      }
    }

    const paintSubmit = () => {
      const ok = !busy && !browsing && input.value.trim() !== '' && input.value.trim().length <= MAX_PROJECT_TITLE_LENGTH
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

    const applyBrowseBody = (body) => {
      if (!body || typeof body.path !== 'string') return false
      browsePath = body.path
      browseParent = typeof body.parent === 'string' ? body.parent : null
      browsePathEl.textContent = body.path
      browsePathEl.title = body.path
      upBtn.disabled = !browseParent
      browseList.replaceChildren()
      const entries = Array.isArray(body.entries) ? body.entries : []
      for (const entry of entries) {
        const row = document.createElement('button') // exempt-ui01: 非 React overlay 无 dsh-ui-kit 运行时
        row.type = 'button'
        row.className = 'omnimux-new-project-folder-row'
        row.dataset.omnimuxNewProjectFolder = ''
        const icon = document.createElement('span')
        icon.innerHTML = FOLDER_SVG
        const label = document.createElement('span')
        label.textContent = entry.name
        row.append(icon, label)
        row.addEventListener('click', () => { void loadBrowse(entry.path) })
        browseList.append(row)
      }
      if (entries.length === 0) {
        const empty = document.createElement('p')
        empty.className = 'omnimux-new-project-browse-empty'
        empty.textContent = t('projects.dialog.browseEmpty')
        browseList.append(empty)
      }
      browsing = true
      paintFolder()
      paintSubmit()
      return true
    }

    const loadBrowse = async (nextPath) => {
      if (busy || picking) return
      picking = true
      paintSubmit()
      try {
        const loader = typeof opts.browseDirectory === 'function' ? opts.browseDirectory : browseProjectDirectory
        const result = await loader(nextPath)
        const body = result && typeof result === 'object' && result.body ? result.body : result
        if (result && result.ok === false) {
          setError(t('projects.dialog.browseFailed'))
          return
        }
        if (!applyBrowseBody(body)) setError(t('projects.dialog.browseFailed'))
        else setError('')
      } catch {
        setError(t('projects.dialog.browseFailed'))
      } finally {
        picking = false
        paintSubmit()
      }
    }

    drop.addEventListener('click', () => { void loadBrowse('') })
    browseClose.addEventListener('click', () => {
      if (picking) return
      browsing = false
      paintFolder()
      paintSubmit()
    })
    browseCancel.addEventListener('click', () => {
      if (picking) return
      browsing = false
      paintFolder()
      paintSubmit()
    })
    upBtn.addEventListener('click', () => { if (browseParent) void loadBrowse(browseParent) })
    chooseBtn.addEventListener('click', () => {
      if (picking || !browsePath) return
      folderPath = browsePath
      if (!nameTouched && !input.value.trim()) input.value = folderNameOf(browsePath)
      browsing = false
      paintFolder()
      paintSubmit()
    })
    removeBtn.addEventListener('click', () => {
      if (picking) return
      folderPath = ''
      paintFolder()
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
