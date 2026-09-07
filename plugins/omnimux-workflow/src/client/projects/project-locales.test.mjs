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
