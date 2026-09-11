import React from 'react'
import { CopyButton } from 'dsh-ui-kit'
import { TranslateIcon, ChevronDownIcon, CheckIcon } from '../icons.jsx'
import { TRANSLATE_LANGUAGES } from '../../languages.js'

function TranslateMenuItem({ lang, isSelected, onSelect }) {
  return (
    <div
      className={`omnimux-video-translate-item${isSelected ? ' is-selected' : ''}`}
      onClick={() => onSelect(lang.code)}
    >
      <span>{lang.label}</span>
      {isSelected ? (
        <span className="omnimux-video-translate-item-check">
          <CheckIcon size={14} />
        </span>
      ) : null}
    </div>
  )
}

function TranslateDropdown(props) {
  const { isZh, selectedLang, isLangMenuOpen, onToggleLangMenu, onSelectLang, menuRef } = props
  const translateTitle = isZh ? '选择翻译语言' : 'Select Translation Language'
  const translateLabel = isZh ? '翻译' : 'Translate'
  const activeClass = selectedLang !== 'original' ? ' is-active' : ''

  return (
    <div className="omnimux-video-translate-wrapper" ref={menuRef}>
      <button // exempt-ui01 translate action button
        type="button"
        className={`omnimux-video-footer-btn${activeClass}`}
        onClick={onToggleLangMenu}
        title={translateTitle}
      >
        <TranslateIcon size={14} />
        <span>{translateLabel}</span>
        <ChevronDownIcon size={11} />
      </button>

      {isLangMenuOpen ? (
        <div className="omnimux-video-translate-menu">
          {TRANSLATE_LANGUAGES.map((lang) => (
            <TranslateMenuItem
              key={lang.code}
              lang={lang}
              isSelected={selectedLang === lang.code}
              onSelect={onSelectLang}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function BreakdownFooter(props) {
  const {
    isZh = true,
    selectedLang = 'original',
    isLangMenuOpen = false,
    onToggleLangMenu,
    onSelectLang,
    translateMenuRef,
    scriptCopyContent = '',
    shotsCopyContent = '',
  } = props

  const scriptLabel = isZh ? '复制脚本' : 'Copy Script'
  const scriptCopiedLabel = isZh ? '已复制脚本' : 'Script Copied'
  const shotsLabel = isZh ? '复制分镜' : 'Copy Shots'
  const shotsCopiedLabel = isZh ? '已复制分镜' : 'Shots Copied'

  return (
    <footer className="omnimux-video-breakdown-bottom-bar">
      <div className="omnimux-video-breakdown-footer-left">
        <TranslateDropdown
          isZh={isZh}
          selectedLang={selectedLang}
          isLangMenuOpen={isLangMenuOpen}
          onToggleLangMenu={onToggleLangMenu}
          onSelectLang={onSelectLang}
          menuRef={translateMenuRef}
        />

        <CopyButton
          variant="outline"
          size="sm"
          text={scriptCopyContent}
          label={scriptLabel}
          copiedLabel={scriptCopiedLabel}
        />
        <CopyButton
          variant="outline"
          size="sm"
          text={shotsCopyContent}
          label={shotsLabel}
          copiedLabel={shotsCopiedLabel}
        />
      </div>
    </footer>
  )
}
