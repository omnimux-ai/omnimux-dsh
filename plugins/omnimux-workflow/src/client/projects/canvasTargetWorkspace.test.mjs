/**
 * Issue #2104：画布 tab 目标创作页解析（画布跟随工作区）。
 *
 * 复现原缺陷：切换工作区后画布停在上一次点过的别的项目的创作页。
 * 判据见 `specs/2104-project-canvas-workspace-binding.spec.md` A6。
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { resolveCanvasTargetWorkspaceId } from './projectCanvas.js'

describe('resolveCanvasTargetWorkspaceId (#2104)', () => {
  it('显式 scope 最优先（项目页点某个创作页进来）', () => {
    const id = resolveCanvasTargetWorkspaceId({
      explicitWorkspaceId: 'ws_from_project_page',
      pickedBySession: { sessionId: 's1', workspaceId: 'ws_picked' },
      sessionBinding: { sessionId: 's1', canvasWorkspaceId: 'ws_bound' },
      sessionId: 's1',
      fallbackWorkspaceId: 'ws_hash',
    })
    assert.equal(id, 'ws_from_project_page')
  })

  it('本会话内用户选中的创作页优先于会话所属项目的当前页', () => {
    const id = resolveCanvasTargetWorkspaceId({
      pickedBySession: { sessionId: 's1', workspaceId: 'ws_picked' },
      sessionBinding: { sessionId: 's1', canvasWorkspaceId: 'ws_bound' },
      sessionId: 's1',
      fallbackWorkspaceId: 'ws_hash',
    })
    assert.equal(id, 'ws_picked')
  })

  it('换工作区后：上一个工作区的选中与绑定全部失效，改用新工作区项目的当前创作页', () => {
    const id = resolveCanvasTargetWorkspaceId({
      // 用户上个工作区点过 ws_picked_old，宿主的绑定也还是旧会话的
      pickedBySession: { sessionId: 's_old', workspaceId: 'ws_picked_old' },
      sessionBinding: { sessionId: 's_old', canvasWorkspaceId: 'ws_bound_old' },
      sessionId: 's_new',
      fallbackWorkspaceId: 'ws_hash_new',
    })
    assert.equal(id, 'ws_hash_new', '旧会话的记忆不得串到新工作区')
  })

  it('新工作区已有项目绑定 → 用其当前创作页（而非会话散列画布）', () => {
    const id = resolveCanvasTargetWorkspaceId({
      pickedBySession: { sessionId: 's_old', workspaceId: 'ws_picked_old' },
      sessionBinding: { sessionId: 's_new', canvasWorkspaceId: 'ws_bound_new' },
      sessionId: 's_new',
      fallbackWorkspaceId: 'ws_hash_new',
    })
    assert.equal(id, 'ws_bound_new')
  })

  it('会话未知（无 sessionId / 空串 / 空白值）时不采信会话级记忆', () => {
    assert.equal(
      resolveCanvasTargetWorkspaceId({
        pickedBySession: { sessionId: null, workspaceId: 'ws_global_stale' },
        sessionBinding: { sessionId: null, canvasWorkspaceId: 'ws_global_stale' },
        sessionId: undefined,
        fallbackWorkspaceId: 'ws_hash',
      }),
      'ws_hash',
      'localStorage 旧值（无会话归属）只能兜底，不能压过会话解析',
    )
    assert.equal(
      resolveCanvasTargetWorkspaceId({
        pickedBySession: { sessionId: 's1', workspaceId: '   ' },
        sessionBinding: { sessionId: 's1', canvasWorkspaceId: '' },
        sessionId: 's1',
        fallbackWorkspaceId: 'ws_hash',
      }),
      'ws_hash',
    )
  })

  it('全部缺失时返回 undefined（组件显示加载态，不猜画布）', () => {
    assert.equal(resolveCanvasTargetWorkspaceId({}), undefined)
    assert.equal(resolveCanvasTargetWorkspaceId(), undefined)
  })
})
