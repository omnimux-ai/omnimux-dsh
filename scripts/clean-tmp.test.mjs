import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

describe('clean-tmp script', () => {
  const tmpDir = '.tmp'
  const agentsPath = join(tmpDir, 'AGENTS.md')
  const dummyFilePath = join(tmpDir, 'dummy-probe.json')
  const nestedDirPath = join(tmpDir, 'nested-probe')
  const nestedFilePath = join(nestedDirPath, 'dump.log')

  let originalAgentsContent = null

  before(() => {
    mkdirSync(nestedDirPath, { recursive: true })
    if (existsSync(agentsPath)) {
      originalAgentsContent = readFileSync(agentsPath, 'utf8')
    }
    writeFileSync(dummyFilePath, '{"probe":true}', 'utf8')
    writeFileSync(nestedFilePath, 'log entry', 'utf8')
  })

  after(() => {
    if (originalAgentsContent !== null) {
      writeFileSync(agentsPath, originalAgentsContent, 'utf8')
    }
  })

  it('removes ephemeral payloads while preserving .tmp/AGENTS.md', () => {
    const res = spawnSync('node', ['scripts/clean-tmp.mjs'], {
      encoding: 'utf8',
    })
    assert.equal(res.status, 0)
    assert.equal(existsSync(agentsPath), true, 'AGENTS.md must be preserved')
    assert.equal(existsSync(dummyFilePath), false, 'dummy-probe.json must be incinerated')
    assert.equal(existsSync(nestedDirPath), false, 'nested-probe directory must be incinerated')
  })
})
