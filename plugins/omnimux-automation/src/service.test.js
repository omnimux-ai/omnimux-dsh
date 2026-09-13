import assert from 'node:assert/strict'
import test from 'node:test'
import { automationDomainSpec, createDefinition, createScheduledRun } from './domain.js'
import { AUTOMATION_SESSION_PREFIX, AutomationService } from './service.js'

/** 内存表：与存储域 `table(name)` 的最小接口一致。 */
function memoryTable() {
  const rows = new Map()
  return {
    get: id => rows.get(id),
    put: (id, value) => { rows.set(id, value) },
    delete: id => { rows.delete(id) },
    entries: () => rows.entries(),
    update: (id, fn) => {
      const current = rows.get(id)
      if (current !== undefined) rows.set(id, fn(current))
    },
    size: () => rows.size,
  }
}

function makeCtx(presets) {
  const tables = { definitions: memoryTable(), runs: memoryTable() }
  let closed = 0
  return {
    tables,
    closedCount: () => closed,
    ctx: {
      logger: { warn: () => undefined },
      permissionPresets: presets,
      get: () => undefined,
      sessions: undefined,
      storageDomain: {
        open: async (spec) => {
          assert.equal(spec.name, 'dsh_automation')
          assert.equal(spec.version, 1)
          return {
            table: name => tables[name],
            close: async () => { closed += 1 },
          }
        },
      },
    },
  }
}

const PRESETS = {
  names: ['read-only', 'workspace-write', 'danger-full-access'],
  defaultPreset: 'read-only',
  optionOf: name => ({ value: name, name }),
}

/** @returns {any} */
function definitionInput(overrides = {}) {
  return {
    id: 'automation_1',
    name: '每日检查',
    prompt: '检查测试并报告结果。',
    schedule: { kind: 'daily', time: '09:00', timeZone: 'Asia/Shanghai' },
    workspaceId: 'ws_1',
    cwd: '/tmp/demo',
    agentPreset: 'standard',
    createdBy: { kind: 'web', sessionId: 'session_1' },
    now: '2026-08-16T01:00:00.000Z',
    ...overrides,
  }
}

const CONFIG = { runTimeoutMs: 60_000, misfireGraceMs: 15 * 60_000, historyLimit: 2 }

test('打开服务时把旧版 full-access 与已下架预设收敛到 Host 当前列表', async () => {
  const { ctx, tables } = makeCtx(PRESETS)
  tables.definitions.put('automation_1', {
    ...createDefinition(definitionInput()),
    permissionPreset: 'full-access',
  })
  const legacyRun = createScheduledRun(createDefinition(definitionInput()), '2026-08-16T01:00:00.000Z')
  tables.runs.put(legacyRun.id, {
    ...legacyRun,
    targetSnapshot: { ...legacyRun.targetSnapshot, permissionPreset: 'removed-preset' },
  })

  const service = await AutomationService.open(ctx, CONFIG)
  assert.equal(tables.definitions.get('automation_1').permissionPreset, 'danger-full-access')
  assert.equal(tables.runs.get(legacyRun.id).targetSnapshot.permissionPreset, 'read-only')
  await service.dispose()
})

test('打开服务时把中断的 running 运行落成 failed 并标为未读', async () => {
  const { ctx, tables } = makeCtx(PRESETS)
  const run = createScheduledRun(createDefinition(definitionInput()), '2026-08-16T01:00:00.000Z')
  tables.runs.put(run.id, { ...run, status: 'running', startedAt: '2026-08-16T01:00:01.000Z' })

  const service = await AutomationService.open(ctx, CONFIG)
  const recovered = tables.runs.get(run.id)
  assert.equal(recovered.status, 'failed')
  assert.equal(recovered.error.code, 'host_interrupted')
  assert.equal(recovered.unread, true)
  await service.dispose()
})

test('历史裁剪按每个任务保留 historyLimit 条终态运行', async () => {
  const { ctx, tables } = makeCtx(PRESETS)
  const definition = createDefinition(definitionInput())
  for (const hour of ['01', '02', '03', '04']) {
    const run = createScheduledRun(definition, `2026-08-16T${hour}:00:00.000Z`)
    tables.runs.put(run.id, { ...run, status: 'succeeded' })
  }
  const service = await AutomationService.open(ctx, CONFIG)
  assert.equal(tables.runs.size(), CONFIG.historyLimit)
  await service.dispose()
})

test('ownsSession 认前缀、认已落库会话、认 automation 来源事件', async () => {
  const { ctx, tables } = makeCtx(PRESETS)
  const definition = createDefinition(definitionInput())
  const run = createScheduledRun(definition, '2026-08-16T01:00:00.000Z')
  tables.runs.put(run.id, { ...run, sessionId: 'sess-run-1' })
  const service = await AutomationService.open(ctx, CONFIG)

  assert.equal(service.ownsSession(`${AUTOMATION_SESSION_PREFIX}abc`, []), true)
  assert.equal(service.ownsSession('sess-run-1', []), true)
  assert.equal(service.ownsSession('sess-other', [
    { type: 'user/message', data: { source: { kind: 'automation' } } },
  ]), true)
  assert.equal(service.ownsSession('sess-other', [
    { type: 'user/message', data: { source: { kind: 'human' } } },
  ]), false)
  await service.dispose()
})

test('权限列表与默认值直接投影 Host 的 permissionPresets', async () => {
  const { ctx } = makeCtx(PRESETS)
  const service = await AutomationService.open(ctx, CONFIG)
  assert.deepEqual([...service.permissionNames()], ['read-only', 'workspace-write', 'danger-full-access'])
  assert.deepEqual(service.permissionOptions().map(item => item.value), ['read-only', 'workspace-write', 'danger-full-access'])
  assert.equal(service.defaultPermission(), 'read-only')
  await service.dispose()
})

test('Host 默认预设不在官方列表时显式报错，不静默兜底', async () => {
  const { ctx } = makeCtx({ ...PRESETS, defaultPreset: 'ghost-preset' })
  await assert.rejects(() => AutomationService.open(ctx, CONFIG), /默认权限预设/)
})

test('dispose 会关闭存储域且可重复调用', async () => {
  const { ctx, closedCount } = makeCtx(PRESETS)
  const service = await AutomationService.open(ctx, CONFIG)
  await service.dispose()
  assert.equal(closedCount(), 1)
})
