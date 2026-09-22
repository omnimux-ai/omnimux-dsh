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
  it('registers the visible tray above the composer and a silent inner upload bridge', () => {
    assert.match(indexSource, /id: 'omnimux-attachment-tray'/)
    assert.match(indexSource, /order: 118/)
    assert.match(indexSource, /id: 'omnimux-native-composer-bridge'/)
    assert.match(indexSource, /NativeComposerBridge/)
    const trayEnd = indexSource.indexOf('}, AttachmentTray)')
    const trayStart = indexSource.lastIndexOf('ctx.slots.inject', trayEnd)
    const trayRegistration = indexSource.slice(trayStart, trayEnd)
    assert.match(trayRegistration, /conversation\.input\.dock/)
    assert.doesNotMatch(trayRegistration, /conversation\.input\.attachments/)
    const bridgeEnd = indexSource.indexOf('}, NativeComposerBridge)')
    const bridgeStart = indexSource.lastIndexOf('ctx.slots.inject', bridgeEnd)
    const bridgeRegistration = indexSource.slice(bridgeStart, bridgeEnd)
    assert.match(bridgeRegistration, /conversation\.input\.attachments/)
  })

  it('accepts native composer attachment props and drop callbacks', () => {
    assert.match(traySource, /attachments\?: readonly any\[\]/)
    assert.match(traySource, /canAcceptDrop\?: boolean/)
    assert.match(traySource, /onAddFiles\?: \(files: readonly File\[\]\) => void/)
    assert.match(traySource, /onRemoveAttachment\?: \(id: string\) => void/)
    assert.match(traySource, /uploads\?: Readonly<Record<string, DraftFileUpload>>/)
    assert.match(traySource, /onRetryFile\?: \(id: string\) => void/)
    assert.match(traySource, /dropLimits\?: \{ readonly count: number; readonly size: string \}/)
    assert.match(traySource, /store\.setActiveSessionId\(currentSessionId\)/)
    assert.match(traySource, /store\.claimPendingAttachments\(currentSessionId\)/)
    assert.match(traySource, /omnimuxAttachments = useSyncExternalStore/)
    assert.match(traySource, /subscribeNativeComposer/)
    assert.match(traySource, /nativeOnAddFiles/)
    assert.match(traySource, /nativeOnRemove/)
    assert.match(traySource, /uploads=\{nativeUploads\}/)
    assert.match(traySource, /onRetryFile=\{nativeOnRetry\}/)
    assert.match(traySource, /data-omnimux-attachments-dock="true"/)
  })

  it('keeps the visible tray above the composer and follows it when the composer docks', () => {
    const guideStyles = readFileSync(join(here, '../session-guide/styles.js'), 'utf8')
    assert.match(traySource, /hasRailContent &&/)
    assert.match(traySource, /SHOW_MANUAL_LINK_BUTTON \|\| hasRailContent/)
    assert.match(
      guideStyles,
      /\[data-omnimux-starter-host\]\[data-omnimux-dock-open\] \.omx-attachment-dock \{[^}]*left:var\(--omnimux-dock-left/,
    )
    assert.match(
      guideStyles,
      /bottom:calc\(var\(--omnimux-dock-bottom, 20px\) \+ var\(--omnimux-dock-card-height, 168px\) \+ 8px\)!important/,
    )
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

  it('renders library media chips with the official native attachment card', () => {
    assert.match(traySource, /isMediaAttachment\(att\)/)
    assert.match(traySource, /isVideoAttachment\(att\) \? 'video' : 'image'/)
    assert.match(traySource, /<NativeAttachmentCard/)
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

  it('registers link trigger source to serialize URL chips on message submit', () => {
    assert.match(indexSource, /import \{ registerLinkTriggerSource \} from '\.\/attachments\/linkTriggerSource\.ts'/)
    assert.match(indexSource, /registerLinkTriggerSource\(ctx\)/)
  })
})
