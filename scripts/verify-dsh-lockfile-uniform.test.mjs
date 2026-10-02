import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findViolations, collectRcVersions } from './verify-dsh-lockfile-uniform.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..')

describe('verify-dsh-lockfile-uniform', () => {
  it('仓库当前锁文件：dsh-* 各 minor 线收敛单一 rc', () => {
    const text = readFileSync(resolve(repoRoot, 'pnpm-lock.yaml'), 'utf-8')
    assert.deepEqual(findViolations(text), [])
  })

  it('混版本锁文件（rc.2 + rc.3 并存）必须报红', () => {
    const mixed = `packages:
  '@deepseek-ai/dsh-llm@0.1.5-rc.2':
    resolution: {integrity: sha512-a}
  '@deepseek-ai/dsh-llm@0.1.5-rc.3':
    resolution: {integrity: sha512-b}
  '@deepseek-ai/dsh-agent@0.1.5-rc.3':
    resolution: {integrity: sha512-c}
`
    const v = findViolations(mixed)
    assert.equal(v.length, 1)
    assert.equal(v[0].pkg, '@deepseek-ai/dsh-llm')
    assert.deepEqual(v[0].rcs, ['2', '3'])
  })

  it('同一 minor 单一 rc + 其他 minor 独立钉位 → 通过', () => {
    const ok = `packages:
  '@deepseek-ai/dsh-llm@0.1.1-rc.2':
    resolution: {integrity: sha512-a}
  '@deepseek-ai/dsh-llm@0.1.5-rc.3':
    resolution: {integrity: sha512-b}
  '@deepseek-ai/dsh-session@0.1.5-rc.3':
    resolution: {integrity: sha512-c}
  '@deepseek-ai/dsh-scope@0.1.0-rc.8':
    resolution: {integrity: sha512-d}
`
    assert.deepEqual(findViolations(ok), [])
  })

  it('peer 后缀括号内的重复版本不产生误报', () => {
    const dup = `packages:
  '@deepseek-ai/dsh-llm@0.1.5-rc.3':
    resolution: {integrity: sha512-a}
snapshots:
  '@deepseek-ai/dsh-agent@0.1.5-rc.3(cordis@4.0.2)(dsh-llm@0.1.5-rc.3)':
    dependencies:
      '@deepseek-ai/dsh-llm': 0.1.5-rc.3(@deepseek-ai/cordis@4.0.2)
`
    const table = collectRcVersions(dup)
    assert.equal(table.get('@deepseek-ai/dsh-llm').get('0.1.5').size, 1)
    assert.deepEqual(findViolations(dup), [])
  })

  it('非 dsh-* 包与其他 scope 不参与约束', () => {
    const other = `packages:
  'react@18.3.1':
    resolution: {integrity: sha512-a}
  '@other/dsh-fake@0.1.5-rc.2':
    resolution: {integrity: sha512-b}
  '@other/dsh-fake@0.1.5-rc.3':
    resolution: {integrity: sha512-c}
`
    assert.deepEqual(findViolations(other), [])
  })
})
