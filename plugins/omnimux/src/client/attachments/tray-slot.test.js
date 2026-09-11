import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const indexSource = readFileSync(join(here, '../index.js'), 'utf8')
const traySource = readFileSync(join(here, 'AttachmentTray.tsx'), 'utf8')
const dockStylesSource = readFileSync(join(here, 'dockStyles.ts'), 'utf8')
const cardSource = readFileSync(join(here, 'AttachmentCard.tsx'), 'utf8')
const detectorSource = readFileSync(join(here, 'media-detector.ts'), 'utf8')
const cssSource = readFileSync(join(here, 'styles.css'), 'utf8')

describe('composer inner attachment slot', () => {
  it('registers conversation.input.attachments instead of the outer dock', () => {
    assert.match(indexSource, /ctx\.slots\.inject\('conversation\.input\.attachments'/)
    assert.match(indexSource, /name: 'conversation\.input\.attachments'/)
    assert.match(indexSource, /id: 'omnimux-attachment-tray'/)
    assert.match(indexSource, /priority: -10/)
    assert.match(indexSource, /locale: NS/)
    const trayEnd = indexSource.indexOf('}, AttachmentTray)')
    const trayStart = indexSource.lastIndexOf('ctx.slots.inject', trayEnd)
    const trayRegistration = indexSource.slice(trayStart, trayEnd)
    assert.match(trayRegistration, /conversation\.input\.attachments/)
    assert.doesNotMatch(trayRegistration, /conversation\.input\.dock/)
  })

  it('accepts native composer attachment props and drop callbacks', () => {
    assert.match(traySource, /attachments\?: readonly any\[\]/)
    assert.match(traySource, /canAcceptDrop\?: boolean/)
    assert.match(traySource, /onAddImages\?: \(files: readonly File\[\]\) => void/)
    assert.match(traySource, /onRemoveImage\?: \(id: string\) => void/)
    assert.match(traySource, /dropLimits\?: \{ readonly count: number; readonly size: string \}/)
    assert.match(traySource, /store\.setActiveSessionId\(currentSessionId\)/)
    assert.match(traySource, /store\.claimPendingAttachments\(currentSessionId\)/)
    assert.match(traySource, /omnimuxAttachments = useSyncExternalStore/)
    assert.match(traySource, /props\.onAddImages/)
    assert.match(traySource, /props\.onRemoveImage/)
    assert.match(traySource, /data-omnimux-attachments-dock="true"/)
  })

  it('compacts the inner rail to the 44×44 / 40px spec', () => {
    for (const source of [dockStylesSource, cssSource]) {
      assert.match(source, /padding: 6px 12px 2px 12px/)
      assert.match(source, /width: 44px/)
      assert.match(source, /height: 44px/)
      assert.match(source, /height: 40px/)
      assert.match(source, /padding: 4px 8px/)
      assert.match(source, /font-size: 12px/)
      assert.match(source, /font-size: 9px/)
      assert.match(source, /width: 16px/)
      assert.match(source, /top: -4px/)
      assert.match(source, /right: -4px/)
      assert.match(source, /omx-att-card__media-frame/)
      assert.match(source, /omx-att-card__remove-btn--media/)
      assert.match(source, /z-index: 6/)
      assert.doesNotMatch(source, /width: 56px/)
      assert.doesNotMatch(source, /height: 56px/)
    }
  })

  it('decomposes attachment tray into modular sub-components and hooks', () => {
    assert.match(traySource, /import \{ ensureStylesInjected \} from '\.\/trayStyles\.ts'/)
    assert.match(traySource, /import \{ insertNativeVideoChip \} from '\.\/nativeVideoChip\.ts'/)
    assert.match(traySource, /import \{ useDragDrop \} from '\.\/useDragDrop\.ts'/)
    assert.match(traySource, /import \{ usePasteVideoInterceptor \} from '\.\/usePasteVideoInterceptor\.ts'/)
    assert.match(traySource, /import \{ VideoLinkPopover \} from '\.\/VideoLinkPopover\.tsx'/)
    assert.match(traySource, /import \{ DropOverlay \} from '\.\/DropOverlay\.tsx'/)
    assert.match(traySource, /import \{ AttachmentPreviewModal/)
    assert.match(traySource, /import \{[\s\S]*NativeAttachmentCard[\s\S]*\} from '\.\/NativeAttachmentCard\.tsx'/)
  })

  it('keeps compact vector file icons without emoji', () => {
    assert.match(cardSource, /const TableFileIcon[\s\S]*width="16"/)
    assert.match(cardSource, /const DocFileIcon[\s\S]*width="16"/)
    assert.match(cardSource, /const AudioFileIcon[\s\S]*width="16"/)
    assert.doesNotMatch(cardSource, /width="20"/)
    assert.doesNotMatch(cardSource, /width="22"/)
    assert.doesNotMatch(cardSource, /[\u{1F300}-\u{1FAFF}]/u)
  })

  it('AttachmentCard defines media and audio extension sets and robust media check', () => {
    assert.match(detectorSource, /IMAGE_EXTENSIONS\s*=\s*new Set/)
    assert.match(detectorSource, /VIDEO_EXTENSIONS\s*=\s*new Set/)
    assert.match(detectorSource, /AUDIO_EXTENSIONS\s*=\s*new Set/)
    assert.match(detectorSource, /TEXT_EXTENSIONS\s*=\s*new Set/)
    assert.match(cardSource, /isMediaAttachment/)
    assert.match(cardSource, /isVideoAttachment/)
    assert.match(cardSource, /omx-att-card--media/)
    assert.match(cardSource, /omx-att-card--file/)
  })
})
