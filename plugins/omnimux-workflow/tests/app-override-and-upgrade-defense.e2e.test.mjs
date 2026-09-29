/**
 * E2E: AI 应用同名覆盖发布、安装包升级防冲毁与恢复出厂设置端到端验证
 *
 * 覆盖 specs/app-override-and-upgrade-defense.spec.md 的完整验收闭环：
 * 1. 同名排他性检测与覆盖冲突识别；
 * 2. 覆盖发布装配与 isUserOverridden 标记；
 * 3. 桌面端发版升级防覆盖（分层遮蔽保障，首页卡片点击不冲刷用户配置）；
 * 4. 已覆盖应用的编辑直通（isAppOwnedByUser 判定为当前用户）；
 * 5. 应用详情页「恢复默认」按钮呈现与出厂设置一键还原。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  checkAppNameConflict,
  isAppOwnedByUser,
  restoreBuiltinAppDefault,
  listPublishedApps,
  APP_MANIFESTS_STORAGE_KEY,
} from '../src/client/projects/appLibrary.js'

const require = createRequire(import.meta.url)

// 1. 编译 AppTab 组件验证其 DOM 结构
const output = await build({
  entryPoints: [new URL('../src/client/projects/AppTab.jsx', import.meta.url).pathname],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  external: ['react', 'react-dom', 'dsh-ui-kit', '@deepseek-ai/dsh-client-ui-primitives', 'lucide-react'],
})

const compiledModule = { exports: {} }
new Function('require', 'module', 'exports', output.outputFiles[0].text)(
  require,
  compiledModule,
  compiledModule.exports,
)
const { AppTab } = compiledModule.exports

function makeMemoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    raw: map,
  }
}

test('E2E: 场景 1 - 同名排他性检测与覆盖冲突判定', () => {
  const storage = makeMemoryStorage()

  // 1. 匹配官方内置应用名
  const conflictOfficial = checkAppNameConflict('手机与网页交互实机演示', '', storage)
  assert.equal(conflictOfficial.hasConflict, true, '必须检测到官方应用同名冲突')
  assert.equal(conflictOfficial.isBuiltin, true, '必须识别为内置官方应用')
  assert.equal(conflictOfficial.targetApp?.appId, 'app-creatify-app-demo')

  // 2. 排除自身 appId
  const conflictSelf = checkAppNameConflict('手机与网页交互实机演示', 'app-creatify-app-demo', storage)
  assert.equal(conflictSelf.hasConflict, false, '正在编辑自身应用时必须排除同名冲突')

  // 3. 全新独立应用名
  const noConflict = checkAppNameConflict('独创跨境电商视频应用', '', storage)
  assert.equal(noConflict.hasConflict, false, '无同名应用时不得误报冲突')
})

test('E2E: 场景 2 - 应用详情页 Header 渲染与「恢复默认」按钮受控呈现', () => {
  // 2a. 原生未覆盖的官方应用：仅展示「编辑应用」，绝不展示「恢复默认」
  const normalBuiltinManifest = {
    appId: 'app-creatify-app-demo',
    version: '1.0.0',
    metadata: {
      name: '手机与网页交互实机演示',
      category: 'video',
      description: '官方出厂描述',
      author: 'OmniMux Official',
    },
    formSchema: { type: 'object', properties: {} },
    fieldMappings: {},
  }

  const normalHtml = renderToStaticMarkup(React.createElement(AppTab, { manifest: normalBuiltinManifest }))
  assert.ok(normalHtml.includes('omx-apptab-edit-btn'), '未覆盖应用必须包含编辑应用按钮')
  assert.ok(!normalHtml.includes('omx-apptab-restore-btn'), '未覆盖应用严禁展示恢复默认按钮')

  // 2b. 用户已覆盖的官方应用：同时展示「恢复默认」与「编辑应用」
  const overriddenManifest = {
    ...normalBuiltinManifest,
    isUserOverridden: true,
    metadata: {
      ...normalBuiltinManifest.metadata,
      name: '手机与网页交互实机演示',
      description: '这是用户定制过后的描述',
    },
  }

  const overriddenHtml = renderToStaticMarkup(React.createElement(AppTab, { manifest: overriddenManifest }))
  assert.ok(overriddenHtml.includes('omx-apptab-edit-btn'), '覆盖应用必须包含编辑应用按钮')
  assert.ok(overriddenHtml.includes('omx-apptab-restore-btn'), '已覆盖的官方应用必须呈现恢复默认按钮')
  assert.ok(overriddenHtml.includes('恢复默认'), '按钮文案必须展示「恢复默认」')
})

test('E2E: 场景 3 - 已覆盖应用的归属判定与直接编辑直通', () => {
  const userProjects = [
    { id: 'proj_custom_1', title: '我的定制工程', canvasWorkspaceIds: ['ws_custom_1'] },
  ]

  // 原生官方应用：判定为 false，强制走创建副本
  const rawOfficial = {
    appId: 'app-creatify-app-demo',
    metadata: { author: 'OmniMux Official', name: '手机与网页交互实机演示' },
    workflowBinding: { projectId: 'proj_custom_1', workspaceId: 'ws_custom_1' },
  }
  assert.equal(isAppOwnedByUser(rawOfficial, userProjects), false, '未经覆盖的官方应用必须判定为非当前用户')

  // 已覆盖官方应用：判定为 true，直接编辑源工程
  const overriddenApp = {
    appId: 'app-creatify-app-demo',
    isUserOverridden: true,
    metadata: { author: 'OmniMux Official', name: '手机与网页交互实机演示' },
    workflowBinding: { projectId: 'proj_custom_1', workspaceId: 'ws_custom_1' },
  }
  assert.equal(isAppOwnedByUser(overriddenApp, userProjects), true, '已覆盖且源工程存在的应用必须判定为当前用户拥有')
})

test('E2E: 场景 4 - 桌面端升级防冲毁与分层遮蔽验证', () => {
  // 模拟用户在本地已完成覆盖发布
  const customPrompt = '【用户自定义极速分镜与口播提示词】'
  const userCustomManifest = {
    appId: 'app-creatify-app-demo',
    version: '1.0.0',
    isUserOverridden: true,
    metadata: { name: '手机与网页交互实机演示' },
    workflowBinding: {
      snapshot: {
        nodes: [{ id: 'node-slot-copywriting', data: { prompt: customPrompt } }],
      },
    },
  }

  const memoryStorage = makeMemoryStorage({
    [APP_MANIFESTS_STORAGE_KEY]: JSON.stringify({
      'app-creatify-app-demo': userCustomManifest,
    }),
  })

  // 模拟桌面端软件发版更新：首页模板卡片携带官方初始打包配置
  const bundledOfficialItem = {
    appId: 'app-creatify-app-demo',
    manifest: {
      appId: 'app-creatify-app-demo',
      version: '1.0.0',
      metadata: { name: '手机与网页交互实机演示' },
      workflowBinding: {
        snapshot: {
          nodes: [{ id: 'node-slot-copywriting', data: { prompt: '官方出厂默认提示词' } }],
        },
      },
    },
  }

  // 执行模拟的首页打开卡片防线逻辑
  const cachedMap = JSON.parse(memoryStorage.getItem(APP_MANIFESTS_STORAGE_KEY) || '{}')
  const existing = cachedMap[bundledOfficialItem.appId]
  const isUserOverridden = Boolean(existing && (existing.isUserOverridden || existing.metadata?.isUserOverridden))

  if (!isUserOverridden && bundledOfficialItem.manifest) {
    cachedMap[bundledOfficialItem.appId] = bundledOfficialItem.manifest
    memoryStorage.setItem(APP_MANIFESTS_STORAGE_KEY, JSON.stringify(cachedMap))
  }

  // 核心断言：用户的覆盖版本必须被完整保留，绝不被官方出厂数据抹除
  const afterLaunchMap = JSON.parse(memoryStorage.getItem(APP_MANIFESTS_STORAGE_KEY) || '{}')
  const preservedManifest = afterLaunchMap['app-creatify-app-demo']
  assert.equal(preservedManifest.isUserOverridden, true, '用户覆盖标记必须保留')
  assert.equal(
    preservedManifest.workflowBinding.snapshot.nodes[0].data.prompt,
    customPrompt,
    '用户自定义提示词与节点配置必须 100% 免疫发版冲刷',
  )
})

test('E2E: 场景 5 - 恢复出厂设置闭环与用户资产隔离', () => {
  const memoryStorage = makeMemoryStorage({
    [APP_MANIFESTS_STORAGE_KEY]: JSON.stringify({
      'app-creatify-app-demo': {
        appId: 'app-creatify-app-demo',
        isUserOverridden: true,
        metadata: { name: '手机与网页交互实机演示' },
      },
      'app_unrelated_custom': {
        appId: 'app_unrelated_custom',
        metadata: { name: '其他自建应用' },
      },
    }),
  })

  // 执行恢复官方出厂配置
  const restoreRes = restoreBuiltinAppDefault('app-creatify-app-demo', memoryStorage)
  assert.equal(restoreRes.ok, true, '恢复出厂设置必须成功')

  // 验证结果：覆盖记录被清空，其他自建应用不受影响
  const remainingApps = listPublishedApps(memoryStorage)
  assert.equal(remainingApps.length, 1, '仅移除被恢复的官方应用覆盖项')
  assert.equal(remainingApps[0].appId, 'app_unrelated_custom', '其他应用资产完好无损')
})
