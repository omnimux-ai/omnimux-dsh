import { afterEach, describe, expect, it, vi } from 'vitest'
import { InspirationSaveRecovery } from './inspiration-recovery.ts'
import { INSPIRATION_RECOVERY_ALARM } from '../shared/inspiration-save.ts'

afterEach(() => vi.useRealTimers())
describe('inspiration task recovery cadence', () => {
  it('uses one foreground timer across observers and returns to a single minute alarm', async () => {
    vi.useFakeTimers()
    let pending = true
    const saves = { hasPending: async () => pending, reconcile: vi.fn(async () => {}) }
    const alarms = { create: vi.fn(async () => {}), clear: vi.fn(async () => true) }
    const recovery = new InspirationSaveRecovery(saves, alarms)
    await recovery.resume()
    expect(alarms.create).toHaveBeenLastCalledWith(INSPIRATION_RECOVERY_ALARM, { periodInMinutes: 1 })
    const releaseFirst = recovery.observe()
    const releaseSecond = recovery.observe()
    await recovery.refresh()
    expect(vi.getTimerCount()).toBe(1)
    saves.reconcile.mockClear()
    await vi.advanceTimersByTimeAsync(1000)
    expect(saves.reconcile).toHaveBeenCalledTimes(1)
    // A receipt update only refreshes cadence; it cannot schedule a recursive read.
    await recovery.refresh()
    expect(saves.reconcile).toHaveBeenCalledTimes(1)
    releaseFirst()
    await recovery.refresh()
    expect(vi.getTimerCount()).toBe(1)
    releaseSecond()
    await recovery.refresh()
    expect(vi.getTimerCount()).toBe(0)
    expect(alarms.create).toHaveBeenLastCalledWith(INSPIRATION_RECOVERY_ALARM, { periodInMinutes: 1 })
    pending = false
    await recovery.refresh()
    expect(alarms.clear).toHaveBeenLastCalledWith(INSPIRATION_RECOVERY_ALARM)
    expect(vi.getTimerCount()).toBe(0)
  })
})
