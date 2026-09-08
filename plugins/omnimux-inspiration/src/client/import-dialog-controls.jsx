import { useCallback, useState } from 'react'
import { Button, InputField } from 'dsh-ui-kit'
import {
  AUTO_ANALYZE_STORAGE_KEY,
  readAutoAnalyzePreference,
  writeAutoAnalyzePreference,
} from './import-dialog-prefs.js'

export {
  AUTO_ANALYZE_STORAGE_KEY,
  readAutoAnalyzePreference,
  writeAutoAnalyzePreference,
}

/**
 * Collapsible custom-tags field. Collapsed by default; trigger toggles the InputField.
 * @param {{
 *   t: (key: string) => string,
 *   value: string,
 *   disabled?: boolean,
 *   onChange: (value: string) => void,
 * }} props
 */
export function CollapsibleTagsField({ t, value, disabled = false, onChange }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="omnimux-inspiration-tags-collapse">
      <Button
        type="button"
        variant="ghost"
        className="omnimux-inspiration-tags-toggle"
        aria-expanded={expanded}
        disabled={disabled}
        onClick={() => { setExpanded((prev) => !prev) }}
      >
        <span className="omnimux-inspiration-tags-toggle-label">{t('add.tagsToggle')}</span>
        <span
          className={`omnimux-inspiration-tags-toggle-chevron${expanded ? ' is-open' : ''}`}
          aria-hidden="true"
        >
          ▾
        </span>
      </Button>
      {expanded ? (
        <InputField
          type="text"
          label={t('add.tagsLabel')}
          placeholder={t('add.tagsPlaceholder')}
          value={value}
          disabled={disabled}
          onChange={(e) => { onChange(e.target.value) }}
        />
      ) : null}
    </div>
  )
}

/**
 * AI auto-analyze switch with localStorage persistence.
 * Defaults to true when no preference is stored.
 * @param {{
 *   t: (key: string) => string,
 *   checked: boolean,
 *   disabled?: boolean,
 *   onChange: (next: boolean) => void,
 * }} props
 */
export function AutoAnalyzeSwitch({ t, checked, disabled = false, onChange }) {
  const handleToggle = useCallback(() => {
    if (disabled) return
    const next = !checked
    writeAutoAnalyzePreference(next)
    onChange(next)
  }, [checked, disabled, onChange])

  return (
    <div className="omnimux-inspiration-switch-row">
      <Button
        type="button"
        variant="ghost"
        role="switch"
        className="omnimux-inspiration-switch"
        aria-checked={String(checked)}
        aria-label={t('add.autoAnalyze')}
        disabled={disabled}
        onClick={handleToggle}
      >
        <span className="omnimux-inspiration-switch-knob" />
      </Button>
      <span className="omnimux-inspiration-switch-label">{t('add.autoAnalyze')}</span>
    </div>
  )
}
