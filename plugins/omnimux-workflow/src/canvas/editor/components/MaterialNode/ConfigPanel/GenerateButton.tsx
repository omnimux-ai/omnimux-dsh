/**
 * GenerateButton — W2 T2.3，移植自 Gxgen
 * apps/web/src/pages/CanvasEditor/components/MaterialNode/components/ConfigPanel/GenerateButton.tsx(83)。
 *
 * 深色胶囊：radial-gradient(#1a1a1a→#656766) + 白圆发送钮（ArrowUp inline
 * SVG 照抄 Gxgen :60-76）。差异：无积分（showCreditCost 恒 false 裁剪）；
 * isGenerating→lucide Loader2 spin；文案入 i18n 字典。
 * T05：禁用态点击经 onDisabledClick 上浮（画板通知 submit_blocked_click），
 * 禁用原因只走 title / disabledReason，不再渲染常驻静态错误条。
 */

import React, { memo } from 'react';
import { Loader2 } from 'lucide-react';
import { useT } from '../../../../i18n';

export interface GenerateButtonProps {
  onClick: () => void;
  /** execBusy：全图/其他节点执行中（禁用语义不变） */
  disabled?: boolean;
  disabledReason?: string;
  /** 禁用态被点击（发布画板通知）；不传则禁用点击静默 */
  onDisabledClick?: () => void;
  /** 本节点生成中 → Loader2 spin */
  isGenerating?: boolean;
}

const GenerateButton: React.FC<GenerateButtonProps> = ({ onClick, disabled, disabledReason, onDisabledClick, isGenerating }) => {
  const t = useT();
  return (
    <div
      className={`wf-generate-btn ${disabled ? 'wf-generate-btn--disabled' : ''}`}
      onClick={() => {
        if (disabled) {
          onDisabledClick?.();
          return;
        }
        if (!isGenerating) onClick();
      }}
      style={{ cursor: disabled || isGenerating ? 'default' : 'pointer' }}
      role="button"
      tabIndex={0}
      aria-disabled={disabled || isGenerating}
      title={disabled ? disabledReason : undefined}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        if (disabled) {
          onDisabledClick?.();
          return;
        }
        if (!isGenerating) onClick();
      }}
    >
      <span className="wf-generate-btn__label">{t('panel.generate')}</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (disabled) {
            onDisabledClick?.();
            return;
          }
          if (!isGenerating) onClick();
        }}
        aria-disabled={disabled || isGenerating}
        className="wf-generate-btn__send"
        aria-label={t('panel.generate')}
        title={disabled && disabledReason ? disabledReason : t('panel.generate')}
      >
        {isGenerating ? (
          <Loader2 size={14} className="wf-generate-btn__spin" />
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width={14}
            height={14}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m5 12 7-7 7 7" />
            <path d="M12 19V5" />
          </svg>
        )}
      </button>
    </div>
  );
};

export default memo(GenerateButton);
