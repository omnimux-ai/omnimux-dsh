import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import catalog from '../../catalog/index.json' with { type: 'json' }

const here = dirname(fileURLToPath(import.meta.url))
const sessionCreateSrc = readFileSync(join(here, 'session-create.js'), 'utf8')
const skillsUiSrc = readFileSync(join(here, 'skills-ui.js'), 'utf8')
const plazaUtilsSrc = readFileSync(join(here, 'plaza/plazaUtils.js'), 'utf8')

// 013fcb898 后 hypit-setup 下架；session-guide 契约以当前目录中的真实条目验证。
const guideItems = catalog.items.filter((row) => row.kind === 'skill' && row.installFlow === 'session-guide')
const ENTRY = guideItems.find((row) => row.id === 'sk-omx-ugc-confessional') || guideItems[0]

describe('session-guide skill contract (issue 2160 lineage)', () => {
  it('catalog lists discoverable session-guide entries with bilingual fields', () => {
    assert.ok(guideItems.length > 0, 'catalog must carry session-guide entries')
    const item = ENTRY
    assert.equal(item.kind, 'skill')
    assert.equal(item.tab, 'skills')
    assert.ok(item.skill, 'entry must carry a skill slug')
    assert.equal(item.installFlow, 'session-guide')
    assert.equal(item.source?.type, 'bundled')
    assert.match(String(item.source?.path || ''), /^catalog\/skills\//)
    assert.equal(item.recommended, true)
    assert.ok(item.titleZh && item.titleEn && item.summaryZh && item.summaryEn)
    assert.ok(String(item.sessionPrefill || '').length > 0, 'sessionPrefill must be present')
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

  it('search fields include the skill token for discovery', () => {
    const item = ENTRY
    const hay = [item.title, item.titleZh, item.titleEn, item.summary, item.summaryZh, item.skill, ...(item.tags || [])]
      .join(' ')
      .toLowerCase()
    assert.match(hay, new RegExp(item.skill.split('-')[0].toLowerCase()))
  })
})
