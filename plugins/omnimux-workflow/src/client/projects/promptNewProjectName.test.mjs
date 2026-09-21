import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { afterEach, describe, it } from 'node:test'

const require = createRequire(import.meta.url)

function t(key) {
  return key
}

async function withDom() {
  const { JSDOM } = require('jsdom')
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true })
  for (const [name, value] of [['window', dom.window], ['document', dom.window.document], ['navigator', dom.window.navigator]]) {
    Object.defineProperty(global, name, { value, writable: true, configurable: true })
  }
  const { promptNewProjectName } = await import(`./promptNewProjectName.js?test=${Date.now()}-${Math.random()}`)
  return { dom, promptNewProjectName }
}

afterEach(() => {
  if (global.document?.querySelector('[data-omnimux-new-local-project]')) {
    global.document.querySelector('[data-omnimux-new-local-project]')?.remove()
  }
})

describe('promptNewProjectName', () => {
  it('renders drop zone and SVG close, never a character ×', async () => {
    const { dom, promptNewProjectName } = await withDom()
    try {
      const pending = promptNewProjectName(t)
      const overlay = document.querySelector('[data-omnimux-new-local-project]')
      assert.ok(overlay)
      assert.ok(overlay.querySelector('[data-omnimux-new-project-drop]'))
      assert.equal(overlay.querySelector('[data-omnimux-new-project-picked]').style.display, 'none')
      const close = overlay.querySelector('[aria-label="projects.close"]')
      assert.ok(close.querySelector('svg'))
      assert.doesNotMatch(close.textContent || '', /×/)
      close.click()
      await pending
    } finally {
      dom.window.close()
    }
  })

  it('in-dialog browse then choose, and submit includes projectRoot', async () => {
    const { dom, promptNewProjectName } = await withDom()
    const submits = []
    try {
      const pending = promptNewProjectName(t, {
        browseDirectory: async (path) => {
          if (!path) {
            return { ok: true, body: { path: '/Users/x/Movies', parent: '/Users/x', entries: [{ name: '短剧宣传片', path: '/Users/x/Movies/短剧宣传片' }] } }
          }
          return { ok: true, body: { path, parent: '/Users/x/Movies', entries: [] } }
        },
        submit: async (title, extra) => {
          submits.push({ title, extra })
          return { ok: true }
        },
      })
      const overlay = document.querySelector('[data-omnimux-new-local-project]')
      overlay.querySelector('[data-omnimux-new-project-drop]').click()
      await new Promise((resolve) => setTimeout(resolve, 0))
      assert.equal(overlay.querySelector('[data-omnimux-new-project-browse]').style.display, 'flex')
      overlay.querySelector('[data-omnimux-new-project-folder]').click()
      await new Promise((resolve) => setTimeout(resolve, 0))
      overlay.querySelector('[data-omnimux-new-project-choose]').click()
      const picked = overlay.querySelector('[data-omnimux-new-project-picked]')
      assert.equal(picked.style.display, 'flex')
      assert.match(picked.textContent, /短剧宣传片/)
      overlay.querySelector('[data-omnimux-new-project-remove]').click()
      assert.equal(overlay.querySelector('[data-omnimux-new-project-picked]').style.display, 'none')
      overlay.querySelector('[data-omnimux-new-project-drop]').click()
      await new Promise((resolve) => setTimeout(resolve, 0))
      overlay.querySelector('[data-omnimux-new-project-folder]').click()
      await new Promise((resolve) => setTimeout(resolve, 0))
      overlay.querySelector('[data-omnimux-new-project-choose]').click()
      const input = overlay.querySelector('#omnimux-new-local-project-name')
      const submitBtn = [...overlay.querySelectorAll('button')].find((btn) => btn.textContent === 'projects.dialog.submit')
      assert.equal(submitBtn.disabled, false)
      assert.equal(input.value, '短剧宣传片')
      submitBtn.click()
      await pending
      assert.equal(submits.length, 1)
      assert.equal(submits[0].title, '短剧宣传片')
      assert.equal(submits[0].extra.projectRoot, '/Users/x/Movies/短剧宣传片')
    } finally {
      dom.window.close()
    }
  })

  it('name-only submit omits projectRoot', async () => {
    const { dom, promptNewProjectName } = await withDom()
    const submits = []
    try {
      const pending = promptNewProjectName(t, {
        submit: async (title, extra) => {
          submits.push({ title, extra })
          return { ok: true }
        },
      })
      const overlay = document.querySelector('[data-omnimux-new-local-project]')
      const input = overlay.querySelector('#omnimux-new-local-project-name')
      const submitBtn = [...overlay.querySelectorAll('button')].find((btn) => btn.textContent === 'projects.dialog.submit')
      assert.equal(submitBtn.disabled, true)
      input.value = '新项目'
      input.dispatchEvent(new window.Event('input', { bubbles: true }))
      assert.equal(submitBtn.disabled, false)
      submitBtn.click()
      await pending
      assert.equal(submits[0].title, '新项目')
      assert.deepEqual(submits[0].extra, {})
    } finally {
      dom.window.close()
    }
  })

  it('second submit after existing project carries confirmedExisting', async () => {
    const { dom, promptNewProjectName } = await withDom()
    const submits = []
    try {
      const pending = promptNewProjectName(t, {
        submit: async (title, extra) => {
          submits.push({ title, extra: { ...extra } })
          if (!extra?.confirmedExisting) return { ok: false, existing: true, error: 'projects.existingConfirm' }
          return { ok: true }
        },
      })
      const overlay = document.querySelector('[data-omnimux-new-local-project]')
      const input = overlay.querySelector('#omnimux-new-local-project-name')
      const submitBtn = [...overlay.querySelectorAll('button')].find((btn) => btn.textContent === 'projects.dialog.submit')
      input.value = '别的项目'
      input.dispatchEvent(new window.Event('input', { bubbles: true }))
      submitBtn.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
      assert.equal(submits.length, 1)
      assert.equal(Boolean(submits[0].extra.confirmedExisting), false)
      submitBtn.click()
      await pending
      assert.equal(submits.length, 2)
      assert.equal(submits[1].extra.confirmedExisting, true)
    } finally {
      dom.window.close()
    }
  })
})
