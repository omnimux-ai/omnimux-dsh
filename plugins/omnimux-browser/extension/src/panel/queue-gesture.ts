/**
 * 空输入框回车的「依次插话」手势：与原生 steerQueue 同构的判定。
 *
 * 成立时返回应当插话发送的队首条目 id；不成立返回 null，调用方保持原有回车语义。
 *
 * @module
 */

export interface QueueSteerGesture {
  /** 输入框当前文字。 */
  input: string
  /** 输入框是否挂着待发图片。 */
  hasDraftImages: boolean
  /** 当前轮是否在运行（与宿主 running 判定同构）。 */
  working: boolean
  /** 是否正在停止当前轮。 */
  stopping: boolean
  /** 宿主 next-turn 队列的条目 id，按先后顺序。 */
  queuedIds: readonly string[]
}

/** 返回本次回车应当插话发送的队首条目 id，条件不成立时为 null。 */
export function nextQueueSteer(gesture: QueueSteerGesture): string | null {
  if (gesture.input.trim() !== '' || gesture.hasDraftImages) return null
  if (!gesture.working || gesture.stopping) return null
  return gesture.queuedIds[0] ?? null
}
