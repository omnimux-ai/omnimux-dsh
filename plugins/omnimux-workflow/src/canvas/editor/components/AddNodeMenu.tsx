/**
 * 画布「添加节点」菜单：Dock (+) 与 ContextMenu 钻取共用同一份 UI。
 * 数据来自 addNodePalette（单点真源）；零 inline 颜色、零副标题。
 */

import { memo, useMemo, type ComponentType, type FC, type MouseEvent } from 'react';
import {
  AudioLines,
  ChevronLeft,
  Film,
  ImagePlus,
  Table,
  Type,
  UploadCloud,
  Video,
} from 'lucide-react';
import { useT } from '../../i18n';
import {
  getAddNodePalette,
  type AddNodePaletteIcon,
  type AddNodePaletteScope,
  type CanvasAddNodeType,
} from './addNodePalette';

const ICON_MAP: Record<AddNodePaletteIcon, ComponentType<{ size?: number }>> = {
  Type,
  Table,
  ImagePlus,
  Video,
  AudioLines,
  Film,
  UploadCloud,
};

export interface AddNodeMenuProps {
  scope: AddNodePaletteScope;
  onSelect: (type: CanvasAddNodeType) => void;
  /** Context 钻取：返回主菜单 */
  onBack?: () => void;
}

function stopMenuEvent(event: MouseEvent) {
  event.preventDefault();
  event.stopPropagation();
}

const AddNodeMenu: FC<AddNodeMenuProps> = ({ scope, onSelect, onBack }) => {
  const t = useT();
  const items = useMemo(() => getAddNodePalette(scope), [scope]);

  return (
    <div
      className={`wf-node-menu wf-node-menu--${scope}`}
      onContextMenu={stopMenuEvent}
    >
      <div className="wf-node-menu__container">
        <div className="wf-node-menu__header">
          {scope === 'context' ? (
            <button
              type="button"
              className="wf-node-menu__back-btn"
              onClick={(event) => {
                event.stopPropagation();
                onBack?.();
              }}
              title={t('menu.back')}
            >
              <ChevronLeft size={16} />
            </button>
          ) : null}
          <span className="wf-node-menu__title">{t('menu.addNode')}</span>
          {scope === 'dock' ? <kbd className="wf-node-menu__kbd">N</kbd> : null}
        </div>
        <div className="wf-node-menu__list">
          {items.map((item) => {
            const Icon = ICON_MAP[item.icon];
            return (
              <button
                key={item.type}
                type="button"
                className="wf-node-menu__item"
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect(item.type);
                }}
              >
                <div className="wf-node-menu__icon-box">
                  <Icon size={18} />
                </div>
                <span className="wf-node-menu__label">{t(item.labelKey)}</span>
                {item.badge ? (
                  <span
                    className={`wf-node-menu__badge wf-node-menu__badge--${item.badge.variant}`}
                  >
                    {item.badge.text}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default memo(AddNodeMenu);
export type { CanvasAddNodeType };
