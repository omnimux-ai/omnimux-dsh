import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { inferKindFromExtension, inferKindFromName, MAX_ATTACHMENTS } from './kind.js'

describe('kind inference', () => {
  it('maps common extensions', () => {
    assert.equal(inferKindFromExtension('PNG'), 'image')
    assert.equal(inferKindFromName('clip.mov'), 'video')
    assert.equal(inferKindFromName('voice.m4a'), 'audio')
    assert.equal(inferKindFromName('sheet.csv'), 'table')
    assert.equal(inferKindFromName('brief.pdf'), 'document')
  })

  it('keeps the composer-domain attachment cap', () => {
    assert.equal(MAX_ATTACHMENTS, 8)
  })
})
