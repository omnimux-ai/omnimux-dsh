import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { getGlobalMediaViewerStore } from './media-viewer-store.js';
import { GeneratingStateCard } from './GeneratingStateCard.jsx';
import { FloatingBottomComposer } from './FloatingBottomComposer.jsx';
import { injectMediaViewerStyles } from './styles.js';

export const MEDIA_VIEWER_TAB_ID = 'omnimux:media-viewer';

/**
 * MediaViewerTab
 * Right panel tab for Image & Video creation workflow.
 * Supports:
 * - 3-column & 2-column layout switching
 * - Timeline feed with multi-image horizontal grouping
 * - Single image/video detail view with left filmstrip
 * - Clean top toolbar (temporary editing buttons removed)
 */
export function MediaViewerTab({ scope }) {
  useEffect(() => {
    injectMediaViewerStyles();
  }, []);

  const store = getGlobalMediaViewerStore();
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);

  const { mediaList, activeId, subViewMode, layoutMode, zoom, isGenerating } = state;

  const activeItem = mediaList.find((m) => m.id === activeId) || mediaList[0];
  const timelineGroups = store.getTimelineGroups();

  const handleSelectMedia = (item) => {
    store.setActiveId(item.id);
    store.setSubViewMode('single');
  };

  const handleDownload = () => {
    if (!activeItem?.url) return;
    const a = document.createElement('a');
    a.href = activeItem.url;
    a.download = activeItem.title || 'media_export.jpg';
    a.click();
  };

  const handleToggleSplit = () => {
    const nextMode = layoutMode === '3col' ? '2col' : '3col';
    store.setLayoutMode(nextMode);
    try {
      const root = document.documentElement;
      if (nextMode === '2col') {
        root.setAttribute('data-omnimux-conversation-collapsed', 'true');
      } else {
        root.removeAttribute('data-omnimux-conversation-collapsed');
      }
    } catch {
      // ignore
    }
  };

  return (
    <div className="omx-media-viewer" data-layout-mode={layoutMode}>
      {/* 顶部工具栏 */}
      <div className="omx-mv-toolbar">
        <div className="omx-mv-toolbar__left">
          <div className="omx-mv-capsule">
            <button // exempt-ui01: 视图切换大图模式按钮
              type="button"
              className={`omx-mv-capsule__btn ${subViewMode === 'single' ? 'active' : ''}`}
              title="大图浏览模式"
              aria-label="大图浏览模式"
              onClick={() => store.setSubViewMode('single')}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect width="18" height="18" x="3" y="3" rx="2" />
                <line x1="9" x2="9" y1="3" y2="21" />
              </svg>
            </button>
            <button // exempt-ui01: 视图切换时间线模式按钮
              type="button"
              className={`omx-mv-capsule__btn ${subViewMode === 'grid' ? 'active' : ''}`}
              title="时间线模式"
              aria-label="时间线模式"
              onClick={() => store.setSubViewMode('grid')}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect width="7" height="7" x="3" y="3" rx="1" />
                <rect width="7" height="7" x="14" y="3" rx="1" />
                <rect width="7" height="7" x="14" y="14" rx="1" />
                <rect width="7" height="7" x="3" y="14" rx="1" />
              </svg>
            </button>
          </div>
        </div>

        <div className="omx-mv-toolbar__center">
          {subViewMode === 'single' ? (
            <button // exempt-ui01: 变焦缩放按钮
              type="button"
              className="omx-mv-btn"
              onClick={() => store.cycleZoom()}
              title="调整缩放比例"
            >
              <span>{zoom}%</span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          ) : (
            <button // exempt-ui01: 时间线多选按钮
              type="button"
              className="omx-mv-btn"
              title="多选"
            >
              多选
            </button>
          )}
        </div>

        <div className="omx-mv-toolbar__right">
          {subViewMode === 'single' ? (
            <>
              <button // exempt-ui01: 外部打开按钮
                type="button"
                className="omx-mv-btn"
                title="在默认看图软件中打开"
                onClick={() => window.open(activeItem?.url, '_blank')}
              >
                打开
              </button>
              <button // exempt-ui01: 下载按钮
                type="button"
                className="omx-chat-media-tail__btn"
                title="下载原图"
                aria-label="下载原图"
                onClick={handleDownload}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </button>
            </>
          ) : null}
          <button // exempt-ui01: 分栏折叠切换按钮
            type="button"
            className="omx-chat-media-tail__btn"
            title="切换两栏/三栏"
            aria-label="切换两栏/三栏"
            onClick={handleToggleSplit}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect width="18" height="18" x="3" y="3" rx="2" />
              <line x1="12" x2="12" y1="3" y2="21" />
            </svg>
          </button>
        </div>
      </div>

      {/* 主舞台区 */}
      <div className="omx-mv-stage-wrapper" data-subview={subViewMode}>
        {/* 左侧胶卷栏：时间线模式下被 CSS 规则完全隐藏，大图模式下展开 */}
        <div className="omx-mv-filmstrip">
          {mediaList.map((item) => (
            <div
              key={item.id}
              className={`omx-mv-filmstrip__item ${item.id === activeItem?.id ? 'active' : ''}`}
              onClick={() => handleSelectMedia(item)}
              role="button"
              tabIndex={0}
            >
              <img src={item.url} alt={item.title || '缩略图'} className="omx-mv-filmstrip__img" />
              {item.type === 'video' && item.duration ? (
                <div className="omx-mv-filmstrip__badge">{item.duration}</div>
              ) : null}
            </div>
          ))}
          {isGenerating ? (
            <div className="omx-mv-filmstrip__item">
              <GeneratingStateCard />
            </div>
          ) : null}
        </div>

        {/* 视口展示区 */}
        <div className="omx-mv-viewport">
          {subViewMode === 'grid' ? (
            /* 时间线瀑布流：同一时间线下多图横排 */
            <div className="omx-mv-timeline">
              {timelineGroups.map((group) => (
                <div key={group.timeKey} className="omx-mv-timeline__group">
                  <div className="omx-mv-timeline__date">{group.timeKey}</div>
                  {group.items.length === 1 ? (
                    <div
                      className={`omx-mv-timeline__card-single ${group.items[0].id === activeItem?.id ? 'selected' : ''}`}
                      onClick={() => handleSelectMedia(group.items[0])}
                      role="button"
                      tabIndex={0}
                    >
                      <img src={group.items[0].url} alt={group.items[0].title || '图片'} />
                    </div>
                  ) : (
                    <div className="omx-mv-timeline__row">
                      {group.items.map((it) => (
                        <div
                          key={it.id}
                          className={`omx-mv-timeline__card-multi ${it.id === activeItem?.id ? 'selected' : ''}`}
                          onClick={() => handleSelectMedia(it)}
                          role="button"
                          tabIndex={0}
                        >
                          <img src={it.url} alt={it.title || '图片'} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {isGenerating ? (
                <div className="omx-mv-timeline__group">
                  <div className="omx-mv-timeline__card-single">
                    <GeneratingStateCard />
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            /* 单图/大图居中视口 */
            <div className="omx-mv-display">
              {activeItem?.type === 'video' ? (
                <video src={activeItem.url} controls autoPlay playsInline />
              ) : (
                <img src={activeItem?.url} alt={activeItem?.title || '预览'} />
              )}
            </div>
          )}

          {/* 两栏模式下的底部悬浮输入框 */}
          <FloatingBottomComposer
            refThumbUrl={activeItem?.url}
            hidden={layoutMode !== '2col'}
          />
        </div>
      </div>
    </div>
  );
}
