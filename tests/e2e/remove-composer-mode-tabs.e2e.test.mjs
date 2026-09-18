import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '../../')

test('E2E: 验证新建会话彻底移除 Agent / 营销 / 短剧 三个模式切换 Tab 胶囊栏', () => {
  const tabsPath = path.join(root, 'plugins/omnimux/src/client/composer-mode/ComposerModeTabs.jsx')
  const tabsContent = fs.readFileSync(tabsPath, 'utf-8')

  // 1. 验证组件彻底返回 null，不再向页面渲染 Tab 切换栏
  assert.ok(
    tabsContent.includes('return null'),
    'ComposerModeTabs 必须始终返回 null，确保新建会话及任何阶段均不渲染'
  )

  // 2. 验证不再探测与挂载至 heroMount
  assert.ok(
    !tabsContent.includes('createPortal(content'),
    '不得再使用 createPortal 挂载胶囊栏'
  )

  // 3. 验证存在清理残留锚点节点的机制
  assert.ok(
    tabsContent.includes('omnimux-composer-mode-anchor'),
    '必须包含对 omnimux-composer-mode-anchor 锚点节点的安全清理'
  )
})
