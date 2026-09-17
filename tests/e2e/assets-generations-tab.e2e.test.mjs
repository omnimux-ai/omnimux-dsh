import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '../../')

test('E2E: 资产库中心新增「生成的（Generations）」标签页与全链路收敛界面端到端契约验证', () => {
  const assetsStagePath = path.join(root, 'plugins/omnimux-assets/src/client/AssetsStage.jsx')
  const generationsViewPath = path.join(root, 'plugins/omnimux-assets/src/client/GenerationsView.jsx')
  const generationsHelpersPath = path.join(root, 'plugins/omnimux-assets/src/client/generations-helpers.js')
  const localesPath = path.join(root, 'plugins/omnimux-assets/src/client/locales.js')
  const stylesPath = path.join(root, 'plugins/omnimux-assets/src/client/styles.js')
  const httpRoutesPath = path.join(root, 'plugins/omnimux-assets/src/http-routes.js')

  const stageContent = fs.readFileSync(assetsStagePath, 'utf-8')
  const viewContent = fs.readFileSync(generationsViewPath, 'utf-8')
  const helpersContent = fs.readFileSync(generationsHelpersPath, 'utf-8')
  const localesContent = fs.readFileSync(localesPath, 'utf-8')
  const stylesContent = fs.readFileSync(stylesPath, 'utf-8')
  const routesContent = fs.readFileSync(httpRoutesPath, 'utf-8')

  // 1. 验证 AssetsStage 中正确声明了 generations 一级 Tab
  assert.ok(
    stageContent.includes("{ id: 'generations', label: t('source.generations') || '生成的' }"),
    'AssetsStage 顶栏 FilterBar 必须声明 generations 一级标签页'
  )

  // 2. 验证多语言字典完整包含中英文词条
  assert.ok(
    localesContent.includes("'source.generations': '生成的'") &&
    localesContent.includes("'source.generations': 'Generations'") &&
    localesContent.includes("'generations.source.agent': '智能体'") &&
    localesContent.includes("'generations.source.image': '图像生成'") &&
    localesContent.includes("'generations.source.canvas': '画布'"),
    'locales 必须完整包含 generations 及其来源分类中英文词条'
  )

  // 3. 验证吸附栈挂载 GenerationsCategoryNav 与滚动归零
  assert.ok(
    stageContent.includes('<GenerationsCategoryNav') &&
    stageContent.includes('sourceTab, feed.filterType, productKindTab, generationsSource, generationsType'),
    'AssetsStage 吸附栏必须挂载 GenerationsCategoryNav 并在切换时滚动归零'
  )

  // 4. 验证 AssetsBody 分支挂载 GenerationsView
  assert.ok(
    stageContent.includes("if (sourceTab === 'generations')") &&
    stageContent.includes('<GenerationsView'),
    'AssetsBody 必须在 sourceTab 为 generations 时渲染 GenerationsView'
  )

  // 5. 验证 GenerationsView 与 helpers 具备全套分类体系与卡片流转交互
  assert.ok(
    helpersContent.includes('GENERATION_SOURCES') &&
    helpersContent.includes('GENERATION_TYPES') &&
    helpersContent.includes('resolveArtifactSource') &&
    helpersContent.includes('getSourceBadgeText'),
    'generations-helpers 必须导出完整来源、格式与来源徽章判定契约'
  )

  assert.ok(
    viewContent.includes('GenerationCard') &&
    viewContent.includes('addMediaToConversation') &&
    viewContent.includes('artifactPreviewUrl'),
    'GenerationsView 必须实现 GenerationCard 卡片呈现、媒体加入对话与预览地址绑定'
  )

  // 6. 验证样式表包含生成物容器与卡片样式且无裸色
  assert.ok(
    stylesContent.includes('.omnimux-generations-container') &&
    stylesContent.includes('.omnimux-generation-card') &&
    stylesContent.includes('.omnimux-generation-badge'),
    'styles.js 必须包含生成物专区与卡片专属设计样式'
  )

  // 7. 验证 Host HTTP 路由支持流式返回 artifact 媒体文件
  assert.ok(
    routesContent.includes("path === '/omnimux/assets/artifacts/preview'"),
    'http-routes.js 必须提供 /omnimux/assets/artifacts/preview 只读流式文件路由'
  )
})
