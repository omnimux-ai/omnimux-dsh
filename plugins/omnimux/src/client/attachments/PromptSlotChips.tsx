import React from 'react';
import type { PromptSlot } from './promptSlotDetector.ts';

export interface PromptSlotChipsProps {
  readonly slots: readonly PromptSlot[];
  readonly activeSlotIndex?: number | null;
  readonly onSelectSlot: (slot: PromptSlot, index: number) => void;
}

export const PromptSlotChips: React.FC<PromptSlotChipsProps> = ({
  slots,
  activeSlotIndex,
  onSelectSlot,
}) => {
  if (!slots || slots.length === 0) {
    return null;
  }

  return (
    <div className="omx-prompt-slots-dock" role="status" aria-label="Prompt 变量槽位">
      <span className="omx-prompt-slots-label">
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
        </svg>
        <span>变量槽位:</span>
      </span>
      {slots.map((slot, index) => {
        const isActive = activeSlotIndex === index;
        const displayText = slot.placeholder ? `[${slot.placeholder}]` : '[]';
        return (
          <button /* exempt-ui01: prompt 变量槽位胶囊按钮 */
            key={slot.id}
            type="button"
            className={`omx-prompt-slot-chip ${isActive ? 'is-active' : ''}`}
            onClick={() => onSelectSlot(slot, index)}
            title={`点击在输入框中定位并修改: ${displayText}`}
          >
            <span className="omx-prompt-slot-chip-tag" aria-hidden="true">✏️</span>
            <span className="omx-prompt-slot-chip-text">{displayText}</span>
          </button>
        );
      })}
    </div>
  );
};
