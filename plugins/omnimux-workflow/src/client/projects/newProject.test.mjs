/**
 * 新建本地项目：弹窗提交契约、重名、(path) 后必须 sessions.create({ workspaceId })、
 * 禁止 connectWorkspace / create({ cwd })。
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { join } from 'node:path'
import {
  normalizeWorkspacePath,
  resolveCurrentCwd,
  resolveWorkspaceForCwd,
  resolveWorkspaceId,
} from './cwd.js'
import {
  folderNameAttempt,
  isDirectoryExistsError,
  sanitizeFolderName,
  validateProjectTitle,
} from './folderName.js'
import { createProjectSession, dismissProductStage, runNewProject, runResetSession } from './newProject.js'

function workspacesWith(items, recentWorkspaceId) {
  return {
    list: {
      getSnapshot: () => ({ items, recentWorkspaceId }),
    },
  }
}

function sessionsWith(current, byId = {}) {
  return {
    list: {
      getSnapshot: () => ({ current, byId }),
    },
    create: async () => {
      throw new Error('sessions.create should not be called')
    },
    open() {},
  }
}

function directoryExistsError(path = '/tmp/x') {
  const error = new Error(`directory browse failed: directory-exists: ${path} already exists`)
  error.name = 'DirectoryBrowseError'
  error.rpcError = { code: 'directory-exists', message: `${path} already exists`, details: { path } }
  return error
}

describe('cwd workspace matching', () => {
  it('normalizeWorkspacePath drops trailing slashes except root', () => {
    assert.equal(normalizeWorkspacePath('/tmp/ws'), '/tmp/ws')
    assert.equal(normalizeWorkspacePath('/tmp/ws/'), '/tmp/ws')
    assert.equal(normalizeWorkspacePath('/tmp/ws///'), '/tmp/ws')
    assert.equal(normalizeWorkspacePath('/'), '/')
  })

  it('resolveWorkspaceForCwd matches items[].path ignoring trailing slash', () => {
    const workspaces = workspacesWith([
      { workspaceId: 'ws-1', path: '/Users/x/work/' },
    ])
    assert.equal(resolveWorkspaceForCwd('/Users/x/work', workspaces), 'ws-1')
    assert.equal(resolveWorkspaceForCwd('/Users/x/work/', workspaces), 'ws-1')
  })

  it('resolveWorkspaceForCwd stringifies path and workspaceId', () => {
    const workspaces = workspacesWith([
      { workspaceId: 42, path: '/tmp/n' },
    ])
    assert.equal(resolveWorkspaceForCwd('/tmp/n/', workspaces), '42')
  })

  it('returns undefined when cwd has no workspace ledger entry', () => {
    const workspaces = workspacesWith([
      { workspaceId: 'ws-other', path: '/tmp/other' },
    ])
    assert.equal(resolveWorkspaceForCwd('/tmp/nopath', workspaces), undefined)
  })

  it('resolveCurrentCwd is unchanged: session cwd wins over recent workspace path', () => {
    const sessions = sessionsWith('s1', { s1: { cwd: '/tmp/session-cwd' } })
    const workspaces = workspacesWith(
      [{ workspaceId: 'ws-1', path: '/tmp/recent' }],
      'ws-1',
    )
    assert.equal(resolveCurrentCwd(sessions, workspaces), '/tmp/session-cwd')
  })

  it('resolveWorkspaceId follows current cwd into the ledger', () => {
    const sessions = sessionsWith('s1', { s1: { cwd: '/tmp/ws/' } })
    const workspaces = workspacesWith([{ workspaceId: 'ws-9', path: '/tmp/ws' }])
    assert.equal(resolveWorkspaceId(sessions, workspaces), 'ws-9')
  })
})

describe('sanitizeFolderName', () => {
  it('keeps CJK display names and strips separators', () => {
    assert.equal(sanitizeFolderName('  宣传片  '), '宣传片')
    assert.equal(sanitizeFolderName('a/b\\c:d'), 'a_b_c_d')
    assert.equal(sanitizeFolderName('...'), '')
    assert.equal(validateProjectTitle('').ok, false)
    assert.equal(validateProjectTitle('  片  ').folderName, '片')
    assert.equal(folderNameAttempt('宣传片', 0), '宣传片')
    assert.equal(folderNameAttempt('宣传片', 1), '宣传片 (2)')
  })

  it('detects official DirectoryBrowseError shape', () => {
    assert.equal(isDirectoryExistsError(directoryExistsError('/Movies/OmniMux/Projects/片')), true)
    assert.equal(isDirectoryExistsError(new Error('EACCES')), false)
    const named = new Error('directory browse failed: directory-exists: x')
    named.name = 'DirectoryBrowseError'
    assert.equal(isDirectoryExistsError(named), true)
  })
})

describe('dismissProductStage', () => {
  it('clears html product-stage mark and sets plugin stage false', () => {
    const previous = globalThis.document
    const dataset = { dshProductStage: 'omnimux-workflow' }
    const events = []
    globalThis.document = { documentElement: { dataset } }
    const previousWindow = globalThis.window
    globalThis.window = {
      dispatchEvent(event) { events.push(event?.detail) },
    }
    const stageCalls = []
    try {
      dismissProductStage({ set(open) { stageCalls.push(open) } })
      assert.equal('dshProductStage' in dataset, false)
      assert.deepEqual(stageCalls, [false])
      assert.deepEqual(events, [{ id: '' }])
    } finally {
      globalThis.document = previous
      globalThis.window = previousWindow
    }
  })
})

describe('createProjectSession', () => {
  it('registers path then create({ workspaceId }) without cwd', async () => {
    const creates = []
    const sessions = {
      async create(opts) {
        creates.push(opts)
        return 'sess-new'
      },
    }
    const workspaces = {
      async create(input) {
        assert.deepEqual(input, { path: '/lib/片' })
        return { workspaceId: 'ws-1', path: '/lib/片' }
      },
      async connectWorkspace() {
        throw new Error('connectWorkspace must not be called')
      },
    }
    const result = await createProjectSession(sessions, workspaces, '/lib/片')
    assert.deepEqual(result, {
      ok: true,
      cwd: '/lib/片',
      workspaceId: 'ws-1',
      sessionId: 'sess-new',
    })
    assert.deepEqual(creates, [{ workspaceId: 'ws-1' }])
    assert.equal('cwd' in creates[0], false)
  })

  it('returns no-workspace when path is empty and does not create a session', async () => {
    let created = 0
    const result = await createProjectSession(
      { async create() { created += 1; return 'x' } },
      { async create() { return { workspaceId: 'ws' } } },
      '',
    )
    assert.deepEqual(result, { ok: false, error: 'no-workspace' })
    assert.equal(created, 0)
  })
})

describe('runNewProject', () => {
  it('POST title only then workspaces.create({ path }) then sessions.create({ workspaceId })', async () => {
    const originalFetch = globalThis.fetch
    const fetchBodies = []
    const directoryCalls = []
    const workspaceCreates = []
    const sessionCreates = []
    const opens = []
    globalThis.fetch = async (url, opts = {}) => {
      fetchBodies.push({ url: String(url), method: opts.method || 'GET', body: opts.body })
      if (String(url).endsWith('/api/projects') && opts.method === 'POST') {
        const body = JSON.parse(String(opts.body))
        return {
          ok: true,
          json: async () => ({
            project: { id: 'p1', title: body.title, path: `/lib/${body.title}` },
          }),
        }
      }
      if (String(url).includes('/api/projects/p1') && opts.method === 'PATCH') {
        return { ok: true, json: async () => ({ project: { id: 'p1', sessionId: 'sess-9' } }) }
      }
      return { ok: true, json: async () => ({}) }
    }
    try {
      const stageCalls = []
      const result = await runNewProject({
        sessions: {
          async create(opts) {
            sessionCreates.push(opts)
            return 'sess-9'
          },
          open(id) { opens.push(id) },
        },
        workspaces: {
          async createDirectory() {
            directoryCalls.push('client-mkdir')
            throw new Error('desktop native picker has no createDirectory')
          },
          async create(input) {
            workspaceCreates.push(input)
            return { workspaceId: 'ws-ledger', path: input.path }
          },
          async connectWorkspace() {
            throw new Error('connectWorkspace must not be called')
          },
        },
        layout: { closeDetails() {} },
        betterSidebar: {
          openTab() {},
          closeTab() {},
          getTab() { return { id: 'omnimux-workflow:canvas' } },
          getSnapshot() { return { sessionId: 'sess-9', state: { splits: {}, width: 700 } } },
        },
        t: (key) => key,
        stage: { set(open) { stageCalls.push(open) } },
      }, { title: '宣传片' })

      assert.equal(result.ok, true)
      assert.equal(result.project?.sessionId, 'sess-9')
      assert.equal(result.project?.path, '/lib/宣传片')
      assert.deepEqual(directoryCalls, [])
      assert.deepEqual(workspaceCreates, [{ path: '/lib/宣传片' }])
      assert.deepEqual(sessionCreates, [{ workspaceId: 'ws-ledger' }])
      assert.equal('cwd' in sessionCreates[0], false)
      assert.deepEqual(opens, ['sess-9'])
      assert.deepEqual(stageCalls, [false])

      const libraryGet = fetchBodies.find((row) => row.url.includes('/projects/library'))
      assert.equal(libraryGet, undefined)
      const post = fetchBodies.find((row) => row.method === 'POST')
      assert.ok(post)
      const posted = JSON.parse(String(post.body))
      assert.equal(posted.title, '宣传片')
      assert.equal('projectRoot' in posted, false)
      assert.equal('cwd' in posted, false)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('does not write when title is empty', async () => {
    const originalFetch = globalThis.fetch
    let fetchCalls = 0
    globalThis.fetch = async () => {
      fetchCalls += 1
      return { ok: true, json: async () => ({}) }
    }
    try {
      const result = await runNewProject({
        sessions: sessionsWith('s1', { s1: { cwd: '/tmp/orphan' } }),
        workspaces: {
          ...workspacesWith([]),
          async createDirectory() { throw new Error('mkdir') },
          async create() { throw new Error('create') },
        },
        t: (key) => key,
      }, { title: '   ' })
      assert.equal(result.ok, false)
      assert.equal(result.error, 'title-required')
      assert.equal(fetchCalls, 0)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('un-collapses conversation after sessions.open (enter-conversation intent)', async () => {
    const originalFetch = globalThis.fetch
    const order = []
    const previousWindow = globalThis.window
    globalThis.window = {
      dispatchEvent() { return true },
      __omnimuxWorkbench: {
        setConversationCollapsed(next, opts) {
          order.push(`collapsed:${next}:${opts?.sessionId || ''}`)
        },
        setFocus(mode) {
          order.push(`focus:${mode}`)
        },
      },
    }
    globalThis.fetch = async (url, opts = {}) => {
      if (String(url).endsWith('/api/projects') && opts.method === 'POST') {
        const body = JSON.parse(String(opts.body))
        return {
          ok: true,
          json: async () => ({
            project: { id: 'p-enter', title: body.title, path: `/lib/${body.title}` },
          }),
        }
      }
      if (String(url).includes('/api/projects/p-enter') && opts.method === 'PATCH') {
        return { ok: true, json: async () => ({ project: { id: 'p-enter', sessionId: 'sess-enter' } }) }
      }
      return { ok: true, json: async () => ({}) }
    }
    try {
      const opens = []
      const result = await runNewProject({
        sessions: {
          async create() { return 'sess-enter' },
          open(id) {
            opens.push(id)
            order.push(`open:${id}`)
          },
        },
        workspaces: {
          async create(input) { return { workspaceId: 'ws-enter', path: input.path } },
        },
        layout: { closeDetails() {} },
        betterSidebar: {
          openTab() { order.push('openTab') },
          closeTab() {},
          getTab() { return { id: 'omnimux-workflow:canvas' } },
          getSnapshot() {
            return { sessionId: 'sess-enter', state: { splits: { kind: 'leaf', tabs: [] }, width: 700, panelOpen: true } }
          },
        },
        t: (key) => key,
        stage: { set() {} },
      }, { title: '进会话' })

      assert.equal(result.ok, true)
      assert.deepEqual(opens, ['sess-enter'])
      assert.ok(order.indexOf('open:sess-enter') >= 0)
      assert.ok(order.indexOf('collapsed:false:sess-enter') > order.indexOf('open:sess-enter'))
      assert.ok(order.indexOf('focus:split') > order.indexOf('open:sess-enter'))
    } finally {
      globalThis.fetch = originalFetch
      if (previousWindow === undefined) delete globalThis.window
      else globalThis.window = previousWindow
    }
  })
})

describe('runResetSession', () => {
  it('un-collapses conversation after opening the fresh session', async () => {
    const order = []
    const previousWindow = globalThis.window
    globalThis.window = {
      __omnimuxWorkbench: {
        setConversationCollapsed(next, opts) {
          order.push(`collapsed:${next}:${opts?.sessionId || ''}`)
        },
        setFocus(mode) {
          order.push(`focus:${mode}`)
        },
      },
    }
    try {
      const result = await runResetSession({
        sessions: {
          async create(opts) {
            order.push(`create:${opts.workspaceId}`)
            return 'sess-reset'
          },
          open(id) { order.push(`open:${id}`) },
        },
        workspaces: {
          async create() { return { workspaceId: 'ws-reset' } },
          list: { getSnapshot: () => ({ items: [{ workspaceId: 'ws-reset', path: '/lib/x' }] }) },
        },
        layout: { closeDetails() {} },
        betterSidebar: {
          openTab() { order.push('openTab') },
          closeTab() {},
          getTab() { return { id: 'omnimux-workflow:canvas' } },
          getSnapshot() {
            return {
              sessionId: 'sess-reset',
              state: { splits: { kind: 'leaf', tabs: [] }, width: 700, panelOpen: true },
            }
          },
        },
        t: (key) => key,
      }, { workspaceId: 'ws-reset', cwd: '/lib/x' })

      assert.equal(result.ok, true)
      assert.equal(result.sessionId, 'sess-reset')
      assert.ok(order.indexOf('open:sess-reset') >= 0)
      assert.ok(order.indexOf('collapsed:false:sess-reset') > order.indexOf('open:sess-reset'))
      assert.ok(order.indexOf('focus:split') > order.indexOf('open:sess-reset'))
    } finally {
      if (previousWindow === undefined) delete globalThis.window
      else globalThis.window = previousWindow
    }
  })
})
