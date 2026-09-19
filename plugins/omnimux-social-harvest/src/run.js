/**
 * @file 默认 run 装配 —— 全插件唯一 spawn OpenCLI 子进程的位置。
 *
 * 装配纪律（沿用 omnimux-intercept §1.3）：其余模块一律经注入的 run 触达外部进程，
 * 只有本文件 import node:child_process。
 */

import { spawn } from 'node:child_process'

import { OPENCLI_BIN } from './core/envelope.js'

/**
 * 构造默认 run：spawn opencli，聚合 stdout/stderr，超时杀进程。
 * @returns {(argv: string[], options: { timeoutMs: number, signal?: AbortSignal }) =>
 *   Promise<{ stdout: string, stderr: string, code: number }>}
 */
export function createDefaultRun() {
  return (argv, options) =>
    new Promise((resolve, reject) => {
      let child
      try {
        child = spawn(OPENCLI_BIN, argv, {
          stdio: ['ignore', 'pipe', 'pipe'],
          env: process.env,
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
