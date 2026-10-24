/**
 * 画布「添加节点」菜单：Dock (+) 与 ContextMenu 钻取共用同一份 UI。
 * 数据来自 addNodePalette（单点真源）；零 inline 颜色。
 * 调色板行保持单行（无副标题）；底部入口卡是唯一的例外。
 *
 * 面板是**无分类平铺列表**（Issue 3640）：条目按 addNodePalette 的声明顺序渲染，
 * 不渲染分类标题 / 计数 / 折叠态；检索词同样来自 addNodePalette（取自节点注册表），
 * 本组件不持有第二份清单。
 *
 * 两个入口共用清单，但形态按 scope 分叉（Issue 3651）：Dock 面板有搜索框与命中高亮；
 * 右键钻取面板**不渲染搜索框**（该浮层不做检索，输入框只会是死入口），列表直接平铺，
 * 底部入口在右键下是平铺行（无分割线、无常态底色），样式见 components.css 的
 * `wf-node-menu--context` 规则。
 *
 * 底部入口是 **ComfyUI 工作流**入口（Issue 3669）：点它把面板内容切成 comfy 视图
 * （导入动作 + 最近导入列表）。组件自身不打开任何弹窗、不读 store —— 数据与动作都由
 * 调用方通过 `comfy` prop 注入；缺省时不渲染该入口，也不伪造入口。
 */

import { memo, useMemo, useState, type ComponentType, type FC, type MouseEvent, type ReactNode } from 'react';
import {
  AudioLines,
  Box,
  ChevronLeft,
  ChevronRight,
  Film,
  ImagePlus,
  Search,
  Table,
  Type,
  UploadCloud,
  Video,
  Workflow,
} from 'lucide-react';
import { useT } from '../../i18n';
import { formatComfyRecentTime, type ComfyRecentEntry } from '../utils/comfyRecents';
import {
  getAddNodePalette,
  matchAddNodePalette,
  type AddNodePaletteIcon,
  type AddNodePaletteMatch,
  type AddNodePaletteScope,
  type CanvasAddNodeType,
} from './addNodePalette';

const ICON_MAP: Record<AddNodePaletteIcon, ComponentType<{ size?: number }>> = {
  Type,
  Table,
  ImagePlus,
  Video,
  AudioLines,
  Box,
  Film,
  UploadCloud,
};

/** 底部 ComfyUI 工作流入口需要的数据与动作（由调用方注入，组件不读 store）。 */
export interface AddNodeComfyProps {
  /** 「最近导入」条目，最新在前。 */
  recents: ComfyRecentEntry[];
  /** 打开系统文件选择器（选择器实例由调用方持有）。 */
  onImport: () => void;
  /** 复现一条最近导入：只进预览，由用户确认后应用。 */
  onApplyRecent: (name: string) => void;
}

export interface AddNodeMenuProps {
  scope: AddNodePaletteScope;
  onSelect: (type: CanvasAddNodeType) => void;
  /** Context 钻取：返回主菜单 */
  onBack?: () => void;
  /** 底部 ComfyUI 工作流入口；缺省时不渲染该入口。 */
  comfy?: AddNodeComfyProps;
}

function stopMenuEvent(event: MouseEvent) {
  event.preventDefault();
  event.stopPropagation();
}

/** 把命中区间包进 <mark>；无命中时原样返回标签文本。 */
function renderLabel(match: AddNodePaletteMatch): ReactNode {
  const { labelText, labelRanges } = match;
  if (labelRanges.length === 0) return labelText;

  const parts: ReactNode[] = [];
  let cursor = 0;
  labelRanges.forEach((range, index) => {
    if (range.start > cursor) parts.push(labelText.slice(cursor, range.start));
    parts.push(
      <mark key={`${range.start}-${index}`} className="wf-node-menu__match">
        {labelText.slice(range.start, range.end)}
      </mark>,
    );
    cursor = range.end;
  });
  if (cursor < labelText.length) parts.push(labelText.slice(cursor));
  return parts;
}

const AddNodeMenu: FC<AddNodeMenuProps> = ({ scope, onSelect, onBack, comfy }) => {
  const t = useT();
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'palette' | 'comfy'>('palette');
  /** 搜索只属于 Dock 的调色板视图：右键浮层与 comfy 视图都不做检索（Issue 3651 / 3669）。 */
  const showSearch = scope === 'dock' && view === 'palette';

  const items = useMemo(() => getAddNodePalette(scope), [scope]);
  const matches = useMemo(
    () => matchAddNodePalette(items, showSearch ? query : '', t),
    [items, query, showSearch, t],
  );

  const isComfyView = view === 'comfy' && Boolean(comfy);

  return (
    <div
      className={`wf-node-menu wf-node-menu--${scope}`}
      onContextMenu={stopMenuEvent}
    >
      <div className="wf-node-menu__container">
        <div className="wf-node-menu__header">
          {isComfyView || scope === 'context' ? (
            <button
              type="button"
              className="wf-node-menu__back-btn"
              onClick={(event) => {
                event.stopPropagation();
                if (isComfyView) setView('palette');
                else onBack?.();
              }}
              title={t('menu.back')}
            >
              <ChevronLeft size={16} />
            </button>
          ) : null}
          <span className="wf-node-menu__title">
            {isComfyView ? t('comfy.panel.title') : t('menu.addNode')}
          </span>
          {scope === 'dock' && !isComfyView ? <kbd className="wf-node-menu__kbd">N</kbd> : null}
        </div>

        {showSearch ? (
          <div className="wf-node-menu__search">
            <Search size={14} className="wf-node-menu__search-icon" />
            <input
              type="text"
              className="wf-node-menu__search-input"
              value={query}
              placeholder={t('palette.searchPlaceholder')}
              aria-label={t('palette.searchLabel')}
              onChange={(event) => setQuery(event.target.value)}
              onClick={(event) => event.stopPropagation()}
            />
          </div>
        ) : null}

        <div className="wf-node-menu__list">
          {isComfyView ? (
            <>
              <button
                type="button"
                className="wf-node-menu__entry"
                onClick={(event) => {
                  stopMenuEvent(event);
                  comfy?.onImport();
                }}
              >
                <div className="wf-node-menu__icon-box">
                  <UploadCloud size={18} />
                </div>
                <span className="wf-node-menu__entry-text">
                  <span className="wf-node-menu__entry-title">{t('comfy.panel.import')}</span>
                  <span className="wf-node-menu__entry-hint">{t('comfy.panel.formatHint')}</span>
                </span>
                <ChevronRight size={16} className="wf-node-menu__entry-arrow" />
              </button>

              {comfy && comfy.recents.length > 0 ? (
                <>
                  <div className="wf-node-menu__section">{t('comfy.panel.recent')}</div>
                  {comfy.recents.map((entry) => {
                    const time = formatComfyRecentTime(entry.savedAt);
                    const meta = (time ? t('comfy.panel.itemMeta') : t('comfy.panel.itemMetaNoTime'))
                      .replace('{format}', entry.format)
                      .replace('{count}', String(entry.nodeCount))
                      .replace('{time}', time);
                    return (
                      <button
                        key={entry.name}
                        type="button"
                        className="wf-node-menu__entry"
                        onClick={(event) => {
                          stopMenuEvent(event);
                          comfy.onApplyRecent(entry.name);
                        }}
                      >
                        <div className="wf-node-menu__icon-box">
                          <Workflow size={18} />
                        </div>
                        <span className="wf-node-menu__entry-text">
                          <span className="wf-node-menu__entry-title">{entry.name}</span>
                          <span className="wf-node-menu__entry-hint">{meta}</span>
                        </span>
                        <ChevronRight size={16} className="wf-node-menu__entry-arrow" />
                      </button>
                    );
                  })}
                </>
              ) : (
                <div className="wf-node-menu__empty" role="status">
                  <p className="wf-node-menu__empty-title">{t('comfy.panel.empty')}</p>
                </div>
              )}
            </>
          ) : null}

          {!isComfyView && showSearch && matches.length === 0 ? (
            <div className="wf-node-menu__empty" role="status">
              <p className="wf-node-menu__empty-title">{t('palette.searchEmpty')}</p>
              <p className="wf-node-menu__empty-hint">{t('palette.searchEmptyHint')}</p>
            </div>
          ) : null}

          {!isComfyView && matches.map((match) => {
            const { item } = match;
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
                <span className="wf-node-menu__label">{renderLabel(match)}</span>
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

        {!isComfyView && comfy ? (
          <div className="wf-node-menu__footer">
            <button
              type="button"
              className="wf-node-menu__entry"
              onClick={(event) => {
                stopMenuEvent(event);
                setView('comfy');
              }}
            >
              <div className="wf-node-menu__icon-box">
                <Workflow size={18} />
              </div>
              <span className="wf-node-menu__entry-text">
                <span className="wf-node-menu__entry-title">{t('comfy.entry.title')}</span>
                <span className="wf-node-menu__entry-hint">{t('comfy.entry.hint')}</span>
              </span>
              <ChevronRight size={16} className="wf-node-menu__entry-arrow" />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default memo(AddNodeMenu);
export type { CanvasAddNodeType };
