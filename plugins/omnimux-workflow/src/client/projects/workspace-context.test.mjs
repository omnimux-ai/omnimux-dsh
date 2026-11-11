import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createWorkspaceContextStore } from './workspace-context.js'

function makeStores({ session, workspace, project }) {
  const byId = session ? { [session.id]: session } : {}
  return {
    sessions: {
      list: {
        getSnapshot: () => ({ current: session?.id ?? null, byId, archivedSessionIds: [] }),
        subscribe: () => () => {},
      },
    },
    workspaces: {
      list: {
        getSnapshot: () => ({ items: workspace ? [workspace] : [] }),
        subscribe: () => () => {},
      },
    },
    fetchProject: async () => ({ ok: true, status: 200, body: { project } }),
  }
}

test('session -> workspace -> project -> activePage', async () => {
  const project = {
    id: 'p1', title: '项目', path: '/work/a', activePageId: 'page2',
    pages: [{ id: 'page1', canvasWorkspaceId: 'ws_1' }, { id: 'page2', canvasWorkspaceId: 'ws_2' }],
  }
  const stores = makeStores({
    session: { id: 's1', cwd: '/work/a', updatedAt: 1 },
    workspace: { workspaceId: 'w1', path: '/work/a', title: 'A', sessionIds: ['s1'] },
    project,
  })
  const context = createWorkspaceContextStore({
    sessions: stores.sessions, workspaces: stores.workspaces, fetchProject: stores.fetchProject,
  })
  const state = await context.refresh()
  assert.equal(state.status, 'ready')
  assert.equal(state.workspaceId, 'w1')
  assert.equal(state.project.id, 'p1')
  assert.equal(state.activePage.id, 'page2')
  assert.equal(state.activePage.canvasWorkspaceId, 'ws_2')
  context.dispose()
})

test('no workspace is explicit, not a guessed first workspace', async () => {
  const stores = makeStores({
    session: { id: 's1', cwd: '/work/orphan', updatedAt: 1 },
    workspace: { workspaceId: 'w1', path: '/work/other', title: 'Other', sessionIds: [] },
    project: null,
  })
  const context = createWorkspaceContextStore({
    sessions: stores.sessions, workspaces: stores.workspaces, fetchProject: stores.fetchProject,
  })
  const state = await context.refresh()
  assert.equal(state.status, 'no-workspace')
  assert.equal(state.workspaceId, null)
  context.dispose()
})

test('workspace without project is a visible guide state', async () => {
  const stores = makeStores({
    session: { id: 's1', cwd: '/work/a', updatedAt: 1 },
    workspace: { workspaceId: 'w1', path: '/work/a', title: 'A', sessionIds: ['s1'] },
    project: null,
  })
  const context = createWorkspaceContextStore({
    sessions: stores.sessions, workspaces: stores.workspaces, fetchProject: stores.fetchProject,
  })
  const state = await context.refresh()
  assert.equal(state.status, 'workspace-no-project')
  assert.equal(state.project, null)
  context.dispose()
})
