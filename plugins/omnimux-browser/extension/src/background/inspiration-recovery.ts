import { INSPIRATION_RECOVERY_ALARM } from '../shared/inspiration-save.ts'

interface RecoverableSaves { hasPending(): Promise<boolean>; reconcile(): Promise<void> }
interface RecoveryAlarms { create(name: string, info: chrome.alarms.AlarmCreateInfo): Promise<void> | void; clear(name: string): Promise<boolean> }

/** Exactly one recovery cadence: visible observers use 1 s; otherwise one alarm uses 1 min. */
export class InspirationSaveRecovery {
  private observers = 0
  private timer: ReturnType<typeof setInterval> | undefined
  constructor(private readonly saves: RecoverableSaves, private readonly alarms: RecoveryAlarms) {}
  async refresh(): Promise<void> {
    const pending = await this.saves.hasPending()
    if (!pending || this.observers === 0) {
      if (this.timer !== undefined) clearInterval(this.timer)
      this.timer = undefined
    } else if (this.timer === undefined) {
      this.timer = setInterval(() => { void this.saves.reconcile() }, 1_000)
    }
    if (pending && this.observers === 0) await this.alarms.create(INSPIRATION_RECOVERY_ALARM, { periodInMinutes: 1 })
    else await this.alarms.clear(INSPIRATION_RECOVERY_ALARM)
  }
  async resume(): Promise<void> { await this.saves.reconcile(); await this.refresh() }
  observe(): () => void {
    this.observers += 1
    void this.resume()
    let released = false
    return () => {
      if (released) return
      released = true
      this.observers -= 1
      void this.refresh()
    }
  }
}
