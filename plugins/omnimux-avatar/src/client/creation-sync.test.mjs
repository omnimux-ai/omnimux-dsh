import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Taxonomy, ValidTier } from '../taxonomy.js'
import { BuildPrompt, ValidateSelection } from '../rules.js'
import { randomizeSelection } from './lib/randomize.js'
import { inspirationMediaUrl,selectedInspirationVideo } from './lib/inspiration-media.js'
import { visOpts } from './lib/taxonomy.js'

test('灵感实际使用唯一规范化受管媒体且拒绝路径跳转',()=>{
 const local='/omnimux/inspiration/media/video.mp4'
 assert.equal(inspirationMediaUrl(local),local)
 assert.equal(inspirationMediaUrl('/omnimux/inspiration/media/../../../api/omnimux/avatar/task'),null)
 assert.equal(inspirationMediaUrl('//external.test/video.mp4'),null)
 assert.equal(selectedInspirationVideo({media_urls:['https://external.test/video.mp4',local]}),local)
})

test('新增猫狗类别和颜色来自完整分类数据', () => {
  const tax = Taxonomy()
  assert.equal(tax.categories.length, 21)
  assert.equal(tax.categories.reduce((count, cat) => count + cat.options.length, 0), 208)
  assert.equal(ValidTier('cat'), true)
  assert.equal(ValidTier('dog'), true)
  assert.equal(tax.categories.find(cat => cat.id === 'hair_colour').options.length, 28)
  assert.equal(tax.categories.find(cat => cat.id === 'skin_tone').options.length, 9)
  assert.equal(visOpts(tax.categories.find(cat => cat.id === 'ethnicity_origin_base'), 'cat').length, 0)
})

test('动物可无特征默认生成，不套用人类面孔与冲突规则', () => {
  assert.deepEqual(ValidateSelection('cat', {}), {})
  assert.match(BuildPrompt('cat', {}), /cat|feline/i)
  assert.match(BuildPrompt('dog', {}), /dog|canine/i)
  assert.match(BuildPrompt('cat', {}), /bipedal|two legs/i)
  assert.doesNotMatch(BuildPrompt('cat', {}), /human face/i)
})

test('所有新角色固定横向胸像和全身双视图，提示词不能改输出布局', () => {
  assert.match(BuildPrompt('normal', {}, '红色衬衣'), /16:9/)
  assert.match(BuildPrompt('normal', {}, ''), /bust|chest-up/i)
  assert.match(BuildPrompt('normal', {}, ''), /full-body/i)
})

test('随机保留手选类别，其他类别仍变化', () => {
  const tax = Taxonomy()
  const locked = { gender: ['female'], hair_colour: ['hc_black'] }
  const result = randomizeSelection(tax, 'total', () => 0.6, locked)
  assert.deepEqual(result.gender, ['female'])
  assert.deepEqual(result.hair_colour, ['hc_black'])
  assert.equal(Object.keys(result).length > 2, true)
})
