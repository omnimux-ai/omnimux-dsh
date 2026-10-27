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
    // 重试的语义是「重新生成」，入口在预览窗里；失败卡自身不再给重试键，
    // 否则用户分不清它重试的是提交还是生成（源提交 45e3cb853 / 28b84c633）。
    assert.match(taskCard, /const failView = state === 'failed' \? describeFailReason\(t, task\?\.fail_reason\) : null/)
    assert.match(taskCard, /<FailReasonDetail view=\{failView\} t=\{t\} \/>/)
    assert.match(taskCard, /omx-avatar-fail/)
    assert.match(taskCard, /'排队中'/)
    assert.match(taskCard, /'生成中'/)
    // 负向断言：失败卡内不得再出现重试按钮，也不得直接消费 onRetry。
    assert.doesNotMatch(taskCard, /t\('重试'\)/)
    assert.doesNotMatch(taskCard, /onRetry\(task\)/)
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

describe('MultiViewDialog：支持受管本地下载且保持外链安全', () => {
  it('本地链接必须为角色任务入口，外链仍要求http(s)', () => {
    assert.match(mvDialog, /startsWith\('\/api\/omnimux\/avatar\/task\/image\?'/)
    assert.match(mvDialog, /const download = local \?\?/)
    assert.ok(mvDialog.includes('absolute && /^https?:\\/\\//i.test(absolute)'), '应当校验外链绝对地址')
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

// ── 本轮新增：失败详情、进行中上传卡、预览只读分镜 ─────────────────────
//
// 这几条都挑选「改错了不会被其它测试发现」的契约：
// 失败卡不许再给重试、未知错误不许被吞、进行中卡片的三态各自可辨、
// 预览里的分镜只读且绝不触发分析。

const pendingCard = read('PendingUploadCard.jsx')
const failDetail = read('FailReasonDetail.jsx')
const previewDialog = read('TaskPreviewDialog.jsx')

describe('TaskCard 失败态：中文原因 + 详情入口，没有重试', () => {
  it('失败卡渲染解析后的中文原因，并把原文交给详情组件', () => {
    assert.match(taskCard, /const failView = state === 'failed' \? describeFailReason\(t, task\?\.fail_reason\) : null/)
    assert.match(taskCard, /<p className='omx-avatar-fail'>\{failView\.message\}<\/p>/)
    assert.match(taskCard, /<FailReasonDetail view=\{failView\} t=\{t\} \/>/)
  })

  it('失败卡不再有重试按钮，也不再消费 onRetry', () => {
    assert.ok(!taskCard.includes("t('重试')"), '失败卡不得再出现「重试」按钮')
    assert.ok(!taskCard.includes('onRetry(task)'), '失败卡不得直接调用 onRetry')
    const { onRetry, ...rest } = { onRetry: 1, viewMode: 2, child: 3 }
    assert.ok(onRetry && rest, '重试入口只留在调用方，卡片不消费')
  })
})

describe('FailReasonDetail：中文主文案 + 原文可展开，未知错误不吞', () => {
  it('已中文化的原因原样作主文案，且不给多余详情', () => {
    assert.match(failDetail, /const CJK = \/\[\\u3400-\\u9fff\\uf900-\\ufaff\]\//)
    assert.match(failDetail, /if \(CJK\.test\(text\)\) return \{ message: text, raw: text, showDetail: false, kind: 'known' \}/)
  })

  it('未知文本落到通用中文主文案，原文完整保留在详情里', () => {
    assert.match(failDetail, /return \{ message: t\(GENERIC_KEY\), raw: text, showDetail: true, kind: 'unknown' \}/)
    assert.match(failDetail, /const GENERIC_KEY = '生成失败，请重试'/)
    // 原文区块必须真的渲染 raw，而不是再翻译一层。
    assert.match(failDetail, /\{view\.raw\}/)
  })

  it('详情入口是 disclosure：aria-expanded 随开关变化，且不冒泡到卡片点击', () => {
    assert.match(failDetail, /aria-expanded=\{open\}/)
    assert.match(failDetail, /event\.stopPropagation\(\)/)
    assert.match(failDetail, /if \(!view\?\.showDetail\) return null/)
  })

  it('已知英文原因都有中文对照，且不把英文当主文案', () => {
    for (const zh of ['生成超时，请重新生成', '上游任务不存在', '查询上游任务状态失败', '获取渠道信息失败']) {
      assert.ok(failDetail.includes(zh), `缺少中文原因 ${zh}`)
    }
    assert.match(failDetail, /const KNOWN_REASONS = \[/)
  })
})

describe('PendingUploadCard：三态各自可辨，状态只落在卡片自身', () => {
  it('三态各自的状态文案齐备，且只来自 locales', () => {
    assert.match(pendingCard, /t\('上传中'\)/)
    assert.match(pendingCard, /t\('上传失败'\)/)
    assert.match(pendingCard, /t\('已完成'\)/)
    assert.match(pendingCard, /t\('重试上传'\)/)
  })

  it('状态经 data-state 落在卡片自身，不在外层重复', () => {
    assert.match(pendingCard, /data-state=\{state\}/)
    assert.match(pendingCard, /aria-busy=\{state === 'uploading'\}/)
    // 只有失败态才给重试与移除：上传中给重试会把「还没结束」说成「失败」。
    assert.match(pendingCard, /\{state === 'error' \? \(/)
  })

  it('没有真实进度就不画进度条，也不编百分比', () => {
    assert.ok(!pendingCard.includes('Math.random'), '不得用随机数编造进度')
    assert.match(pendingCard, /Number\.isFinite\(progress\) \? Math\.max\(0, Math\.min\(100, Math\.round\(progress\)\)\) : null/)
    assert.match(pendingCard, /\{state === 'uploading' && pct !== null \? \(/)
  })

  it('图标是内联矢量 SVG，没有字符或 emoji 充当图标', () => {
    assert.match(pendingCard, /function UploadingIcon\(\)[\s\S]{0,320}<svg/)
    assert.match(pendingCard, /function DoneIcon\(\)[\s\S]{0,320}<svg/)
    assert.match(pendingCard, /function FailIcon\(\)[\s\S]{0,320}<svg/)
    assert.ok(!pendingCard.includes('>✓<'), '不得用 ✓ 字符充当图标')
    assert.equal(pendingCard.match(/\p{Extended_Pictographic}/u), null)
  })
})

describe('TaskPreviewDialog：分镜只读，绝不触发分析', () => {
  it('只从任务记录读已落库的拆解，不发任何请求', () => {
    assert.match(previewDialog, /export function readTaskRecreate\(task\)/)
    assert.ok(!/\bfetch\b/.test(previewDialog), '预览不得发网络请求')
    assert.ok(!previewDialog.includes('analyzeRecreate'), '预览不得触发重新分析')
    assert.ok(!/import .*api\.js/.test(previewDialog), '预览不得引入 api 层')
  })

  it('落库路径认 input.recreate 并兼容顶层，分镜为空即不渲染', () => {
    assert.match(previewDialog, /const source = input\.recreate \?\? input/)
    assert.match(previewDialog, /if \(!shots\.length\) return null/)
  })

  it('分镜用服务端确认的五个字段渲染，缺字段就不显示那一段', () => {
    assert.match(previewDialog, /shot\?\.start_s/)
    assert.match(previewDialog, /shot\?\.end_s/)
    assert.match(previewDialog, /shot\?\.shot_id/)
    assert.match(previewDialog, /shot\?\.shot_size/)
    assert.match(previewDialog, /shot\?\.narrative_job/)
  })

  it('没有重新分析入口，也没有「不可复用」提示', () => {
    assert.ok(!previewDialog.includes('重新分析'), '分镜只读，不得给重新分析入口')
    assert.ok(!previewDialog.includes('不可复用'), '不得保留「不可复用」提示')
    assert.ok(!previewDialog.includes('cannot be reused'), '不得保留英文版不可复用提示')
  })

  it('拆解区块有可访问名，列表语义是 ol', () => {
    assert.match(previewDialog, /aria-label=\{t\('分镜拆解'\)\}/)
    assert.match(previewDialog, /<ol className='omx-avatar-shot-list'>/)
  })
})
