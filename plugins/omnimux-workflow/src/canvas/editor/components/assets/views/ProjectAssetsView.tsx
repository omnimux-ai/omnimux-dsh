import React, { useState } from 'react';
import {
  Sparkles,
  ChevronRight,
  Folder,
  FolderPlus,
  ArrowUp,
  Image as ImageIcon,
  Film,
  Music,
  FileText,
  ChevronDown,
  LayoutGrid,
  List,
  Search,
  RefreshCw,
  Layers,
  Crosshair,
} from 'lucide-react';
import type { AssetItem, ViewMode } from '../types';
import { useT } from '../../../../i18n';

interface ProjectAssetsViewProps {
  assets: AssetItem[];
  onOpenSubjects: () => void;
  onContextMenu: (e: React.MouseEvent, item: AssetItem, isFolder: boolean) => void;
  onHoverItem: (item: AssetItem | null, e?: React.MouseEvent) => void;
  onImportFiles: () => void;
  onCreateFolder: () => void;
  onInsertToCanvas: (item: AssetItem) => void;
  onRefresh?: () => void;
}

export const ProjectAssetsView: React.FC<ProjectAssetsViewProps> = ({
  assets,
  onOpenSubjects,
  onContextMenu,
  onHoverItem,
  onImportFiles,
  onCreateFolder,
  onInsertToCanvas,
  onRefresh,
}) => {
  const t = useT();
  const [viewMode, setViewMode] = useState<ViewMode>('tree');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});

  const toggleFolder = (folderId: string) => {
    setExpandedFolders((prev) => ({ ...prev, [folderId]: !prev[folderId] }));
  };

  const getAssetIcon = (type: string) => {
    switch (type) {
      case 'image':
        return <ImageIcon size={14} style={{ color: '#3b82f6', flexShrink: 0 }} />;
      case 'video':
        return <Film size={14} style={{ color: '#8b5cf6', flexShrink: 0 }} />;
      case 'audio':
        return <Music size={14} style={{ color: '#a855f7', flexShrink: 0 }} />;
      case 'doc':
        return <FileText size={14} style={{ color: '#10b981', flexShrink: 0 }} />;
      case 'folder':
        return <Folder size={14} style={{ color: '#f59e0b', flexShrink: 0 }} />;
      default:
        return <Sparkles size={14} style={{ color: '#60a5fa', flexShrink: 0 }} />;
    }
  };

  const filteredAssets = assets.filter((item) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const match =
        item.name.toLowerCase().includes(q) ||
        (item.tags && item.tags.some((t) => t.toLowerCase().includes(q)));
      if (!match) return false;
    }
    return true;
  });

  const childrenOf = (parentId: string | null): AssetItem[] =>
    filteredAssets.filter((item) => (item.parentId ?? null) === parentId);

  const renderTreeRows = (parentId: string | null, depth: number): React.ReactNode[] => {
    const rows: React.ReactNode[] = [];
    for (const item of childrenOf(parentId)) {
      const isFolder = item.type === 'folder';
      const isExpanded = isFolder && (expandedFolders[item.id] ?? depth === 0);
      const isSelected = selectedId === item.id;
      rows.push(
        <div
          key={item.id}
          className={`wf-tree-item-compact ${isSelected ? 'selected' : ''}`}
          style={{ paddingLeft: `${8 + depth * 14}px` }}
          data-asset-id={item.id}
          data-parent-id={item.parentId ?? ''}
          draggable={!isFolder}
          onDragStart={(e) => {
            if (!isFolder) {
              e.dataTransfer.setData(
                'application/json',
                JSON.stringify({
                  type: 'omnimux-asset',
                  asset: item,
                }),
              );
              e.dataTransfer.effectAllowed = 'copy';
            }
          }}
          onClick={() => {
            setSelectedId(item.id);
            if (isFolder) toggleFolder(item.id);
          }}
          onDoubleClick={() => {
            if (!isFolder) onInsertToCanvas(item);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            setSelectedId(item.id);
            onContextMenu(e, item, isFolder);
          }}
          onMouseEnter={(e) => onHoverItem(item, e)}
          onMouseLeave={() => onHoverItem(null)}
        >
          {isFolder ? (
            <span className="wf-tree-folder-arrow-compact">
              {isExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            </span>
          ) : null}

          {item.previewUrl ? (
            <img src={item.previewUrl} alt={item.name} className="wf-tree-file-thumb-compact" />
          ) : (
            <div className="wf-tree-file-icon-box-compact">
              {getAssetIcon(item.type)}
            </div>
          )}

          <span className="wf-tree-name-compact" title={item.name}>
            {item.name}
          </span>

          {!isFolder && (
            <div
              className="wf-item-locate-icon-compact"
              title="在创作画布定位"
              onClick={(e) => {
                e.stopPropagation();
                onInsertToCanvas(item);
              }}
            >
              <Crosshair size={12} />
            </div>
          )}
        </div>,
      );
      if (isFolder && isExpanded) {
        rows.push(...renderTreeRows(item.id, depth + 1));
      }
    }
    return rows;
  };

  return (
    <div className="wf-project-assets-view-compact">
      {/* 1. 纯净主体库入口 (无副标题) */}
      <div className="wf-subject-hero-card-compact" onClick={onOpenSubjects}>
        <div className="wf-subject-hero-left-compact">
          <Sparkles size={14} style={{ color: 'var(--wb-accent, #3b82f6)' }} />
          <span className="wf-subject-hero-name-compact">{t('assets.subjectLibrary') || '主体库'}</span>
        </div>
        <ChevronRight size={14} className="wf-subject-hero-arrow" />
      </div>

      {/* 2. 搜索栏 + 视图模式切换 + 刷新按钮 */}
      <div className="wf-assets-toolbar-compact">
        <div className="wf-search-row-compact">
          <div className="wf-search-input-wrapper-compact">
            <Search size={13} className="wf-search-icon" />
            <input
              type="text"
              className="wf-search-input-compact"
              placeholder={t('assets.searchProjectAssets') || '搜索项目资产'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
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
            title={t('assets.refreshProject') || '刷新项目资产'}
            onClick={onRefresh}
          >
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      {/* 3. 素材列表滚动区 */}
      <div className="wf-drawer-content-scroll-compact">
        {filteredAssets.length === 0 ? (
          <div className="wf-assets-empty-state-compact">
            <Layers size={24} className="wf-assets-empty-icon" />
            <div className="wf-assets-empty-title">{t('assets.emptyProjectFiles') || '暂无素材文件'}</div>
          </div>
        ) : viewMode === 'tree' ? (
          <div className="wf-tree-list-container-compact">
            {renderTreeRows(null, 0)}
          </div>
        ) : (
          <div className="wf-grid-view-container-compact">
            {filteredAssets.map((item) => (
              <div
                key={item.id}
                className="wf-grid-card-compact"
                draggable={item.type !== 'folder'}
                onDragStart={(e) => {
                  if (item.type !== 'folder') {
                    e.dataTransfer.setData(
                      'application/json',
                      JSON.stringify({
                        type: 'omnimux-asset',
                        asset: item,
                      }),
                    );
                    e.dataTransfer.effectAllowed = 'copy';
                  }
                }}
                onClick={() => setSelectedId(item.id)}
                onDoubleClick={() => {
                  if (item.type !== 'folder') onInsertToCanvas(item);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setSelectedId(item.id);
                  onContextMenu(e, item, item.type === 'folder');
                }}
                onMouseEnter={(e) => onHoverItem(item, e)}
                onMouseLeave={() => onHoverItem(null)}
              >
                <div className="wf-grid-card-thumb-compact">
                  {item.previewUrl ? (
                    <img src={item.previewUrl} alt={item.name} />
                  ) : (
                    getAssetIcon(item.type)
                  )}
                  {item.duration && (
                    <span className="wf-grid-card-duration-compact">{item.duration}</span>
                  )}
                </div>
                <div className="wf-grid-card-meta-compact">
                  <div className="wf-grid-card-title-compact" title={item.name}>
                    {item.name}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 4. 始终固定在底部的两个操作按钮 */}
      <div className="wf-assets-bottom-bar-compact">
        <button
          type="button"
          className="wf-assets-action-secondary-btn-compact"
          onClick={onCreateFolder}
        >
          <FolderPlus size={13} />
          <span>{t('assets.newFolder') || '新建文件夹'}</span>
        </button>
        <button
          type="button"
          className="wf-assets-action-primary-btn-compact"
          onClick={onImportFiles}
        >
          <ArrowUp size={13} />
          <span>{t('assets.importFile') || '导入文件'}</span>
        </button>
      </div>
    </div>
  );
};
