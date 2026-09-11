/**
 * 非 React 入口（侧栏 button click / 折叠加号 click 原按钮）挂 overlay。
 * 不用 react-dom：apply() 测试与侧栏加载路径不能多一个 ModuleLoader 依赖。
 * 视觉对齐 NewLocalProjectDialog（--dsw-alias-*）。
 *
 * 提交后 overlay 保持到 create 结束：失败把错误画在弹窗里，成功才关。
 */
import { MAX_PROJECT_TITLE_LENGTH } from './limits.js'

function css(el, styles) {
  Object.assign(el.style, styles)
}

function formatCreateError(error, t) {
  const code = String(error || '')
  if (code === 'no-workspace') return t('projects.noWorkspace')
  if (code === 'title-required' || code === 'title-invalid' || code === 'title-too-long') {
    return t('projects.genericError')
  }
  return t('projects.createFailed').replace('{error}', code)
}

/**
 * @param {(key: string) => string} t
 * @param {{
 *   submit?: (title: string) => Promise<{ ok: boolean, error?: string }>,
 * }} [opts]
 * @returns {Promise<string | null>}
 */
export function promptNewProjectName(t, opts = {}) {
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
      width: '420px',
      maxWidth: 'calc(100vw - 48px)',
      overflow: 'auto',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--dsw-alias-bg-base)',
      color: 'var(--dsw-alias-label-primary)',
      borderRadius: '16px',
      border: '1px solid var(--dsw-alias-border-l2)',
    })

    const header = document.createElement('div')
    css(header, { display: 'flex', alignItems: 'center', gap: '8px', padding: '16px 20px 8px' })
    const titleEl = document.createElement('h2')
    titleEl.id = 'omnimux-new-local-project-title'
    titleEl.textContent = t('projects.dialog.title')
    css(titleEl, { margin: '0', flex: '1', fontSize: '18px', fontWeight: '500', lineHeight: '28px' })
    const closeBtn = document.createElement('button')
    closeBtn.type = 'button'
    closeBtn.setAttribute('aria-label', t('projects.close'))
    closeBtn.textContent = '×' // exempt-ui04: 历史存量待迁移为矢量SVG
    css(closeBtn, {
      border: 'none', background: 'transparent', cursor: 'pointer',
      width: '28px', height: '28px', borderRadius: '8px', color: 'inherit', fontSize: '18px',
    })
    header.append(titleEl, closeBtn)

    const body = document.createElement('div')
    css(body, { padding: '0 20px 12px', display: 'flex', flexDirection: 'column', gap: '8px' })
    const label = document.createElement('label')
    label.htmlFor = 'omnimux-new-local-project-name'
    label.textContent = t('projects.dialog.nameLabel')
    css(label, { fontSize: '13px', color: 'var(--dsw-alias-label-secondary)' })
    const input = document.createElement('input')
    input.id = 'omnimux-new-local-project-name'
    input.maxLength = MAX_PROJECT_TITLE_LENGTH
    input.placeholder = t('projects.dialog.namePlaceholder')
    css(input, {
      width: '100%',
      border: '1px solid var(--dsw-alias-border-l2)',
      borderRadius: '8px',
      padding: '8px 10px',
      fontSize: '13px',
      color: 'inherit',
      background: 'transparent',
      boxSizing: 'border-box',
    })
    const hint = document.createElement('p')
    hint.textContent = t('projects.dialog.hint')
    css(hint, { margin: '0', fontSize: '12px', lineHeight: '18px', color: 'var(--dsw-alias-label-tertiary)' })
    const errorEl = document.createElement('p')
    css(errorEl, { margin: '0', fontSize: '12px', color: 'var(--dsw-alias-state-error-primary, var(--dsw-alias-label-error))', display: 'none' })
    body.append(label, input, hint, errorEl)

    const footer = document.createElement('div')
    css(footer, { display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: '10px 20px 16px' })
    const cancelBtn = document.createElement('button')
    cancelBtn.type = 'button'
    cancelBtn.textContent = t('projects.dialog.cancel')
    css(cancelBtn, {
      border: '1px solid var(--dsw-alias-border-l2)',
      background: 'transparent',
      color: 'inherit',
      borderRadius: '999px',
      padding: '8px 16px',
      fontSize: '14px',
      cursor: 'pointer',
    })
    const submitBtn = document.createElement('button')
    submitBtn.type = 'button'
    submitBtn.textContent = t('projects.dialog.submit')
    submitBtn.disabled = true

    let busy = false
    const paintSubmit = () => {
      const ok = !busy && input.value.trim() !== '' && input.value.trim().length <= MAX_PROJECT_TITLE_LENGTH
      submitBtn.disabled = !ok
      css(submitBtn, {
        border: 'none',
        background: ok ? 'var(--dsw-alias-button-primary-fill)' : 'var(--dsw-alias-border-l2)',
        color: 'var(--dsw-alias-label-primary-foreground)',
        borderRadius: '999px',
        padding: '8px 16px',
        fontSize: '14px',
        fontWeight: '500',
        cursor: ok ? 'pointer' : 'default',
        opacity: busy ? '0.7' : '1',
      })
      input.disabled = busy
      cancelBtn.disabled = busy
      css(cancelBtn, { cursor: busy ? 'default' : 'pointer' })
    }
    paintSubmit()
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

    const runSubmit = async () => {
      const title = input.value.trim()
      if (busy || title === '' || title.length > MAX_PROJECT_TITLE_LENGTH) return
      if (typeof opts.submit !== 'function') {
        finish(title)
        return
      }
      busy = true
      setError('')
      paintSubmit()
      try {
        const result = await opts.submit(title)
        if (result?.ok) {
          finish(title)
          return
        }
        setError(formatCreateError(result?.error, t))
      } catch (error) {
        setError(formatCreateError(error instanceof Error ? error.message : String(error), t))
      } finally {
        busy = false
        paintSubmit()
      }
    }

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
      setError('')
      paintSubmit()
    })

    document.body.appendChild(overlay)
    input.focus()
  })
}
