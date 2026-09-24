import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  isAppOwnedByUser,
  getPresetWorkflowSnapshot,
  wrapNodesInGroup,
  createProjectForkFromManifest,
  friendlyForkError,
} from './appLibrary.js'

describe('appOwnershipFork: 应用所有权与副本创建流程', () => {
  describe('isAppOwnedByUser 应用归属判定', () => {
    it('官方预置应用（OmniMux Official）一律判定为非当前用户', () => {
      const manifest = {
        appId: 'app-creatify-app-demo',
        metadata: {
          name: '手机与网页交互实机演示',
          author: 'OmniMux Official',
        },
      }
      assert.equal(isAppOwnedByUser(manifest, [{ id: 'proj_1' }]), false)
    })

    it('官方 Creatify 预置前缀应用判定为非当前用户', () => {
      const manifest = {
        appId: 'app-creatify-3d-cute-vfx',
        metadata: {
          name: '3D 视效粒子',
        },
      }
      assert.equal(isAppOwnedByUser(manifest, [{ id: 'proj_1' }]), false)
    })

    it('本地未找到对应工程项目的应用判定为非当前用户', () => {
      const manifest = {
        appId: 'app_user_custom_001',
        metadata: {
          name: '外部导入应用',
        },
        workflowBinding: {
          projectId: 'proj_non_existent',
          workspaceId: 'ws_foreign',
        },
      }
      const projects = [{ id: 'proj_local_100', canvasWorkspaceIds: ['ws_local_100'] }]
      assert.equal(isAppOwnedByUser(manifest, projects), false)
    })

    it('本地存在所属项目的用户自建应用判定为同一个用户', () => {
      const manifest = {
        appId: 'app_user_custom_002',
        metadata: {
          name: '我的自建视频生成器',
          author: 'Creator',
        },
        workflowBinding: {
          projectId: 'proj_my_own',
          workspaceId: 'ws_my_canvas',
          sourceGroupId: 'group_abc',
        },
      }
      const projects = [
        {
          id: 'proj_my_own',
          canvasWorkspaceIds: ['ws_my_canvas'],
          title: '我的视频工程',
        },
      ]
      assert.equal(isAppOwnedByUser(manifest, projects), true)
    })
  })

  describe('getPresetWorkflowSnapshot 预置拓扑解析', () => {
    it('成功读取手机与网页交互实机演示等 7 个预置应用的工作流拓扑', () => {
      const appIds = [
        'app-creatify-3d-cute-vfx',
        'app-creatify-app-demo',
        'app-creatify-apparel-tryon',
        'app-creatify-chasing-product',
        'app-creatify-fall-down-durability',
        'app-creatify-product-spotlight',
        'app-creatify-ugc-selfie',
      ]
      for (const id of appIds) {
        const snapshot = getPresetWorkflowSnapshot(id)
        assert.ok(snapshot, `预置工作流 ${id} 必须存在`)
        assert.ok(Array.isArray(snapshot.nodes) && snapshot.nodes.length >= 4, `${id} 节点数应大于等于4`)
        assert.ok(Array.isArray(snapshot.edges) && snapshot.edges.length >= 2, `${id} 连线数应大于等于2`)
      }
    })

    it('未知应用返回 null', () => {
      assert.equal(getPresetWorkflowSnapshot('app_unknown_xxx'), null)
    })
  })

  describe('wrapNodesInGroup 工作流打组算法', () => {
    it('空节点安全返回空拓扑', () => {
      const res = wrapNodesInGroup([], [])
      assert.deepEqual(res, { groupId: '', nodes: [], edges: [] })
    })

    it('多节点自动生成外层 GroupNode 并转为相对坐标', () => {
      const rawNodes = [
        { id: 'node_1', position: { x: 100, y: 100 }, width: 240, height: 160 },
        { id: 'node_2', position: { x: 450, y: 200 }, width: 260, height: 180 },
      ]
      const rawEdges = [{ id: 'e1', source: 'node_1', target: 'node_2' }]

      const { groupId, nodes, edges } = wrapNodesInGroup(rawNodes, rawEdges, '演示组 (副本)')
      assert.ok(groupId.startsWith('group_'))
      assert.equal(nodes.length, 3, '包含 1 个 GroupNode + 2 个子节点')

      const group = nodes.find((n) => n.id === groupId)
      assert.ok(group)
      assert.equal(group.type, 'group')
      assert.equal(group.data.title, '演示组 (副本)')
      assert.ok(group.width >= 610)
      assert.ok(group.height >= 280)

      const children = nodes.filter((n) => n.id !== groupId)
      for (const child of children) {
        assert.equal(child.parentId, groupId, '子节点必须指向 group parentId')
        assert.equal(child.extent, 'parent')
        assert.ok(child.position.x >= 0)
        assert.ok(child.position.y >= 0)
      }
      assert.deepEqual(edges, rawEdges)
    })

    it('已有 GroupNode 时直接复用并更新标题', () => {
      const rawNodes = [
        { id: 'existing_grp', type: 'group', data: { title: '原工作流' } },
        { id: 'child_1', parentId: 'existing_grp' },
      ]
      const { groupId, nodes } = wrapNodesInGroup(rawNodes, [], '新工作流 (副本)')
      assert.equal(groupId, 'existing_grp')
      assert.equal(nodes.find((n) => n.id === groupId).data.title, '新工作流 (副本)')
    })
  })

  describe('createProjectForkFromManifest 创建副本全流程', () => {
    it('为预置应用创建独立项目工程与打组工作区', async () => {
      const manifest = {
        appId: 'app-creatify-app-demo',
        metadata: {
          name: '手机与网页交互实机演示',
          category: 'video',
        },
      }

      let createdTitle = ''
      let savedWorkspaceId = ''
      let savedPayload = null

      const mockDeps = {
        createProjectFn: async (title) => {
          createdTitle = title
          return {
            ok: true,
            status: 200,
            body: {
              project: {
                id: 'proj_fork_999',
                title,
                canvasWorkspaceIds: ['ws_fork_999'],
                sessionId: 'sess_fork_999',
              },
            },
          }
        },
        requestFn: async (url, opts) => {
          savedWorkspaceId = url.split('/').pop()
          savedPayload = opts.body
          return { ok: true, status: 200, body: { success: true } }
        },
      }

      const res = await createProjectForkFromManifest(manifest, mockDeps)
      assert.equal(createdTitle, '手机与网页交互实机演示 (副本)')
      assert.equal(res.project.id, 'proj_fork_999')
      assert.equal(res.workspaceId, 'ws_fork_999')
      assert.ok(res.groupId.startsWith('group_'))

      assert.equal(savedWorkspaceId, 'ws_fork_999')
      assert.ok(savedPayload && Array.isArray(savedPayload.nodes))
      assert.equal(savedPayload.expectedVersion, 0, '保存画布必须显式携带 expectedVersion: 0 避免 version-required 拦截')
      const groupNode = savedPayload.nodes.find((n) => n.type === 'group')
      assert.ok(groupNode, '必须包含外层工作流容器 GroupNode')
      assert.equal(groupNode.data.title, '手机与网页交互实机演示 (副本)')
    })

    it('支持自定义 projectTitle 和自选工作区 projectRoot', async () => {
      const manifest = {
        appId: 'app-creatify-app-demo',
        metadata: { name: '手机与网页交互实机演示' },
      }
      let passedTitle = ''
      let passedRoot = ''
      let savedExpectedVersion = null
      let initedWorkspaceId = ''
      const mockDeps = {
        createProjectFn: async (title, _sid, root) => {
          passedTitle = title
          passedRoot = root
          return {
            ok: true,
            status: 200,
            body: {
              project: {
                id: 'proj_custom_root',
                title,
                path: root,
                canvasWorkspaceIds: ['ws_custom'],
              },
            },
          }
        },
        requestFn: async (url, opts) => {
          if (url.includes('/api/workspaces/') && (!opts || !opts.method || opts.method === 'GET')) {
            return { ok: false, status: 404, body: { error: 'workspace-not-found' } }
          }
          if (url.endsWith('/api/workspaces') && opts.method === 'POST') {
            initedWorkspaceId = opts.body?.id
            return { ok: true, status: 200, body: { workspace: { id: opts.body?.id } } }
          }
          savedExpectedVersion = opts.body?.expectedVersion
          return { ok: true, status: 200, body: { success: true } }
        },
        projectTitle: '我的自定义项目名',
        projectRoot: '/Users/x/MyWorkspaces/CustomDir',
      }

      const res = await createProjectForkFromManifest(manifest, mockDeps)
      assert.equal(passedTitle, '我的自定义项目名')
      assert.equal(passedRoot, '/Users/x/MyWorkspaces/CustomDir')
      assert.equal(initedWorkspaceId, 'ws_custom', '新建独立项目前必须先 POST /api/workspaces 初始化空白画布物理快照')
      assert.equal(savedExpectedVersion, 0, '新建独立项目保存画布必须携带 expectedVersion: 0')
      assert.equal(res.project.id, 'proj_custom_root')
    })

    it('当前项目已存在时复制创作页并支持自定义 pageTitle', async () => {
      const manifest = {
        appId: 'app-creatify-app-demo',
        metadata: { name: '手机与网页交互实机演示' },
      }
      let createdProject = 0
      let createdPageTitle = ''
      let savedGroupTitle = ''
      const mockDeps = {
        hostProject: {
          id: 'proj_current',
          activePageId: 'page-1',
          pages: [{ id: 'page-1', canvasWorkspaceId: 'ws_host' }],
          canvasWorkspaceIds: ['ws_host'],
        },
        pageTitle: '自定义专属创作页',
        createProjectFn: async () => {
          createdProject += 1
          return { ok: false }
        },
        createPageFn: async (_canvasId, title) => {
          createdPageTitle = title
          return {
            ok: true,
            body: {
              page: { id: 'page-copy', canvasWorkspaceId: 'ws_copy' },
              project: { id: 'proj_current' },
            },
          }
        },
        requestFn: async (_url, opts) => {
          const group = opts.body?.nodes?.find((n) => n.type === 'group')
          savedGroupTitle = group?.data?.title
          return { ok: true, body: {} }
        },
      }
      const res = await createProjectForkFromManifest(manifest, mockDeps)
      assert.equal(createdProject, 0)
      assert.equal(createdPageTitle, '自定义专属创作页')
      assert.equal(savedGroupTitle, '自定义专属创作页')
      assert.equal(res.workspaceId, 'ws_copy')
      assert.equal(res.project.id, 'proj_current')
      assert.equal(res.page.id, 'page-copy')
    })
  })

  describe('friendlyForkError 错误码大白话转译', () => {
    it('正确将所有已知英文错误码转译为大白话中文', () => {
      assert.equal(friendlyForkError('workspace-not-found'), '未找到工程画布，请重试')
      assert.equal(friendlyForkError('version-required'), '画布版本号缺失，请重试')
      assert.equal(friendlyForkError('version_conflict'), '画布版本冲突，请重试')
      assert.equal(friendlyForkError('project-exists'), '该工作区已存在同名工程，请微调名称')
      assert.equal(friendlyForkError('project-required'), '需要关联项目工程，请重试')
      assert.equal(friendlyForkError('invalid-project-root'), '工作区目录路径无效，请重新选择')
      assert.equal(friendlyForkError('not-local'), '禁止跨域写入本地工作区')
      assert.equal(friendlyForkError('internal'), '服务器内部处理异常，请重试')
    })

    it('未知英文代号或单词英文自动回退至默认中文提示', () => {
      assert.equal(friendlyForkError('unknown-code', '默认失败提示'), '默认失败提示')
      assert.equal(friendlyForkError('some_error_code', '默认失败提示'), '默认失败提示')
      assert.equal(friendlyForkError('panic', '默认失败提示'), '默认失败提示')
    })

    it('自然中文提示与空输入处理', () => {
      assert.equal(friendlyForkError('磁盘空间不足'), '磁盘空间不足')
      assert.equal(friendlyForkError('', '操作失败兜底'), '操作失败兜底')
      assert.equal(friendlyForkError(null, '操作失败兜底'), '操作失败兜底')
    })
  })
})
