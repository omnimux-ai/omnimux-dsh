/**
 * @file 插件自有配置存储 —— 「显式开启」开关的唯一真源。
 * 落盘 $DSH_HOME/omnimux-social-harvest/config.json；默认关（产品基线：显式开启）。
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { stateDir } from './config.js'

/** @typedef {{ enabled: boolean }} HarvestConfig */

/** 默认配置：总开关关。 @type {HarvestConfig} */
export const DEFAULT_CONFIG = Object.freeze({ enabled: false })

function configPath() {
  return path.join(stateDir(), 'config.json')
}

/**
 * 读配置；文件不存在或损坏时返回默认（关）。
 * @returns {Promise<HarvestConfig>}
 */
export async function loadConfig() {
  try {
    const raw = await readFile(configPath(), 'utf8')
    const parsed = JSON.parse(raw)
    return { enabled: parsed?.enabled === true }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

/**
 * 写配置（全量替换，目前只有 enabled 一个字段）。
 * @param {HarvestConfig} next
 */
export async function saveConfig(next) {
  await mkdir(stateDir(), { recursive: true })
  const value = { enabled: next?.enabled === true }
  await writeFile(configPath(), JSON.stringify(value, null, 2), 'utf8')
  return value
}
