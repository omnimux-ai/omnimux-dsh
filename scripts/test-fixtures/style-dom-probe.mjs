import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

import { findChromePath } from '../worktree-web-qa.mjs'

/**
 * Render one owner-local style fixture in an ephemeral incognito browser
 * session and return the computed geometry selected by `measure`.
 */
export function runStyleDomProbe({ name, styles, html, measure }) {
  const dir = mkdtempSync(join(tmpdir(), `omnimux-${name}-`))
  try {
    const page = join(dir, 'probe.html')
    const source = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>pending</title>
<style>* { box-sizing: border-box; margin: 0; padding: 0; } body { width: 1600px; background: #111; color: #fff; }</style>
<style>${styles}</style></head><body>${html}
<script>document.title = 'RESULT:' + JSON.stringify((${measure.toString()})());</script>
</body></html>`
    writeFileSync(page, source)
    const output = spawnSync(findChromePath(), [
      '--headless=new',
      '--incognito',
      `--user-data-dir=${join(dir, 'profile')}`,
      '--disable-gpu',
      '--disable-extensions',
      '--no-first-run',
      '--no-default-browser-check',
      '--window-size=1600,800',
      '--virtual-time-budget=1500',
      '--dump-dom',
      `file://${page}`,
    ], { encoding: 'utf8', timeout: 30000 })
    const match = /<title>RESULT:(.*?)<\/title>/s.exec(output.stdout || '')
    try {
      if (output.error) throw output.error
      assert.equal(output.status, 0, (output.stderr || '').slice(-2048) || `Chrome exited with ${output.status}`)
      assert.ok(match, `页面未回传测量结果: ${(output.stdout || '').slice(0, 300)}`)
      return JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'))
    } catch (error) {
      /** @type {{ name: string, timeoutMs: number, status: number | null, signal: string | null, stdoutTail: string, stderrTail: string, measurementPresent: boolean }} */
      const diagnostic = {
        name,
        timeoutMs: 30000,
        status: output.status,
        signal: output.signal,
        stdoutTail: (output.stdout || '').slice(-2048),
        stderrTail: (output.stderr || '').slice(-2048),
        measurementPresent: Boolean(match),
      }
      error.diagnostic = diagnostic
      error.message += `\nChrome probe diagnostic: ${JSON.stringify(diagnostic)}`
      throw error
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
