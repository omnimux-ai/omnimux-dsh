import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const installSource = readFileSync(join(here, 'install.js'), 'utf8')
const indexSource = readFileSync(join(here, '../index.js'), 'utf8')
const commandsSource = readFileSync(join(here, 'commands.js'), 'utf8')

describe('composer-add install contract', () => {
  it('keeps the business side: modal, window events, toast, submit capture', () => {
    assert.match(installSource, /installComposerAttachmentSubmitCapture/)
    assert.match(installSource, /AssetPickerModal/)
    assert.match(installSource, /omnimux:composer-add-file/)
    assert.match(installSource, /omnimux:composer-add-folder/)
    assert.match(installSource, /omnimux:composer-add-library/)
    assert.match(installSource, /composerAdd\.pickerUnsupported/)
    assert.match(installSource, /\/omnimux\/assets\/pick/)
    assert.match(installSource, /kind === 'directory' \? 'directory' : 'file'/)
    assert.match(installSource, /\/omnimux\/composer\/attachments\/materialize/)
  })

  it('no longer intercepts the official + button or draws its own menu', () => {
    assert.doesNotMatch(installSource, /add-button\.js|menu-dom\.js/)
    assert.doesNotMatch(installSource, /bindAddButton|findAddButton|replayOfficialAdd|openNativeAddMenu|closeNativeAddMenu/)
    assert.doesNotMatch(installSource, /MutationObserver/)
    assert.doesNotMatch(installSource, /stopImmediatePropagation/)
    assert.doesNotMatch(installSource, /state\.bypass|fileDisabled/)
  })

  it('is installed from the hub client without new slots or extra injects', () => {
    assert.match(indexSource, /installComposerAddCapture/)
    assert.match(indexSource, /registerComposerAddCommands/)
    assert.match(indexSource, /export const inject = \['slots', 'locale'\]/)
    assert.doesNotMatch(indexSource, /conversation\.input\.add-menu/)
  })

  it('contributes both actions to the official command list (sole path)', () => {
    assert.match(commandsSource, /name: 'add-file'/)
    assert.match(commandsSource, /name: 'add-from-library'/)
    assert.match(commandsSource, /ctx\.inject\(\['commandUi'\]/)
    assert.match(commandsSource, /composerAdd\.pickFiles/)
    assert.match(commandsSource, /composerAdd\.pickFolder/)
    assert.match(commandsSource, /composerAdd\.openLibrary/)
    assert.match(commandsSource, /id: 'folder'/)
    assert.doesNotMatch(commandsSource, /[Ff]allback/)
  })
})
