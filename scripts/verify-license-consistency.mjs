#!/usr/bin/env node
/**
 * scripts/verify-license-consistency.mjs
 *
 * 包许可声明一致性门禁（Issue #3817）：
 * 1. 每个 plugins/* 包都必须在 scripts/license-registry.json 登记，且 registry 不得有死条目；
 * 2. package.json 的 license 字段必须与 registry 登记值一致；
 * 3. 每个包根必须有 LICENSE 文件，且 files 白名单必须显式包含 "LICENSE"；
 * 4. original 类（全自有代码）的包内 LICENSE 必须与仓库根 LICENSE 逐字节相同；
 *    根目录存在 NOTICE 时，original 与 vendor 类还须随包分发与根 NOTICE 逐字节相同的 NOTICE，
 *    且 files 白名单显式包含 "NOTICE"（AGPLv3 第 7 条附加条款随包可见，Issue #3841）；
 * 5. fork / vendor 类包的上游许可原文文件必须存在，且含登记的上游版权行；
 * 6. vendor 类包的包内 LICENSE 必须逐一提到登记的上游代码路径范围。
 *
 * 本门禁不改任何上游许可原文；它只阻止声明漂移。
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..')

/** 读取并解析 registry；供测试直接注入自定义 root。 */
export function readRegistry(root = repoRoot) {
  const path = join(root, 'scripts', 'license-registry.json')
  return JSON.parse(readFileSync(path, 'utf8'))
}

/** 列出磁盘上实际存在的插件目录名（不含隐藏目录与无 package.json 的目录）。 */
export function listPluginDirs(root = repoRoot) {
  const pluginsDir = join(root, 'plugins')
  if (!existsSync(pluginsDir)) return []
  return readdirSync(pluginsDir, { withFileTypes: true })
    .filter(e => e.isDirectory() && !e.name.startsWith('.'))
    .map(e => e.name)
    .filter(name => existsSync(join(pluginsDir, name, 'package.json')))
    .sort()
}

/**
 * 校验许可声明一致性。
 * @param {string} root 仓库根目录
 * @returns {{ errors: string[], warnings: string[], audited: number, counts: Record<string, number> }}
 */
export function verifyLicenseConsistency(root = repoRoot) {
  const errors = []
  const warnings = []
  const counts = { original: 0, fork: 0, vendor: 0 }
  let audited = 0

  let registry
  try {
    registry = readRegistry(root)
  } catch (err) {
    return { errors: ['scripts/license-registry.json 读取失败: ' + err.message], warnings, audited: 0, counts }
  }

  const registered = registry.packages || {}
  const onDisk = listPluginDirs(root)

  for (const dir of onDisk) {
    if (!Object.hasOwn(registered, dir)) {
      errors.push('[' + dir + '] 未在 scripts/license-registry.json 登记，许可声明无真源')
    }
  }
  for (const name of Object.keys(registered)) {
    if (!onDisk.includes(name)) {
      errors.push('[' + name + '] registry 登记了不存在的插件目录')
    }
  }

  const rootLicensePath = join(root, registry.rootLicense || 'LICENSE')
  if (!existsSync(rootLicensePath)) {
    return { errors: ['根许可文件不存在: ' + registry.rootLicense], warnings, audited: 0, counts }
  }
  const rootLicenseText = readFileSync(rootLicensePath, 'utf8')
  // registry 声明了 rootNotice 时，根 NOTICE 必须存在；未声明则不启用 NOTICE 检查（兼容最小测试夹具）
  let rootNoticeText = null
  if (registry.rootNotice) {
    const rootNoticePath = join(root, registry.rootNotice)
    if (!existsSync(rootNoticePath)) {
      return { errors: ['根 NOTICE 文件不存在: ' + registry.rootNotice], warnings, audited: 0, counts }
    }
    rootNoticeText = readFileSync(rootNoticePath, 'utf8')
  }

  for (const dir of onDisk) {
    const entry = registered[dir]
    if (!entry) continue
    audited++
    const pluginDir = join(root, 'plugins', dir)
    const pkgPath = join(pluginDir, 'package.json')
    let pkg
    try {
      pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
    } catch (err) {
      errors.push('[' + dir + '] package.json 解析失败: ' + err.message)
      continue
    }

    if (!counts[entry.class]) counts[entry.class] = 0
    counts[entry.class]++

    // 检查 2: license 字段与 registry 一致
    if (pkg.license !== entry.license) {
      errors.push(
        '[' + dir + '] license 字段为 "' + (pkg.license ?? '(缺失)') + '"，registry 要求 "' + entry.license + '"'
      )
    }

    // 检查 3: 包内 LICENSE 存在且被 files 覆盖
    const licensePath = join(pluginDir, 'LICENSE')
    const hasLicense = existsSync(licensePath)
    if (!hasLicense) {
      errors.push('[' + dir + '] 包根缺少 LICENSE 文件，npm 消费者读不到适用许可原文')
    }
    if (Array.isArray(pkg.files) && !pkg.files.some(f => f === 'LICENSE' || f === './LICENSE')) {
      errors.push('[' + dir + '] files 白名单未显式包含 "LICENSE"')
    }

    // 检查 4: original 类必须是根许可原文
    if (entry.class === 'original' && hasLicense) {
      const text = readFileSync(licensePath, 'utf8')
      if (text !== rootLicenseText) {
        errors.push('[' + dir + '] 原创包的 LICENSE 与根 LICENSE 不一致（应为逐字节相同）')
      }
    }

    // 检查 4b: 含 OmniMux 自有代码的包（original / vendor）必须随包分发根 NOTICE（AGPLv3 第 7 条附加条款）
    if (rootNoticeText !== null && (entry.class === 'original' || entry.class === 'vendor')) {
      const noticePath = join(pluginDir, 'NOTICE')
      if (!existsSync(noticePath)) {
        errors.push('[' + dir + '] 包根缺少 NOTICE，npm 消费者读不到 AGPLv3 第 7 条附加条款')
      } else if (readFileSync(noticePath, 'utf8') !== rootNoticeText) {
        errors.push('[' + dir + '] 包内 NOTICE 与根 NOTICE 不一致（应为逐字节相同）')
      }
      if (Array.isArray(pkg.files) && !pkg.files.some(f => f === 'NOTICE' || f === './NOTICE')) {
        errors.push('[' + dir + '] files 白名单未显式包含 "NOTICE"')
      }
    }

    if (entry.class !== 'original') {
      // 检查 5: 上游许可原文文件存在且含登记版权行
      for (const up of entry.upstream || []) {
        const textFile = join(pluginDir, up.textFile)
        if (!existsSync(textFile)) {
          errors.push('[' + dir + '] 缺少上游许可原文 "' + up.textFile + '"（' + up.project + '）')
        } else {
          const text = readFileSync(textFile, 'utf8')
          if (!text.includes(up.copyright)) {
            errors.push('[' + dir + '] "' + up.textFile + '" 中找不到登记的版权行 "' + up.copyright + '"')
          }
        }
        if (up.noticeFile && up.noticeFile !== up.textFile && !existsSync(join(pluginDir, up.noticeFile))) {
          errors.push('[' + dir + '] 缺少上游声明文件 "' + up.noticeFile + '"（' + up.project + '）')
        }
        if (up.commit === null || up.commit === undefined) {
          warnings.push('[' + dir + '] 上游基线 commit 未记录（' + up.project + '），再同步时无法做三方比对')
        }
      }

      // 检查 6: vendor 类包内 LICENSE 必须提到上游路径范围
      if (entry.class === 'vendor' && hasLicense) {
        const text = readFileSync(licensePath, 'utf8')
        for (const up of entry.upstream || []) {
          for (const p of up.paths || []) {
            if (!text.includes(p)) {
              errors.push('[' + dir + '] 包内 LICENSE 未声明上游代码路径范围 "' + p + '"（' + up.project + '）')
            }
          }
        }
      }
    }
  }

  return { errors, warnings, audited, counts }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const { errors, warnings, audited, counts } = verifyLicenseConsistency(repoRoot)
  for (const w of warnings) console.warn('WARN ' + w)
  if (errors.length > 0) {
    for (const e of errors) console.error('ERROR ' + e)
    console.error('\n许可声明一致性门禁失败：' + errors.length + ' 项错误 / ' + audited + ' 个包')
    process.exit(1)
  }
  console.log(
    '许可声明一致性通过：' + audited + ' 个包（original ' + (counts.original || 0) +
    ' / fork ' + (counts.fork || 0) + ' / vendor ' + (counts.vendor || 0) + '），' +
    warnings.length + ' 条警告'
  )
}
