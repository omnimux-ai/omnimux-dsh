// @vitest-environment jsdom
// @ts-nocheck
import { describe, it } from 'vitest'
import { strict as assert } from 'node:assert'
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

// Static acceptance for the loopback transport rule (#3440). The behaviour is
// proven end-to-end in docs/evidence/browser-loopback-credentials-3440/; this
// test keeps the convention from drifting while the save path evolves.
const srcRoot = resolve(__dirname, '../../src')

function sourceFiles(dir) {
  const files = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      const nested = sourceFiles(path)
      for (const file of nested) files.push(file)
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      files.push(path)
    }
  }
  return files
}

describe('loopback credential boundary (#3440)', () => {
  it('keeps every loopback HTTP call on the no-credentials transport', () => {
    const helper = readFileSync(join(srcRoot, 'shared/loopback-fetch.ts'), 'utf8')
    assert.equal(helper.includes("credentials: 'omit'"), true)

    const offenders = []
    for (const file of sourceFiles(srcRoot)) {
      if (file.endsWith('shared/loopback-fetch.ts')) continue
      const code = readFileSync(file, 'utf8')
      if (/fetch\(\s*[`'"]http:\/\/127\.0\.0\.1/.test(code)) offenders.push(file)
    }
    assert.equal(offenders.length, 0)
  })

  it('names a 431 from the loopback save instead of reporting the host as absent', () => {
    const background = readFileSync(join(srcRoot, 'background/index.ts'), 'utf8')
    assert.equal(background.includes("'local-header-overflow'"), true)
    assert.equal(background.includes('res?.status === 431'), true)

    const panel = readFileSync(join(srcRoot, 'panel/App.tsx'), 'utf8')
    assert.equal(panel.includes("bgRes?.code === 'local-header-overflow'"), true)

    // 431 与普通失败的解释文案已抽到可测的 save-target-copy 模块。
    const copy = readFileSync(join(srcRoot, 'panel/save-target-copy.ts'), 'utf8')
    assert.equal(copy.includes('127.0.0.1 残留 cookie 过多（请求头超限）'), true)
    assert.equal(copy.includes("code === 'local-header-overflow'"), true)
    // Genuinely unreachable hosts keep the original message.
    assert.equal(copy.includes('保存失败，请检查 OmniMux 运行状态'), true)
  })
})
