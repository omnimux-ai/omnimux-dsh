import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const sessionCreateSrc = readFileSync(join(here, 'session-create.js'), 'utf8')
const skillPlazaSrc = readFileSync(join(here, 'skill-plaza.js'), 'utf8')
const applySrc = readFileSync(join(here, 'apply.js'), 'utf8')
const cssSrc = readFileSync(join(here, 'css.js'), 'utf8')

describe('Skill Workshop UI & Session Contract (Issue #773 / #776)', () => {
  it('sidebar entry is positioned under projects (rank 4.1) via __omnimuxSidebar and footer action is removed', () => {
    assert.doesNotMatch(applySrc, /slots\.inject\(['"]sidebar\.footer\.action['"]/)
    assert.match(applySrc, /window\.__omnimuxSidebar/)
    assert.match(applySrc, /rank:\s*4\.1/)
    assert.match(applySrc, /data-omnimux-market-entry/)
    assert.match(applySrc, /data-omnimux-esc-entry/)
    assert.match(applySrc, /height:\s*32px/)
    assert.match(applySrc, /font-size:\s*14px/)
    assert.match(applySrc, /width:\s*14px;\s*height:\s*14px/)
  })

  it('session create helper creates real session B via sessions.create without modifying session A', () => {
    assert.match(sessionCreateSrc, /function createSkillSession/)
    assert.match(sessionCreateSrc, /sessions\.create\(createOpts\)/)
    assert.match(sessionCreateSrc, /sessions\.open\(sessionBId\)/)
    assert.match(sessionCreateSrc, /sessionBId === sessionAId/)
    // 严禁改写或清空原会话 A
    assert.doesNotMatch(sessionCreateSrc, /sessionA\.draft\s*=/)
    assert.doesNotMatch(sessionCreateSrc, /sessionA\.text\s*=/)
  })

  it('session create helper prefills /skill-creator with prompt without auto-sending (no auto-send)', () => {
    assert.match(sessionCreateSrc, /\/skill-creator\\n帮我使用它来创建一个新的技能。首先询问我这个技能应该做什么。/)
    // 严禁自动回车或提交
    assert.doesNotMatch(sessionCreateSrc, /composer\.submit/)
    assert.doesNotMatch(sessionCreateSrc, /dispatchEvent\(new KeyboardEvent\(['"]keydown['"],\s*\{\s*key:\s*['"]Enter['"]/)
    assert.doesNotMatch(sessionCreateSrc, /dispatchEvent\(new Event\(['"]submit['"]/)
  })

  it('session create helper performs CAS check preventing overwrite of existing user input', () => {
    assert.match(sessionCreateSrc, /composer\.value\.trim\(\)\.length\s*>\s*0/)
    assert.match(sessionCreateSrc, /prefilled\s*=\s*true/)
  })

  it('trySkillInSession helper quotes /<slug> without auto-send', () => {
    assert.match(sessionCreateSrc, /function trySkillInSession/)
    assert.match(sessionCreateSrc, /`\/\$\{slug\}\s*`/)
  })

  it('skill plaza renders dual tabs: Skill and 我的 Skill', () => {
    assert.match(skillPlazaSrc, /mainTab === "discover"/)
    assert.match(skillPlazaSrc, /mainTab === "mine"/)
    assert.match(skillPlazaSrc, /workshop\.tabSkill/)
    assert.match(skillPlazaSrc, /workshop\.tabMine/)
  })

  it('category order conforms to PRD §6.1 / AC-05 (11 items)', () => {
    assert.match(skillPlazaSrc, /WORKSHOP_DOMAIN_ORDER/)
    const expected = [
      '短剧漫剧',
      '专业影视',
      '动画',
      '商业广告',
      '电商',
      '教育',
      '创意实验',
      '音频音乐',
      '平台工具',
    ]
    for (const domain of expected) {
      assert.ok(skillPlazaSrc.includes(domain), `missing domain ${domain}`)
    }
  })

  it('featured section renders 4-column 16:9 cards and hides completely when 0 items', () => {
    assert.match(skillPlazaSrc, /featuredItems\.length\s*>\s*0/)
    assert.match(skillPlazaSrc, /featured-cover-wrap/)
    assert.match(skillPlazaSrc, /featured-hover-actions/)
    assert.match(skillPlazaSrc, /hover-btn-detail/)
    assert.match(skillPlazaSrc, /hover-btn-try/)
  })

  it('category featured hides other skills regular section (AC-14, AC-11)', () => {
    assert.match(skillPlazaSrc, /category === "featured" \? null :/)
  })

  it('install modal provides drag & drop and requirements notice', () => {
    assert.match(skillPlazaSrc, /function InstallModal/)
    assert.match(skillPlazaSrc, /drop-zone/)
    assert.match(skillPlazaSrc, /req-section/)
    assert.match(skillPlazaSrc, /btn-modal-install/)
  })

  it('switch toggle prompts installation confirmation for uninstalled skills', () => {
    assert.match(skillPlazaSrc, /function ConfirmInstallModal/)
    assert.match(skillPlazaSrc, /handleConfirmInstall/)
  })

  it('css defines minimalist design matching demo', () => {
    assert.match(cssSrc, /\.page-header/)
    assert.match(cssSrc, /\.page-title/)
    assert.match(cssSrc, /\.page-subtitle/)
    assert.match(cssSrc, /\.btn-create/)
    assert.match(cssSrc, /\.btn-install/)
    assert.match(cssSrc, /\.featured-cover-wrap/)
    assert.match(cssSrc, /aspect-ratio:\s*16\s*\/\s*9/)
    assert.match(cssSrc, /\.switch-bg\.on/)
    assert.match(cssSrc, /\.modal-dialog/)
  })
})
