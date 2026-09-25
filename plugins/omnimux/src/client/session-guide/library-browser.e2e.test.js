import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'
import { createAttachmentStore } from '../attachments/store.ts'
import { createComposerAddController } from '../composer-add/controller.js'
import { LIBRARY_STAGE_EVENT, LIBRARY_STAGE_PROMPT_EVENT, LIBRARY_TABS, mergeLibraryPrompt, promptForCard } from '../composer-add/library-stage-model.js'
import { zh } from '../locales.js'

const guideSource = readFileSync(new URL('./SessionGuide.jsx', import.meta.url), 'utf8')
const styleSource = readFileSync(new URL('./styles.js', import.meta.url), 'utf8')
const assetHubSource = readFileSync(new URL('../workbench/AssetHubPanel.jsx', import.meta.url), 'utf8')
const geometrySource = readFileSync(new URL('../workbench/geometry.js', import.meta.url), 'utf8')

function mountStage() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://example.test/' })
  const { window } = dom
  const doc = window.document
  const store = createAttachmentStore()
  const prompts = []
  let stageModel = null
  const host = doc.createElement('div')
  host.setAttribute('data-omnimux-starter-host', '')
  host.setAttribute('data-omnimux-dock-open', '')
  doc.body.appendChild(host)

  window.addEventListener(LIBRARY_STAGE_EVENT, (event) => {
    stageModel = event.detail
    event.preventDefault()
    let stage = doc.querySelector('[data-omnimux-library-stage]')
    if (!stageModel) {
      stage?.remove()
      return
    }
    if (!stage) {
      stage = doc.createElement('section')
      stage.setAttribute('data-omnimux-library-stage', '')
      stage.setAttribute('aria-label', '挑选素材')
      host.prepend(stage)
    }
    stage.dataset.tab = stageModel.tab
    stage.innerHTML = ''
    const tabs = doc.createElement('div')
    tabs.className = 'omnimux-library-stage-tabs'
    const back = doc.createElement('button')
    back.type = 'button'
    back.className = 'omnimux-library-stage-back'
    back.textContent = '返回'
    back.addEventListener('click', () => stageModel.onClose?.())
    tabs.appendChild(back)
    for (const item of LIBRARY_TABS) {
      const button = doc.createElement('button')
      button.type = 'button'
      button.className = `omnimux-library-stage-tab${item.id === stageModel.tab ? ' is-active' : ''}`
      button.textContent = item.label
      button.addEventListener('click', () => stageModel.onTab?.(item.id))
      tabs.appendChild(button)
    }
    const close = doc.createElement('button')
    close.type = 'button'
    close.className = 'omnimux-library-stage-close'
    close.addEventListener('click', () => stageModel.onClose?.())
    tabs.appendChild(close)
    stage.appendChild(tabs)

    const card = doc.createElement('button')
    card.type = 'button'
    card.className = 'omnimux-library-stage-cell'
    card.dataset.libraryLane = stageModel.tab === 'assets' ? 'assets' : stageModel.tab
    card.textContent = stageModel.tab === 'assets' ? '咖啡机' : '街拍'
    card.addEventListener('click', () => {
      const lane = card.dataset.libraryLane
      const title = card.textContent
      stageModel.onPick?.({
        lane,
        title,
        raw: { id: lane === 'assets' ? 'asset-1' : 'cloud-1', name: title, title },
      })
    })
    stage.appendChild(card)
  })

  window.addEventListener(LIBRARY_STAGE_PROMPT_EVENT, (event) => {
    prompts.push(String(event.detail?.prompt || ''))
  })

  const controller = createComposerAddController({
    store,
    t: (key) => zh[key] || key,
    getCurrentSessionId: () => 'session-a',
    subscribeCurrentSession() { return () => {} },
    notify() {},
    onPrompt(prompt) {
      window.dispatchEvent(new window.CustomEvent(LIBRARY_STAGE_PROMPT_EVENT, { detail: { prompt, sessionId: 'session-a' } }))
    },
    renderLibrary(model) {
      const event = new window.CustomEvent(LIBRARY_STAGE_EVENT, { detail: model, cancelable: true })
      window.dispatchEvent(event)
    },
    async request(path, body) {
      if (String(path).includes('/instantiate')) {
        return {
          ok: true,
          status: 200,
          body: {
            results: (body.assetIds || []).map((id) => ({
              ok: true,
              sourcePath: id,
              relativePath: `assets/imported/${id}/hero.png`,
              title: '咖啡机',
              kind: 'asset',
              entityId: id,
            })),
          },
        }
      }
      return { ok: true, status: 200, body: {} }
    },
  })

  const onKey = (event) => {
    if (event.key === 'Escape') stageModel?.onClose?.()
  }
  window.addEventListener('keydown', onKey)

  return {
    doc,
    window,
    store,
    prompts,
    controller,
    openAssets() { controller.openLibrary('session-a') },
    openInspiration() { controller.openInspiration('session-a') },
    openProduct() { controller.openProduct('session-a') },
    dispose() {
      window.removeEventListener('keydown', onKey)
      controller.dispose()
    },
  }
}

test('三栏工作台新架构保留贴底输入框、打通Prompt管道并移除旧全屏固定遮罩', () => {
  assert.match(guideSource, /LIBRARY_STAGE_PROMPT_EVENT/)
  assert.match(guideSource, /mergeLibraryPrompt/)
  assert.match(assetHubSource, /LIBRARY_STAGE_PROMPT_EVENT/)
  assert.match(assetHubSource, /promptForCard/)
  assert.match(geometrySource, /ASSET_HUB_CHAT_PX = 380/)
  assert.doesNotMatch(styleSource, /\.omnimux-library-stage \{[^}]*position:fixed/)
  assert.match(readFileSync(new URL('./useComposerDocking.js', import.meta.url), 'utf8'), /scrollBody/)
  assert.match(readFileSync(new URL('./useComposerDocking.js', import.meta.url), 'utf8'), /placement === 'docked' \|\| pinnedRef\.current/)
  assert.match(styleSource, /data-omnimux-skill-picker/)
  assert.doesNotMatch(styleSource, /data-omnimux-skill-picker[\s\S]{0,120}display:\s*none/)
})

test('e2e: 打开整页后点卡片写入素材与提示词，整页保持打开', async () => {
  const f = mountStage()
  f.openAssets()
  const stage = f.doc.querySelector('[data-omnimux-library-stage]')
  assert.ok(stage)
  assert.equal(stage.dataset.tab, 'assets')
  assert.equal(f.doc.querySelector('.omnimux-library-stage-tab.is-active')?.textContent, '资产库')

  f.doc.querySelector('.omnimux-library-stage-cell').click()
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(f.store.getSnapshot('session-a').length, 1)
  assert.deepEqual(f.prompts, [promptForCard({ lane: 'assets', title: '咖啡机' })])
  assert.ok(f.doc.querySelector('[data-omnimux-library-stage]'))

  const draft = mergeLibraryPrompt('', f.prompts[0])
  assert.equal(draft, '请结合资产「咖啡机」继续创作：')

  f.doc.querySelector('.omnimux-library-stage-close').click()
  assert.equal(f.doc.querySelector('[data-omnimux-library-stage]'), null)
  f.dispose()
})

test('e2e: 点击返回按钮与按下 Escape 键均可退出整页素材层', async () => {
  const f = mountStage()
  f.openAssets()
  let stage = f.doc.querySelector('[data-omnimux-library-stage]')
  assert.ok(stage)

  // 1. 点击左侧返回按钮退出
  const backBtn = f.doc.querySelector('.omnimux-library-stage-back')
  assert.ok(backBtn, '返回按钮必须存在')
  backBtn.click()
  assert.equal(f.doc.querySelector('[data-omnimux-library-stage]'), null, '点击返回按钮后必须退出素材层')

  // 2. 重新打开并验证 Escape 按键退出
  f.openAssets()
  assert.ok(f.doc.querySelector('[data-omnimux-library-stage]'))
  f.window.dispatchEvent(new f.window.KeyboardEvent('keydown', { key: 'Escape' }))
  assert.equal(f.doc.querySelector('[data-omnimux-library-stage]'), null, '按 Escape 键后必须退出素材层')

  f.dispose()
})

test('e2e: 打开素材层时再次点击不同入口无缝切换选项卡分类', async () => {
  const f = mountStage()
  f.openAssets()
  let stage = f.doc.querySelector('[data-omnimux-library-stage]')
  assert.equal(stage.dataset.tab, 'assets')

  // 再次点击从灵感库选择
  f.openInspiration()
  stage = f.doc.querySelector('[data-omnimux-library-stage]')
  assert.ok(stage, '素材层保持打开')
  assert.equal(stage.dataset.tab, 'inspiration', '分类成功切换到灵感库')

  f.dispose()
})
