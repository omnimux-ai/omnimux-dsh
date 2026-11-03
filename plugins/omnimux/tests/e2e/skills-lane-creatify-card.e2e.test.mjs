import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../../../../')
const cardPath = path.join(ROOT, 'plugins/omnimux/src/client/components/library-flow/UniversalLibraryCard.jsx')
const layoutPath = path.join(ROOT, 'plugins/omnimux/src/client/components/library-flow/masonry-layout.js')
const stylesPath = path.join(ROOT, 'plugins/omnimux/src/client/session-guide/styles.js')
const skillsJsonPath = path.join(ROOT, 'plugins/omnimux/src/client/session-guide/skills/featured-skills.json')

describe('E2E: 素材工作台 Skills lane 复用 Creatify 渐变技能卡（Issue #3918）', () => {
  it('UniversalLibraryCard 必须将 lane=skills 卡片分发到 SkillCard 并携带 category/index', () => {
    const src = fs.readFileSync(cardPath, 'utf8')

    // 1. 必须 import SkillCard 与 CATEGORY_NAMES
    assert.match(src, /import\s*\{[^}]*SkillCard[^}]*\}\s*from/, 'UniversalLibraryCard 必须 import SkillCard')
    assert.match(src, /import\s*\{[^}]*CATEGORY_NAMES[^}]*\}\s*from/, 'UniversalLibraryCard 必须 import CATEGORY_NAMES')
    assert.match(src, /import\s*\{[^}]*ensureGuideStyles[^}]*\}\s*from/, 'UniversalLibraryCard 必须 import ensureGuideStyles')

    // 2. 必须有 skills lane 分支且在 trending 之前（剥离注释，只匹配 if 分支）
    const codeOnly = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
    const skillsBranchIdx = codeOnly.search(/if\s*\(\s*lane\s*===\s*['"]skills['"]/)
    const trendingBranchIdx = codeOnly.search(/if\s*\(\s*lane\s*===\s*['"]trending['"]|isTrending/)
    assert.equal(skillsBranchIdx > -1, true, '必须存在 if (lane === "skills") 分支')
    assert.equal(trendingBranchIdx === -1 || skillsBranchIdx < trendingBranchIdx, true, 'skills 分支必须位于 trending 分支之前（短路优先级）')

    // 3. skills 分支内必须渲染 SkillCard 并传必要 props
    const branchBody = codeOnly.slice(skillsBranchIdx, skillsBranchIdx + 800)
    assert.match(branchBody, /<SkillCard\b/, 'skills 分支必须渲染 <SkillCard>')
    assert.match(branchBody, /categoryTitle\s*=\s*\{/, '必须传入 categoryTitle')
    assert.match(branchBody, /index\s*=\s*\{/, '必须传入 index')
    assert.match(branchBody, /onSelect\s*=\s*\{/, '必须传入 onSelect')

    // 4. skill 数据必须从 card.raw 读取（携带完整 featured-skills 行）
    assert.match(branchBody, /card\.raw\s*\|\|\s*card/, 'skills 分支必须从 card.raw || card 解出 skill')
  })

  it('masonry-layout 必须为 skills lane 声明 3:2 卡片比例，且 ensureGuideStyles 存在', () => {
    const layout = fs.readFileSync(layoutPath, 'utf8')
    const styles = fs.readFileSync(stylesPath, 'utf8')
    const skillsJson = JSON.parse(fs.readFileSync(skillsJsonPath, 'utf8'))

    // 5. masonry 比例 3:2（原为 1:1 方卡，Creatify 卡片应为 3:2 宽横卡）
    const skillsBlock = layout.match(/skills[\s\S]{0,300}/)
    assert.ok(skillsBlock, 'masonry-layout 必须声明 skills lane')
    assert.match(skillsBlock[0], /3\s*\/\s*2/, 'skills lane 卡片比例必须为 3/2')
    assert.doesNotMatch(skillsBlock[0], /1\s*\/\s*1/, 'skills lane 不得保留 1/1 方卡')

    // 6. ensureGuideStyles 必须存在（非幂等的 installGuideStyles 会重复注入）
    assert.match(styles, /export\s+function\s+ensureGuideStyles/, 'styles.js 必须导出 ensureGuideStyles')
    assert.match(styles, /GUIDE_STYLE_ID|getElementById/, 'ensureGuideStyles 必须幂等检查 style id')

    // 7. featured-skills 数据必须带分类字段供 CATEGORY_NAMES 映射
    assert.ok(Array.isArray(skillsJson.skills) && skillsJson.skills.length >= 100, 'skills 快照必须完整')
    for (const s of skillsJson.skills.slice(0, 20)) {
      assert.ok(typeof s.category === 'string' && s.category.length > 0, `技能 ${s.id} 必须有 category`)
      assert.ok(typeof s.isHot === 'boolean' && typeof s.isNew === 'boolean', `技能 ${s.id} 必须有 isHot/isNew`)
    }
  })
})
