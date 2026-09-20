import React, { useMemo, useState } from 'react';
import {
  Search,
  LayoutGrid,
  List,
  RefreshCw,
  Crosshair,
  Image as ImageIcon,
  Film,
  Music,
  FileText,
  Sparkles,
  Layers,
  ChevronDown,
} from 'lucide-react';
import type { CanvasNodeItem, FilterState, ViewMode } from '../types';
import { TypeFilterPopover } from '../popovers/TypeFilterPopover';
import { TagFilterPopover, TAG_OPTIONS } from '../popovers/TagFilterPopover';
import { TimeFilterPopover } from '../popovers/TimeFilterPopover';
import { useT } from '../../../../i18n';

interface CanvasOutlineViewProps {
  nodes: CanvasNodeItem[];
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
  onFocusNode: (nodeId: string) => void;
  onContextMenu: (e: React.MouseEvent, item: CanvasNodeItem) => void;
  onHoverItem: (item: CanvasNodeItem | null, e?: React.MouseEvent) => void;
  onRefresh?: () => void;
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function matchesTimeRange(updatedAt: number, range: FilterState['timeRange']): boolean {
  if (range === 'all' || range === 'custom') return true;
  const delta = Date.now() - updatedAt;
  if (range === 'today') return delta <= DAY_MS;
  if (range === '7d') return delta <= 7 * DAY_MS;
  if (range === '30d') return delta <= 30 * DAY_MS;
  return true;
}

const TAG_ALIASES: Record<string, string[]> = {
  person: ['person', '人物', 'character', '角色'],
  scene: ['scene', '场景', 'background', '底图'],
  draft: ['draft', '待定版'],
  final: ['final', '最终版'],
  prop: ['prop', '道具'],
  voice: ['voice', '音色', 'audio-cue', '音效'],
  costume: ['costume', '服装'],
};

function nodeMatchesTags(node: CanvasNodeItem, selectedTags: string[]): boolean {
  if (selectedTags.length === 0) return true;
  const haystack = `${node.name} ${node.prompt || ''} ${(node.tags || []).join(' ')}`.toLowerCase();
  return selectedTags.some((id) => {
    const tag = TAG_OPTIONS.find((t) => t.id === id);
    const aliases = [...(TAG_ALIASES[id] || [id]), tag?.name || '']
      .filter(Boolean)
      .map((s) => s.toLowerCase());
    return aliases.some((alias) => haystack.includes(alias));
  });
}

function nodeMatchesTypes(nodeType: string, selectedTypes: string[]): boolean {
  if (selectedTypes.length === 0) return true;
  if (selectedTypes.includes('__none__')) return false;
  const aliases = new Set<string>([nodeType]);
  if (nodeType === 'text' || nodeType === 'table' || nodeType === 'doc') {
    aliases.add('text');
    aliases.add('doc');
  }
  if (nodeType === 'video_composition') aliases.add('video');
  if (!['image', 'video', 'audio', 'text', 'doc', 'table', 'video_composition'].includes(nodeType)) {
    aliases.add('other');
  }
  return selectedTypes.some((t) => aliases.has(t));
}

export const CanvasOutlineView: React.FC<CanvasOutlineViewProps> = ({
  nodes,
  searchQuery: propQuery,
  onSearchChange: propOnChange,
  onFocusNode,
  onContextMenu,
  onHoverItem,
  onRefresh,
  viewMode: propViewMode,
  onViewModeChange,
}) => {
  const t = useT();
  const [internalQuery, setInternalQuery] = useState('');
  const searchQuery = propQuery !== undefined ? propQuery : internalQuery;
  const handleSearchChange = (q: string) => {
    setInternalQuery(q);
    propOnChange?.(q);
  };

  const [internalViewMode, setInternalViewMode] = useState<ViewMode>('tree');
  const viewMode = propViewMode ?? internalViewMode;
  const setViewMode = (mode: ViewMode) => {
    setInternalViewMode(mode);
    onViewModeChange?.(mode);
  };

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterState, setFilterState] = useState<FilterState>({
    types: [],
    tags: [],
    timeRange: 'all',
    sortOrder: 'desc',
  });

  const [typeOpen, setTypeOpen] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
  const [typeAnchor, setTypeAnchor] = useState<DOMRect | null>(null);
  const [tagAnchor, setTagAnchor] = useState<DOMRect | null>(null);
  const [timeAnchor, setTimeAnchor] = useState<DOMRect | null>(null);

  const getNodeIcon = (type: string) => {
    switch (type) {
      case 'image':
        return <ImageIcon size={14} style={{ color: '#3b82f6', flexShrink: 0 }} />;
      case 'video':
        return <Film size={14} style={{ color: '#8b5cf6', flexShrink: 0 }} />;
      case 'audio':
        return <Music size={14} style={{ color: '#a855f7', flexShrink: 0 }} />;
      case 'text':
      case 'doc':
        return <FileText size={14} style={{ color: '#10b981', flexShrink: 0 }} />;
      default:
        return <Sparkles size={14} style={{ color: '#60a5fa', flexShrink: 0 }} />;
    }
  };

  const filteredNodes = useMemo(() => {
    const next = nodes.filter((n) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match =
          n.name.toLowerCase().includes(q) ||
          (n.prompt && n.prompt.toLowerCase().includes(q));
        if (!match) return false;
      }
      if (!nodeMatchesTypes(n.type, filterState.types)) return false;
      if (!nodeMatchesTags(n, filterState.tags)) return false;
      if (!matchesTimeRange(n.updatedAt || 0, filterState.timeRange)) return false;
      return true;
    });
    next.sort((a, b) =>
      filterState.sortOrder === 'desc'
        ? (b.updatedAt || 0) - (a.updatedAt || 0)
        : (a.updatedAt || 0) - (b.updatedAt || 0),
    );
    return next;
  }, [nodes, searchQuery, filterState]);

  const bindDrag = (node: CanvasNodeItem) => (e: React.DragEvent) => {
    e.dataTransfer.setData(
      'application/json',
      JSON.stringify({ type: 'omnimux-canvas-node', nodeId: node.id }),
    );
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className="wf-canvas-tab-view-compact">
      <div className="wf-assets-toolbar-compact">
        <div className="wf-search-row-compact">
          <div className="wf-search-input-wrapper-compact">
            <Search size={13} className="wf-search-icon" />
            <input
              type="text"
              className="wf-search-input-compact"
              placeholder={t('assets.searchFiles') || '搜索文件'}
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
          </div>

          <div className="wf-view-mode-toggle-compact">
            <button
              type="button"
              className={`wf-view-mode-btn-compact ${viewMode === 'tree' ? 'active' : ''}`}
              title={t('assets.viewList') || '列表视图'}
              onClick={() => setViewMode('tree')}
            >
              <List size={13} />
            </button>
            <button
              type="button"
              className={`wf-view-mode-btn-compact ${viewMode === 'grid' ? 'active' : ''}`}
              title={t('assets.viewGrid') || '网格视图'}
              onClick={() => setViewMode('grid')}
            >
              <LayoutGrid size={13} />
            </button>
          </div>

          <button
            type="button"
            className="wf-view-mode-btn-compact"
            title={t('assets.refresh') || '刷新创作画布素材'}
            onClick={onRefresh}
          >
            <RefreshCw size={13} />
          </button>
        </div>

        <div className="wf-filter-chips-row-compact">
          <div className="wf-filter-dropdown-wrapper-compact">
            <button
              type="button"
              className={`wf-filter-dropdown-btn-compact ${filterState.types.length > 0 ? 'active' : ''}`}
              onClick={(e) => {
                setTypeAnchor(e.currentTarget.getBoundingClientRect());
                setTypeOpen((prev) => !prev);
                setTagOpen(false);
                setTimeOpen(false);
              }}
            >
              <span>
                {filterState.types.length > 0
                  ? `${t('assets.filter.type') || '类型'} (${filterState.types.includes('__none__') ? 0 : filterState.types.length})`
                  : (t('assets.filter.type') || '类型')}
              </span>
              <ChevronDown size={11} />
            </button>
          </div>

          <div className="wf-filter-dropdown-wrapper-compact">
            <button
              type="button"
              className={`wf-filter-dropdown-btn-compact ${filterState.tags.length > 0 ? 'active' : ''}`}
              onClick={(e) => {
                setTagAnchor(e.currentTarget.getBoundingClientRect());
                setTagOpen((prev) => !prev);
                setTypeOpen(false);
                setTimeOpen(false);
              }}
            >
              <span>{filterState.tags.length > 0 ? `${t('assets.filter.tag') || '标签'} (${filterState.tags.length})` : (t('assets.filter.tag') || '标签')}</span>
              <ChevronDown size={11} />
            </button>
          </div>

          <div className="wf-filter-dropdown-wrapper-compact">
            <button
              type="button"
              className={`wf-filter-dropdown-btn-compact ${filterState.timeRange !== 'all' || filterState.sortOrder === 'asc' ? 'active' : ''}`}
              onClick={(e) => {
                setTimeAnchor(e.currentTarget.getBoundingClientRect());
                setTimeOpen((prev) => !prev);
                setTypeOpen(false);
                setTagOpen(false);
              }}
            >
              <span>{t('assets.filter.time') || '时间'}</span>
              <ChevronDown size={11} />
            </button>
          </div>
        </div>
      </div>

      <div className="wf-drawer-content-scroll-compact">
        {nodes.length === 0 ? (
          <div className="wf-assets-empty-state-compact">
            <Layers size={24} className="wf-assets-empty-icon" />
            <div className="wf-assets-empty-title">{t('assets.emptyCanvas') || '创作画布暂无素材'}</div>
            <div className="wf-assets-empty-subtitle">{t('assets.emptyCanvasSub') || '请导入文件或添加节点并生成'}</div>
          </div>
        ) : filteredNodes.length === 0 ? (
          <div className="wf-assets-empty-state-compact">
            <Layers size={24} className="wf-assets-empty-icon" />
            <div className="wf-assets-empty-title">{t('assets.emptyCanvasMatch') || '当前创作画布暂无匹配素材'}</div>
          </div>
        ) : viewMode === 'tree' ? (
          <div className="wf-tree-list-container-compact">
            {filteredNodes.map((node) => {
              const isSelected = selectedId === node.id;
              return (
                <div
                  key={node.id}
                  data-id={node.id}
                  className={`wf-tree-item-compact ${isSelected ? 'selected' : ''}`}
                  draggable
                  onDragStart={bindDrag(node)}
                  onClick={() => {
                    setSelectedId(node.id);
                    onFocusNode(node.id);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setSelectedId(node.id);
                    onContextMenu(e, node);
                  }}
                  onMouseEnter={(e) => onHoverItem(node, e)}
                  onMouseLeave={() => onHoverItem(null)}
                >
                  {node.previewUrl ? (
                    <img src={node.previewUrl} alt={node.name} className="wf-tree-file-thumb-compact" />
                  ) : (
                    <div className="wf-tree-file-icon-box-compact">
                      {getNodeIcon(node.type)}
                    </div>
                  )}

                  <span className="wf-tree-name-compact" title={node.name}>
                    {node.name}
                  </span>
                  {node.nodeKind ? (
                    <span className={`wf-node-kind-badge wf-node-kind-badge--${node.nodeKind}`}>
                      {node.nodeKind === 'import' ? (t('assets.badge.import') || '导入') : (t('assets.badge.generate') || '生成')}
                    </span>
                  ) : null}

                  <div
                    className="wf-item-locate-icon-compact"
                    title={t('assets.locateOnCanvas') || '在创作画布定位'}
                    onClick={(e) => {
                      e.stopPropagation();
                      onFocusNode(node.id);
                    }}
                  >
                    <Crosshair size={12} />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="wf-grid-view-container-compact">
            {filteredNodes.map((node) => (
              <div
                key={node.id}
                data-id={node.id}
                className="wf-grid-card-compact"
                draggable
                onDragStart={bindDrag(node)}
                onClick={() => {
                  setSelectedId(node.id);
                  onFocusNode(node.id);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  onContextMenu(e, node);
                }}
                onMouseEnter={(e) => onHoverItem(node, e)}
                onMouseLeave={() => onHoverItem(null)}
              >
                <div className="wf-grid-card-thumb-compact">
                  {node.previewUrl ? (
                    <img src={node.previewUrl} alt={node.name} />
                  ) : (
                    getNodeIcon(node.type)
                  )}
                </div>
                <div className="wf-grid-card-meta-compact">
                  <div className="wf-grid-card-title-compact" title={node.name}>
                    {node.name}
                  </div>
                  {node.nodeKind ? (
                    <span className={`wf-node-kind-badge wf-node-kind-badge--${node.nodeKind}`}>
                      {node.nodeKind === 'import' ? (t('assets.badge.import') || '导入') : (t('assets.badge.generate') || '生成')}
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <TypeFilterPopover
        isOpen={typeOpen}
        anchorRect={typeAnchor}
        selectedTypes={filterState.types}
        onChange={(types) => setFilterState((prev) => ({ ...prev, types }))}
        onClose={() => setTypeOpen(false)}
      />
      <TagFilterPopover
        isOpen={tagOpen}
        anchorRect={tagAnchor}
        selectedTags={filterState.tags}
        onChange={(tags) => setFilterState((prev) => ({ ...prev, tags }))}
        onClose={() => setTagOpen(false)}
      />
      <TimeFilterPopover
        isOpen={timeOpen}
        anchorRect={timeAnchor}
        sortOrder={filterState.sortOrder}
        timeRange={filterState.timeRange}
        onSortChange={(sortOrder) => setFilterState((prev) => ({ ...prev, sortOrder }))}
        onRangeChange={(timeRange) => setFilterState((prev) => ({ ...prev, timeRange }))}
        onClose={() => setTimeOpen(false)}
      />
    </div>
  );
};
