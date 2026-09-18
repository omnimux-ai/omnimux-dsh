import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { installBundledPack } from '../../src/expert/install.js'

test('kling-global-ad-localizer: catalog entries and bundled files are valid', () => {
  const catalogPath = join(import.meta.dirname, '../../catalog/index.json')
  assert.ok(existsSync(catalogPath), 'catalog/index.json must exist')
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'))

  // 1. 技能条目校验
  const skillEntry = catalog.items.find((x) => x.id === 'sk-omx-kling-global-ad-localizer')
  assert.ok(skillEntry, 'sk-omx-kling-global-ad-localizer must exist in index.json')
  assert.equal(skillEntry.tab, 'skills')
  assert.equal(skillEntry.kind, 'skill')
  assert.equal(skillEntry.source?.type, 'bundled')
  assert.equal(skillEntry.source?.path, 'catalog/skills/kling-global-ad-localizer')
  assert.equal(skillEntry.titleZh, 'TikTok出海广告本地化')
  assert.equal(skillEntry.titleEn, 'TikTok Global Ad Localization')
  assert.ok(skillEntry.summaryZh, 'must have Chinese summary')
  assert.ok(skillEntry.summaryEn, 'must have English summary')

  // 2. 物理文件完整性
  const pkgRoot = join(import.meta.dirname, '../..')
  const skillDir = join(pkgRoot, 'catalog/skills/kling-global-ad-localizer')
  assert.ok(existsSync(join(skillDir, 'SKILL.md')), 'SKILL.md must exist')
  assert.ok(existsSync(join(skillDir, 'meta.yaml')), 'meta.yaml must exist')
  assert.ok(existsSync(join(skillDir, 'references/kling-generation-runtime.md')), 'kling runtime contract must exist')
  assert.ok(existsSync(join(skillDir, 'agents/kling-global-ad-localizer.md')), 'agent md must exist')
  assert.ok(existsSync(join(skillDir, 'expert.png')), 'expert avatar must exist')
})

test('kling-global-ad-localizer: bundled install unpacks skill and references', () => {
  const pkgRoot = join(import.meta.dirname, '../..')
  const catalog = JSON.parse(readFileSync(join(pkgRoot, 'catalog/index.json'), 'utf8'))
  const skillEntry = catalog.items.find((x) => x.id === 'sk-omx-kling-global-ad-localizer')
  assert.ok(skillEntry)

  const tempHome = mkdtempSync(join(tmpdir(), 'kling-skill-install-test-'))
  try {
    installBundledPack(tempHome, skillEntry, pkgRoot)

    // 验证释放出的主技能包
    const installedDir = join(tempHome, 'skills', 'kling-global-ad-localizer')
    assert.ok(existsSync(join(installedDir, 'SKILL.md')), 'SKILL.md must exist after install')
    assert.ok(existsSync(join(installedDir, 'references/kling-generation-runtime.md')), 'contract references preserved')
    const skillContent = readFileSync(join(installedDir, 'SKILL.md'), 'utf8')
    assert.ok(skillContent.includes('TikTok出海广告本地化导演'), 'SKILL.md content preserved')
  } finally {
    rmSync(tempHome, { recursive: true, force: true })
  }
})
