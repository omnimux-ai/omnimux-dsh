import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'

const require = createRequire(import.meta.url)

/** 用与 trending-interaction.test.js 相同的 esbuild + JSDOM 织法加载真实组件。 */
async function loadComponent(entry) {
  const output = await build({
    entryPoints: [new URL(entry, import.meta.url).pathname],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    external: ['react'],
  })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', output.outputFiles[0].text)(require, module, module.exports)
  return module.exports
}

const SECTION_FIXTURE = [
  '<div id="root" data-omnimux-starter-host data-phase="hero">',
  '<div data-composer-seat><div class="band"><div data-composer-card>',
  '<button data-send-button>Send</button>',
  '</div></div></div>',
  '<div id="seat"></div>',
  '</div>',
].join('')

/** 灵感库真实行：带封面与来源视频，确保 previewUrl / relativePath 都来自真实字段。 */
const SOURCE_ROWS = [
  {
    id: 'insp_us_beauty',
    title: 'US beauty hook',
    country_code: 'US',
    category: 'beauty',
    cover_url: '/omnimux/inspiration/local/media/covers/us-beauty.jpg',
    source_url: '/omnimux/inspiration/local/media/videos/us-beauty.mp4',
    stats: { likes: 300000, comments: 20000, shares: 5000, views: 12000000 },
    deconstruction: { hook_highlight: '开场 3 秒反差' },
  },
  {
    id: 'insp_th_beauty',
    title: 'TH beauty routine',
    country_code: 'TH',
    category: 'beauty',
    cover_url: '/omnimux/inspiration/local/media/covers/th-beauty.jpg',
    stats: { likes: 400000, comments: 1000, shares: 1000, views: 40000000 },
    deconstruction: { summary: '素颜到上妆的完整节奏' },
  },
]

function withDom(html) {
  const dom = new JSDOM(html, { url: 'http://localhost/' })
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    act: globalThis.IS_REACT_ACT_ENVIRONMENT,
    fetch: globalThis.fetch,
    CustomEvent: globalThis.CustomEvent,
  }
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  return {
    dom,
    restore() {
      globalThis.window = previous.window
      globalThis.document = previous.document
      globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act
      globalThis.fetch = previous.fetch
      globalThis.CustomEvent = previous.CustomEvent
      dom.window.close()
    },
  }
}

/** 装一个只回给定行的 fetch 替身（与真源同形状）。 */
function stubFetch(rows) {
  const previous = globalThis.fetch
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ data: { items: rows, total: rows.length } }),
  })
  return { restore: () => { globalThis.fetch = previous } }
}

async function click(node) {
  await act(async () => {
    node.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  })
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
  })
}

/**
 * 渲染复刻板块，并接上**真实**会话附件 Store。
 * 组件与测试消费同一个全局单例（`window.__omnimuxAttachments`），
 * 因此断言看到的就是附件栏真实拿到的数据。
 */
async function renderSection({ rows = SOURCE_ROWS, sessionId = 'sess-replicate' } = {}) {
  const sectionModule = await loadComponent('./TrendingReplicateSection.jsx')
  const store = await loadComponent('../../attachments/store.ts')

  const env = withDom(SECTION_FIXTURE)
  const host = document.querySelector('#root')
  const stub = stubFetch(rows)
  const globalStore = store.getGlobalAttachmentStore()
  // 全局 Store 是跨测试共享的单例：每次渲染前先清空并认领会话，避免上一条测试的污染
  window.__omnimuxActiveSkill = null
  globalStore.clear(sessionId)
  globalStore.clear('default')
  globalStore.setActiveSessionId(sessionId)

  const applied = []
  const skillEvents = []
  window.addEventListener('omnimux:skill:changed', (event) => skillEvents.push(event.detail?.skill || null))

  const root = createRoot(host.querySelector('#seat'))
  await act(async () => {
    root.render(React.createElement(sectionModule.TrendingReplicateSection, {
      t: (key) => key,
      onApplyPrompt: (prompt, item) => applied.push({ prompt, id: item.id }),
    }))
  })
  await flush()
  await flush()

  return {
    env,
    host,
    root,
    stub,
    applied,
    skillEvents,
    store: globalStore,
    Section: sectionModule.TrendingReplicateSection,
    sessionId,
    attachments: () => globalStore.getSnapshot(sessionId),
    cards: () => Array.from(host.querySelectorAll('[data-trending-id]')),
    activeCardId: () => {
      const active = host.querySelector('[data-trending-active="true"]')
      return active ? active.getAttribute('data-trending-id') : null
    },
    async teardown() {
      await act(async () => root.unmount())
      globalStore.clear(sessionId)
      window.__omnimuxActiveSkill = null
      stub.restore()
      env.restore()
    },
  }
}

// ─────────────────────────────────────────────────────────────
// 1. 点击复刻：附件栏 + 技能药丸 + 极简草稿
// ─────────────────────────────────────────────────────────────

test('复刻联动：点击复刻把对标对象挂进附件栏（封面/标题/时长都在），并点亮技能药丸', async () => {
  const view = await renderSection()
  try {
    assert.equal(view.attachments().length, 0, '点之前附件栏必须是空的')

    const card = view.cards()[0]
    const targetId = card.getAttribute('data-trending-id')
    await click(card.querySelector('.omnimux-trending-recreate-btn'))
    await flush()

    const attachments = view.attachments()
    assert.equal(attachments.length, 1, '复刻对象必须进附件栏')
    const attachment = attachments[0]
    assert.equal(attachment.kind, 'video')
    assert.equal(attachment.entityId, targetId)
    assert.equal(attachment.title, 'US beauty hook', '附件卡片标题取自对标片标题')
    assert.equal(attachment.extension, 'MP4')
    assert.equal(
      attachment.previewUrl,
      '/omnimux/inspiration/local/media/covers/us-beauty.jpg',
      '附件卡片必须带视频封面缩略图',
    )
    assert.equal(attachment.relativePath, 'inspiration/videos/us-beauty.mp4')
    assert.equal(attachment.metadata.isRecreateTarget, true)
    assert.equal(attachment.metadata.structure, '开场 3 秒反差')

    // 技能药丸：激活态走全局通道，底部工具栏据此渲染
    assert.equal(window.__omnimuxActiveSkill?.slug, 'video-deconstruct')
    assert.equal(view.skillEvents.at(-1)?.name, '复刻爆款视频')
    assert.equal(view.skillEvents.at(-1)?.description.includes('拆解爆款视频'), true)

    // 草稿极简：只有一句意图，附件数据与结构化指令一律不进草稿
    assert.equal(view.applied.length, 1)
    assert.equal(view.applied[0].prompt, '复刻这条爆款视频')
    assert.equal(view.applied[0].id, targetId)
    assert.ok(!view.applied[0].prompt.includes('{'), '草稿不得出现结构化 JSON')
    assert.ok(!view.applied[0].prompt.includes('Attached Context'), '草稿不得内联附件上下文')

    assert.equal(view.activeCardId(), targetId)
  } finally {
    await view.teardown()
  }
})

test('复刻联动：换片时同一会话只保留一个复刻对象', async () => {
  const view = await renderSection()
  try {
    await click(view.cards()[0].querySelector('.omnimux-trending-recreate-btn'))
    await flush()
    const firstId = view.attachments()[0].entityId

    await click(view.cards()[1].querySelector('.omnimux-trending-recreate-btn'))
    await flush()

    const attachments = view.attachments()
    assert.equal(attachments.length, 1, '换片不得在附件栏堆两条')
    assert.notEqual(attachments[0].entityId, firstId)
    assert.equal(attachments[0].entityId, view.cards()[1].getAttribute('data-trending-id'))
    assert.equal(view.activeCardId(), view.cards()[1].getAttribute('data-trending-id'))
    assert.equal(window.__omnimuxActiveSkill?.slug, 'video-deconstruct', '换片后技能仍在激活态')
  } finally {
    await view.teardown()
  }
})

// ─────────────────────────────────────────────────────────────
// 2. 取消与反悔：三处挂载必须同步
// ─────────────────────────────────────────────────────────────

test('复刻联动：再点同一张卡片 → 附件撤下、技能清除、卡片取消激活', async () => {
  const view = await renderSection()
  try {
    const card = view.cards()[0]
    await click(card.querySelector('.omnimux-trending-recreate-btn'))
    await flush()
    assert.equal(view.attachments().length, 1)

    await click(card.querySelector('.omnimux-trending-recreate-btn'))
    await flush()

    assert.equal(view.attachments().length, 0, '再点必须把复刻对象从附件栏撤下')
    assert.equal(window.__omnimuxActiveSkill, null, '再点必须清除激活技能')
    assert.equal(view.skillEvents.at(-1), null)
    assert.equal(view.activeCardId(), null)
    assert.equal(view.applied.length, 1, '撤回复刻不应再向输入框写草稿')
  } finally {
    await view.teardown()
  }
})

test('复刻联动：在附件栏移除该附件 → 卡片态与技能药丸同步撤回', async () => {
  const view = await renderSection()
  try {
    await click(view.cards()[0].querySelector('.omnimux-trending-recreate-btn'))
    await flush()
    const attachmentId = view.attachments()[0].id

    // 附件栏的订阅在板块首次提交后建立，这里补一次提交让订阅就位
    await act(async () => view.root.render(React.createElement(view.Section, {
      t: (key) => key,
      onApplyPrompt: () => {},
    })))
    await flush()
    await act(async () => {
      view.store.removeAttachment(view.sessionId, attachmentId)
    })
    await flush()

    assert.equal(view.attachments().length, 0)
    assert.equal(window.__omnimuxActiveSkill, null, '附件没了技能不得继续挂着')
    assert.equal(view.activeCardId(), null, '卡片必须同步取消激活')
  } finally {
    await view.teardown()
  }
})

test('复刻联动：底部药丸点 ✕ 移除技能 → 复刻对象一并撤离', async () => {
  const view = await renderSection()
  try {
    await click(view.cards()[0].querySelector('.omnimux-trending-recreate-btn'))
    await flush()
    assert.equal(view.attachments().length, 1)

    // 模拟药丸 ✕：技能通道清空激活态
    await act(async () => {
      window.__omnimuxActiveSkill = null
      window.dispatchEvent(new window.CustomEvent('omnimux:skill:changed', { detail: { skill: null } }))
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    assert.equal(view.attachments().length, 0, '药丸移除技能必须同步撤下复刻附件')
    assert.equal(view.activeCardId(), null)
  } finally {
    await view.teardown()
  }
})

test('复刻联动：附件挂载失败时不假装接管成功（卡片不标 active）', async () => {
  const view = await renderSection()
  try {
    // 附件栏满额：8 条占满配额后，复刻对象挂不进去
    for (let i = 0; i < 8; i += 1) {
      view.store.addAttachment(view.sessionId, {
        sourcePlugin: 'omnimux',
        kind: 'asset',
        entityId: `ast_${i}`,
        title: `资产 ${i}`,
        relativePath: `assets/${i}.png`,
      })
    }
    assert.equal(view.attachments().length, 8)

    await click(view.cards()[0].querySelector('.omnimux-trending-recreate-btn'))
    await flush()

    assert.equal(view.attachments().length, 8, '满额时不得把配额顶掉')
    assert.equal(view.activeCardId(), null, '附件没挂上就不该显示成已接管')
    assert.ok(!window.__omnimuxActiveSkill, '附件没挂上就不得激活技能')
  } finally {
    await view.teardown()
  }
})

test('复刻联动：卸载板块会同时撤下附件与技能，不留悬空挂载', async () => {
  const view = await renderSection()
  await click(view.cards()[0].querySelector('.omnimux-trending-recreate-btn'))
  await flush()
  assert.equal(view.attachments().length, 1)

  await act(async () => view.root.unmount())
  await flush()

  assert.equal(view.attachments().length, 0, '板块卸载必须撤下复刻附件')
  assert.equal(window.__omnimuxActiveSkill, null, '板块卸载必须清除复刻技能')
  view.stub.restore()
  view.env.restore()
})

test('复刻联动：附件栏已满时，换片靠替换名额完成（不因为满额卡死）', async () => {
  const view = await renderSection()
  try {
    await click(view.cards()[0].querySelector('.omnimux-trending-recreate-btn'))
    await flush()
    // 再用其它附件把剩余名额填满
    for (let i = 0; i < 7; i += 1) {
      view.store.addAttachment(view.sessionId, {
        sourcePlugin: 'omnimux',
        kind: 'asset',
        entityId: `ast_${i}`,
        title: `资产 ${i}`,
        relativePath: `assets/${i}.png`,
      })
    }
    assert.equal(view.attachments().length, 8, '名额已被填满')

    await click(view.cards()[1].querySelector('.omnimux-trending-recreate-btn'))
    await flush()

    const replicate = view.attachments().filter((item) => item.metadata?.isRecreateTarget === true)
    assert.equal(replicate.length, 1, '换片后仍只挂一个复刻对象')
    assert.equal(replicate[0].entityId, view.cards()[1].getAttribute('data-trending-id'))
    assert.equal(view.attachments().length, 8, '其它附件不受影响')
  } finally {
    await view.teardown()
  }
})
