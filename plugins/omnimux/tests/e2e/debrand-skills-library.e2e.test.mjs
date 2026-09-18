import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../../../../')
const snapshotPath = path.join(ROOT, 'plugins/omnimux/src/client/session-guide/skills/featured-skills.json')
const catalogPath = path.join(ROOT, 'plugins/omnimux-market/catalog/index.json')
const skillsDir = path.join(ROOT, 'plugins/omnimux-market/catalog/skills')

describe('E2E: 112套营销技能库全面去品牌化与专有工具描述彻底脱敏核验', () => {
  it('验证全量快照与目录中零品牌残留，author均为Official且tags无原厂词汇', () => {
    const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'))
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'))

    // 1. 验证快照 skills 数量与 tags
    assert.equal(snapshot.skills.length, 112, '必须有 112 套完整营销技能')
    for (const s of snapshot.skills) {
      assert.ok(!s.tags.some(t => t.toLowerCase() === 'creatify'), `技能 ${s.id} 标签不得包含原厂词汇`)
      assert.ok(!s.cover.includes('creatify'), `技能 ${s.id} 封面路径不得泄漏原厂目录`)
    }

    // 2. 验证 catalog items 中的技能
    const activeSkills = catalog.items.filter(i => i.kind === 'skill' && i.recommended)
    assert.equal(activeSkills.length, 112, 'catalog 激活技能数必须为 112')
    for (const item of activeSkills) {
      assert.equal(item.author, 'Official', `技能 ${item.id} 作者必须脱敏为 Official`)
      assert.ok(!item.tags.some(t => t.toLowerCase() === 'creatify'), `技能 ${item.id} 标签不得包含原厂词汇`)
      assert.ok(!item.cover.asset.includes('creatify'), `技能 ${item.id} 封面路径必须脱敏`)
    }

    // 3. 验证关键技能正文去专有工具化
    const c2sSkillMd = fs.readFileSync(path.join(skillsDir, 'course-to-short-video/SKILL.md'), 'utf8')
    assert.ok(!c2sSkillMd.toLowerCase().includes('creatify'), 'course-to-short-video 正文不得包含原厂词汇')
    assert.ok(!c2sSkillMd.includes('mcp__creatify'), 'course-to-short-video 不得绑定私有 MCP')

    const mdfSkillMd = fs.readFileSync(path.join(skillsDir, 'motion-design-flow/SKILL.md'), 'utf8')
    assert.ok(!mdfSkillMd.toLowerCase().includes('creatify'), 'motion-design-flow 正文不得包含原厂词汇')
  })
})
