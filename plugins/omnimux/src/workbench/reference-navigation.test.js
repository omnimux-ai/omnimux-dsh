import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  RECOMMENDED_BREAKDOWN_TOOL,
  buildReferenceNavigationHint,
  extractVirtualReferences,
  withReferenceNavigation,
} from './reference-navigation.js'

describe('Reference navigation', () => {
  it('extracts inspiration references from real attached-context text', () => {
    const text = [
      '### 会话关联上下文 (Attached Context):',
      '- [视频] She really woke up and chose GTA-style chaos.',
      '(`MP4`): @inspiration/insp_ad704927.mp4',
    ].join('\n')

    assert.deepEqual(extractVirtualReferences(text), ['@inspiration/insp_ad704927.mp4'])
  })

  it('extracts every namespace, de-duplicated and in first-appearance order', () => {
    const text = [
      '@asset/banana-cat',
      '@inspiration/insp_1.mp4',
      '@asset/banana-cat',
      '@product/prod_42',
    ].join(' ')

    assert.deepEqual(extractVirtualReferences(text), [
      '@asset/banana-cat',
      '@inspiration/insp_1.mp4',
      '@product/prod_42',
    ])
  })

  it('does not absorb a sentence-ending period into the reference', () => {
    assert.deepEqual(
      extractVirtualReferences('见 @inspiration/insp_9.mp4. 就这样。'),
      ['@inspiration/insp_9.mp4'],
    )
  })

  it('returns an empty list for text without unified references, and for non-strings', () => {
    assert.deepEqual(extractVirtualReferences('普通文本，没有任何引用'), [])
    assert.deepEqual(extractVirtualReferences('邮箱 a@inspiration.com 不算引用'), [])
    assert.deepEqual(extractVirtualReferences(''), [])
    assert.deepEqual(extractVirtualReferences(null), [])
    assert.deepEqual(extractVirtualReferences(undefined), [])
  })

  it('builds a navigation block naming the reference, the tool and the forbidden action', () => {
    const hint = buildReferenceNavigationHint('- [视频]: @inspiration/insp_ad704927.mp4')

    assert.match(hint, /@inspiration\/insp_ad704927\.mp4/)
    assert.match(hint, new RegExp(RECOMMENDED_BREAKDOWN_TOOL))
    assert.match(hint, /在本地磁盘查找它们的对应文件/)
    assert.match(hint, /glob \/ find \/ bash/)
    assert.match(hint, /<reference_navigation>/)
    assert.match(hint, /<\/reference_navigation>/)
  })

  it('produces no hint when the text carries no reference', () => {
    assert.equal(buildReferenceNavigationHint('只有普通素材说明'), '')
    assert.equal(withReferenceNavigation('只有普通素材说明'), '只有普通素材说明')
  })

  it('appends the block after the original text without altering it', () => {
    const original = '- [视频]: @inspiration/insp_1.mp4'
    const combined = withReferenceNavigation(original)

    assert.ok(combined.startsWith(original))
    assert.ok(combined.length > original.length)
    assert.ok(combined.includes(buildReferenceNavigationHint(original)))
  })

  it('passes non-string input through untouched', () => {
    assert.equal(withReferenceNavigation(''), '')
    assert.equal(withReferenceNavigation(undefined), '')
  })
})
