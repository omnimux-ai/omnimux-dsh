/**
 * E2E: AI 应用编辑、副本创建与发布项目库闭环端到端验证
 *
 * 覆盖规格 specs/app-edit-and-fork-workflow.spec.md 的五大核心场景：
 * 1. 标题栏布局重构：标题右侧紧跟应用描述；
 * 2. 右上角「编辑应用」入口按钮与矢量图标呈现；
 * 3. 官方预置应用或外部应用自适应创建副本与工作流打组容器；
 * 4. 同一用户自建应用直接跳转源工程画布与工作流组定位；
 * 5. 编辑完成后重新打包发布，在「项目」库的「AI 应用」列表中实时可见。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  isAppOwnedByUser,
  getPresetWorkflowSnapshot,
  wrapNodesInGroup,
  createProjectForkFromManifest,
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

test('E2E: 场景 1 & 2 - 应用详情页 Header 标题右侧紧跟描述，右上角新增「编辑应用」入口', () => {
  const mockManifest = {
    appId: 'app-creatify-app-demo',
    version: '1.0.0',
    metadata: {
      name: '手机与网页交互实机演示',
      category: 'video',
      description: '适用于 SaaS 界面穿屏、手机 App 操作流程实录与软件出海推广',
    },
    formSchema: {
      type: 'object',
      properties: {
        product_image: {
          type: 'string',
          title: '商品主图 / 白底图',
        },
      },
      required: ['product_image'],
    },
  }

  const html = renderToStaticMarkup(
    React.createElement(AppTab, { manifest: mockManifest }),
  )

  // 1. 验证标题、分类与版本号
  assert.ok(html.includes('手机与网页交互实机演示'), '必须包含应用标题')
  assert.ok(html.includes('视频应用'), '必须包含分类徽标')
  assert.ok(html.includes('v1.0.0'), '必须包含版本号')

  // 2. 验证描述文字位于左侧 Header 内部紧跟标题右侧
  assert.ok(
    html.includes('class="omx-apptab-desc" title="适用于 SaaS 界面穿屏、手机 App 操作流程实录与软件出海推广"'),
    '描述必须出现在标题右侧的 omx-apptab-desc 容器内并附带 tooltip',
  )

  // 3. 验证右上角「编辑应用」入口按钮与矢量图标
  assert.ok(html.includes('class="omx-apptab-header-right"'), '必须包含 Header 右侧操作区')
  assert.ok(html.includes('class="omx-apptab-edit-btn"'), '必须包含编辑应用按钮')
  assert.ok(html.includes('编辑应用'), '按钮文案必须清晰展示「编辑应用」')
  assert.ok(html.includes('class="omx-apptab-edit-icon"'), '按钮必须包含矢量编辑图标')
})

test('E2E: 场景 3 & 4 - 应用归属自适应分诊、副本创建与工作流组打包', async () => {
  // 3a. 官方应用分诊：判定为非当前用户，触发创建副本
  const officialManifest = {
    appId: 'app-creatify-app-demo',
    version: '1.0.0',
    metadata: {
      name: '手机与网页交互实机演示',
      category: 'video',
      author: 'OmniMux Official',
    },
  }
  const userProjects = [
    { id: 'proj_user_1', title: '用户自己的项目', canvasWorkspaceIds: ['ws_user_1'] },
  ]
  assert.equal(isAppOwnedByUser(officialManifest, userProjects), false, '官方应用必须判定为非当前用户')

  // 3b. 模拟创建副本全链路
  let createdProjectTitle = ''
  let writtenWorkspaceId = ''
  let writtenCanvasPayload = null
  let preInitedWorkspaceId = ''

  const mockDeps = {
    createProjectFn: async (title) => {
      createdProjectTitle = title
      return {
        ok: true,
        status: 200,
        body: {
          project: {
            id: 'proj_fork_demo',
            title,
            canvasWorkspaceIds: ['ws_fork_demo'],
          },
        },
      }
    },
    requestFn: async (url, opts) => {
      if (url.includes('/api/workspaces/') && (!opts || !opts.method || opts.method === 'GET')) {
        return { ok: false, status: 404, body: { error: 'workspace-not-found' } }
      }
      if (url.endsWith('/api/workspaces') && opts.method === 'POST') {
        preInitedWorkspaceId = opts.body?.id
        return { ok: true, status: 200, body: { workspace: { id: opts.body?.id } } }
      }
      writtenWorkspaceId = url.split('/').pop()
      writtenCanvasPayload = opts.body
      return { ok: true, status: 200, body: { success: true } }
    },
  }

  const forkResult = await createProjectForkFromManifest(officialManifest, mockDeps)

  // 验证副本工程与工作区生成
  assert.equal(createdProjectTitle, '手机与网页交互实机演示 (副本)')
  assert.equal(forkResult.project.id, 'proj_fork_demo')
  assert.equal(forkResult.workspaceId, 'ws_fork_demo')
  assert.equal(preInitedWorkspaceId, 'ws_fork_demo', '必须在保存画布前执行 POST /api/workspaces 初始化空白快照')
  assert.equal(writtenWorkspaceId, 'ws_fork_demo')

  // 验证工作流节点打组容器 (GroupNode)
  assert.ok(writtenCanvasPayload, '必须写入画布数据')
  assert.equal(writtenCanvasPayload.expectedVersion, 0, '保存画布必须显式携带 expectedVersion: 0 杜绝 version-required 拦截')
  const groupNode = writtenCanvasPayload.nodes.find((n) => n.type === 'group')
  assert.ok(groupNode, '副本必须自动生成工作流组容器 GroupNode')
  assert.equal(groupNode.data.title, '手机与网页交互实机演示 (副本)')
  assert.equal(groupNode.id, forkResult.groupId)

  // 验证子节点与组的归属关系
  const childNodes = writtenCanvasPayload.nodes.filter((n) => n.id !== groupNode.id)
  assert.ok(childNodes.length >= 4, '子节点数应完整继承预置工作流')
  for (const child of childNodes) {
    assert.equal(child.parentId, groupNode.id, '子节点 parentId 必须指向该组')
    assert.equal(child.extent, 'parent', '子节点边界限制在组内')
  }

  // 3c. 用户自建应用分诊：判定为同一个用户，可直接编辑
  const ownedManifest = {
    appId: 'app_my_custom_app',
    version: '1.0.0',
    metadata: {
      name: '我的私人定制应用',
    },
    workflowBinding: {
      projectId: 'proj_user_1',
      workspaceId: 'ws_user_1',
      sourceGroupId: 'grp_001',
    },
  }
  assert.equal(isAppOwnedByUser(ownedManifest, userProjects), true, '本地所属工程存在的自建应用必须判定为同一个用户')
})

test('E2E: 场景 5 - 副本修改后重新打包发布，在「项目」库的「AI 应用」中实时可见', () => {
  // 内存模拟 localStorage
  const storageMap = new Map()
  const mockStorage = {
    getItem: (k) => storageMap.get(k) || null,
    setItem: (k, v) => storageMap.set(k, String(v)),
  }

  // 模拟发布向导打包完成，生成新应用 manifest 并落盘
  const newlyPublishedManifest = {
    appId: 'app_fork_published_101',
    version: '1.0.0',
    createdAt: new Date().toISOString(),
    metadata: {
      name: '手机与网页交互实机演示 (我的定制版)',
      category: 'video',
      description: '基于官方预置应用副本修改后的自定义生成应用',
      coverUrl: 'https://example.com/cover.png',
    },
    workflowBinding: {
      projectId: 'proj_fork_demo',
      workspaceId: 'ws_fork_demo',
      sourceGroupId: 'group_fork_101',
      snapshot: {
        nodes: [{ id: 'n1' }, { id: 'n2' }],
        edges: [],
      },
    },
    formSchema: {
      type: 'object',
      properties: {
        product_image: { type: 'string', title: '主图' },
      },
      required: ['product_image'],
    },
  }

  // 写入存储（与向导完全相同的存储键）
  mockStorage.setItem(
    APP_MANIFESTS_STORAGE_KEY,
    JSON.stringify({ [newlyPublishedManifest.appId]: newlyPublishedManifest }),
  )

  // 验证项目库 AI 应用列表读取能力
  const appsInLibrary = listPublishedApps(mockStorage)
  assert.equal(appsInLibrary.length, 1, '项目库 AI 应用列表中必须可见刚发布的新应用')
  const publishedApp = appsInLibrary[0]
  assert.equal(publishedApp.appId, 'app_fork_published_101')
  assert.equal(publishedApp.name, '手机与网页交互实机演示 (我的定制版)')
  assert.equal(publishedApp.category, 'video')
  assert.equal(publishedApp.projectId, 'proj_fork_demo')
  assert.equal(publishedApp.groupId, 'group_fork_101')
})

test('E2E: 场景 6 - ForkAppProjectDialog 弹窗支持追加创作页与自选工作区新建项目', async () => {
  const dialogBuild = await build({
    entryPoints: [new URL('../src/client/projects/ForkAppProjectDialog.jsx', import.meta.url).pathname],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    external: ['react', 'react-dom', 'dsh-ui-kit', '@deepseek-ai/dsh-client-ui-primitives', 'lucide-react'],
  })

  const dialogModule = { exports: {} }
  new Function('require', 'module', 'exports', dialogBuild.outputFiles[0].text)(
    require,
    dialogModule,
    dialogModule.exports,
  )
  const { ForkAppProjectDialog } = dialogModule.exports
  assert.ok(ForkAppProjectDialog, '必须成功导出 ForkAppProjectDialog')

  const manifest = {
    metadata: { name: '爆款商品实拍' },
  }
  const hostProject = {
    id: 'proj_current',
    title: '我的视频主项目',
  }

  // 1. 静态渲染验证组件无语法或未定义引用报错
  const html = renderToStaticMarkup(
    React.createElement(ForkAppProjectDialog, {
      manifest,
      hostProject,
      initialPath: '/Users/x/Projects/Current',
      onCancel() {},
      onSubmit() {},
    }),
  )

  assert.ok(html.includes('创建应用编辑副本'), '必须包含弹窗标题')
  assert.ok(html.includes('加入当前项目'), '有当前项目时必须展示加入当前项目选项')
  assert.ok(html.includes('新建独立项目'), '必须展示新建独立项目选项')
  assert.ok(html.includes('新创作页名称'), '有当前项目时显式标注为新创作页名称')
  assert.ok(html.includes('将在当前项目「我的视频主项目」中追加一张新画布'), '包含清晰的项目内追加说明')
  assert.ok(html.includes('爆款商品实拍_副本'), '有当前项目时默认预填创作页副本名')

  // 2. 验证未建项独立项目场景下的显式标签与意图说明
  const htmlNoHost = renderToStaticMarkup(
    React.createElement(ForkAppProjectDialog, {
      manifest,
      hostProject: null,
      initialPath: '/Users/x/Projects/Current',
      onCancel() {},
      onSubmit() {},
    }),
  )
  assert.ok(htmlNoHost.includes('项目显示名称'), '未建项时显式标注为项目显示名称')
  assert.ok(htmlNoHost.includes('不会在电脑硬盘中新建或重命名物理文件夹'), '包含明确的物理文件夹不新建说明')
  assert.ok(htmlNoHost.includes('存放工作区目录'), '明确提示这是工作区目录而非新物理文件夹')
})

test('E2E: 场景 7 - 官方预设工程与历史遗留拓扑在副本创建时自愈连线 Handle (out/in) 且模型层级与卡槽合规 (Issue #2648)', async () => {
  // 1. 验证官方预设 app-creatify-app-demo 的连线全部为 sourceHandle: 'out' / targetHandle: 'in'
  const presetSnapshot = getPresetWorkflowSnapshot('app-creatify-app-demo')
  assert.ok(presetSnapshot, '预设工作流必须存在')
  for (const edge of presetSnapshot.edges) {
    assert.equal(edge.sourceHandle, 'out', `预设连线 ${edge.id} 必须为 sourceHandle: 'out'`)
    assert.equal(edge.targetHandle, 'in', `预设连线 ${edge.id} 必须为 targetHandle: 'in'`)
  }
  const videoGen = presetSnapshot.nodes.find((n) => n.id === 'node-video-generation-core')
  assert.ok(videoGen)
  assert.equal(videoGen.data.params?.model, 'seedance-2.0', '预设视频生成节点必须包含 params.model')

  // 2. 模拟克隆副本：传入缺失 Handle / targetHandle 为 image 的脏数据拓扑
  const dirtyManifest = {
    appId: 'app_dirty_test',
    metadata: { name: '脏数据历史应用' },
    workflowBinding: {
      snapshot: {
        nodes: [
          { id: 'n_slot', data: { isSlot: true, label: '主图' } },
          { id: 'n_gen', data: { model: 'seedance-2.0', params: { duration: 5 } } },
        ],
        edges: [
          { id: 'e_dirty', source: 'n_slot', target: 'n_gen', targetHandle: 'image' },
        ],
      },
    },
  }

  let capturedNodes = null
  let capturedEdges = null
  const mockDeps = {
    createProjectFn: async (title) => ({
      ok: true,
      status: 200,
      body: { project: { id: 'proj_clean', title, canvasWorkspaceIds: ['ws_clean'] } },
    }),
    requestFn: async (url, opts) => {
      if (url.includes('/api/workspaces/') && opts?.method === 'PUT') {
        capturedNodes = opts.body.nodes
        capturedEdges = opts.body.edges
      }
      return { ok: true, status: 200, body: { success: true } }
    },
  }

  await createProjectForkFromManifest(dirtyManifest, mockDeps)
  assert.ok(capturedNodes && capturedEdges)

  // 验证连线自愈：sourceHandle: 'out', targetHandle: 'in', targetSlot: 'first_frame'
  const healedEdge = capturedEdges.find((e) => e.id === 'e_dirty')
  assert.ok(healedEdge)
  assert.equal(healedEdge.sourceHandle, 'out')
  assert.equal(healedEdge.targetHandle, 'in')
  assert.equal(healedEdge.data?.targetSlot, 'first_frame')

  // 验证节点自愈：params.model 补齐，slot 补齐 nodeKind: 'import' / selectedTool: 'import' / status: 'completed'
  const healedGen = capturedNodes.find((n) => n.id === 'n_gen')
  assert.equal(healedGen.data.params.model, 'seedance-2.0')
  const healedSlot = capturedNodes.find((n) => n.id === 'n_slot')
  assert.equal(healedSlot.data.nodeKind, 'import')
  assert.equal(healedSlot.data.selectedTool, 'import')
  assert.equal(healedSlot.data.status, 'completed')
})

