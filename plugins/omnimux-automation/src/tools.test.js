import assert from 'node:assert/strict'
import test from 'node:test'
import { registerAutomationTools } from './tools.js'

/** 假 Agent：只实现 tools.js 实际用到的四个面。 */
function makeAgent(id = 'agent_1') {
  const registered = []
  return {
    id,
    registered,
    ctx: {
      effect: (factory) => {
        const dispose = factory()
        return () => { if (typeof dispose === 'function') dispose() }
      },
      tools: {
        register: (definition) => {
          registered.push(definition)
          return () => { registered.splice(registered.indexOf(definition), 1) }
        },
      },
    },
  }
}

function makeService(overrides = {}) {
  return {
    permissionNames: () => ['read-only', 'workspace-write'],
    create: async () => ({ id: 'automation_1', revision: 1 }),
    update: async () => ({ id: 'automation_1', revision: 2 }),
    delete: async () => ({ id: 'automation_1', preserveRunHistory: true }),
    runNow: async () => ({ id: 'run_1' }),
    snapshot: async () => ({ automations: [], runs: [] }),
    markRead: async () => ({ id: 'run_1', unread: false }),
    ...overrides,
  }
}

const EXPECTED_TOOLS = [
  'automation_create',
  'automation_list',
  'automation_update',
  'automation_runs',
  'automation_run_now',
  'automation_delete',
]

test('注册 6 个标准 Agent 工具，名称与上游逐字一致', () => {
  const agent = makeAgent()
  const dispose = registerAutomationTools(makeService(), agent)
  assert.deepEqual(agent.registered.map(item => item.name), EXPECTED_TOOLS)
  dispose()
  assert.equal(agent.registered.length, 0)
})

test('工具统一以 JSON 输出并返回 { ok } 信封', async () => {
  const agent = makeAgent()
  const service = makeService()
  registerAutomationTools(service, agent)
  const create = agent.registered.find(item => item.name === 'automation_create')
  assert.deepEqual(create.output.schema, { type: 'json' })

  const created = await create.execute({
    name: '每日检查',
    prompt: '检查测试并报告结果。',
    kind: 'daily',
    time_zone: 'Asia/Shanghai',
    time: '09:00',
  }, { agent, signal: new AbortController().signal })
  assert.equal(created.ok, true)
  assert.equal(created.automation.id, 'automation_1')
})

test('exec.agent 不是本工具挂载的 Agent 时返回 cancelled，不落库', async () => {
  const agent = makeAgent()
  let called = 0
  registerAutomationTools(makeService({ create: async () => { called += 1 } }), agent)
  const create = agent.registered.find(item => item.name === 'automation_create')
  const result = await create.execute({ name: 'x', prompt: 'y', kind: 'daily', time_zone: 'UTC', time: '09:00' }, {
    agent: makeAgent('agent_2'),
    signal: new AbortController().signal,
  })
  assert.deepEqual(result, { ok: false, code: 'cancelled' })
  assert.equal(called, 0)
})

test('计划字段必须与 kind 精确匹配：缺字段与多余字段都被拒绝', async () => {
  const agent = makeAgent()
  registerAutomationTools(makeService(), agent)
  const create = agent.registered.find(item => item.name === 'automation_create')
  const exec = { agent, signal: new AbortController().signal }

  const missing = await create.execute({ name: 'x', prompt: 'y', kind: 'weekly', time_zone: 'UTC', time: '09:00' }, exec)
  assert.equal(missing.ok, false)
  assert.match(missing.message, /weekdays/)

  const unrelated = await create.execute({ name: 'x', prompt: 'y', kind: 'daily', time_zone: 'UTC', time: '09:00', minute: 15 }, exec)
  assert.equal(unrelated.ok, false)
  assert.match(unrelated.message, /不接受/)

  const noKind = await create.execute({ name: 'x', prompt: 'y', time: '09:00' }, exec)
  assert.equal(noKind.ok, false)
  assert.match(noKind.message, /kind/)
})

test('run_now 与 delete 走服务边界并把错误降级为 automation_error', async () => {
  const agent = makeAgent()
  registerAutomationTools(makeService({
    runNow: async () => { throw new Error('工作区不可用') },
  }), agent)
  const runNow = agent.registered.find(item => item.name === 'automation_run_now')
  const result = await runNow.execute({ id: 'automation_1' }, { agent, signal: new AbortController().signal })
  assert.deepEqual(result, { ok: false, code: 'automation_error', message: '工作区不可用' })
})

test('权限枚举来自 Host 当前列表，不写死', () => {
  const agent = makeAgent()
  registerAutomationTools(makeService({ permissionNames: () => ['read-only'] }), agent)
  const create = agent.registered.find(item => item.name === 'automation_create')
  assert.deepEqual(create.parameters.permission.enum, ['read-only'])
})
