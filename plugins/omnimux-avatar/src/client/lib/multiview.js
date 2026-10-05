// 多视角（转面）设定板的状态派生：徽标状态、进度、占位记录与画廊分层。
//
// 来源：OmniMux/web/src/features/influencer/lib/multiview.ts（只读真源），行为 1:1。

import { parentTaskId } from './history.js'

/** 转面布局的生成尺寸。 */
export const MULTIVIEW_SIZE = '16:9'

/** @typedef {'absent'|'generating'|'failed'|'ready'} MultiViewState */

/**
 * 任务在画廊中的标识键。
 * @param {import('./types.js').TaskRecord} task
 * @returns {string}
 */
export function taskKey(task) {
  return String(task.task_id || task.id)
}

/**
 * 由卡片上挂载的派生行推导 1:1 徽标状态。
 * @param {import('./types.js').TaskRecord|null|undefined} child
 * @returns {MultiViewState}
 */
export function multiViewState(child) {
  if (!child) return 'absent'
  // 适配层对终态的拼法不止一种，两种都接受。
  const status = (child.status ?? '').toUpperCase()
  if (status === 'SUCCESS' || status === 'SUCCEEDED') return 'ready'
  if (status === 'FAILURE' || status === 'FAILED') return 'failed'
  return 'generating'
}

/**
 * 进度整数百分比，钳制在 0..100。
 * @param {import('./types.js').TaskRecord|null|undefined} child
 * @returns {number}
 */
export function multiViewProgress(child) {
  const parsed = Number.parseInt(child?.progress ?? '', 10)
  if (!Number.isFinite(parsed)) return 0
  return Math.min(Math.max(parsed, 0), 100)
}

/**
 * 刚提交但还无法从历史读到时的本地占位记录，使徽标无需等一轮轮询就出现。
 * @param {string} taskId
 * @returns {import('./types.js').TaskRecord}
 */
export function pendingMultiViewRecord(taskId) {
  return { id: 0, task_id: taskId, status: 'QUEUED', progress: '0%' }
}

/**
 * @typedef {object} PartitionedTasks
 * @property {import('./types.js').TaskRecord[]} roots 角色设定板，画廊只渲染这些行
 * @property {Map<string, import('./types.js').TaskRecord>} childByParent 每个父任务 id 下最新的派生行
 */

/**
 * 把历史拆成画廊根行与挂在根行上的派生行。
 * 派生行永不作为顶层卡片渲染；父行已不在列表中的派生行直接丢弃而不是提升。
 * @param {import('./types.js').TaskRecord[]} tasks
 * @returns {PartitionedTasks}
 */
export function partitionTasks(tasks) {
  /** @type {import('./types.js').TaskRecord[]} */
  const roots = []
  /** @type {Map<string, import('./types.js').TaskRecord>} */
  const childByParent = new Map()

  for (const task of tasks) {
    const parent = parentTaskId(task)
    if (!parent) {
      roots.push(task)
      continue
    }
    const current = childByParent.get(parent)
    if (!current || (task.id ?? 0) > (current.id ?? 0)) {
      childByParent.set(parent, task)
    }
  }

  const rootKeys = new Set(roots.map(taskKey))
  /** @type {string[]} */
  const orphans = []
  for (const parent of childByParent.keys()) {
    if (!rootKeys.has(parent)) orphans.push(parent)
  }
  for (const parent of orphans) childByParent.delete(parent)

  return { roots, childByParent }
}
