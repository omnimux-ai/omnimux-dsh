import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '../../')

test('E2E: 灵感库导入生成中复用创作画布有机微光折射动效与中心极简纯净化验证', () => {
  const cardPath = path.join(root, 'plugins/omnimux-inspiration/src/client/InspirationCoverCard.jsx')
  const shimmerPath = path.join(root, 'plugins/omnimux-inspiration/src/client/OrganicShimmer.jsx')
  const stylesPath = path.join(root, 'plugins/omnimux-inspiration/src/client/styles.js')

  const cardContent = fs.readFileSync(cardPath, 'utf-8')
  const shimmerContent = fs.readFileSync(shimmerPath, 'utf-8')
  const stylesContent = fs.readFileSync(stylesPath, 'utf-8')

  // 1. 验证卡片引入并挂载创作画布同款 OrganicShimmerOverlay
  assert.ok(
    cardContent.includes("import { OrganicShimmerOverlay } from './OrganicShimmer.jsx'"),
    'InspirationCoverCard 必须引入 OrganicShimmerOverlay 组件',
  )
  assert.ok(
    cardContent.includes("{importing ? <OrganicShimmerOverlay /> : null}"),
    '处于 importing 状态时必须挂载 OrganicShimmerOverlay 流光动效',
  )

  // 2. 验证中间区域文本与按钮彻底移除（仅在 failed 时才显示状态药丸，且非 importing 时才呈现 fallback）
  assert.ok(
    cardContent.includes("{failed && statusPill ? ("),
    '状态文本胶囊仅在 failed 失败状态下展示，生成中状态彻底移除中间文本胶囊',
  )
  assert.ok(
    cardContent.includes("{importing ? null : usesVideoFrame ? ("),
    '处于 importing 状态时不挂载中间占位播放图标与长链接',
  )
  assert.ok(
    cardContent.includes("className={`omnimux-inspiration-card-pure ${importing ? 'is-importing' : ''}`}"),
    'MediaCard 容器在 importing 态必须打上 is-importing 标识',
  )

  // 3. 验证 OrganicShimmer 组件包含完整的五大层级结构
  assert.ok(
    shimmerContent.includes('className="wf-organic-shimmer__canvas"') &&
    shimmerContent.includes('className="wf-organic-shimmer__field"') &&
    shimmerContent.includes('className="wf-organic-shimmer__distortion"') &&
    shimmerContent.includes('className="wf-organic-shimmer__glow-layer"') &&
    shimmerContent.includes('className="wf-organic-shimmer__glow-deep"') &&
    shimmerContent.includes('className="wf-organic-shimmer__glow-mid"') &&
    shimmerContent.includes('className="wf-organic-shimmer__glow-border"') &&
    shimmerContent.includes('className="wf-organic-shimmer__mask"'),
    'OrganicShimmerOverlay 必须包含光谱场、液体湍流折射层、三层发光系统与动态同步过渡遮罩层',
  )

  // 4. 验证 styles.js 包含 4000ms 往返平移动画与 Organic Shimmer 变量体系
  assert.ok(
    stylesContent.includes('@keyframes wf-organic-shimmer-sweep'),
    'styles.js 必须声明 @keyframes wf-organic-shimmer-sweep 动画',
  )
  assert.ok(
    stylesContent.includes('--wf-shimmer-dur: 4000ms;') &&
    stylesContent.includes('--wf-shimmer-direction: alternate;'),
    '必须声明 4000ms 匀速往返 alternate 动画变量体系',
  )
  assert.ok(
    stylesContent.includes('.omnimux-inspiration-card-pure.is-importing .omnimux-inspiration-card-overlay {\n  display: none;\n}'),
    '生成中状态下悬停遮罩层必须隐藏，保持纯净动效',
  )
})
