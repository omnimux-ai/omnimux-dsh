import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createProjectNavigation } from './project-navigation.js'
import { normalizeWorkspacePath } from './cwd.js'

function services({ workspaces = [], sessions = [], current = null, createWorkspace, createSession } = {}) {
  return {
    sessions: {
      create: createSession || (async () => 'sess-new'),
      list: {
        getSnapshot: () => ({
          current,
          byId: Object.fromEntries(sessions.map((s) => [s.id, s])),
          archivedSessionIds: [],
        }),
        subscribe: () => () => {},
      },
      open() {},
    },
    workspaces: {
      create: createWorkspace || (async ({ path }) => ({ workspaceId: `ws_${normalizeWorkspacePath(path).split('/').pop()}` })),
      list: {
        getSnapshot: () => ({ items: workspaces }),
        subscribe: () => () => {},
      },
    },
  }
}

test('opens the project workspace and reuses a live session, ignoring project.sessionId', async () => {
  const opened = []
  const store = services({
    workspaces: [{ workspaceId: 'w1', path: '/work/a', title: 'A', sessionIds: ['s1'] }],
    sessions: [{ id: 's1', cwd: '/work/a', updatedAt: 1, blank: false }],
  })
  const navigation = createProjectNavigation({
    ...store,
    activateCanvas: async (_ctx, opts) => { opened.push(opts); return true },
  })
  const project = {
    id: 'p1', title: '项目', path: '/work/a', sessionId: 'deleted-session', activePageId: 'page2',
    pages: [{ id: 'page1', canvasWorkspaceId: 'ws_1' }, { id: 'page2', canvasWorkspaceId: 'ws_2' }],
  }
  const result = await navigation.openProject(project)
  assert.equal(result.ok, true)
  assert.equal(result.sessionId, 's1')
  assert.equal(opened.length, 1)
  assert.equal(opened[0].sessionId, 's1')
  assert.equal(opened[0].canvasWorkspaceId, 'ws_2')
})

test('registers a missing workspace before creating a session', async () => {
  let createdPath = null
  const created = []
  const store = services({
    workspaces: [],
    sessions: [],
    createWorkspace: async ({ path }) => { createdPath = path; return { workspaceId: 'w-new' } },
    createSession: async () => 'sess-new',
  })
  const navigation = createProjectNavigation({
    ...store,
    activateCanvas: async () => { created.push('opened'); return true },
  })
  const project = { id: 'p1', title: '项目', path: '/work/new', pages: [{ id: 'p', canvasWorkspaceId: 'ws_new' }] }
  const result = await navigation.openProject(project)
  assert.equal(result.ok, true)
  assert.equal(createdPath, '/work/new')
  assert.equal(result.sessionId, 'sess-new')
  assert.equal(created.length, 1)
})

test('missing path fails visibly and never creates an ungrouped session', async () => {
  const created = []
  const store = services({ createSession: async () => { created.push('session'); return 'bad' } })
  const navigation = createProjectNavigation({ ...store, activateCanvas: async () => true })
  const result = await navigation.openProject({ id: 'p1', title: 'no path' })
  assert.equal(result.ok, false)
  assert.equal(result.error, 'missing-project-path')
  assert.deepEqual(created, [])
})
