import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import { transformSync } from 'esbuild'

const readClient = (name) => readFileSync(new URL(name, import.meta.url), 'utf8')

// i18n.js 是 client 工厂里的片段，没有 import/export，直接在沙箱里取 lookup。
const makeLookup = (lang) => runInNewContext(`${readClient('i18n.js')}\nlookup`, {
  React: { createContext: () => ({}) },
  document: { documentElement: { lang } },
})

// plazaUtils.js 是真正的 ESM 模块（import React / export），编译成 CJS 后注入 React 桩取导出。
const plazaUtils = (() => {
  const compiled = transformSync(readClient('plaza/plazaUtils.js'), {
    loader: 'jsx',
    format: 'cjs',
  }).code
  const moduleObj = { exports: {} }
  const reactStub = { createElement: () => ({}), Fragment: {} }
  new Function('require', 'module', 'exports', compiled)(
    (id) => (id === 'react' ? reactStub : {}),
    moduleObj,
    moduleObj.exports,
  )
  return moduleObj.exports
})()

const { EXPERT_STATUS_CONFIG, getExpertButtonText } = plazaUtils

test('专家卡片按钮文案为「招聘 / 解聘」，不对应「安装 / 禁用」', () => {
  const zh = makeLookup('zh')
  assert.equal(zh('expertMarket.install'), '招聘')
  assert.equal(zh('expertMarket.disable'), '解聘')
  assert.notEqual(zh('expertMarket.install'), '安装')
  assert.notEqual(zh('expertMarket.disable'), '禁用')
})

test('专家卡片按钮英文文案为 Hire / Dismiss', () => {
  const en = makeLookup('en')
  assert.equal(en('expertMarket.install'), 'Hire')
  assert.equal(en('expertMarket.disable'), 'Dismiss')
})

test('EXPERT_STATUS_CONFIG 的可入职、已入职、已离职状态按钮文案与字典一致', () => {
  const expected = {
    enabled: { btnKey: 'expertMarket.disable', zh: '解聘', en: 'Dismiss' },
    available: { btnKey: 'expertMarket.install', zh: '招聘', en: 'Hire' },
    disabled: { btnKey: 'expertMarket.install', zh: '招聘', en: 'Hire' },
  }
  const zh = makeLookup('zh')
  const en = makeLookup('en')
  for (const [status, want] of Object.entries(expected)) {
    const conf = EXPERT_STATUS_CONFIG[status]
    assert.ok(conf, `缺少状态配置: ${status}`)
    assert.equal(conf.btnKey, want.btnKey, `${status} 按钮应绑定 ${want.btnKey}`)
    assert.equal(conf.defaultBtn, want.zh)
    assert.equal(conf.defaultBtnEn, want.en)
    // 缺省文案是字典缺失时的兜底，必须与真实字典同值，防止两处文案漂移。
    assert.equal(conf.defaultBtn, zh(conf.btnKey))
    assert.equal(conf.defaultBtnEn, en(conf.btnKey))
  }
})

test('getExpertButtonText 优先取字典，字典缺失时回落到状态配置', () => {
  const zh = makeLookup('zh')
  const en = makeLookup('en')
  for (const status of ['enabled', 'available', 'disabled']) {
    const conf = EXPERT_STATUS_CONFIG[status]
    assert.equal(getExpertButtonText(conf, zh, false), conf.defaultBtn)
    assert.equal(getExpertButtonText(conf, en, true), conf.defaultBtnEn)
    assert.equal(getExpertButtonText(conf, () => '', false), conf.defaultBtn)
    assert.equal(getExpertButtonText(conf, () => '', true), conf.defaultBtnEn)
  }
  assert.equal(getExpertButtonText(EXPERT_STATUS_CONFIG.coming_soon, zh, false), '')
})
