import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import snapshot from './featured-skills.json' with { type: 'json' }
import { filterSkillsByCategory, buildSkillPrompt } from './featured-skills-data.js'
import { readCatalog, buildSnapshot } from '../../../../../../scripts/generate-featured-skills.mjs'

const require = createRequire(import.meta.url)

// ─────────────────────────────────────────────────────────────
// 1. 数据层纯函数
// ─────────────────────────────────────────────────────────────

test('featured-skills-data: filterSkillsByCategory 按分类筛选', () => {
  const list = [
    { id: 's1', category: 'sk-commerce' },
    { id: 's2', category: 'sk-marketing' },
    { id: 's3', category: 'sk-commerce' },
  ]
  assert.equal(filterSkillsByCategory(list, '').length, 3, '空分类代表全部/精选')
  assert.equal(filterSkillsByCategory(list, 'all').length, 3)
  assert.deepEqual(
    filterSkillsByCategory(list, 'sk-commerce').map((s) => s.id),
    ['s1', 's3'],
  )
  assert.deepEqual(filterSkillsByCategory(list, 'sk-marketing').map((s) => s.id), ['s2'])
  assert.deepEqual(filterSkillsByCategory(list, 'unknown'), [])
  assert.deepEqual(filterSkillsByCategory(null, 'sk-commerce'), [])
})

test('featured-skills-data: buildSkillPrompt 生成清晰的技能预填指令', () => {
  const prompt = buildSkillPrompt({
    title: '3D动画短片',
    summary: '用途：生成 3D 动画分镜脚本与画面设定。',
  })
  assert.ok(prompt.includes('使用技能「3D动画短片」'))
  assert.ok(prompt.includes('用途：生成 3D 动画分镜脚本与画面设定。'))
  assert.ok(prompt.includes('请按照该技能的规范和步骤，帮我完成以下任务：'))

  assert.equal(buildSkillPrompt(null), '')
  assert.equal(buildSkillPrompt({}), '请按照该技能的规范和步骤，帮我完成以下任务：')
})

test('featured-skills-data: 快照文件格式与约束', () => {
  assert.equal(snapshot.schema, 'omnimux.session-guide.featured-skills/v1')
  assert.ok(Array.isArray(snapshot.skills))
  assert.ok(Array.isArray(snapshot.categories))
  assert.equal(snapshot.skills.length, 69, '精选技能必须有 69 条（来自 recommended: true）')
  assert.equal(snapshot.categories.length, 5, '在册分类必须为 5 个')
  for (const s of snapshot.skills) {
    assert.ok(s.id && s.title, '技能条目必须包含 id 与 title')
  }
})

test('featured-skills-data: 快照与市场目录完全一致（新鲜度门禁）', () => {
  const catalog = readCatalog()
  const expected = buildSnapshot(catalog)
  assert.deepEqual(snapshot, expected, 'featured-skills.json 必须与目录构建结果一致')
})

// ─────────────────────────────────────────────────────────────
// 2. 组件交互与双 Tab 渲染测试
// ─────────────────────────────────────────────────────────────

const FIXTURE_HTML = `
<!doctype html>
<html>
  <body>
    <div id="root" data-phase="hero">
      <div id="seat"></div>
      <div id="composer-band">
        <div data-composer-card="true" style="height: 166px;">
          <input data-composer-input="true" />
        </div>
      </div>
    </div>
  </body>
</html>
`

function withDom(html) {
  const dom = new JSDOM(html, { url: 'http://localhost/' })
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    Event: globalThis.Event,
    MouseEvent: globalThis.MouseEvent,
    sessionStorage: globalThis.sessionStorage,
    act: globalThis.IS_REACT_ACT_ENVIRONMENT,
  }
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.HTMLElement = dom.window.HTMLElement
  globalThis.Event = dom.window.Event
  globalThis.MouseEvent = dom.window.MouseEvent
  globalThis.sessionStorage = dom.window.sessionStorage
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  return {
    dom,
    restore() {
      globalThis.window = previous.window
      globalThis.document = previous.document
      globalThis.HTMLElement = previous.HTMLElement
      globalThis.Event = previous.Event
      globalThis.MouseEvent = previous.MouseEvent
      globalThis.sessionStorage = previous.sessionStorage
      globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act
      dom.window.close()
    },
  }
}

async function loadComponent(entry) {
  const output = await build({
    entryPoints: [new URL(entry, import.meta.url).pathname],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    external: ['react'],
    loader: { '.json': 'json' },
  })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', output.outputFiles[0].text)(require, module, module.exports)
  return module.exports
}

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 20)) })
const click = (el) => act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })

test('TrendingReplicateSection: 头部渲染「创作灵感 / Skill」双 Tab 并支持平滑切换', async () => {
  const { TrendingReplicateSection } = await loadComponent('../trending/TrendingReplicateSection.jsx')
  const env = withDom(FIXTURE_HTML)
  const host = document.querySelector('#root')
  const root = createRoot(host.querySelector('#seat'))
  let appliedPrompt = ''

  try {
    await act(async () => {
      root.render(React.createElement(TrendingReplicateSection, {
        t: (key) => key,
        onApplyPrompt: (p) => { appliedPrompt = p },
      }))
    })
    await flush()

    // 1. 验证双 Tab 渲染
    const tabTrending = host.querySelector('#tab-trending')
    const tabSkills = host.querySelector('#tab-skills')
    assert.ok(tabTrending, '必须渲染创作灵感 Tab')
    assert.ok(tabSkills, '必须渲染 Skill Tab')
    assert.equal(tabTrending.getAttribute('aria-selected'), 'true', '默认选中创作灵感')
    assert.equal(tabSkills.getAttribute('aria-selected'), 'false')

    // 默认展示对标内容
    assert.ok(host.querySelector('#tabpanel-trending'), '默认挂载对标内容区')
    assert.equal(host.querySelector('#tabpanel-skills'), null)

    // 2. 点击切换到 Skill Tab
    await click(tabSkills)
    await flush()

    assert.equal(tabTrending.getAttribute('aria-selected'), 'false')
    assert.equal(tabSkills.getAttribute('aria-selected'), 'true', '点击后 Skill Tab 选中')
    assert.ok(host.querySelector('#tabpanel-skills'), '切换后挂载 Skill 面板')
    assert.equal(host.querySelector('#tabpanel-trending'), null)
    assert.equal(host.querySelector('.omnimux-trending-source-badge'), null, 'Tab 头部不得包含「来自灵感库」或工坊徽章')
    assert.equal(host.querySelector('.omnimux-trending-subtitle'), null, '头部不得包含副标题（图 2 元素彻底移除）')

    // 3. 验证分类胶囊
    const chips = host.querySelectorAll('.omnimux-skills-chip')
    assert.equal(chips.length, 6, '应有 1 个全选「精选」+ 5 个业务分类胶囊')
    assert.equal(chips[0].getAttribute('aria-pressed'), 'true', '默认全部分类按下')

    // 4. 验证技能卡片渲染与图 4 规范对齐
    const cards = host.querySelectorAll('.omnimux-skill-card')
    assert.equal(cards.length, 69, '全部分类下展示 69 张精选卡片')

    // 验证前 8 张重磅置顶官方视频 Skill 顺序与图 4 像素级一致
    const expectedTop8Titles = [
      '3D动画短片',
      '品牌宣传短片生成器',
      '极简产品广告生成器',
      '音乐MV动态字幕生成器',
      '纸拼贴讲解动画',
      '第一视角 FPV 穿越生成',
      '第一视角短片生成',
      '悬疑电影片头生成',
    ]
    const actualTop8Titles = Array.from(cards).slice(0, 8).map((c) => c.querySelector('.omnimux-skill-card-title')?.textContent?.trim())
    assert.deepEqual(actualTop8Titles, expectedTop8Titles, '前 8 张卡片必须与图 4 官方精选爆款严格一致')

    // 验证卡片内容规范（封面、H3 角标、hover 按钮、两行描述、认证底行）
    const firstCard = cards[0]
    const coverImg = firstCard.querySelector('.omnimux-skill-card-cover-img')
    assert.ok(coverImg, '技能卡片必须渲染真实封面图片')
    assert.ok(coverImg.getAttribute('src').includes('3d-animation-short-generator.png'), '封面 src 必须正确指向对应资源')
    const badge = firstCard.querySelector('.omnimux-skill-card-badge')
    assert.ok(badge, '技能卡片必须渲染左上角紫色角标')
    assert.equal(badge.textContent.trim(), 'H3', '角标文本必须为 H3')
    const author = firstCard.querySelector('.omnimux-skill-card-author')
    assert.equal(author?.textContent?.trim(), '@MiniMax Design官方', '底部署名必须为 @MiniMax Design官方')
    assert.ok(firstCard.querySelector('.omnimux-skill-verified-icon'), '底行必须渲染官方认证打勾图标')

    // 5. 点击分类胶囊筛选
    await click(chips[1]) // 第一个业务分类（电商变现）
    await flush()
    const filteredCards = host.querySelectorAll('.omnimux-skill-card')
    assert.ok(filteredCards.length > 0 && filteredCards.length < 69, '点击分类胶囊后数量减少')

    // 6. 点击卡片触发指令预填与激活态
    const useBtn = filteredCards[0].querySelector('.omnimux-skill-card-btn')
    assert.ok(useBtn, '技能卡片上必须有调用按钮')
    assert.ok(useBtn.textContent.includes('skills.card.use') || useBtn.textContent.includes('使用 Skill'), '按钮文案必须对应使用技能/Skill')
    await click(useBtn)
    await flush()

    assert.ok(appliedPrompt.includes('使用技能'), '必须通过 onApplyPrompt 预填技能指令')
    assert.equal(useBtn.getAttribute('aria-pressed'), 'true', '点击后卡片按钮状态为 pressed')
    assert.ok(filteredCards[0].classList.contains('is-active'), '点击后技能卡片具备 is-active 样式')

    // 7. 再次点击同一技能卡片归还/取消接管
    await click(useBtn)
    await flush()
    assert.equal(useBtn.getAttribute('aria-pressed'), 'false', '再次点击后取消 pressed')
    assert.equal(filteredCards[0].classList.contains('is-active'), false, '再次点击后移除 is-active')

    await act(async () => root.unmount())
  } finally {
    env.restore()
  }
})
