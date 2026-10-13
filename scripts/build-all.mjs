#!/usr/bin/env node
/**
 * scripts/build-all.mjs — OmniMux 全量插件并发构建调度器（主仓库自包含版）
 *
 * 职责：
 * 1. 扫描 plugins/* 下的所有产品插件；
 * 2. 识别 build 策略（scripts/build-client.mjs 或 package.json 中的 build 脚本）；
 * 3. 并发调度构建，汇总耗时与状态，统一收集错误（Exit 1），提供全局一致性保障。
 */

import { spawn } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { cpus } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pluginsDir = join(rootDir, 'plugins')

// 并发限制：min(4, max(2, cpus - 1))，避免打满 CPU 造成机器卡顿
const maxConcurrency = Math.min(4, Math.max(2, cpus().length - 1))

/**
 * 格式化输出带颜色的终端日志
 */
const log = {
  info: (msg) => process.stdout.write(`\x1b[36m[INFO]\x1b[0m ${msg}\n`),
  ok: (msg) => process.stdout.write(`\x1b[32m✓\x1b[0m ${msg}\n`),
  warn: (msg) => process.stdout.write(`\x1b[33m⚠\x1b[0m ${msg}\n`),
  err: (msg) => process.stderr.write(`\x1b[31m✗\x1b[0m ${msg}\n`),
}

/**
 * 执行指定目录下的命令
 */
function runCommand(command, args, cwd, name) {
  return new Promise((resolve) => {
    const startTime = Date.now()
    const child = spawn(command, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (d) => {
      stdout += d.toString()
    })
    child.stderr.on('data', (d) => {
      stderr += d.toString()
    })

    child.on('error', (err) => {
      resolve({
        name,
        success: false,
        duration: Date.now() - startTime,
        error: err.message,
        stdout,
        stderr,
      })
    })

    child.on('exit', (code) => {
      resolve({
        name,
        success: code === 0,
        code,
        duration: Date.now() - startTime,
        stdout,
        stderr,
      })
    })
  })
}

/**
 * 检查并确定插件的构建策略
 */
function resolvePluginBuildTask(pluginName, dir) {
  const pkgPath = join(dir, 'package.json')
  if (!existsSync(pkgPath)) return null

  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
    if(['omnimux','omnimux-avatar'].includes(pluginName)&&pkg.scripts?.build){
      return {name:pluginName,dir,command:'npm',args:['run','build','--silent']}
    }
    // 1. 特殊脚本：build-client.mjs
    if (existsSync(join(dir, 'scripts/build-client.mjs'))) {
      return {
        name: pluginName,
        dir,
        command: process.execPath,
        args: ['scripts/build-client.mjs'],
      }
    }
    // 2. package.json 声明了 scripts.build
    if (pkg.scripts?.build) {
      return {
        name: pluginName,
        dir,
        command: 'pnpm',
        args: ['--silent', 'run', 'build'],
      }
    }
  } catch (e) {
    log.warn(`解析 ${pluginName}/package.json 失败: ${e.message}`)
  }

  return null
}

async function main() {
  const overallStart = Date.now()
  process.stdout.write('\n============================================================\n')
  process.stdout.write('🚀 OmniMux 全量插件构建管线 (build:all)\n')
  process.stdout.write('============================================================\n\n')

  log.info(`扫描业务插件并执行并发构建 (并发度: ${maxConcurrency})...`)
  if (!existsSync(pluginsDir)) {
    log.err(`产品插件目录不存在: ${pluginsDir}`)
    process.exit(1)
  }

  const entries = readdirSync(pluginsDir, { withFileTypes: true })
  const tasks = []

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue
    const task = resolvePluginBuildTask(entry.name, join(pluginsDir, entry.name))
    if (task) {
      tasks.push(task)
    }
  }

  if (tasks.length === 0) {
    log.warn('未发现需要构建的业务插件')
    process.exit(0)
  }

  log.info(`发现 ${tasks.length} 个待构建插件: ${tasks.map((t) => t.name).join(', ')}`)

  // 并发池控制
  const results = []
  let activeIndex = 0

  async function worker() {
    while (activeIndex < tasks.length) {
      const taskIndex = activeIndex++
      const task = tasks[taskIndex]
      const res = await runCommand(task.command, task.args, task.dir, task.name)
      results.push(res)
      if (res.success) {
        log.ok(`[${task.name}] 构建完成 (${res.duration}ms)`)
      } else {
        log.err(`[${task.name}] 构建失败! (${res.duration}ms)`)
      }
    }
  }

  const workers = Array.from({ length: Math.min(maxConcurrency, tasks.length) }, () => worker())
  await Promise.all(workers)

  // 统计结果汇总
  const totalDuration = Date.now() - overallStart
  const failed = results.filter((r) => !r.success)

  process.stdout.write('\n============================================================\n')
  if (failed.length === 0) {
    log.ok(`全量构建成功！(共 ${results.length} 个插件，总耗时 ${(totalDuration / 1000).toFixed(2)}s)`)
    process.stdout.write('============================================================\n\n')
    process.exit(0)
  } else {
    log.err(`全量构建完成，但有 ${failed.length} 个插件构建失败:\n`)
    for (const f of failed) {
      process.stderr.write(`--- ❌ [${f.name}] 错误日志 ---\n`)
      process.stderr.write(f.stderr || f.stdout || '无控制台输出\n')
      process.stderr.write('----------------------------------------\n')
    }
    process.stdout.write('============================================================\n\n')
    process.exit(1)
  }
}

main().catch((err) => {
  log.err(`构建管线异常: ${err.message}`)
  process.exit(1)
})
