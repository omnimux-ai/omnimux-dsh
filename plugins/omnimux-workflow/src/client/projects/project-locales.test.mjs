import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { en, zh } from '../locales.js'

describe('Workflow Projects Locales & i18n Dictionaries', () => {
  it('contains projects.all in both zh and en dictionaries', () => {
    assert.equal(zh['projects.all'], '全部')
    assert.equal(en['projects.all'], 'All')
  })

  it('uses creative-canvas library titles and Create Project button copy', () => {
    assert.equal(zh['stage.title'], '工作流')
    assert.equal(zh['projects.title'], '创作画布')
    assert.equal(zh['projects.pageTitle'], '创作画布')
    assert.equal(zh['projects.subtitle'], '管理本地创作画布项目')
    assert.equal(zh['projects.pageSubtitle'], '管理本地创作画布项目')
    assert.equal(zh['projects.newButton'], '创建项目')
    assert.equal(zh['projects.newProject'], '新项目')
    assert.equal(zh['projects.refresh'], '刷新')
    assert.equal(zh['projects.emptyTitle'], '还没有工作流项目')
    assert.equal(en['stage.title'], 'Workflow')
    assert.equal(en['projects.title'], 'Creative Canvas')
    assert.equal(en['projects.subtitle'], 'Manage local creative canvas projects')
    assert.equal(en['projects.newButton'], 'Create Project')
    assert.equal(en['projects.newProject'], 'New Project')
    assert.equal(en['projects.refresh'], 'Refresh')
  })

  it('covers B2 independent/linked projects and two-level delete copy', () => {
    assert.equal(zh['projects.independent'], '独立项目')
    assert.equal(en['projects.independent'], 'Independent project')
    assert.equal(zh['projects.bound'], '关联工作区')
    assert.equal(en['projects.bound'], 'Linked workspace')
    assert.equal(zh['projects.removeFromLibrary'], '移出项目库')
    assert.equal(en['projects.removeFromLibrary'], 'Remove from library')
    assert.equal(zh['projects.purge'], '删除项目')
    assert.equal(en['projects.purge'], 'Delete project')
    assert.notEqual(zh['projects.purge'], zh['projects.removeFromLibrary'], '两级删除文案必须区分')
    assert.match(zh['projects.purgeConfirm'], /画布与资产/)
    assert.match(en['projects.purgeConfirm'], /canvases and assets/)
    assert.match(zh['projects.removeFromLibraryConfirm'], /保留在磁盘/)
    assert.equal(zh['projects.preflight.initialize'], '将在该工作区初始化项目与首个创作页。')
    assert.match(zh['projects.preflight.open'], /\{title\}/)
    assert.equal(en['projects.preflight.rebuild'], 'Existing creative pages were found; the project will be rebuilt and included.')
  })

  it('ensures all projects.* keys exist in both zh and en dictionaries', () => {
    const zhKeys = Object.keys(zh).filter((k) => k.startsWith('projects.'))
    const enKeys = Object.keys(en).filter((k) => k.startsWith('projects.'))

    assert.deepEqual(zhKeys.sort(), enKeys.sort())

    for (const key of zhKeys) {
      assert.ok(zh[key] && typeof zh[key] === 'string', `zh missing valid string for ${key}`)
      assert.ok(en[key] && typeof en[key] === 'string', `en missing valid string for ${key}`)
    }
  })
})
