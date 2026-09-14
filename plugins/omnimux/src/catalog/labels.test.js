import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { TEXT_MODEL_LABELS, textModelLabel } from './labels.js'

describe('TEXT_MODEL_LABELS', () => {
  it('uses the Issue #321 display names', () => {
    assert.equal(textModelLabel('claude-opus-4-6'), 'Claude Opus 4.6')
    assert.equal(textModelLabel('deepseek-v4-flash'), 'DeepSeek V4 Flash')
    assert.equal(textModelLabel('gpt-5.5'), 'GPT 5.5')
    // #1751：标签随 canonical 更名一起迁移；旧写法降级为别名，不再有独立标签条目。
    assert.equal(textModelLabel('deepseek-v4-flash-vision-exp'), 'deepseek-v4-flash-vision-exp')
  })

  it('forbids ASCII hyphen-minus in every curated display label', () => {
    for (const [id, label] of Object.entries(TEXT_MODEL_LABELS)) {
      assert.equal(typeof label, 'string')
      assert.doesNotMatch(
        label,
        /-/,
        `display label must not contain '-': ${id} → ${label}`,
      )
    }
  })
})
