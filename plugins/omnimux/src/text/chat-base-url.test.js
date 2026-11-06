import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { normalizeBaseUrl } from './chat.js'

describe('normalizeBaseUrl', () => {
  it('keeps a versioned OpenAI base untouched', () => {
    assert.equal(normalizeBaseUrl('https://api.openai.com/v1'), 'https://api.openai.com/v1')
    assert.equal(normalizeBaseUrl('https://api.openai.com/v1/'), 'https://api.openai.com/v1')
  })

  it('keeps the Gemini OpenAI-compatible root untouched', () => {
    assert.equal(
      normalizeBaseUrl('https://generativelanguage.googleapis.com/v1beta/openai'),
      'https://generativelanguage.googleapis.com/v1beta/openai',
    )
  })

  it('appends /v1 only when the URL has no protocol root', () => {
    assert.equal(normalizeBaseUrl('https://api.example.com'), 'https://api.example.com/v1')
    assert.equal(normalizeBaseUrl(''), normalizeBaseUrl(''))
  })
})
