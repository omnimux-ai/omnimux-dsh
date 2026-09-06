import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply, ACCOUNTS_TOOL_NAMES } from './index.js'

test('omnimux-accounts tools lifecycle', async (t) => {
  const tmp = mkdtempSync(join(tmpdir(), 'accounts-tools-test-'))
  const prevHome = process.env.DSH_HOME
  process.env.DSH_HOME = tmp

  t.after(() => {
    if (prevHome !== undefined) process.env.DSH_HOME = prevHome
    else delete process.env.DSH_HOME
    rmSync(tmp, { recursive: true, force: true })
  })

  const registered = new Map()
  const mockCtx = {
    tools: {
      register(tool) {
        registered.set(tool.name, tool)
      },
      get(name) {
        if (name === 'omnimux_accounts_list') {
          return {
            async execute(args) {
              assert.deepEqual(args, { provider: 'zernio' })
              return {
                accounts: [
                  { id: 'acc_1', provider: 'zernio', platform: 'tiktok', account_name: 'same-name', agent_usable: true },
                  { id: 'acc_2', provider: 'zernio', platform: 'instagram', account_name: 'Insta Official', agent_usable: true },
                  { id: 'acc_direct', provider: 'tiktok_direct', platform: 'tiktok', account_name: 'same-name' },
                  { id: 'acc_missing', platform: 'tiktok' },
                  { id: 'acc_unknown', provider: 'unknown', platform: 'tiktok' },
                ],
              }
            },
          }
        }
        return undefined
      },
    },
  }

  apply(mockCtx)

  assert.deepEqual([...registered.keys()], ACCOUNTS_TOOL_NAMES)
  assert.ok(registered.has('accounts_list'))
  assert.ok(registered.has('accounts_update_group'))

  // 1. List all accounts
  const listTool = registered.get('accounts_list')
  const res1 = await listTool.execute({})
  assert.equal(res1.count, 2)
  assert.equal(res1.accounts[0].id, 'acc_1')

  // 2. Update group and agent_usable
  const updateTool = registered.get('accounts_update_group')
  for (const id of ['acc_direct', 'acc_missing', 'acc_unknown']) {
    await assert.rejects(updateTool.execute({ id, group: 'forbidden' }), /account-provider-mismatch/)
  }
  const updateRes = await updateTool.execute({
    id: 'acc_1',
    group: '短剧矩阵A',
    agent_usable: false,
  })
  assert.equal(updateRes.ok, true)
  assert.equal(updateRes.meta.group, '短剧矩阵A')
  assert.equal(updateRes.meta.agent_usable, false)

  // 3. List with filter
  const res2 = await listTool.execute({ group: '短剧矩阵A' })
  assert.equal(res2.count, 1)
  assert.equal(res2.accounts[0].id, 'acc_1')
  assert.equal(res2.accounts[0].agent_usable, false)

  // 4. List with agent_usable_only
  const res3 = await listTool.execute({ agent_usable_only: true })
  assert.equal(res3.count, 1)
  assert.equal(res3.accounts[0].id, 'acc_2')
})
