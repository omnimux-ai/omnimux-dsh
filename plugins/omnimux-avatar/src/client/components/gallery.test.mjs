// 画廊半页的 1:1 不变量：只读组件源码文本，不需要 DOM。
//
// 这些断言挑选的都是「改错了也不会被其他测试发现」的契约：
// 按钮不得互相嵌套、套用按钮的禁用条件、pending 排首位、不伪造百分比、
// 失败图标不是字符、下载只认绝对地址、客户端只能依赖 react、不得出现原生 select 或 emoji。
//
// 本文件自身是 Node 测试（因此允许 import node: 内置模块），
// 浏览器安全约束只对组件源码生效，扫描时显式排除 *.test.*。

import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

const read = (name) => readFileSync(join(here, name), 'utf8')

const presetGrid = read('ExplorePresetGrid.jsx')
const presetDialog = read('PresetPreviewDialog.jsx')
const feedGrid = read('FeedGrid.jsx')
const taskCard = read('TaskCard.jsx')
const mvBadge = read('MultiViewBadge.jsx')
const mvDialog = read('MultiViewDialog.jsx')
const skeleton = read('HistorySkeleton.jsx')

/** 本次交付的 7 个组件。 */
const DELIVERED = [
  'ExplorePresetGrid.jsx',
  'PresetPreviewDialog.jsx',
  'FeedGrid.jsx',
  'TaskCard.jsx',
  'MultiViewBadge.jsx',
  'MultiViewDialog.jsx',
  'HistorySkeleton.jsx',
]

/**
 * 目录下全部组件源码（排除测试自身）。
 * 用目录枚举而不是写死清单：同目录还有并行工作流的组件，边界规则对它们同样生效。
 */
const ALL_SOURCES = readdirSync(here)
  .filter((name) => /\.(jsx|js|mjs)$/.test(name) && !/\.test\./.test(name))
  .sort()

/**
 * 去掉注释后再扫描。
 * 注释里出现 `<select>` 或颜色字面量是说明文字，不是用法——仓库自带的 UI 门禁同样跳过注释行。
 */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '')
}

/** 统计子串出现次数。 */
function countOf(source, needle) {
  let count = 0
  let index = source.indexOf(needle)
  while (index !== -1) {
    count += 1
    index = source.indexOf(needle, index + needle.length)
  }
  return count
}

describe('ExplorePresetGrid：预览与套用是两个兄弟按钮', () => {
  it('卡片里恰好两个按钮，且没有任何按钮嵌在另一个按钮里', () => {
    assert.equal(countOf(presetGrid, '<button'), 2)

    const firstOpen = presetGrid.indexOf('<button')
    const firstClose = presetGrid.indexOf('</button>')
    assert.ok(firstOpen !== -1 && firstClose > firstOpen, '预览按钮应当先闭合')

    const insideFirst = presetGrid.slice(firstOpen + '<button'.length, firstClose)
    assert.ok(!insideFirst.includes('<button'), '预览按钮内部不得嵌套按钮')
  })

  it('预览图在首个 </button> 之前，套用胶囊在它之后（兄弟而非嵌套）', () => {
    const firstClose = presetGrid.indexOf('</button>')
    const image = presetGrid.indexOf('<img')
    const secondOpen = presetGrid.indexOf('<button', presetGrid.indexOf('<button') + 1)

    assert.ok(image !== -1 && image < firstClose, '预览图应在预览按钮内')
    assert.ok(secondOpen > firstClose, '套用胶囊应在预览按钮闭合之后')
  })

  it('空态、瀑布流列数与触屏兜底齐备', () => {
    assert.match(presetGrid, /omx-avatar-preset-grid/)
    assert.match(presetGrid, /--avatar-preset-columns/)
    assert.match(presetGrid, /暂无预设/)
    assert.match(presetGrid, /灵感预设当前不可用/)
    assert.match(presetGrid, /matchMedia\('\(hover: none\)'\)/)
  })
})

describe('PresetPreviewDialog：套用按钮的禁用条件与告警行', () => {
  it('canApply 为假时禁用「套用」并渲染 role=status 的告警行', () => {
    assert.match(presetDialog, /const canApply = useMemo\(/)
    assert.match(presetDialog, /resolvePresetSelection\(preset, taxonomy\)/)
    assert.match(presetDialog, /disabled=\{!canApply\}/)
    assert.match(presetDialog, /role='status'/)
    assert.match(presetDialog, /预设设置正在更新，请稍后再试。/)
  })

  it('无预设时返回 null，且切预设会重置视图模式', () => {
    assert.match(presetDialog, /if \(!preset\) return null/)
    assert.match(presetDialog, /setActualSize\(false\)/)
    assert.match(presetDialog, /aria-pressed=\{actualSize\}/)
    assert.match(presetDialog, /适应视图/)
    assert.match(presetDialog, /原始尺寸/)
  })

  it('模态契约：dialog 角色、Escape 关闭、遮罩关闭、焦点陷阱', () => {
    assert.match(presetDialog, /role='dialog'/)
    assert.match(presetDialog, /aria-modal='true'/)
    assert.match(presetDialog, /event\.key === 'Escape'/)
    assert.match(presetDialog, /event\.target === event\.currentTarget/)
    assert.match(presetDialog, /panel\.querySelector\(FOCUSABLE\)/)
  })
})

describe('FeedGrid：去重顺序与自动分页守卫', () => {
  it('pending 排在列表最前，去重走 taskKey', () => {
    const pendingBranch = feedGrid.indexOf('if (pending)')
    const loop = feedGrid.indexOf('for (const task of')
    assert.ok(pendingBranch !== -1, '应当有 pending 优先分支')
    assert.ok(loop !== -1 && pendingBranch < loop, 'pending 必须先于历史列表入列')
    assert.match(feedGrid, /taskKey\(/)
    assert.match(feedGrid, /seen\.has\(key\)/)
  })

  it('守卫 IntersectionObserver，并按 240px 提前量只触发一次', () => {
    assert.match(feedGrid, /typeof IntersectionObserver !== 'undefined'/)
    assert.match(feedGrid, /LOAD_MORE_MARGIN = '240px 0px'/)
    assert.match(feedGrid, /rootMargin: LOAD_MORE_MARGIN/)
    assert.match(feedGrid, /if \(!armed\) continue/)
  })

  it('网格类名指向真实存在的插件类，且断点没有列数回退', () => {
    const gridConst = /export const GRID_CLASSES =\s*'([^']+)'/.exec(feedGrid)
    const timelineConst = /export const TIMELINE_CLASSES =\s*'([^']+)'/.exec(feedGrid)
    assert.ok(gridConst && timelineConst, '两套网格类名常量都应当存在')
    // 源工作台用的是 Tailwind 工具类，本插件不带 Tailwind；若沿用那些字符串，
    // 历史画廊会塌成一列。这里断言两个常量是插件自己的类名。
    assert.equal(gridConst[1], 'omx-avatar-feed-grid')
    assert.equal(timelineConst[1], 'omx-avatar-feed-timeline')
    assert.ok(!gridConst[1].includes('md:grid-cols-2'), 'md 断点不得比 sm 少列')
    // 更强的检查：这两个类必须在 styles.js 里真的定义了列数/窄栏规则，
    // 否则「类名存在」只是又一次把惰性字符串当实现。
    const styles = readFileSync(join(here, '..', 'styles.js'), 'utf8')
    assert.match(styles, /\.omx-avatar-feed-grid\s*\{[^}]*grid-template-columns/)
    assert.match(styles, /\.omx-avatar-feed-timeline\s*\{[^}]*max-width:\s*340px/)
    // 断点语义与源一致：sm 3 列 / xl 4 列 / 2xl 5 列。
    assert.equal((styles.match(/\.omx-avatar-feed-grid\s*\{/g) ?? []).length, 4)
  })

  it('分页尾部的四种状态与空态文案都在', () => {
    assert.match(feedGrid, /正在加载更多…/)
    assert.match(feedGrid, /加载历史失败/)
    assert.match(feedGrid, /没有更多记录了/)
    assert.match(feedGrid, /这里还没有内容/)
    assert.match(feedGrid, /在左侧选好设定后点生成，或点随机来一个形象/)
  })

  it('骨架复用同一套网格类名', () => {
    assert.match(skeleton, /GRID_CLASSES, TIMELINE_CLASSES/)
    assert.match(skeleton, /正在加载历史…/)
    assert.match(skeleton, /role='status'/)
  })
})

describe('TaskCard：图片兜底与进度不造假', () => {
  it('图片有 onError 兜底并落到「预览不可用」占位', () => {
    assert.match(taskCard, /onError=\{\(\) => setImageFailed\(true\)\}/)
    assert.match(taskCard, /预览不可用/)
    assert.match(taskCard, /is-loaded/)
    assert.match(taskCard, /loading='lazy'/)
    assert.match(taskCard, /decoding='async'/)
  })

  it('进度条宽度只由真实进度推导，没有编造的百分比', () => {
    assert.ok(!taskCard.includes('Math.random'), '不得用随机数编造进度')
    assert.match(taskCard, /Math\.min\(progress, 100\)/)
    // 硬编码的百分比宽度（width: '80%' 这类）一律不许出现
    assert.doesNotMatch(taskCard, /(?:width|--[A-Za-z0-9-]+)\s*:\s*['"]?\d+(?:\.\d+)?%/)
  })

  it('失败原因与重试按钮齐备，重试先阻断冒泡', () => {
    assert.match(taskCard, /fail_reason \|\| t\('生成失败'\)/)
    assert.match(taskCard, /event\.stopPropagation\(\)/)
    assert.match(taskCard, /omx-avatar-fail/)
    assert.match(taskCard, /'排队中'/)
    assert.match(taskCard, /'生成中'/)
  })

  it('状态归一同时认上游与适配层两种拼法', () => {
    assert.match(taskCard, /upper === 'SUCCESS' \|\| lower === 'succeeded'/)
    assert.match(taskCard, /upper === 'FAILURE' \|\| lower === 'failed'/)
    assert.match(taskCard, /upper === 'QUEUED' \|\| upper === 'SUBMITTED' \|\| upper === 'NOT_START'/)
  })

  it('只有成品卡片可点，键盘激活绑定 Enter 与空格', () => {
    assert.match(taskCard, /const clickable = state === 'done' && Boolean\(image\)/)
    assert.match(taskCard, /event\.key !== 'Enter' && event\.key !== ' '/)
    assert.match(taskCard, /role=\{clickable \? 'button' : undefined\}/)
  })
})

describe('MultiViewBadge：缺省态、冒泡与矢量失败图标', () => {
  it('absent 直接返回 null', () => {
    assert.match(mvBadge, /if \(state === 'absent'\) return null/)
  })

  it('打开动作先 stopPropagation', () => {
    assert.match(mvBadge, /event\.stopPropagation\(\)/)
    assert.match(mvBadge, /onOpen\(\)/)
  })

  it('失败图标是矢量 SVG，不含 ! 字符', () => {
    assert.ok(!mvBadge.includes('>!<'), '不得用 ! 字符充当图标')
    assert.match(mvBadge, /omx-avatar-mv-fail[\s\S]{0,120}<AlertIcon \/>/)
    assert.match(mvBadge, /function AlertIcon\(\)[\s\S]{0,320}<svg/)
  })

  it('状态类名与可访问名按状态派生', () => {
    assert.match(mvBadge, /omx-avatar-mv-tile--\$\{state\}/)
    assert.match(mvBadge, /查看多视角/)
    assert.match(mvBadge, /多视角生成失败/)
    assert.match(mvBadge, /正在生成多视角设定板…/)
  })

  it('没有真实百分比时不显示数字', () => {
    assert.match(mvBadge, /hasRealProgress \? `\$\{progress\}%` : t\('生成中'\)/)
    assert.match(mvBadge, /--avatar-mv-progress/)
  })
})

describe('MultiViewDialog：只把绝对地址当下载目标', () => {
  it('下载链接要求 http(s) 绝对地址，相对地址一律不提供', () => {
    assert.ok(
      mvDialog.includes('const download = absolute && /^https?:\\/\\//i.test(absolute) ? absolute : null'),
      '应当就地校验绝对地址'
    )
    assert.match(mvDialog, /\{download \? \(/)
    assert.match(mvDialog, /rel='noreferrer'/)
  })

  it('四种状态与页脚动作齐备', () => {
    assert.match(mvDialog, /重新生成/)
    assert.match(mvDialog, /disabled=\{regenerating\}/)
    assert.match(mvDialog, /删除/)
    assert.match(mvDialog, /这里还没有内容/)
    assert.match(mvDialog, /omx-avatar-mv-panel/)
    assert.match(mvDialog, /omx-avatar-mv-empty/)
    assert.match(mvDialog, /if \(!open\) return null/)
  })
})

describe('客户端源码边界：只依赖 react，无原生 select，无 emoji', () => {
  it('本次交付的 7 个组件都在目录里', () => {
    for (const name of DELIVERED) {
      assert.ok(ALL_SOURCES.includes(name), `缺少组件 ${name}`)
    }
  })

  it('组件目录下每个文件都只 import react 或相对模块', () => {
    const NODE_BUILTINS = new Set([
      'assert', 'buffer', 'child_process', 'crypto', 'events', 'fs', 'http', 'https',
      'os', 'path', 'process', 'stream', 'url', 'util', 'zlib',
    ])

    for (const name of ALL_SOURCES) {
      const source = stripComments(read(name))
      const specifiers = [...source.matchAll(/from\s*['"]([^'"]+)['"]/g)].map((m) => m[1])
      for (const specifier of specifiers) {
        assert.ok(!specifier.startsWith('node:'), `${name} 不得引入 Node 内置模块 ${specifier}`)
        assert.ok(!NODE_BUILTINS.has(specifier), `${name} 不得引入 Node 内置模块 ${specifier}`)
        assert.notEqual(specifier, 'axios', `${name} 不得引入 axios`)
        const allowed = specifier === 'react' || specifier.startsWith('./') || specifier.startsWith('../')
        assert.ok(allowed, `${name} 只允许依赖 react 或相对模块，实际为 ${specifier}`)
      }
    }
  })

  it('没有原生 select 标签，也没有 emoji 充当图标', () => {
    for (const name of ALL_SOURCES) {
      const source = stripComments(read(name))
      assert.ok(!source.includes('<select'), `${name} 不得使用原生 select`)
      const emoji = source.match(/\p{Extended_Pictographic}/u)
      assert.equal(emoji, null, `${name} 不得使用 emoji：${emoji ? emoji[0] : ''}`)
    }
  })

  it('没有裸色字面量，颜色只能来自类或官方 token', () => {
    for (const name of ALL_SOURCES) {
      const source = stripComments(read(name))
      // 去掉 SVG 行与 var(...) 回退值后再找裸色
      const stripped = source
        .split('\n')
        .filter((line) => !/<svg|<path|<circle|<rect|xmlns=/i.test(line))
        .join('\n')
        .replace(/var\s*\([^()]*(?:\([^()]*\)[^()]*)*\)/g, '')
      assert.doesNotMatch(stripped, /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/, `${name} 存在裸色`)
      assert.doesNotMatch(stripped, /\brgba?\s*\(/i, `${name} 存在裸色`)
    }
  })
})
