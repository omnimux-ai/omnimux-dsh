/**
 * 保存飞行的纯策略：按 asset id 单飞 + 已保存去重。
 *
 * 与 React 无关，因此可在 node --test 下行为化验证（见 cloud-save-flight.test.js）。
 * `admit` 原子地判并占位，`settle` 原子地释放并按结果落库——
 * 单线程事件循环下无需额外锁，且不变量 savedIds ∩ savingIds = ∅ 由构造保证。
 *
 * 按 id 判定而非全局布尔：A 卡片在途不影响 B 卡片开始自己的保存。
 *
 * @returns {{
 *   savedIds: Set<string>,
 *   savingIds: Set<string>,
 *   admit: (id: string) => 'accept' | 'invalid' | 'in-flight' | 'saved',
 *   settle: (id: string, ok: boolean) => void,
 *   reset: () => void,
 * }}
 */
export function createCloudSaveFlight() {
  const savedIds = new Set()
  const savingIds = new Set()

  return {
    savedIds,
    savingIds,
    /** @param {string} id */
    admit(id) {
      if (id === '') return 'invalid'
      if (savingIds.has(id)) return 'in-flight'
      if (savedIds.has(id)) return 'saved'
      savingIds.add(id)
      return 'accept'
    },
    /** @param {string} id @param {boolean} ok */
    settle(id, ok) {
      savingIds.delete(id)
      if (ok === true) savedIds.add(id)
    },
    reset() {
      savedIds.clear()
      savingIds.clear()
    },
  }
}
