/**
 * WorkflowTemplatePanel — 工作流模板面板（卡片形态，Issue #3625 工作流 5）。
 *
 * 形态（对齐用户截图结构：左侧分类卡 + 右侧模板卡 / 入口卡）：
 *   ┌───────────────────────────────────────────────┐
 *   │ 工作流模板                          3 个模板   │
 *   │ [ 搜索模板... ]                                │
 *   │ ┌──────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ │
 *   │ │ 全部  │ │ 模板卡 A  │ │ 模板卡 B  │ │+新建   │ │
 *   │ │ 视频  │ │ 名称/描述 │ │ 名称/描述 │ │工作流  │ │
 *   │ │ 图像  │ │ 节点数    │ │ 节点数    │ │        │ │
 *   │ └──────┘ └──────────┘ └──────────┘ └────────┘ │
 *   └───────────────────────────────────────────────┘
 *
 * 边界（与 lead 裁决一致）：
 * - 自包含：不依赖插件宿主、manifest、`window.hub`、displayMode，只做本仓 UI。
 * - 不伪造数据：分类卡只从模板真实 `tags` 派生；无封面不塞占位图；无新建回调不画
 *   入口卡；加载/失败/空态如实呈现。
 * - 不改调度语义、不碰 Feed/Slot 契约；本组件只发出「插入 / 新建 / 删除」三个回调。
 *
 * 宿主接线（由拥有 Toolbar.tsx 写权限的同学完成）：把原来 `wf-template-picker`
 * 的列表区块替换为 `<WorkflowTemplatePanel ... />` 即可，props 见下。
 */

import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { FileCode, Plus, Search, Trash2 } from 'lucide-react';
import { useT } from '../../i18n';
import {
  ALL_CATEGORIES_ID,
  categoryHasMatches,
  deriveCategoryOptions,
  filterTemplates,
  shouldRenderCreateEntry,
  type TemplateCardModel,
} from './templatePanelModel.ts';

export type { TemplateCardModel };

export interface WorkflowTemplatePanelProps {
  /** 模板列表（单一真源：由宿主传入的服务端列表）。 */
  templates?: TemplateCardModel[];
  /** 插入模板到当前画布。 */
  onInsertTemplate: (id: string) => void;
  /** 新建工作流（把当前画布/节点组保存为模板）。缺省时不渲染入口卡。 */
  onCreateWorkflow?: () => void;
  /** 删除模板。缺省时不渲染删除按钮。 */
  onDeleteTemplate?: (id: string) => void;
  /** 真实加载态。 */
  isLoading?: boolean;
  /** 真实错误文案（可读；不静默吞掉）。 */
  errorMessage?: string;
  /** Esc 关闭（宿主已有点击外部收起，这里补齐键盘通道）。 */
  onClose?: () => void;
  className?: string;
}

const WorkflowTemplatePanel: React.FC<WorkflowTemplatePanelProps> = ({
  templates,
  onInsertTemplate,
  onCreateWorkflow,
  onDeleteTemplate,
  isLoading = false,
  errorMessage,
  onClose,
  className = '',
}) => {
  const t = useT();
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>(ALL_CATEGORIES_ID);

  const list = useMemo(() => (templates ?? []).filter(Boolean), [templates]);
  const categoryOptions = useMemo(() => deriveCategoryOptions(list), [list]);
  const visible = useMemo(
    () => filterTemplates(list, activeCategory, query),
    [list, activeCategory, query],
  );

  // Esc 关闭（点击外部收起由宿主负责，见 ui-design-guidelines §4）。
  useEffect(() => {
    if (!onClose) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // 分类被搜索词清空后仍停留在该分类会显示「没有匹配」——这是真实状态，不自动跳转
  // （自动跳转等于替用户改筛选条件）。
  const handleCategoryClick = useCallback((categoryId: string) => {
    setActiveCategory(categoryId);
  }, []);

  const hasTemplates = list.length > 0;
  const showCreateEntry = shouldRenderCreateEntry(onCreateWorkflow);

  const renderEmpty = () => {
    if (isLoading) {
      return <div className="wf-template-panel__empty">{t('template.panel.loading')}</div>;
    }
    if (errorMessage) {
      return (
        <div className="wf-template-panel__empty wf-template-panel__empty--error">
          <span className="wf-template-panel__empty-title">{t('template.panel.loadFailed')}</span>
          <span className="wf-template-panel__empty-hint">{errorMessage}</span>
        </div>
      );
    }
    if (!hasTemplates) {
      return (
        <div className="wf-template-panel__empty">
          <span className="wf-template-panel__empty-title">{t('template.panel.empty')}</span>
          <span className="wf-template-panel__empty-hint">{t('template.panel.emptyHint')}</span>
        </div>
      );
    }
    return (
      <div className="wf-template-panel__empty">
        <span className="wf-template-panel__empty-title">{t('template.panel.noMatch')}</span>
        <span className="wf-template-panel__empty-hint">{t('template.panel.noMatchHint')}</span>
      </div>
    );
  };

  return (
    <div
      className={`wf-template-panel nodrag nopan ${className}`.trim()}
      role="dialog"
      aria-label={t('template.panel.title')}
    >
      <div className="wf-template-panel__head">
        <span className="wf-template-panel__title">{t('template.panel.title')}</span>
        {hasTemplates ? (
          <span className="wf-template-panel__count">
            {t('template.panel.count').replace('{count}', String(list.length))}
          </span>
        ) : null}
      </div>

      <div className="wf-template-panel__search">
        <Search size={14} className="wf-template-panel__search-icon" aria-hidden />
        <input
          type="text"
          className="wf-template-panel__search-input nodrag nopan"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('template.panel.searchPlaceholder')}
          aria-label={t('template.panel.searchPlaceholder')}
        />
      </div>

      <div className="wf-template-panel__body">
        <div
          className="wf-template-panel__rail"
          role="tablist"
          aria-label={t('template.panel.categoryLabel')}
        >
          {categoryOptions.map((option) => {
            const selectable = categoryHasMatches(list, option.id, query);
            const selected = option.id === activeCategory;
            return (
              <button
                key={option.id}
                type="button"
                role="tab"
                aria-selected={selected}
                disabled={!selectable}
                className={`wf-template-panel__rail-item nodrag${selected ? ' wf-template-panel__rail-item--active' : ''}`}
                onClick={() => handleCategoryClick(option.id)}
              >
                <span className="wf-template-panel__rail-label">
                  {option.id === ALL_CATEGORIES_ID ? t('template.panel.allCategories') : option.id}
                </span>
                <span className="wf-template-panel__rail-count">{option.count}</span>
              </button>
            );
          })}
        </div>

        <div className="wf-template-panel__grid">
          {showCreateEntry ? (
            <button
              type="button"
              className="wf-template-panel__card wf-template-panel__card--create nodrag"
              onClick={() => onCreateWorkflow?.()}
            >
              <span className="wf-template-panel__create-icon">
                <Plus size={18} />
              </span>
              <span className="wf-template-panel__card-title">{t('template.panel.newWorkflow')}</span>
              <span className="wf-template-panel__card-desc">{t('template.panel.newWorkflowHint')}</span>
            </button>
          ) : null}

          {visible.map((template) => (
            <div key={template.id} className="wf-template-panel__card">
              <button
                type="button"
                className="wf-template-panel__card-main nodrag"
                onClick={() => onInsertTemplate(template.id)}
                title={template.name}
              >
                {template.coverUrl ? (
                  <img className="wf-template-panel__cover" src={template.coverUrl} alt="" draggable={false} />
                ) : (
                  <span className="wf-template-panel__cover wf-template-panel__cover--empty">
                    <FileCode size={18} />
                  </span>
                )}
                <span className="wf-template-panel__card-title">{template.name}</span>
                {template.description ? (
                  <span className="wf-template-panel__card-desc">{template.description}</span>
                ) : null}
                <span className="wf-template-panel__card-meta">
                  {t('toolbar.insertTemplateNodes').replace('{count}', String(template.nodeCount))}
                </span>
              </button>
              {onDeleteTemplate ? (
                <button
                  type="button"
                  className="wf-template-panel__card-delete nodrag"
                  aria-label={t('template.panel.delete')}
                  title={t('template.panel.delete')}
                  onClick={() => onDeleteTemplate(template.id)}
                >
                  <Trash2 size={13} />
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      {visible.length === 0 || !hasTemplates || isLoading || errorMessage ? renderEmpty() : null}
    </div>
  );
};

export default memo(WorkflowTemplatePanel);
