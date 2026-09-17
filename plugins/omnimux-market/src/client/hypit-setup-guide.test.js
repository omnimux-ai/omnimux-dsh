import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import catalog from '../../catalog/index.json' with { type: 'json' }
import recommendations from '../../catalog/skill-recommendations.json' with { type: 'json' }

const here = dirname(fileURLToPath(import.meta.url))
const sessionCreateSrc = readFileSync(join(here, 'session-create.js'), 'utf8')
const skillsUiSrc = readFileSync(join(here, 'skills-ui.js'), 'utf8')
const plazaUtilsSrc = readFileSync(join(here, 'plaza/plazaUtils.js'), 'utf8')
const skillMd = readFileSync(join(here, '../../catalog/skills/hypit-setup/SKILL.md'), 'utf8')

const ENTRY_ID = 'sk-omx-hypit-setup'
const SLUG = 'hypit-setup'

describe('Hypit optional session-guide skill (issue 2160)', () => {
  it('catalog lists discoverable session-guide entry with bilingual fields', () => {
    const item = catalog.items.find((row) => row.id === ENTRY_ID)
    assert.ok(item, 'catalog must include sk-omx-hypit-setup')
    assert.equal(item.kind, 'skill')
    assert.equal(item.tab, 'skills')
    assert.equal(item.skill, SLUG)
    assert.equal(item.title, 'Hypit-克隆爆款视频')
    assert.equal(item.titleZh, 'Hypit-克隆爆款视频')
    assert.equal(item.installFlow, 'session-guide')
    assert.equal(item.source?.type, 'bundled')
    assert.match(String(item.source?.path || ''), /catalog\/skills\/hypit-setup/)
    assert.equal(item.recommended, true)
    assert.ok(item.titleZh && item.titleEn && item.summaryZh && item.summaryEn)
    assert.match(String(item.sessionPrefill || ''), /npx skills add hypit-ai\/hypit -g/)
    assert.match(String(item.sessionPrefill || ''), /@hypit\/hypit/)
    assert.ok(recommendations.featuredSkills.includes(ENTRY_ID))
  })

  it('guide skill body is OmniMux-owned and forbids bundling Hypit engine', () => {
    assert.match(skillMd, /name:\s*hypit-setup/)
    assert.match(skillMd, /不捆绑/)
    assert.match(skillMd, /npx skills add hypit-ai\/hypit -g/)
    assert.match(skillMd, /@hypit\/hypit/)
    assert.doesNotMatch(skillMd, /tmp\/hypit-upstream/)
    assert.doesNotMatch(skillMd, /\/Users\//)
  })

  it('session helper activates shared-tool pill and uses sessionPrefill for guide flow', () => {
    assert.match(sessionCreateSrc, /function activateSharedToolSkill/)
    assert.match(sessionCreateSrc, /__omnimuxActiveSkill/)
    assert.match(sessionCreateSrc, /omnimux:skill:changed/)
    assert.match(sessionCreateSrc, /installFlow === ["']session-guide["']/)
    assert.match(sessionCreateSrc, /sessionGuidePrefillText/)
    assert.match(sessionCreateSrc, /sessionPrefill/)
    assert.doesNotMatch(sessionCreateSrc, /composer\.submit/)
    assert.doesNotMatch(sessionCreateSrc, /dispatchEvent\(new KeyboardEvent\(['"]keydown['"]/)
  })

  it('detail install button routes session-guide through trySkillInSession', () => {
    assert.match(skillsUiSrc, /installFlow === ["']session-guide["']/)
    assert.match(skillsUiSrc, /trySkillInSession\(/)
    assert.match(plazaUtilsSrc, /installFlow === ['"]session-guide['"]/)
  })

  it('search fields include hypit token for discovery', () => {
    const item = catalog.items.find((row) => row.id === ENTRY_ID)
    const hay = [item.title, item.titleZh, item.titleEn, item.summary, item.summaryZh, item.skill, ...(item.tags || [])]
      .join(' ')
      .toLowerCase()
    assert.match(hay, /hypit/)
  })
})
