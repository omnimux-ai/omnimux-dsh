/**
 * scripts/guard-quality-loop.test.mjs
 * Unit test suite for Quality Loop Hard Gate (Spec → Code → Verify → Test → Green)
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  isBusinessSourceFile,
  isE2ETestFile,
  hasValidSpec,
  hasVerifyEvidence,
  decideQualityGate,
} from './guard-quality-loop.mjs'

test('isBusinessSourceFile correctly identifies business source files vs exemptions', () => {
  const root = '/repo'
  // Business source files
  assert.equal(isBusinessSourceFile('/repo/plugins/omnimux/src/client.js', root), true)
  assert.equal(isBusinessSourceFile('/repo/plugins/omnimux-browser/extension/src/content.ts', root), true)
  assert.equal(isBusinessSourceFile('/repo/packages/form-contract/src/index.js', root), true)

  // Exemptions
  assert.equal(isBusinessSourceFile('/repo/specs/my.spec.md', root), false)
  assert.equal(isBusinessSourceFile('/repo/docs/readme.md', root), false)
  assert.equal(isBusinessSourceFile('/repo/package.json', root), false)
  assert.equal(isBusinessSourceFile('/repo/scripts/guard-worktree.mjs', root), false)
  assert.equal(isBusinessSourceFile('/repo/plugins/omnimux/tests/client.test.js', root), false)
  assert.equal(isBusinessSourceFile('/repo/plugins/omnimux/src/test-fixtures/shim.mjs', root), false)
})

test('isE2ETestFile correctly identifies E2E and UI tests', () => {
  const root = '/repo'
  assert.equal(isE2ETestFile('/repo/tests/e2e/login.spec.ts', root), true)
  assert.equal(isE2ETestFile('/repo/plugins/omnimux/tests/e2e/runner.js', root), true)
  assert.equal(isE2ETestFile('/repo/plugins/omnimux/tests/login.e2e.test.ts', root), true)
  assert.equal(isE2ETestFile('/repo/scripts/unit.test.mjs', root), false)
  assert.equal(isE2ETestFile('/repo/specs/feature.spec.md', root), false)
})

test('hasValidSpec checks existence and minimum size', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'spec-test-'))
  try {
    assert.equal(hasValidSpec(tempDir), false)

    const specsDir = join(tempDir, 'specs')
    mkdirSync(specsDir)

    // Empty or tiny file (< 50 chars)
    writeFileSync(join(specsDir, 'empty.md'), '# Title\n')
    assert.equal(hasValidSpec(tempDir), false)

    // Valid spec (> 50 chars)
    writeFileSync(
      join(specsDir, 'feature.spec.md'),
      '# Feature Specification\n\n## Acceptance Criteria\n- Step 1: Click button\n- Step 2: Expect result\n',
    )
    assert.equal(hasValidSpec(tempDir), true)
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
})

test('hasVerifyEvidence checks existence of verification artifacts', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'evidence-test-'))
  try {
    assert.equal(hasVerifyEvidence(tempDir), false)

    const evidenceDir = join(tempDir, '.workbuddy/evidence')
    mkdirSync(evidenceDir, { recursive: true })
    assert.equal(hasVerifyEvidence(tempDir), false)

    writeFileSync(join(evidenceDir, 'screenshot.png'), 'fake-png-bytes')
    assert.equal(hasVerifyEvidence(tempDir), true)
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
})

test('decideQualityGate enforces Spec Gate and Verify Gate', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'gate-test-'))
  try {
    // 1. Mock package.json to identify root
    writeFileSync(join(tempDir, 'package.json'), JSON.stringify({ name: 'omnimux-dsh' }))

    // 2. Try to write business code without spec -> DENIED
    const res1 = decideQualityGate({
      toolName: 'write',
      toolInput: { file_path: join(tempDir, 'plugins/omnimux/src/feature.js') },
      cwd: tempDir,
    })
    assert.equal(res1.decision, 'deny')
    assert.match(res1.message, /Spec 前置拦截/)

    // 3. Write a spec file -> ALLOWED (exempt)
    const resSpec = decideQualityGate({
      toolName: 'write',
      toolInput: { file_path: join(tempDir, 'specs/feature.spec.md') },
      cwd: tempDir,
    })
    assert.equal(resSpec.decision, 'allow')

    // Create the actual spec file
    mkdirSync(join(tempDir, 'specs'))
    writeFileSync(
      join(tempDir, 'specs/feature.spec.md'),
      '# My Feature Spec\n\n- User Journey 1: Open page and click\n- User Journey 2: Fill form and verify\n',
    )

    // 4. Try to write business code WITH spec -> ALLOWED
    const res2 = decideQualityGate({
      toolName: 'write',
      toolInput: { file_path: join(tempDir, 'plugins/omnimux/src/feature.js') },
      cwd: tempDir,
    })
    assert.equal(res2.decision, 'allow')

    // 5. Try to write E2E test without verification evidence -> DENIED
    const res3 = decideQualityGate({
      toolName: 'write',
      toolInput: { file_path: join(tempDir, 'tests/e2e/feature.spec.ts') },
      cwd: tempDir,
    })
    assert.equal(res3.decision, 'deny')
    assert.match(res3.message, /Verify 前置拦截/)

    // 6. Create verification evidence
    mkdirSync(join(tempDir, '.workbuddy/evidence'), { recursive: true })
    writeFileSync(join(tempDir, '.workbuddy/evidence/run.json'), '{"status":"ok"}')

    // 7. Try to write E2E test WITH verification evidence -> ALLOWED
    const res4 = decideQualityGate({
      toolName: 'write',
      toolInput: { file_path: join(tempDir, 'tests/e2e/feature.spec.ts') },
      cwd: tempDir,
    })
    assert.equal(res4.decision, 'allow')
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
})
