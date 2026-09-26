import { test } from 'node:test'
import { equal, deepEqual } from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { checkGlobalSkillsDir, ALLOWED_GLOBAL_SKILLS } from './verify-global-skills.mjs'

test('GATE-01: 全局技能白名单校验', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'test-global-skills-'))
  try {
    // 1. 空目录或只包含白名单技能时通过
    mkdirSync(join(tmp, 'web-access'))
    mkdirSync(join(tmp, 'read'))
    mkdirSync(join(tmp, 'write'))
    mkdirSync(join(tmp, 'genui'))
    const resPass = checkGlobalSkillsDir(tmp)
    equal(resPass.valid, true)
    equal(resPass.violations.length, 0)
    equal(resPass.count, 4)

    // 2. 混入特定垂直专业技能（如代码、摄影等）时失败拦截
    mkdirSync(join(tmp, 'code-review-expert'))
    mkdirSync(join(tmp, 'candid-character-photography'))
    const resFail = checkGlobalSkillsDir(tmp)
    equal(resFail.valid, false)
    equal(resFail.violations.length, 2)
    deepEqual(resFail.violations.sort(), ['candid-character-photography', 'code-review-expert'])
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})
