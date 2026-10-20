// @ts-nocheck
// @vitest-environment jsdom
/**
 * Theme modal: two frozen choices, a confirm callback that reports the picked
 * theme, and Escape/close behaviour that leaves no overlay behind.
 */
import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'vitest'
import { openPosterModal } from '../src/content/twitter-poster/modal.ts'

beforeEach(() => {
  document.getElementById('omnimux-poster-modal')?.remove()
})

describe('openPosterModal', () => {
  it('shows the two poster themes and confirms the selected one', () => {
    let confirmed = null
    const modal = openPosterModal({
      locale: 'zh',
      initialTheme: 'light',
      onConfirm: (theme) => { confirmed = theme },
    })

    assert.equal(modal.element.querySelectorAll('.omnimux-poster-theme').length, 2)
    assert.equal(modal.selectedTheme(), 'light')

    modal.element.querySelector('.omnimux-poster-theme[data-theme="dark"]').click()
    assert.equal(modal.selectedTheme(), 'dark')
    assert.equal(
      modal.element.querySelector('.omnimux-poster-theme[data-theme="dark"]').getAttribute('aria-checked'),
      'true',
    )

    modal.element.querySelector('[data-action="confirm"]').click()
    assert.equal(confirmed, 'dark')
    modal.close()
    assert.equal(modal.isOpen(), false)
  })

  it('closes on Escape and removes the overlay', () => {
    const modal = openPosterModal({ locale: 'en', initialTheme: 'dark', onConfirm: () => {} })
    assert.equal(modal.isOpen(), true)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    assert.equal(modal.isOpen(), false)
    assert.equal(document.getElementById('omnimux-poster-modal'), null)
  })

  it('reports progress through the two steps and blocks duplicate confirm clicks', () => {
    let calls = 0
    const modal = openPosterModal({
      locale: 'zh',
      initialTheme: 'light',
      onConfirm: () => { calls += 1 },
    })
    modal.element.querySelector('[data-action="confirm"]').click()
    modal.element.querySelector('[data-action="confirm"]').click()
    assert.equal(calls, 1)
    modal.setStep('poster', 'done')
    modal.setPhase('generating')
    assert.equal(modal.element.querySelector('[data-step="poster"]').dataset.state, 'done')
    modal.close()
  })
})
