import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { assessAdmission, assessAuthorization, assessRuntimeAuthorization } from './authorization.mjs'

const maintainers = new Set(['boss-user'])
const comment = body => ({ author: { login: 'boss-user' }, body })
function issue(tier = 'R2') {
  return {
    body: `---\nrisk-tier: ${tier}\npre-authorized: true\n---\n`,
    labels: ['status:ready-to-run', `risk:${tier}`],
    comments: [comment(`/auto-approve risk:${tier}`)],
    state: 'OPEN',
  }
}

describe('admission', () => {
  it('keeps the legacy export as the same admission function', () => {
    assert.equal(assessAuthorization, assessAdmission)
    for (const tier of ['R2', 'R3']) {
      const auth = assessAdmission(issue(tier), maintainers)
      assert.equal(auth.eligible, true)
      assert.equal(auth.admitted, true)
    }
  })
  for (const [name, mutate, pattern] of [
    ['missing ready', value => { value.labels.shift() }, /ready-to-run/],
    ['missing approval', value => { value.comments = [] }, /auto-approve/],
    ['untrusted author', value => { value.comments[0].author.login = 'stranger' }, /auto-approve/],
    ['display name impersonation', value => { value.comments[0].author = { name: 'boss-user' } }, /auto-approve/],
    ['missing preauthorization', value => { value.body = value.body.replace('true', 'false') }, /pre-authorized/],
    ['missing risk frontmatter', value => { value.body = '---\npre-authorized: true\n---\n' }, /风险|frontmatter/],
    ['mismatched label', value => { value.labels[1] = 'risk:R3' }, /frontmatter/],
    ['multiple risk labels', value => { value.labels.push('risk:R1') }, /frontmatter/],
    ['mismatched approval', value => { value.comments = [comment('/auto-approve risk:R3')] }, /风险等级/],
    ['revoke', value => { value.comments.push(comment('/revoke')) }, /撤销/],
    ['closed', value => { value.state = 'closed' }, /closed/],
    ['blocked', value => { value.labels.push('status:blocked') }, /blocked/],
  ]) it(`rejects ${name}`, () => {
    const value = issue()
    mutate(value)
    const auth = assessAdmission(value, maintainers)
    assert.equal(auth.admitted, false)
    assert.match(auth.reasons.join(';'), pattern)
  })
  for (const tier of ['R0', 'R1']) it(`never admits ${tier}`, () => {
    assert.equal(assessAdmission(issue(tier), maintainers).eligible, false)
  })
  it('ignores quoted approvals and malformed risk tokens', () => {
    for (const body of ['> /auto-approve risk:R2', '/auto-approve risk:R2-extra', '/auto-approve risk:R23']) {
      assert.equal(assessAdmission({ ...issue(), comments: [comment(body)] }, maintainers).eligible, false)
    }
  })
})

describe('runtime authorization lifecycle', () => {
  it('admits, consumes ready, transitions to merge-pending, revokes and reauthorizes', () => {
    const value = issue()
    const original = structuredClone(value)
    assert.equal(assessAdmission(value, maintainers).admitted, true)
    assert.deepEqual(value, original, 'assessment must not mutate the Issue')
    value.labels = ['risk:R2', 'status:auto-merge-pending']
    assert.equal(assessAdmission(value, maintainers).eligible, false)
    assert.equal(assessRuntimeAuthorization(value, maintainers, 'R2').valid, true)
    value.comments.push(comment('/revoke: late cancellation'))
    assert.equal(assessRuntimeAuthorization(value, maintainers, 'R2').valid, false)
    value.comments.push(comment('/auto-approve risk:R2'))
    assert.equal(assessRuntimeAuthorization(value, maintainers, 'R2').valid, true)
    assert.equal(assessRuntimeAuthorization(value, maintainers, 'R1').valid, false)
  })
  it('ignores untrusted revoke but rejects removal of approval or preauthorization', () => {
    const value = issue()
    value.labels.shift()
    value.comments.push({ author: { login: 'stranger' }, body: '/revoke' })
    assert.equal(assessRuntimeAuthorization(value, maintainers, 'R2').valid, true)
    assert.equal(assessRuntimeAuthorization(value, new Set(), 'R2').valid, false)
    value.comments = []
    assert.equal(assessRuntimeAuthorization(value, maintainers, 'R2').valid, false)
    value.comments = issue().comments
    value.body = value.body.replace('true', 'false')
    assert.equal(assessRuntimeAuthorization(value, maintainers, 'R2').valid, false)
  })
  it('rejects closed, blocked or re-declared Issues', () => {
    for (const mutation of [{ state: 'CLOSED' }, { labels: ['risk:R2', 'status:blocked'] }, { body: issue('R3').body }]) {
      assert.equal(assessRuntimeAuthorization({ ...issue(), ...mutation }, maintainers, 'R2').valid, false)
    }
  })
  it('treats smaller tier numbers as higher risk and never expands R0/R1 authority', () => {
    assert.equal(assessRuntimeAuthorization(issue('R3'), maintainers, 'R2').valid, false)
    assert.equal(assessRuntimeAuthorization(issue('R2'), maintainers, 'R3').valid, true)
    for (const tier of ['R0', 'R1', '', 'unknown']) {
      const auth = assessRuntimeAuthorization(issue(), maintainers, tier)
      assert.equal(auth.valid, false)
      assert.match(auth.reasons.join(';'), /风险升级/)
    }
  })
})
