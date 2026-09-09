/**
 * CanvasPageHeader.tsx — 画布左上角创作页管理组件。
 *
 * 语义：
 * 1. 工作区 = 当前项目物理目录 (Directory / Project)
 * 2. 创作页 = 项目内的独立画布页面 (Page)，支持切换与新建全新页面。
 *
 * 交互：
 * - 默认展示当前激活的创作页名称；
 * - 悬停名称右侧出现下拉“更多”图标按钮；
 * - 点击呼出下拉浮层，可切换已有页面，或点击「+ 新建页面」直接生成并进入全新空白页面。
 */

import React, { memo, useState, useEffect, useRef, useCallback } from 'react';
import { Layers, ChevronDown, Check, Plus } from 'lucide-react';
import {
  fetchProjectPages,
  createProjectPage,
  setActiveProjectPage,
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
  const [projectTitle, setProjectTitle] = useState<string>('');

  const popoverRef = useRef<HTMLDivElement>(null);
  const capsuleRef = useRef<HTMLDivElement>(null);

  // 1. 根据当前 workspaceId 获取项目与创作页列表
  const loadPages = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const res = await fetchProjectPages(workspaceId);
      if (res.ok && res.body) {
        if (Array.isArray(res.body.pages) && res.body.pages.length > 0) {
          setPages(res.body.pages);
          // 确定当前激活页：优先匹配当前 workspaceId
          const matchedByWs = res.body.pages.find((p) => p.canvasWorkspaceId === workspaceId);
          if (matchedByWs) {
            setActivePageId(matchedByWs.id);
          } else if (res.body.activePageId) {
            setActivePageId(res.body.activePageId);
          }
        }
        if (res.body.projectTitle) {
          setProjectTitle(res.body.projectTitle);
        }
      }
    } catch {
      // ignore
    }
  }, [workspaceId]);

  useEffect(() => {
    void loadPages();
  }, [loadPages]);

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
      }
    };
    document.addEventListener('mousedown', handleClickOutside, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
    };
  }, [isOpen]);

  const activePage = pages.find((p) => p.id === activePageId) || pages[0];
  const displayTitle = activePage?.title || projectTitle || '创作页 1';

  // 2. 切换页面
  const handleSelectPage = async (page: ProjectPageDto) => {
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

  // 3. 新建创作页
  const handleCreateNewPage = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!workspaceId || loading) return;
    setLoading(true);
    try {
      const nextIndex = pages.length + 1;
      const newTitle = `创作页 ${nextIndex}`;
      const res = await createProjectPage(workspaceId, newTitle);
      if (res.ok && res.body.workspace && res.body.page) {
        const newPage = res.body.page;
        const newWs = res.body.workspace;
        setPages((prev) => [...prev, newPage]);
        setActivePageId(newPage.id);
        setIsOpen(false);
        if (onSwitchWorkspaceId) {
          onSwitchWorkspaceId(newWs.id);
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
        onClick={() => setIsOpen((prev) => !prev)}
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
          <div className="wf-page-dropdown-header">
            <span>创作页面</span>
            <span>{pages.length || 1} 个页面</span>
          </div>

          <div className="wf-page-dropdown-list">
            {pages.map((p) => {
              const isCurrent = p.id === activePageId;
              return (
                <div
                  key={p.id}
                  className={`wf-page-dropdown-item ${isCurrent ? 'wf-page-dropdown-item--active' : ''}`}
                  onClick={() => void handleSelectPage(p)}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.title}
                  </span>
                  {isCurrent && <Check size={13} style={{ color: 'var(--dsw-alias-brand-primary)', flexShrink: 0 }} />}
                </div>
              );
            })}
          </div>

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
