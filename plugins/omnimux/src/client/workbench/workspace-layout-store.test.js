/**
 * 比例持久化与迁移（Issue #2608 · T05）。
 *
 * 真源口径：
 * - **只存比例，不存像素**——像素是「比例 × 舞台」的函数，落盘即错位；
 * - **键缺失**与**键损坏**必须走不同路径：前者触发老用户迁移，后者回落产品默认 0.3；
 * - 迁移按「当前实际宽度 ÷ 舞台」反推，升级后首开中栏像素与升级前一致（AC-11 ±4px）。
 */

import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import {
  CHAT_RATIO_PERSIST_DEBOUNCE_MS,
  CHAT_RATIO_WRITE_EPSILON,
  WORKSPACE_LAYOUT_KEY,
  WORKSPACE_LAYOUT_VERSION,
  migrateChatRatioFromAuthoredGeometry,
  persistChatRatioNow,
  readChatRatio,
  resetWorkspaceLayoutStoreForTests,
  schedulePersistChatRatio,
  writeChatRatio,
} from './workspace-layout-store.js'
import { CONVERSATION_RATIO_DEFAULT } from '../conversation-ratio.js'

/** 可跨「重开应用」复用的内存存储：同一份数据被多次读取即模拟重开。 */
function createStorage(seed) {
  const map = new Map(seed ? Object.entries(seed) : [])
  return {
    map,
    getItem(key) { return map.has(key) ? map.get(key) : null },
    setItem(key, value) { map.set(key, String(value)) },
    removeItem(key) { map.delete(key) },
  }
}

const readPayload = (storage) => JSON.parse(storage.getItem(WORKSPACE_LAYOUT_KEY))

afterEach(() => {
  resetWorkspaceLayoutStoreForTests()
})

describe('T05 比例持久化（只存比例，不存像素）', () => {
  it('stores the ratio alone, under the agreed key and payload version', () => {
    const storage = createStorage()
    assert.equal(writeChatRatio(0.42, { storage }), true)

    assert.equal(WORKSPACE_LAYOUT_KEY, 'omnimux.conversationRatio')
    const payload = readPayload(storage)
    assert.deepEqual(Object.keys(payload).sort(), ['chatRatio', 'version'])
    assert.equal(payload.version, WORKSPACE_LAYOUT_VERSION)
    assert.equal(payload.chatRatio, 0.42)
    assert.equal(readChatRatio({ storage }), 0.42)
  })

  it('distinguishes a missing key (migration) from a corrupt value (default)', () => {
    const empty = createStorage()
    assert.equal(readChatRatio({ storage: empty }), null, '键缺失必须返回 null，交给迁移路径')

    for (const corrupt of ['not-json', '[]', '{}', '{"chatRatio":"abc"}', '{"chatRatio":null}', '{"chatRatio":true}']) {
      const storage = createStorage({ [WORKSPACE_LAYOUT_KEY]: corrupt })
      assert.equal(
        readChatRatio({ storage }),
        CONVERSATION_RATIO_DEFAULT,
        `损坏载荷 ${corrupt} 必须回落默认比例`,
      )
      assert.equal(
        readPayload(storage).chatRatio,
        CONVERSATION_RATIO_DEFAULT,
        '损坏值必须被清洗写回，不能每次读都重新判一次',
      )
    }
  })

  it('clamps an out-of-range finite ratio instead of falling back', () => {
    assert.equal(readChatRatio({ storage: createStorage({ [WORKSPACE_LAYOUT_KEY]: '{"version":1,"chatRatio":1.5}' }) }), 0.72)
    assert.equal(readChatRatio({ storage: createStorage({ [WORKSPACE_LAYOUT_KEY]: '{"version":1,"chatRatio":-3}' }) }), 0)
    assert.equal(readChatRatio({ storage: createStorage({ [WORKSPACE_LAYOUT_KEY]: '{"version":1,"chatRatio":"0.25"}' }) }), 0.25)
  })

  it('skips a rewrite when the stored ratio is already the same', () => {
    const storage = createStorage()
    assert.equal(writeChatRatio(0.3, { storage }), true)
    assert.equal(writeChatRatio(0.3, { storage }), false, '同值不重复写')
    assert.equal(writeChatRatio(0.3 + CHAT_RATIO_WRITE_EPSILON / 2, { storage }), false, '差小于阈值视为同一比例')
    assert.equal(writeChatRatio(0.4, { storage }), true)
  })

  it('coalesces the drag-time debounce and lets pointerup cancel it', async () => {
    const storage = createStorage()
    for (let i = 1; i <= 10; i += 1) {
      schedulePersistChatRatio(0.3 + i / 100, { storage, delayMs: CHAT_RATIO_PERSIST_DEBOUNCE_MS })
    }
    await new Promise((resolve) => setTimeout(resolve, CHAT_RATIO_PERSIST_DEBOUNCE_MS + 30))
    assert.equal(readChatRatio({ storage }), 0.4, '防抖窗口内只允许落盘最后一次比例')

    // 松手结算：立即写终值，并把待发的防抖写取消掉，避免旧值事后覆盖终值。
    schedulePersistChatRatio(0.55, { storage, delayMs: CHAT_RATIO_PERSIST_DEBOUNCE_MS })
    assert.equal(persistChatRatioNow(0.62, { storage }), true)
    await new Promise((resolve) => setTimeout(resolve, CHAT_RATIO_PERSIST_DEBOUNCE_MS + 30))
    assert.equal(readChatRatio({ storage }), 0.62, 'pointerup 的立即写必须赢过任何待发防抖写')
  })

  it('keeps the ratio across session switches, app restarts and viewport changes', () => {
    const storage = createStorage()
    persistChatRatioNow(0.47, { storage })

    // ① 切会话：没有任何按会话分片的键，重新读到的仍是同一个比例。
    assert.equal(readChatRatio({ storage }), 0.47)
    // ② 重开应用：同一份 localStorage 被重新读取。
    assert.equal(readChatRatio({ storage }), 0.47)
    // ③ 改窗口大小：比例与窗口尺寸无关，落盘值不变（像素由调用方按新舞台重算）。
    assert.equal(readChatRatio({ storage }), 0.47)
    assert.equal(
      storage.map.size,
      1,
      '全局只允许一份比例，不得按会话 / 页签分片',
    )
  })

  it('survives an unavailable storage without throwing', () => {
    const throwing = {
      getItem() { throw new Error('storage unavailable') },
      setItem() { throw new Error('storage unavailable') },
    }
    assert.equal(readChatRatio({ storage: throwing }), null)
    assert.equal(writeChatRatio(0.3, { storage: throwing }), false)
  })
})

describe('T05 老用户迁移（AC-11 观感不变）', () => {
  it('reverse-derives the ratio from the live authored geometry', () => {
    const storage = createStorage()
    // 升级前：1920 视口、左栏 280、外壳 authored 第三轨 864 → 中栏 776，舞台 1640。
    const ratio = migrateChatRatioFromAuthoredGeometry({
      viewportWidth: 1920,
      railVisiblePx: 280,
      railBaselinePx: 280,
      collapsed: false,
      rightTrackPx: 864,
    }, { storage })

    assert.ok(Math.abs(ratio - 776 / 1640) < 1e-9)
    assert.equal(readChatRatio({ storage }), ratio)

    // 迁移后按比例重算的中栏像素必须与升级前一致（±4px）。
    const migratedWidth = Math.round(1640 * ratio)
    assert.ok(Math.abs(migratedWidth - 776) <= 4, `迁移后中栏 ${migratedWidth}px 与升级前 776px 偏差超限`)
  })

  it('locks the expanded rail baseline while the left rail is collapsed', () => {
    const storage = createStorage()
    const ratio = migrateChatRatioFromAuthoredGeometry({
      viewportWidth: 1920,
      railVisiblePx: 0,
      railBaselinePx: 280,
      collapsed: true,
      rightTrackPx: 864,
    }, { storage })
    // 收起态：中栏 = 1920 − 864 = 1056，舞台仍锁展开态基线 1640。
    assert.ok(Math.abs(ratio - 1056 / 1640) < 1e-9)
  })

  it('refuses to migrate when the geometry cannot support it', () => {
    const storage = createStorage()
    for (const geometry of [
      { viewportWidth: 1920, railVisiblePx: 280, rightTrackPx: 0 },
      { viewportWidth: 1920, railVisiblePx: 280, rightTrackPx: null },
      { viewportWidth: 0, railVisiblePx: 280, rightTrackPx: 864 },
      { viewportWidth: 1000, railVisiblePx: 280, rightTrackPx: 720 },
    ]) {
      assert.equal(
        migrateChatRatioFromAuthoredGeometry(geometry, { storage }),
        null,
        `几何 ${JSON.stringify(geometry)} 不足以反推比例时必须放弃迁移`,
      )
    }
    assert.equal(storage.getItem(WORKSPACE_LAYOUT_KEY), null, '放弃迁移时不得写入任何值')
  })

  it('never overwrites an existing ratio (migration happens at most once)', () => {
    const storage = createStorage()
    persistChatRatioNow(0.3, { storage })
    const ratio = migrateChatRatioFromAuthoredGeometry({
      viewportWidth: 1920,
      railVisiblePx: 280,
      rightTrackPx: 864,
    }, { storage })
    assert.equal(ratio, 0.3, '已存比例时迁移必须返回已存值')
    assert.equal(readChatRatio({ storage }), 0.3, '已存比例绝不被迁移值覆盖')
  })
})
