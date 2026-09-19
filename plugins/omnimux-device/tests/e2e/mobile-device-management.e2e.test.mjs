import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '../../')

test('E2E: 验证手机管理 (omnimux-device) 正式接入主界面侧边栏与全幅工作台', async () => {
  // 1. 验证 plugins.registry.json 中包含 omnimux-device 一级应用配置
  const registryPath = path.join(root, 'plugins.registry.json')
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'))
  const deviceApp = (registry.plugins || registry).find(item => item.id === 'omnimux-device')
  assert.ok(deviceApp, 'plugins.registry.json 中必须注册 omnimux-device 一级应用')
  assert.equal(deviceApp.name, 'omnimux-device')
  assert.equal(deviceApp.tier, 'tier-1-app')
  assert.deepEqual(deviceApp.capabilities.slots, [
    { target: 'sidebar.extra', componentPath: 'src/client/sidebar-entry.js' },
    { target: 'shell.overlay', componentPath: 'src/client/DeviceStage.jsx' }
  ])

  // 2. 验证插件 manifest 声明双插槽
  const manifestPath = path.join(root, 'plugins/omnimux-device/dsh.manifest.json')
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  assert.equal(manifest.id, 'omnimux-device')
  assert.ok(manifest.capabilities.slots.some(s => s.target === 'sidebar.extra'))
  assert.ok(manifest.capabilities.slots.some(s => s.target === 'shell.overlay'))

  // 3. 验证 sidebar-entry.js 中名称为「手机管理」且 rank 为 3.5
  const sidebarEntryPath = path.join(root, 'plugins/omnimux-device/src/client/sidebar-entry.js')
  const sidebarContent = fs.readFileSync(sidebarEntryPath, 'utf8')
  assert.match(sidebarContent, /手机管理/, '侧边栏入口文本必须为「手机管理」')
  assert.match(sidebarContent, /rank:\s*3\.5/, '侧边栏入口 rank 必须定为 3.5')
  assert.match(sidebarContent, /data-omnimux-device-entry/, '必须包含标准 datasetKey')

  // 4. 验证焦点决策状态机 focus-state.js 包含标题回退映射
  const focusStatePath = path.join(root, 'plugins/omnimux/src/client/workbench/focus-state.js')
  const focusContent = fs.readFileSync(focusStatePath, 'utf8')
  assert.match(focusContent, /'omnimux-device:library':\s*'手机管理'/, '必须包含手机管理工作台标题回退映射')

  // 5. 验证互斥路由表 conversation-box.js 包含 Stage 样式映射
  const convBoxPath = path.join(root, 'plugins/omnimux/src/client/conversation-box.js')
  const convContent = fs.readFileSync(convBoxPath, 'utf8')
  assert.match(convContent, /'omnimux-device':\s*'omnimux-device-stage'/, '必须包含手机管理 Stage 根样式类映射')

  // 6. 验证侧边栏契约 sidebar-extra-entries.md 包含手机管理行
  const contractPath = path.join(root, 'docs/contracts/sidebar-extra-entries.md')
  const contractContent = fs.readFileSync(contractPath, 'utf8')
  assert.match(contractContent, /\[data-omnimux-device-entry\]/, '侧边栏规范文档中必须登记手机管理入口')

  // 7. 验证打包产物 lib/client.js 真实存在且包含 ModuleLoader 容器
  const clientBundlePath = path.join(root, 'plugins/omnimux-device/lib/client.js')
  assert.ok(fs.existsSync(clientBundlePath), '必须成功编译生成 lib/client.js')
  const bundleContent = fs.readFileSync(clientBundlePath, 'utf8')
  assert.match(bundleContent, /window\.__ModuleLoader__\.load/, '必须包裹在 ModuleLoader 容器中')
})
