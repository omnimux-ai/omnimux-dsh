/**
 * 侧栏「新建项目」并排按钮（kind:'inline'），由 hub 的单一 sidebar coordinator
 * 放置（window.__omnimuxSidebar）。本模块只描述按钮与点击行为，不自挂 observer。
 * 点击 → 弹窗收名称 → runNewProject。折叠加号菜单只 click 本按钮，不改 hub。
 */
import { runNewProject } from './newProject.js'
import { promptNewProjectName } from './promptNewProjectName.js'

const ICON = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg>'

const STYLES = `
.omnimux-new-project-entry {
  box-sizing: border-box; display: flex; align-items: center; justify-content: center; gap: 6px;
  height: 38px; padding: 8px 12px;
  border: 1px solid var(--dsw-alias-border-l2, currentColor); border-radius: 12px;
  background: transparent; color: var(--dsw-alias-label-primary, inherit);
  font-size: 14px; font-weight: 500; line-height: 22px; cursor: pointer;
  overflow: hidden; white-space: nowrap;
}
.omnimux-new-project-entry:hover { background: var(--dsw-alias-button-floating-hover); }
.omnimux-new-project-entry-icon { flex: none; display: inline-flex; width: 14px; height: 14px; align-items: center; justify-content: center; }
.omnimux-new-project-entry svg { display: block; width: 14px; height: 14px; }
.omnimux-new-project-entry-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
`

function paintLabel(entry, label) {
  entry.setAttribute('aria-label', label)
  const node = entry.querySelector('.omnimux-new-project-entry-label')
  if (node) node.textContent = label
}

/**
 * 轮询等待 hub 全局就绪后 register() 一次（与 sidebar-entry.js 同款；coordinator
 * 独占 observer，这里不重放、不级联）。
 * @param {object} row
 * @returns {() => void} disposer
 */
function registerWhenReady(row) {
  let unregister = () => {}
  let disposed = false
  const attempt = () => {
    if (disposed) return
    const api = window.__omnimuxSidebar
    if (!api || typeof api.register !== 'function') return
    unregister = api.register(row)
    clearInterval(timer)
  }
  const timer = setInterval(attempt, 500)
  attempt()
  return () => {
    disposed = true
    clearInterval(timer)
    unregister()
  }
}

/**
 * @param {{ sessions: object, workspaces?: object, layout?: object }} deps
 * @param {(key: string) => string} t
 * @param {{ subscribe?: (fn: () => void) => () => void }} [locale]
 * @returns {() => void} disposer
 */
export function mountNewProjectEntry(deps, t, locale) {
  const entry = document.createElement('button')
  entry.type = 'button'
  entry.dataset.dshOmnimuxNewProjectEntry = ''
  entry.className = 'omnimux-new-project-entry'
  entry.innerHTML = `<span class="omnimux-new-project-entry-icon">${ICON}</span><span class="omnimux-new-project-entry-label"></span>`
  paintLabel(entry, t('projects.newProject'))
  entry.addEventListener('click', () => {
    void promptNewProjectName(t, {
      submit: (title) => runNewProject(deps, { title }),
    })
  })

  const paint = () => { paintLabel(entry, t('projects.newProject')) }
  const unsubscribeLocale = typeof locale?.subscribe === 'function' ? locale.subscribe(paint) : () => {}

  const unregister = registerWhenReady({
    id: 'omnimux-new-project-entry',
    kind: 'inline',
    styles: STYLES,
    styleId: 'omnimux-new-project-entry-styles',
    create: () => entry,
  })

  return () => {
    unregister()
    unsubscribeLocale()
  }
}
