import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

describe('market workbench seat (sidebar must not claim overlay)', () => {
  it('plaza action uses the workbench open, not the product stage claim', () => {
    const source = readFileSync(join(here, 'plaza-shell.js'), 'utf8')
    assert.match(source, /__omnimuxWorkbench/)
    assert.match(source, /omnimux-market:plaza/)
    assert.doesNotMatch(source, /__omnimuxStage\.claim/)
  })

  it('client apply registers plaza tab on betterSidebar', () => {
    const source = readFileSync(join(here, 'apply.js'), 'utf8')
    assert.match(source, /PLAZA_TAB_ID/)
    assert.match(source, /registerPlazaTab/)
    assert.match(source, /icon:\s*renderPlazaIcon/)
    assert.doesNotMatch(source, /slots\.inject\(['"]shell\.overlay['"]/)
  })

  it('plaza entry is registered to __omnimuxSidebar under projects (rank 4.1), not in footer', () => {
    const source = readFileSync(join(here, 'apply.js'), 'utf8')
    assert.doesNotMatch(source, /slots\.inject\(['"]sidebar\.footer\.action['"]/)
    assert.match(source, /__omnimuxSidebar/)
    assert.match(source, /rank:\s*4\.1/)
    assert.match(source, /data-omnimux-market-entry/)
    assert.match(source, /PLAZA_TAB_ID/)
  })

  it('registers the composer Skill picker on conversation.input.left', () => {
    const source = readFileSync(join(here, 'apply.js'), 'utf8')
    assert.match(source, /conversation\.input\.left/)
    assert.match(source, /omnimux-market-skill-picker/)
    assert.match(source, /SkillPickerButton/)
  })

  it('Skill trigger uses a puzzle icon and has no border', () => {
    const picker = readFileSync(join(here, 'skill-picker.js'), 'utf8')
    const css = readFileSync(join(here, 'css.js'), 'utf8')
    assert.match(picker, /function renderPuzzleIcon/)
    assert.match(picker, /renderPuzzleIcon\(16\)/)
    assert.match(picker, /viewBox: "0 0 24 24"/)
    assert.match(picker, /M15\.39 4\.39a1 1 0 0 0 1\.68-\.474/)
    assert.doesNotMatch(picker, /renderPlazaIcon\(16\)/)
    assert.match(picker, /let left = r\.left/)
    assert.doesNotMatch(picker, /r\.right - width/)
    assert.match(css, /\.sh-picker-trigger\{[^}]*border:0/)
    assert.match(picker, /peekPickerCache/)
    assert.match(picker, /pickerSearchCache/)
    // 货架规则统一走 SkillShelf 真源（Issue #504），不再内联标签字面量
    assert.match(picker, /SkillShelf\.PICKER_TABS/)
    assert.match(picker, /SkillShelf\.filterPickerItems/)
    assert.doesNotMatch(picker, /const SKILL_SHELF_TAGS = \[/)
  })

  it('skill plaza consumes SkillShelf rules instead of SkillHub categories', () => {
    const plaza = readFileSync(join(here, 'skill-plaza.js'), 'utf8')
    assert.match(plaza, /SkillShelf\.SKILL_SHELF_TAXONOMY/)
    assert.match(plaza, /SkillShelf\.plazaDiscoverySections/)
    assert.doesNotMatch(plaza, /const PLAZA_SHELF_TAGS = \[/)
    assert.doesNotMatch(plaza, /office-efficiency/)
    // 渠道由 buildPlazaSearchPayload 真源决定（有 query 才含 skillhub），禁止写死双渠道
    assert.match(plaza, /SkillShelf\.buildPlazaSearchPayload/)
    assert.doesNotMatch(plaza, /channels: \["custom", "workbuddy"\]/)
  })

  it('plaza view consumes a one-shot skills tab intent', () => {
    const source = readFileSync(join(here, 'plaza-shell.js'), 'utf8')
    assert.match(source, /omnimux-market:plaza-intent/)
    assert.match(source, /function consumePlazaIntent/)
    assert.match(source, /setTab\(intent\)/)
  })

  it('plaza icon SVG carries explicit square width and height', () => {
    const source = readFileSync(join(here, 'skill-plaza.js'), 'utf8')
    assert.match(source, /function renderPlazaIcon/)
    assert.match(source, /width:\s*px/)
    assert.match(source, /height:\s*px/)
    assert.match(source, /preserveAspectRatio:\s*"xMidYMid meet"/)
  })

  it('plaza title is Skills', () => {
    const source = readFileSync(join(here, 'i18n.js'), 'utf8')
    assert.match(source, /"plaza.title": "Skills"/)
    assert.doesNotMatch(source, /插件市场/)
    assert.doesNotMatch(source, /Plugin Market/)
    assert.doesNotMatch(source, /扩展市场/)
    assert.doesNotMatch(source, /Extension Market/)
  })

  it('plaza shell has no in-tab FocusBar and does not claim overlay', () => {
    const shell = readFileSync(join(here, 'plaza-shell.js'), 'utf8')
    assert.doesNotMatch(shell, /PlazaFocusBar/)
    assert.doesNotMatch(shell, /data-omnimux-workbench-focus/)
    assert.doesNotMatch(shell, /omnimux-workbench-focus/)
    assert.match(shell, /__omnimuxWorkbench/)
    assert.doesNotMatch(shell, /__omnimuxStage\.claim/)
  })

  it('skill picker button binds to agent preset and hides when unbound', () => {
    const picker = readFileSync(join(here, 'skill-picker.js'), 'utf8')
    assert.match(picker, /SkillShelf\.resolveActivePreset/)
    assert.match(picker, /SkillShelf\.getPresetSkillBinding/)
    assert.match(picker, /if \(!presetBinding\)\s*\{\s*return null;\s*\}/)
    assert.match(picker, /presetBinding/)
  })
})
