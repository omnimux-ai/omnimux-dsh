/**
 * @file 插件入口定义：命令注册 / 帮助 / 装配（**不产生副作用**）。
 *
 * 本插件是「CLI 优先」的独立插件：
 * - 不注册 Client Slot、不产出客户端 bundle、不引入 React；
 * - 不新增 hub seam、不改官方 Harness、不消费任何跨插件契约；
 * - 交互式看板一律以 GenUI spec 形态产出（`--format genui`）。
 *
 * `apply()` 在宿主提供命令注册 seam 时登记 `scan` 命令；seam 不存在时保持静默，
 * 命令仍可通过 `intercept` 直接调用。
 */

import { HELP_TEXT, VERSION, main } from './cli.js'

/** 插件 id（与 `dsh.manifest.json` 的 `id` 一致）。 */
export const name = 'omnimux-intercept'

/** 本插件不依赖任何宿主服务（CLI 自洽运行）。 @type {string[]} */
export const inject = []

/** 本插件对外暴露的命令名。 */
export const INTERCEPT_COMMANDS = Object.freeze(['scan'])

export { HELP_TEXT, VERSION }

/**
 * 执行一次 CLI（宿主调度与直接调用共用同一实现）。
 * @param {string[]} argv 参数
 * @param {Record<string, any>} [deps] 注入依赖
 * @returns {Promise<number>} 退出码
 */
export async function run(argv, deps) {
  return main(argv, deps)
}

/**
 * 帮助文本（宿主展示用）。
 * @returns {string}
 */
export function helpText() {
  return HELP_TEXT
}

/**
 * 插件装配：仅在宿主提供命令注册 seam 时登记命令，否则静默。
 *
 * **不产生副作用**：不读文件、不发起进程、不写盘。
 * @param {{ commands?: { add?: Function }, logger?: { info?: Function } }} [ctx] 宿主上下文
 * @returns {{ registered: boolean }}
 */
export function apply(ctx) {
  const add = ctx?.commands?.add
  if (typeof add !== 'function') {
    return { registered: false }
  }
  try {
    add({
      name: 'scan',
      summary: '扫描推特首页时间线，找出爆速推文并生成抢评草稿',
      help: HELP_TEXT,
      run: (/** @type {string[]} */ argv, /** @type {Record<string, any>} */ deps) =>
        main(argv, deps),
    })
    return { registered: true }
  } catch {
    return { registered: false }
  }
}

export default { name, inject, apply, run, helpText, INTERCEPT_COMMANDS, VERSION }
