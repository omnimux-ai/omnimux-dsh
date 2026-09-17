import test from 'node:test'
import assert from 'node:assert/strict'
import { RequestCoalescer } from './request-coalescer.js'

test('RequestCoalescer: 并发相同 key 的在飞请求自动合并 (AC-4)', async () => {
  const coalescer = new RequestCoalescer()
  let networkCalls = 0

  const slowFetcher = async () => {
    networkCalls += 1
    await new Promise((r) => setTimeout(r, 20))
    return { data: 'ok', callId: networkCalls }
  }

  // 并发发起 3 次同 key 请求
  const [res1, res2, res3] = await Promise.all([
    coalescer.coalesce('asset-123', slowFetcher),
    coalescer.coalesce('asset-123', slowFetcher),
    coalescer.coalesce('asset-123', slowFetcher),
  ])

  assert.equal(networkCalls, 1, '3 次并发应该只触发 1 次真实网络执行')
  assert.equal(res1.callId, 1)
  assert.equal(res2.callId, 1)
  assert.equal(res3.callId, 1)
  assert.equal(coalescer.inFlightCount, 0, '请求完成后在飞表必须清空')
})

test('RequestCoalescer: 决议完成后再次调用会发起新请求', async () => {
  const coalescer = new RequestCoalescer()
  let count = 0
  const fetcher = async () => {
    count += 1
    return count
  }

  const first = await coalescer.coalesce('key', fetcher)
  assert.equal(first, 1)
  assert.equal(coalescer.inFlightCount, 0)

  const second = await coalescer.coalesce('key', fetcher)
  assert.equal(second, 2)
})

test('RequestCoalescer: 失败请求释放且不影响下一次', async () => {
  const coalescer = new RequestCoalescer()
  const badFetcher = async () => {
    throw new Error('network-fail')
  }

  await assert.rejects(
    () => Promise.all([
      coalescer.coalesce('fail-key', badFetcher),
      coalescer.coalesce('fail-key', badFetcher),
    ]),
    /network-fail/,
  )
  assert.equal(coalescer.inFlightCount, 0)
})
