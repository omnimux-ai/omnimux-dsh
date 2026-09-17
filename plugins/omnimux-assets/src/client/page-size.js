/**
 * 资产中心每批展示条数：跟当前列数走，铺满约三行。
 *
 * 目录分片仍是 24 条一份，本函数只决定客户端一次展示/追加多少张。
 * 上限 24 是为了不跨分片；下限 6 保证两列时也有三行骨架。
 */

import { GRID_MAX_COLUMNS, GRID_MIN_COLUMNS } from './grid-columns.js'

/** 首屏按几行铺。 */
export const PAGE_ROWS = 3

/** 一次最少几张：两列 × 三行。 */
export const PAGE_SIZE_MIN = GRID_MIN_COLUMNS * PAGE_ROWS

/** 一次最多几张：不超过目录分片。 */
export const PAGE_SIZE_MAX = 24

/**
 * 给定列数，返回本批展示条数。
 * 非法列数回落下限，不抛错。
 * @param {number} columns
 * @returns {number}
 */
export function pageSizeFor(columns) {
  const count = Number(columns)
  if (!Number.isFinite(count) || count <= 0) return PAGE_SIZE_MIN
  const raw = Math.floor(count) * PAGE_ROWS
  return Math.max(PAGE_SIZE_MIN, Math.min(PAGE_SIZE_MAX, raw))
}
