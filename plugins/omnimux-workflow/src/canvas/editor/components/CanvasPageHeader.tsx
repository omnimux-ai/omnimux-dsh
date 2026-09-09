/**
 * CanvasPageHeader.tsx — 画布左上角创作页管理组件。
 *
 * 语义：
 * 1. 工作区 = 当前项目物理目录 (Directory / Project)
 * 2. 创作页 = 项目内的独立画布页面 (Page)，支持切换、重命名与新建全新页面。
 *
 * 优化特性：
 * - 移除不必要的顶层标题行，展开直奔页面列表；
 * - 悬停单项右侧浮现编辑铅笔图标，点击就地内联重命名（支持回车/失焦确认）；
 * - 限制列表最大显示高度，超过时优雅滚动；
 * - 强化新建与切换流水线，保证即时生成新画布并零闪烁平滑切换。
 */

import React, { memo, useState, useEffect, useRef, useCallback } from 'react';
import { Layers, ChevronDown, Check, Plus, Pencil } from 'lucide-react';
import {
  fetchProjectPages,
  createProjectPage,
  setActiveProjectPage,
  renameProjectPage,
  type ProjectPageDto,
} from '../../bridge/apiClient';
import { stopToolbarNativeEvent } from './toolbarPointerGuard';

export interface CanvasPageHeaderProps {
  workspaceId: string | null;
  onSwitchWorkspaceId?: (newWorkspaceId: string) => void;
}

export const CanvasPageHeader: React.FC<CanvasPageHeaderProps> = memo(({
  workspaceId,
  onSwitchWorkspaceId,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pages, setPages] = useState<ProjectPageDto[]>([]);
  const [activePageId, setActivePageId] = useState<string>('page-default');
  const [editingPageId, setEditingPageId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState<string>('');

  const popoverRef = useRef<HTMLDivElement>(null);
  const capsuleRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // 1. 根据当前 workspaceId 获取项目与创作页列表
  const loadPages = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const res = await fetchProjectPages(workspaceId);
      if (res.ok && res.body && Array.isArray(res.body.pages) && res.body.pages.length > 0) {
        setPages(res.body.pages);
        const matched = res.body.pages.find((p) => p.canvasWorkspaceId === workspaceId);
        if (matched) {
          setActivePageId(matched.id);
        } else if (res.body.activePageId) {
          setActivePageId(res.body.activePageId);
        }
      }
    } catch {
      // ignore
    }
  }, [workspaceId]);

  useEffect(() => {
    void loadPages();
  }, [loadPages]);

  // 重命名输入框自动聚焦
  useEffect(() => {
    if (editingPageId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [editingPageId]);

  // 点击外部自动关闭
  useEffect(() => {
    if (!isOpen) return undefined;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        capsuleRef.current &&
        !capsuleRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
        setEditingPageId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
    };
  }, [isOpen]);

  const activePage = pages.find((p) => p.id === activePageId) || pages[0];
  const displayTitle = activePage?.title || '创作页 1';

  // 2. 切换页面
  const handleSelectPage = async (page: ProjectPageDto) => {
    if (editingPageId) return;
    if (page.id === activePageId) {
      setIsOpen(false);
      return;
    }
    setIsOpen(false);
    if (!workspaceId) return;

    try {
      setActivePageId(page.id);
      const res = await setActiveProjectPage(workspaceId, page.id);
      const targetWs = res.ok && res.body.canvasWorkspaceId ? res.body.canvasWorkspaceId : page.canvasWorkspaceId;
      if (targetWs && onSwitchWorkspaceId) {
        onSwitchWorkspaceId(targetWs);
      }
    } catch {
      if (page.canvasWorkspaceId && onSwitchWorkspaceId) {
        onSwitchWorkspaceId(page.canvasWorkspaceId);
      }
    }
  };

  // 3. 开始重命名
  const handleStartRename = (e: React.MouseEvent, page: ProjectPageDto) => {
    e.stopPropagation();
    setEditingPageId(page.id);
    setEditingTitle(page.title);
  };

  // 4. 提交重命名
  const handleCommitRename = async (pageId: string) => {
    const trimmed = editingTitle.trim();
    setEditingPageId(null);
    if (!trimmed || !workspaceId) return;

    // 先乐观更新本地
    setPages((prev) =>
      prev.map((p) => (p.id === pageId ? { ...p, title: trimmed } : p)),
    );

    try {
      await renameProjectPage(workspaceId, pageId, trimmed);
    } catch {
      // ignore
    }
  };

  // 5. 新建创作页
  const handleCreateNewPage = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!workspaceId || loading) return;
    setLoading(true);
    try {
      const nextIndex = pages.length + 1;
      const newTitle = `创作页 ${nextIndex}`;
      const res = await createProjectPage(workspaceId, newTitle);

      if (res.ok && res.body) {
        const newWsId = res.body.workspace?.id || res.body.page?.canvasWorkspaceId;
        const newPage: ProjectPageDto = res.body.page || {
          id: newWsId || `page-${nextIndex}`,
          title: newTitle,
          canvasWorkspaceId: newWsId,
          createdAt: new Date().toISOString(),
        };

        const updatedPages = res.body.pages && Array.isArray(res.body.pages)
          ? res.body.pages
          : [...pages, newPage];

        setPages(updatedPages);
        setActivePageId(newPage.id);
        setIsOpen(false);

        if (newWsId && onSwitchWorkspaceId) {
          onSwitchWorkspaceId(newWsId);
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="wf-page-header-controls nodrag nopan"
      onPointerDown={stopToolbarNativeEvent}
      onMouseDown={stopToolbarNativeEvent}
    >
      {/* 顶部左侧胶囊：展示当前页面名称 + 悬停更多下拉按钮 */}
      <div
        ref={capsuleRef}
        className="wf-page-header-capsule"
        title="点击切换或新建创作页"
        onClick={() => {
          setIsOpen((prev) => !prev);
          setEditingPageId(null);
        }}
      >
        <Layers size={14} style={{ color: 'var(--dsw-alias-label-secondary)', flexShrink: 0 }} />
        <span className="wf-page-header-title">{displayTitle}</span>
        <span className="wf-page-header-more-btn">
          <ChevronDown size={13} />
        </span>
      </div>

      {/* 下拉 Popover 菜单 */}
      {isOpen && (
        <div ref={popoverRef} className="wf-page-dropdown-popover">
          {/* 页面列表直接展示，限高滚动 */}
          <div className="wf-page-dropdown-list">
            {(pages.length > 0 ? pages : [{ id: 'page-default', title: displayTitle, canvasWorkspaceId: workspaceId || '' }]).map((p) => {
              const isCurrent = p.id === activePageId;
              const isEditing = p.id === editingPageId;

              return (
                <div
                  key={p.id}
                  className={`wf-page-dropdown-item ${isCurrent ? 'wf-page-dropdown-item--active' : ''}`}
                  onClick={() => void handleSelectPage(p)}
                >
                  {isEditing ? (
                    <input
                      ref={renameInputRef}
                      className="wf-page-rename-input"
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === 'Enter') void handleCommitRename(p.id);
                        if (e.key === 'Escape') setEditingPageId(null);
                      }}
                      onBlur={() => void handleCommitRename(p.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <span className="wf-page-dropdown-item-title" title={p.title}>
                      {p.title}
                    </span>
                  )}

                  <div className="wf-page-dropdown-item-actions">
                    {/* 悬停编辑铅笔图标 */}
                    {!isEditing && (
                      <button /* exempt-ui01: 创作页重命名图标按钮 */
                        type="button"
                        className="wf-page-edit-btn"
                        title="重命名"
                        onClick={(e) => handleStartRename(e, p)}
                      >
                        <Pencil size={11} />
                      </button>
                    )}
                    {/* 选中打勾图标 */}
                    {isCurrent && !isEditing && (
                      <Check size={13} style={{ color: 'var(--dsw-alias-brand-primary)', flexShrink: 0 }} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 底部「新建创作页」操作项 */}
          <div className="wf-page-dropdown-footer">
            <button /* exempt-ui01: 创作页下拉菜单底部新建按钮 */
              type="button"
              className="wf-page-dropdown-create-btn"
              disabled={loading}
              onClick={handleCreateNewPage}
            >
              <Plus size={13} />
              <span>{loading ? '正在新建…' : '新建创作页'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

CanvasPageHeader.displayName = 'CanvasPageHeader';
