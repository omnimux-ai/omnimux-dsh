import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const read = file => readFileSync(new URL(file, import.meta.url), 'utf8')
const installSource = read('./install.js')
const indexSource = read('../index.js')
const commandsSource = read('./commands.js')

describe('composer add integration boundaries', () => {
  it('keeps selection UI separate from the existing submission capture', () => {
    assert.match(installSource, /AssetPickerModal/)
    assert.match(indexSource, /installComposerAttachmentSubmitCapture/)
    assert.match(indexSource, /export const inject = \['slots', 'locale'\]/)
  })

  it('uses official command events without intercepting buttons or contributing a second menu', () => {
    assert.doesNotMatch(installSource, /MutationObserver|stopImmediatePropagation|omnimux:composer-add-(file|folder|library)/)
    assert.doesNotMatch(commandsSource, /popupSelect|commandUi\.register/)
    assert.doesNotMatch(indexSource, /conversation\.input\.add-menu|onAddFolder/)
  })
})
