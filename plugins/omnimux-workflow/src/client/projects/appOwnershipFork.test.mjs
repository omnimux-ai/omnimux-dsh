import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  isAppOwnedByUser,
  getPresetWorkflowSnapshot,
  wrapNodesInGroup,
  createProjectForkFromManifest,
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
      assert.equal(createdTitle, '手机与网页交互实机演示_副本')
      assert.equal(res.project.id, 'proj_fork_999')
      assert.equal(res.workspaceId, 'ws_fork_999')
      assert.ok(res.groupId.startsWith('group_'))

      assert.equal(savedWorkspaceId, 'ws_fork_999')
      assert.ok(savedPayload && Array.isArray(savedPayload.nodes))
      const groupNode = savedPayload.nodes.find((n) => n.type === 'group')
      assert.ok(groupNode, '必须包含外层工作流容器 GroupNode')
      assert.equal(groupNode.data.title, '手机与网页交互实机演示_副本')
    })

    it('当前项目已存在时复制创作页而不是新建项目', async () => {
      const manifest = {
        appId: 'app-creatify-app-demo',
        metadata: { name: '手机与网页交互实机演示' },
      }
      let createdProject = 0
      let createdPageTitle = ''
      const mockDeps = {
        hostProject: {
          id: 'proj_current',
          activePageId: 'page-1',
          pages: [{ id: 'page-1', canvasWorkspaceId: 'ws_host' }],
          canvasWorkspaceIds: ['ws_host'],
        },
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
        requestFn: async () => ({ ok: true, body: {} }),
      }
      const res = await createProjectForkFromManifest(manifest, mockDeps)
      assert.equal(createdProject, 0)
      assert.equal(createdPageTitle, '手机与网页交互实机演示_副本')
      assert.equal(res.workspaceId, 'ws_copy')
      assert.equal(res.project.id, 'proj_current')
      assert.equal(res.page.id, 'page-copy')
    })
  })
})
