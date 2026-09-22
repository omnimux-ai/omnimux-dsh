import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const sessionCreateSrc = readFileSync(join(here, 'session-create.js'), 'utf8')
const plazaUtilsSrc = readFileSync(join(here, 'plaza/plazaUtils.js'), 'utf8')
const pickerSrc = readFileSync(join(here, 'skill-picker.js'), 'utf8')

describe('try skill in current session without install (issue 2166)', () => {
  it('exports trySkillInSession on window so plaza hover can reach it', () => {
    assert.match(sessionCreateSrc, /window\.trySkillInSession\s*=\s*trySkillInSession/)
    assert.match(plazaUtilsSrc, /fromWindow/)
    assert.match(plazaUtilsSrc, /window\.trySkillInSession/)
  })

  it('non-guide try attaches current session and never calls install', () => {
    assert.match(sessionCreateSrc, /api\(["']tryAttach["']/)
    assert.match(sessionCreateSrc, /currentPlazaSessionId/)
    assert.match(sessionCreateSrc, /skipInstall/)
    const tryFn = sessionCreateSrc.slice(sessionCreateSrc.indexOf('async function trySkillInSession'))
    const nonGuide = tryFn.slice(tryFn.indexOf('activateSharedToolSkill({ ...skill, slug })'))
    assert.doesNotMatch(nonGuide, /api\(["']install["']/)
    assert.match(nonGuide, /installed:\s*false/)
  })

  it('session-guide still installs then prefills', () => {
    assert.match(sessionCreateSrc, /installFlow === ["']session-guide["']/)
    assert.match(sessionCreateSrc, /sessionGuidePrefillText/)
    assert.match(sessionCreateSrc, /await api\(["']install["']/)
  })

  it('clearing the skill chip broadcasts removal and the market detaches once', () => {
    assert.match(pickerSrc, /omnimux:skill:changed/)
    assert.doesNotMatch(pickerSrc, /tryDetach/)
    assert.match(sessionCreateSrc, /omnimux:skill:changed/)
    assert.match(sessionCreateSrc, /tryDetach/)
  })

  it('trySkillInSession ensures conversation is visible and focuses composer (issue 2201)', () => {
    const tryFn = sessionCreateSrc.slice(sessionCreateSrc.indexOf('async function trySkillInSession'))
    assert.match(tryFn, /ensureConversationVisible/)
    assert.match(tryFn, /setFocus\?\.\(["']split["']\)/)
    assert.match(tryFn, /findComposer\(\)/)
    assert.match(tryFn, /findComposer\(\)\?\.focus/)
  })

  it('trySkillInSession lights the skill chip and never writes a slash command', () => {
    const tryFn = sessionCreateSrc.slice(sessionCreateSrc.indexOf('async function trySkillInSession'))
    const nonGuide = tryFn.slice(tryFn.indexOf('activateSharedToolSkill({ ...skill, slug })'))
    assert.doesNotMatch(nonGuide, /applySkillPrefillToComposer/)
    assert.match(nonGuide, /text:\s*""/)
  })
})
