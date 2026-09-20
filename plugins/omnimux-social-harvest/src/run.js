/**
 * @file 默认 run 装配 —— 全插件唯一 spawn OpenCLI 子进程的位置。
 *
 * 装配纪律（沿用 omnimux-intercept §1.3）：其余模块一律经注入的 run 触达外部进程，
 * 只有本文件 import node:child_process。
 *
 * 环境变量自适应（Issue #2457）：macOS GUI App（如 LaunchServices 启动的 Electron）
 * 默认缺失用户终端 PATH（如 /usr/local/bin, /opt/homebrew/bin, nvm bin），本文件自动
 * 补全标准安装目录与动态探测 bin 路径，确保在 GUI 宿主环境下 100% 可行。
 */

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { OPENCLI_BIN } from './core/envelope.js'

/**
 * 构造子进程环境变量：在 process.env 基础上动态补齐 macOS/Linux 常见的包管理器与 CLI 安装目录。
 * 注意：必须通过 os.homedir() 动态推导，严禁硬编码特定用户名绝对路径。
 * @param {NodeJS.ProcessEnv} [baseEnv]
 * @returns {Record<string, string>}
 */
export function buildChildEnv(baseEnv = process.env) {
  const currentPath = baseEnv.PATH || ''
  const home = os.homedir()
  const extraPaths = [
    '/usr/local/bin',
    '/usr/local/sbin',
    '/opt/homebrew/bin',
    '/opt/homebrew/sbin',
    path.join(home, '.local/bin'),
    path.join(home, '.nvm/current/bin'),
  ]

  // 扫描用户 ~/.nvm/versions/node 下的所有版本 bin 目录
  try {
    const nvmNodeDir = path.join(home, '.nvm/versions/node')
    if (fs.existsSync(nvmNodeDir)) {
      const versions = fs.readdirSync(nvmNodeDir).sort().reverse()
      for (const ver of versions) {
        extraPaths.push(path.join(nvmNodeDir, ver, 'bin'))
      }
    }
  } catch {}

  const currentList = currentPath.split(':').filter(Boolean)
  const combined = Array.from(new Set([...extraPaths, ...currentList])).join(':')

  return {
    ...baseEnv,
    PATH: combined,
  }
}

/**
 * 在目标环境 PATH 中探测 opencli 可执行文件的绝对路径。
 * 命中即使用绝对路径，未命中则回落为 OPENCLI_BIN。
 * @param {Record<string, string>} env
 * @returns {string}
 */
export function resolveOpenCliBin(env) {
  if (env.OPENCLI_BIN && fs.existsSync(env.OPENCLI_BIN)) {
    return env.OPENCLI_BIN
  }
  const paths = (env.PATH || '').split(':').filter(Boolean)
  for (const dir of paths) {
    const target = path.join(dir, OPENCLI_BIN)
    try {
      if (fs.existsSync(target) && fs.statSync(target).isFile()) {
        return target
      }
    } catch {}
  }
  return OPENCLI_BIN
}

/**
 * 构造默认 run：spawn opencli，聚合 stdout/stderr，超时杀进程。
 * @returns {(argv: string[], options: { timeoutMs: number, signal?: AbortSignal }) =>
 *   Promise<{ stdout: string, stderr: string, code: number }>}
 */
export function createDefaultRun() {
  return (argv, options) =>
    new Promise((resolve, reject) => {
      const childEnv = buildChildEnv(process.env)
      const binPath = resolveOpenCliBin(childEnv)

      let child
      try {
        child = spawn(binPath, argv, {
          stdio: ['ignore', 'pipe', 'pipe'],
          env: childEnv,
        })
      } catch (err) {
        reject(err)
        return
      }

      let stdout = ''
      let stderr = ''
      let settled = false

      const finish = (code) => {
        if (settled) return
        settled = true
        resolve({ stdout, stderr, code })
      }

      const timer = setTimeout(() => {
        if (settled) return
        child.kill('SIGKILL')
        finish(75) // EX_TEMPFAIL
      }, options.timeoutMs)

      child.stdout.on('data', (chunk) => { stdout += String(chunk) })
      child.stderr.on('data', (chunk) => { stderr += String(chunk) })
      child.on('error', (err) => {
        clearTimeout(timer)
        if (settled) return
        settled = true
        // spawn ENOENT 等：以 exit 1 + stderr 诊断的形态交给分类器
        resolve({ stdout, stderr: stderr + String(err), code: 1 })
      })
      child.on('close', (code) => {
        clearTimeout(timer)
        finish(code ?? 1)
      })

      if (options.signal) {
        options.signal.addEventListener('abort', () => {
          clearTimeout(timer)
          child.kill('SIGKILL')
          finish(130)
        }, { once: true })
      }
    })
}
