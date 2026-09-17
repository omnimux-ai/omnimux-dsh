import test from 'node:test'
import assert from 'node:assert/strict'
import {
  formatRegionLabel,
  formatIndustryLabel,
  isEnglishLocale,
} from './trending-i18n.js'

test('trending-i18n: 语言环境侦测', () => {
  assert.equal(isEnglishLocale((key) => (key === 'locale' ? 'zh' : key)), false)
  assert.equal(isEnglishLocale((key) => (key === 'locale' ? 'en' : key)), true)
  assert.equal(isEnglishLocale((key) => (key === 'locale' ? 'en-US' : key)), true)
  assert.equal(isEnglishLocale(null), false)
})

test('trending-i18n: 地区代码双语格式化（中文与英文）', () => {
  const zhT = (key) => (key === 'locale' ? 'zh' : key)
  const enT = (key) => (key === 'locale' ? 'en' : key)

  // 中文环境下：转换为专业标准中文国名
  assert.equal(formatRegionLabel('US', zhT), '美国')
  assert.equal(formatRegionLabel('TH', zhT), '泰国')
  assert.equal(formatRegionLabel('CA', zhT), '加拿大')
  assert.equal(formatRegionLabel('DE', zhT), '德国')
  assert.equal(formatRegionLabel('GB', zhT), '英国')
  assert.equal(formatRegionLabel('LV', zhT), '拉脱维亚')
  assert.equal(formatRegionLabel('MD', zhT), '摩尔多瓦')
  assert.equal(formatRegionLabel('SE', zhT), '瑞典')
  assert.equal(formatRegionLabel('jp', zhT), '日本', '支持大小写容错')

  // 英文环境下：转换为标准英文国名
  assert.equal(formatRegionLabel('US', enT), 'United States')
  assert.equal(formatRegionLabel('TH', enT), 'Thailand')
  assert.equal(formatRegionLabel('CA', enT), 'Canada')
  assert.equal(formatRegionLabel('DE', enT), 'Germany')
  assert.equal(formatRegionLabel('GB', enT), 'United Kingdom')
  assert.equal(formatRegionLabel('LV', enT), 'Latvia')
  assert.equal(formatRegionLabel('MD', enT), 'Moldova')
  assert.equal(formatRegionLabel('SE', enT), 'Sweden')

  // 未知国家代码：平滑降级展示原值，绝不报错
  assert.equal(formatRegionLabel('ZZ', zhT), 'ZZ')
  assert.equal(formatRegionLabel('ZZ', enT), 'ZZ')
  assert.equal(formatRegionLabel('', zhT), '')
})

test('trending-i18n: 行业类目双向解析与双语规整（消除中英混杂）', () => {
  const zhT = (key) => (key === 'locale' ? 'zh' : key)
  const enT = (key) => (key === 'locale' ? 'en' : key)

  // 1. 原生输入为英文别名时：
  // 中文环境规整为精炼标准中文
  assert.equal(formatIndustryLabel('digital', zhT), '数码家电')
  assert.equal(formatIndustryLabel('Education & Knowledge', zhT), '教育培训')
  assert.equal(formatIndustryLabel('Fitness', zhT), '运动健身')
  assert.equal(formatIndustryLabel('Food & Cooking', zhT), '食品饮料')
  assert.equal(formatIndustryLabel('beauty', zhT), '美妆个护')
  assert.equal(formatIndustryLabel('home', zhT), '家居生活')

  // 英文环境规整为标准 SaaS 术语
  assert.equal(formatIndustryLabel('digital', enT), 'Consumer Electronics')
  assert.equal(formatIndustryLabel('Education & Knowledge', enT), 'Education & Learning')
  assert.equal(formatIndustryLabel('Fitness', enT), 'Sports & Fitness')
  assert.equal(formatIndustryLabel('Food & Cooking', enT), 'Food & Beverage')
  assert.equal(formatIndustryLabel('beauty', enT), 'Beauty & Personal Care')
  assert.equal(formatIndustryLabel('home', enT), 'Home & Living')

  // 2. 原生输入为中文别名时：
  // 中文环境规整规范
  assert.equal(formatIndustryLabel('电脑和办公设备', zhT), '电脑办公')
  assert.equal(formatIndustryLabel('家居装修', zhT), '家居生活')
  assert.equal(formatIndustryLabel('健康', zhT), '医疗健康')
  assert.equal(formatIndustryLabel('女装和内衣', zhT), '女装内衣')

  // 英文环境下自动翻译为对应英文术语
  assert.equal(formatIndustryLabel('电脑和办公设备', enT), 'Computers & Office')
  assert.equal(formatIndustryLabel('家居装修', enT), 'Home & Living')
  assert.equal(formatIndustryLabel('健康', enT), 'Health & Wellness')
  assert.equal(formatIndustryLabel('女装和内衣', enT), "Women's Apparel")

  // 3. 未知自定义类目：平滑降级展示原值
  assert.equal(formatIndustryLabel('Custom Category XYZ', zhT), 'Custom Category XYZ')
  assert.equal(formatIndustryLabel('Custom Category XYZ', enT), 'Custom Category XYZ')
  assert.equal(formatIndustryLabel('', zhT), '')
})
