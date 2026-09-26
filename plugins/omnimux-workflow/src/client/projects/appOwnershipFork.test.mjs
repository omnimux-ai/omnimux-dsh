import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  isAppOwnedByUser,
  getPresetWorkflowSnapshot,
  normalizeWorkflowTopology,
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
    it('成功读取 10 个预置应用的工作流拓扑，且 Handle、模型与卡槽均严格合规', () => {
      const appIds = [
        'app-creatify-3d-cute-vfx',
        'app-creatify-app-demo',
        'app-creatify-apparel-tryon',
        'app-creatify-chasing-product',
        'app-creatify-fall-down-durability',
        'app-creatify-product-spotlight',
        'app-creatify-ugc-selfie',
        'app-builtin-product-video',
        'app-builtin-video-to-prompt',
        'app-builtin-viral-replication',
      ]
      for (const id of appIds) {
        const snapshot = getPresetWorkflowSnapshot(id)
        assert.ok(snapshot, `预置工作流 ${id} 必须存在`)
        if (id.startsWith('app-creatify-')) {
          assert.ok(Array.isArray(snapshot.nodes) && snapshot.nodes.length >= 3, `${id} 节点数应大于等于3`)
          assert.equal(snapshot.nodes.find(n => n.id === 'node-slot-voice-tts'), undefined, `${id} 预置快照中不得残留孤立声音槽节点`)
          assert.ok(Array.isArray(snapshot.edges) && snapshot.edges.length >= 2, `${id} 连线数应大于等于2`)
        } else {
          assert.ok(Array.isArray(snapshot.nodes) && snapshot.nodes.length >= 2, `${id} 节点数应大于等于2`)
          assert.ok(Array.isArray(snapshot.edges) && snapshot.edges.length >= 1, `${id} 连线数应大于等于1`)
        }

        // 1. 连线 Handle 合规性断言 (sourceHandle === 'out', targetHandle === 'in')
        for (const edge of snapshot.edges) {
          assert.equal(edge.sourceHandle, 'out', `${id} 连线 ${edge.id} 必须为 sourceHandle: 'out'`)
          assert.equal(edge.targetHandle, 'in', `${id} 连线 ${edge.id} 必须为 targetHandle: 'in'`)
        }

        // 2. 图像槽位连线挂载 targetSlot: 'first_frame'
        const imageEdges = snapshot.edges.filter((e) => e.source.includes('image'))
        for (const edge of imageEdges) {
          assert.equal(
            edge.data?.targetSlot,
            'first_frame',
            `${id} 的图像槽位连线 ${edge.id} 必须包含 targetSlot: 'first_frame'`
          )
        }

        // 针对参考视频槽位连线（node-slot-reference-video），不得携带非法 targetSlot
        const refVideoEdges = snapshot.edges.filter((e) => e.source === 'node-slot-reference-video')
        for (const edge of refVideoEdges) {
          assert.equal(edge.data?.targetSlot, undefined, `${id} 的参考视频连线不得携带非法 targetSlot`)
        }

        // 3. 生成节点 params.model 与 nodeKind/selectedTool 合规性
        for (const node of snapshot.nodes) {
          if (node.data?.model) {
            assert.equal(node.data.params?.model, node.data.model, `${id} 的生成节点 ${node.id} params.model 必须与 model 一致`)
            assert.equal(node.data.nodeKind, 'generate', `${id} 的生成节点 ${node.id} nodeKind 必须为 generate`)
            if (node.data?.materialType === 'text') {
              assert.equal(node.data.selectedTool, 'text-to-text', `${id} 的文本生成节点 ${node.id} selectedTool 必须为 text-to-text`)
            } else {
              assert.equal(node.data.selectedTool, 'omnimux_video_submit', `${id} 的生成节点 ${node.id} selectedTool 必须为 omnimux_video_submit`)
            }
          }
          if (node.data?.isSlot) {
            assert.equal(node.data.nodeKind, 'import', `${id} 的槽位节点 ${node.id} nodeKind 必须为 import`)
            assert.equal(node.data.selectedTool, 'import', `${id} 的槽位节点 ${node.id} selectedTool 必须为 import`)
            assert.equal(node.data.status, 'completed', `${id} 的槽位节点 ${node.id} status 必须为 completed`)
          }
        }
      }
    })

    it('app-builtin-product-video 卡槽坐标合理分离（自定义描述槽位位移至 y:350），避免与商品主图坐标重叠', () => {
      const snapshot = getPresetWorkflowSnapshot('app-builtin-product-video')
      assert.ok(snapshot)
      const imageSlot = snapshot.nodes.find((n) => n.id === 'node-slot-product-image')
      const briefSlot = snapshot.nodes.find((n) => n.id === 'node-slot-custom-brief')
      assert.ok(imageSlot, '必须包含商品主图槽位')
      assert.ok(briefSlot, '必须包含自定义描述槽位')
      assert.deepEqual(imageSlot.position, { x: 50, y: 100 })
      assert.deepEqual(briefSlot.position, { x: 50, y: 350 })
      assert.notDeepEqual(imageSlot.position, briefSlot.position)
    })

    it('app-builtin-video-to-prompt 分析核心生成节点修正为合法的 text-to-text 工具，严禁 prompt-template', () => {
      const snapshot = getPresetWorkflowSnapshot('app-builtin-video-to-prompt')
      assert.ok(snapshot)
      const analysisNode = snapshot.nodes.find((n) => n.id === 'node-prompt-analysis-core')
      assert.ok(analysisNode, '必须包含分析核心节点')
      assert.equal(analysisNode.data?.nodeKind, 'generate')
      assert.equal(analysisNode.data?.selectedTool, 'text-to-text')
      assert.equal(analysisNode.data?.tool, 'text-to-text')
      assert.equal(analysisNode.data?.materialType, 'text')
      assert.equal(analysisNode.data?.model, 'gemini-3.8-flash')
      assert.equal(analysisNode.data?.params?.model, 'gemini-3.8-flash')
      assert.notEqual(analysisNode.data?.selectedTool, 'prompt-template')
      assert.notEqual(analysisNode.data?.tool, 'prompt-template')
    })

    it('未知应用返回 null', () => {
      assert.equal(getPresetWorkflowSnapshot('app_unknown_xxx'), null)
    })
  })

  describe('normalizeWorkflowTopology 拓扑防御自愈归一化', () => {
    it('自动补齐缺失的 sourceHandle: out 与 targetHandle: in', () => {
      const rawEdges = [{ id: 'e1', source: 's1', target: 't1' }]
      const { edges } = normalizeWorkflowTopology([], rawEdges)
      assert.equal(edges[0].sourceHandle, 'out')
      assert.equal(edges[0].targetHandle, 'in')
    })

    it('将 targetHandle 为 image 的连线安全纠正为 in，并设置 targetSlot: first_frame', () => {
      const rawEdges = [
        { id: 'e_img', source: 'img_slot', target: 'gen_node', targetHandle: 'image' },
      ]
      const { edges } = normalizeWorkflowTopology([], rawEdges)
      assert.equal(edges[0].sourceHandle, 'out')
      assert.equal(edges[0].targetHandle, 'in')
      assert.equal(edges[0].data?.targetSlot, 'first_frame')
    })

    it('将其他非法 targetHandle（如 prompt）纠正为 in', () => {
      const rawEdges = [
        { id: 'e_prompt', source: 'prompt_slot', target: 'gen_node', targetHandle: 'prompt' },
      ]
      const { edges } = normalizeWorkflowTopology([], rawEdges)
      assert.equal(edges[0].sourceHandle, 'out')
      assert.equal(edges[0].targetHandle, 'in')
      assert.equal(edges[0].data?.targetSlot, undefined)
    })

    it('将历史别名 targetHandle: input 统一归一化为物理句柄 in，且不将 input 写入 targetSlot', () => {
      const rawEdges = [
        { id: 'e_input', source: 's1', target: 't1', targetHandle: 'input' },
        { id: 'e_input_with_slot', source: 's2', target: 't2', targetHandle: 'input', data: { targetSlot: 'first_frame' } },
      ]
      const { edges } = normalizeWorkflowTopology([], rawEdges)
      assert.equal(edges[0].sourceHandle, 'out')
      assert.equal(edges[0].targetHandle, 'in')
      assert.equal(edges[0].data?.targetSlot, undefined)

      assert.equal(edges[1].sourceHandle, 'out')
      assert.equal(edges[1].targetHandle, 'in')
      assert.equal(edges[1].data?.targetSlot, 'first_frame')
    })

    it('连线自愈语义：当 targetHandle 为合法原子卡槽名（如 end_frame, reference）纠正为 in 并保留 targetSlot 语义', () => {
      const rawEdges = [
        { id: 'e_end', source: 's1', target: 't1', targetHandle: 'end_frame' },
        { id: 'e_ref', source: 's2', target: 't1', targetHandle: 'reference' },
        { id: 'e_exist', source: 's3', target: 't1', targetHandle: 'end_frame', data: { targetSlot: 'custom_preserved' } },
      ]
      const { edges } = normalizeWorkflowTopology([], rawEdges)
      assert.equal(edges[0].targetHandle, 'in')
      assert.equal(edges[0].data?.targetSlot, 'end_frame')

      assert.equal(edges[1].targetHandle, 'in')
      assert.equal(edges[1].data?.targetSlot, 'reference')

      // 已显式提供 targetSlot 时不被覆盖
      assert.equal(edges[2].targetHandle, 'in')
      assert.equal(edges[2].data?.targetSlot, 'custom_preserved')
    })

    it('非严格别名 targetHandle（如 reference_image）不被误篡改为 first_frame，归一化为 in 且不设未定义的 targetSlot', () => {
      const rawEdges = [
        { id: 'e_ref_img', source: 's1', target: 't1', targetHandle: 'reference_image' },
        { id: 'e_ref_img_with_slot', source: 's2', target: 't2', targetHandle: 'reference_image', data: { targetSlot: 'reference' } },
      ]
      const { edges } = normalizeWorkflowTopology([], rawEdges)
      assert.equal(edges[0].targetHandle, 'in')
      assert.equal(edges[0].data?.targetSlot, undefined)

      assert.equal(edges[1].targetHandle, 'in')
      assert.equal(edges[1].data?.targetSlot, 'reference')
    })

    it('复合 Operation 代号（如 first_last_frame）已从白名单剔除，自愈后归一化为 in 且不设未定义的 targetSlot', () => {
      const rawEdges = [
        { id: 'e_fl', source: 's1', target: 't1', targetHandle: 'first_last_frame' },
      ]
      const { edges } = normalizeWorkflowTopology([], rawEdges)
      assert.equal(edges[0].targetHandle, 'in')
      assert.equal(edges[0].data?.targetSlot, undefined)
    })

    it('当连线已有 targetSlot: end_frame 时，旧 targetHandle: image 不得覆盖原有 targetSlot', () => {
      const rawEdges = [
        {
          id: 'e_preserve_slot',
          source: 's1',
          target: 't1',
          targetHandle: 'image',
          data: { targetSlot: 'end_frame' },
        },
      ]
      const { edges } = normalizeWorkflowTopology([], rawEdges)
      assert.equal(edges[0].targetHandle, 'in')
      assert.equal(edges[0].data?.targetSlot, 'end_frame')
    })

    it('未知 targetHandle（如 foo_bar）自愈后 targetHandle 为 in 且不写入 targetSlot', () => {
      const rawEdges = [
        {
          id: 'e_unknown_handle',
          source: 's1',
          target: 't1',
          targetHandle: 'foo_bar',
        },
        {
          id: 'e_unknown_handle_with_data',
          source: 's2',
          target: 't2',
          targetHandle: 'foo_bar',
          data: { customField: 42 },
        },
      ]
      const { edges } = normalizeWorkflowTopology([], rawEdges)
      assert.equal(edges[0].targetHandle, 'in')
      assert.equal(edges[0].data?.targetSlot, undefined)

      assert.equal(edges[1].targetHandle, 'in')
      assert.equal(edges[1].data?.targetSlot, undefined)
      assert.equal(edges[1].data?.customField, 42)
    })

    it('对 edge.data 进行普通对象校验，杜绝字符串、数组或非纯对象展开污染 nextEdge.data', () => {
      const rawEdges = [
        { id: 'e_str', source: 's1', target: 't1', data: 'malformed_string_data' },
        { id: 'e_arr', source: 's2', target: 't2', data: ['item1', 'item2'] },
        { id: 'e_valid', source: 's3', target: 't3', data: { safeField: true } },
      ]
      const { edges } = normalizeWorkflowTopology([], rawEdges)
      assert.equal(edges[0].data, undefined)
      assert.equal(edges[1].data, undefined)
      assert.deepEqual(edges[2].data, { safeField: true })
    })

    it('当 node.data.model 存在且 node.data.params.model 缺失时自动补全', () => {
      const rawNodes = [
        {
          id: 'n_gen',
          type: 'material',
          data: {
            model: 'seedance-2.0',
            params: { duration: 5, aspectRatio: '9:16' },
          },
        },
      ]
      const { nodes } = normalizeWorkflowTopology(rawNodes, [])
      assert.equal(nodes[0].data.params.model, 'seedance-2.0')
      assert.equal(nodes[0].data.params.duration, 5)
    })

    it('当 node.data.params 为字符串或数组等非纯对象时，补全 model 不产生数字索引脏数据', () => {
      const rawNodes = [
        {
          id: 'n_str_params',
          type: 'material',
          data: {
            model: 'seedance-2.0',
            params: 'corrupted_string_params',
          },
        },
        {
          id: 'n_arr_params',
          type: 'material',
          data: {
            model: 'seedance-2.0',
            params: ['bad', 'array', 'params'],
          },
        },
      ]
      const { nodes } = normalizeWorkflowTopology(rawNodes, [])
      assert.deepEqual(nodes[0].data.params, { model: 'seedance-2.0' })
      assert.equal(nodes[0].data.params['0'], undefined)

      assert.deepEqual(nodes[1].data.params, { model: 'seedance-2.0' })
      assert.equal(nodes[1].data.params['0'], undefined)
    })

    it('当 isSlot: true 且缺失 nodeKind 时自动补齐 nodeKind、selectedTool 与 status', () => {
      const rawNodes = [
        {
          id: 'n_slot',
          type: 'material',
          data: {
            isSlot: true,
            label: '商品槽位',
          },
        },
      ]
      const { nodes } = normalizeWorkflowTopology(rawNodes, [])
      assert.equal(nodes[0].data.nodeKind, 'import')
      assert.equal(nodes[0].data.selectedTool, 'import')
      assert.equal(nodes[0].data.status, 'completed')
    })

    it('当 looksLikeSlot 命中且 selectedTool !== import 时强制纠正为 import 并规范化 nodeKind 与 status', () => {
      const rawNodes = [
        {
          id: 'n_slot_dirty',
          type: 'material',
          data: {
            isSlot: true,
            nodeKind: 'custom',
            selectedTool: 'custom_uploader',
            status: 'pending',
          },
        },
        {
          id: 'node-slot-partial',
          type: 'material',
          data: {
            nodeKind: 'import',
            selectedTool: 'legacy_tool',
          },
        },
      ]
      const { nodes } = normalizeWorkflowTopology(rawNodes, [])
      assert.equal(nodes[0].data.nodeKind, 'import')
      assert.equal(nodes[0].data.selectedTool, 'import')
      assert.equal(nodes[0].data.status, 'completed')

      assert.equal(nodes[1].data.nodeKind, 'import')
      assert.equal(nodes[1].data.selectedTool, 'import')
      assert.equal(nodes[1].data.status, 'completed')
    })

    it('当 data.tool 为 import-image 或 prompt-template 时识别为 looksLikeSlot 并强制 status 为 completed', () => {
      const rawNodes = [
        {
          id: 'n_tool_img',
          type: 'material',
          data: {
            tool: 'import-image',
            status: 'pending',
          },
        },
        {
          id: 'n_tool_tpl',
          type: 'material',
          data: {
            tool: 'prompt-template',
            nodeKind: 'custom',
          },
        },
      ]
      const { nodes } = normalizeWorkflowTopology(rawNodes, [])
      assert.equal(nodes[0].data.nodeKind, 'import')
      assert.equal(nodes[0].data.selectedTool, 'import')
      assert.equal(nodes[0].data.status, 'completed')

      assert.equal(nodes[1].data.nodeKind, 'import')
      assert.equal(nodes[1].data.selectedTool, 'import')
      assert.equal(nodes[1].data.status, 'completed')
    })

    it('卡槽节点判定拓展：识别 slotRole 或 node-slot-* 前缀并补齐 nodeKind、selectedTool 与 status', () => {
      const rawNodes = [
        {
          id: 'node_custom_role',
          type: 'material',
          data: {
            slotRole: 'custom_brief',
            label: '角色定义槽位',
          },
        },
        {
          id: 'node-slot-dynamic',
          type: 'material',
          data: {
            label: 'ID前缀识别槽位',
          },
        },
      ]
      const { nodes } = normalizeWorkflowTopology(rawNodes, [])
      assert.equal(nodes[0].data.nodeKind, 'import')
      assert.equal(nodes[0].data.selectedTool, 'import')
      assert.equal(nodes[0].data.status, 'completed')

      assert.equal(nodes[1].data.nodeKind, 'import')
      assert.equal(nodes[1].data.selectedTool, 'import')
      assert.equal(nodes[1].data.status, 'completed')
    })

    it('幂等性：已合规的拓扑再次执行自愈保持不变', () => {
      const validNodes = [
        {
          id: 'n1',
          data: {
            model: 'seedance-2.0',
            params: { model: 'seedance-2.0' },
            nodeKind: 'generate',
          },
        },
      ]
      const validEdges = [
        {
          id: 'e1',
          source: 's1',
          sourceHandle: 'out',
          target: 't1',
          targetHandle: 'in',
          data: { targetSlot: 'first_frame' },
        },
      ]
      const { nodes, edges } = normalizeWorkflowTopology(validNodes, validEdges)
      assert.deepEqual(nodes, validNodes)
      assert.deepEqual(edges, validEdges)
    })
  })

  describe('wrapNodesInGroup 工作流打组算法', () => {
    it('空节点安全返回空拓扑', () => {
      const res = wrapNodesInGroup([], [])
      assert.deepEqual(res, { groupId: '', nodes: [], edges: [] })
    })

    it('多节点自动生成外层 GroupNode 并转为相对坐标且自愈连线 Handle', () => {
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
      assert.deepEqual(edges, [
        { id: 'e1', source: 'node_1', sourceHandle: 'out', target: 'node_2', targetHandle: 'in' },
      ])
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

    it('传入未规范化的快照时，createProjectForkFromManifest 自动自愈连线与节点', async () => {
      const legacyManifest = {
        appId: 'app_legacy_custom',
        metadata: { name: '历史遗留应用' },
        workflowBinding: {
          snapshot: {
            nodes: [
              {
                id: 'slot_img',
                data: { isSlot: true, label: '主图' },
              },
              {
                id: 'core_gen',
                data: { model: 'seedance-2.0', params: { duration: 5 } },
              },
            ],
            edges: [
              {
                id: 'e_legacy',
                source: 'slot_img',
                target: 'core_gen',
                targetHandle: 'image',
              },
            ],
          },
        },
      }

      let savedNodes = null
      let savedEdges = null
      const mockDeps = {
        createProjectFn: async (title) => ({
          ok: true,
          status: 200,
          body: {
            project: { id: 'proj_legacy', title, canvasWorkspaceIds: ['ws_legacy'] },
          },
        }),
        requestFn: async (url, opts) => {
          if (url.includes('/api/workspaces/') && opts?.method === 'PUT') {
            savedNodes = opts.body.nodes
            savedEdges = opts.body.edges
          }
          return { ok: true, status: 200, body: { success: true } }
        },
      }

      await createProjectForkFromManifest(legacyManifest, mockDeps)
      assert.ok(savedNodes && savedEdges)

      // 断言连线自愈为 sourceHandle: 'out', targetHandle: 'in', targetSlot: 'first_frame'
      const edge = savedEdges.find((e) => e.id === 'e_legacy')
      assert.ok(edge)
      assert.equal(edge.sourceHandle, 'out')
      assert.equal(edge.targetHandle, 'in')
      assert.equal(edge.data?.targetSlot, 'first_frame')

      // 断言节点自愈 params.model 与 nodeKind
      const genNode = savedNodes.find((n) => n.id === 'core_gen')
      assert.ok(genNode)
      assert.equal(genNode.data.params.model, 'seedance-2.0')

      const slotNode = savedNodes.find((n) => n.id === 'slot_img')
      assert.ok(slotNode)
      assert.equal(slotNode.data.nodeKind, 'import')
      assert.equal(slotNode.data.selectedTool, 'import')
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
