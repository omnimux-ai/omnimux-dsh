import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { getGlobalMediaViewerStore } from './media-viewer-store.js';
import { GeneratingStateCard } from './GeneratingStateCard.jsx';
import { injectMediaViewerStyles } from './styles.js';
import { registerContextContributor } from '../workbench/context.js';

export const MEDIA_VIEWER_TAB_ID = 'omnimux:media-viewer';

/**
 * MediaViewerTab
 * Right panel tab for Image & Video creation workflow.
 * Supports:
 * - 3-column & 2-column layout switching
 * - Timeline feed with multi-image horizontal grouping
 * - Single image/video detail view with right vertical thumbnails rail
 * - Image annotation comments with popovers, consecutive numbering and model prompt integration
 */
export function MediaViewerTab({ scope }) {
  useEffect(() => {
    injectMediaViewerStyles();
  }, []);

  const store = getGlobalMediaViewerStore();
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);

  const { mediaList, activeId, subViewMode, layoutMode, zoom, isGenerating, isAnnotating } = state;

  const activeItem = mediaList.find((m) => m.id === activeId) || mediaList[0];
  const timelineGroups = store.getTimelineGroups();

  const imageRef = useRef(null);
  const [draftText, setDraftText] = useState('');

  const annotations = store.getAnnotations(activeItem?.id);
  const savedAnnotations = annotations.filter((a) => a.status === 'saved');

  // Register workbench Agent UI context for canvas and active annotations
  useEffect(() => {
    return registerContextContributor(MEDIA_VIEWER_TAB_ID, () => {
      const currentAnnotations = store.getAnnotations(activeItem?.id);
      const saved = currentAnnotations.filter((a) => a.status === 'saved');
      return {
        view: {
          kind: 'canvas',
          activeMediaId: activeItem?.id,
          annotationsCount: saved.length,
        },
        selection: [],
      };
    });
  }, [activeItem?.id]);

  // ESC key to exit annotating mode or cancel draft
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (isAnnotating) {
          store.cancelDraftAnnotation(activeItem?.id);
          store.setAnnotating(false);
          setDraftText('');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAnnotating, activeItem?.id]);

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

  const handleImageClick = (e) => {
    if (!isAnnotating || !activeItem?.id) return;
    if (e.target.closest('.omx-mv-annotation-popover') || e.target.closest('.omx-mv-annotation-pin')) {
      return;
    }
    const img = imageRef.current;
    if (!img) return;
    const rect = img.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    if (x < 0 || x > 100 || y < 0 || y > 100) return;
    store.addDraftAnnotation(activeItem.id, { xPercent: x, yPercent: y });
    setDraftText('');
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
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect width="18" height="13" x="3" y="7" rx="2" />
                <line x1="8" y1="3" x2="16" y2="3" />
              </svg>
            </button>
            <button // exempt-ui01: 视图切换时间线模式按钮
              type="button"
              className={`omx-mv-capsule__btn ${subViewMode === 'grid' ? 'active' : ''}`}
              title="四宫格时间线模式"
              aria-label="四宫格时间线模式"
              onClick={() => store.setSubViewMode('grid')}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect width="6" height="6" x="4" y="4" rx="1.5" />
                <rect width="6" height="6" x="14" y="4" rx="1.5" />
                <rect width="6" height="6" x="14" y="14" rx="1.5" />
                <rect width="6" height="6" x="4" y="14" rx="1.5" />
              </svg>
            </button>
          </div>
        </div>

        <div className="omx-mv-toolbar__center">
          {subViewMode === 'grid' ? (
            <button // exempt-ui01: 时间线多选按钮
              type="button"
              className="omx-mv-btn"
              title="多选"
            >
              多选
            </button>
          ) : (
            savedAnnotations.length > 0 ? (
              <div className="omx-mv-toolbar-comments-bar">
                <span>{savedAnnotations.length} 条评论</span>
                <span>请用对话发送按钮提交评论</span>
                <button // exempt-ui01: 评论清空按钮
                  type="button"
                  className="omx-mv-toolbar-comments-bar__btn-close"
                  title="清空当前所有评论"
                  onClick={() => store.clearAnnotations(activeItem?.id)}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            ) : (
              <button // exempt-ui01: 添加评论按钮
                type="button"
                className={`omx-mv-btn--comment ${isAnnotating ? 'active' : ''}`}
                title={isAnnotating ? '点击画面标记评论（按 Esc 退出）' : '点击在画面上添加评论标记'}
                onClick={() => store.setAnnotating(!isAnnotating)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="9" />
                  <line x1="12" y1="8" x2="12" y2="16" />
                  <line x1="8" y1="12" x2="16" y2="12" />
                </svg>
                <span>添加评论</span>
              </button>
            )
          )}
        </div>

        <div className="omx-mv-toolbar__right">
          {subViewMode === 'single' ? (
            <>
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
            /* 单图大画布展示区与右侧多图纵向候选栏 (完全对标截图) */
            <div className="omx-mv-single-stage">
              <div
                className={`omx-mv-display ${isAnnotating ? 'is-annotating' : ''}`}
                onClick={handleImageClick}
              >
                {activeItem?.type === 'video' ? (
                  <video src={activeItem.url} controls autoPlay playsInline />
                ) : (
                  <img
                    ref={imageRef}
                    src={activeItem?.url}
                    alt={activeItem?.title || '预览'}
                  />
                )}

                {/* 局部打点与气泡输入框层 */}
                {annotations.map((item) => {
                  if (item.status === 'draft') {
                    const isNearRight = item.xPercent > 65;
                    return (
                      <div
                        key={item.id}
                        className="omx-mv-annotation-popover"
                        style={{
                          left: `${item.xPercent}%`,
                          top: `${item.yPercent}%`,
                          transform: isNearRight ? 'translate(-85%, -115%)' : 'translate(-15%, -115%)',
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="omx-mv-annotation-popover__badge">{item.index}</div>
                        <input
                          className="omx-mv-annotation-popover__input"
                          autoFocus
                          placeholder="添加评论..."
                          value={draftText}
                          onChange={(e) => setDraftText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              store.commitAnnotation(activeItem?.id, item.id, draftText);
                              setDraftText('');
                            } else if (e.key === 'Escape') {
                              store.cancelDraftAnnotation(activeItem?.id, item.id);
                              setDraftText('');
                            }
                          }}
                        />
                        {draftText.trim() ? (
                          <button // exempt-ui01: 评论提交按钮
                            type="button"
                            className="omx-mv-annotation-popover__submit"
                            title="提交评论 (Enter)"
                            onClick={() => {
                              store.commitAnnotation(activeItem?.id, item.id, draftText);
                              setDraftText('');
                            }}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <line x1="12" y1="19" x2="12" y2="5" />
                              <polyline points="5 12 12 5 19 12" />
                            </svg>
                          </button>
                        ) : null}
                      </div>
                    );
                  }

                  return (
                    <div
                      key={item.id}
                      className="omx-mv-annotation-pin"
                      style={{ left: `${item.xPercent}%`, top: `${item.yPercent}%` }}
                      title={`标记 ${item.index}: ${item.text}`}
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
                    >
                      {item.index}
                    </div>
                  );
                })}
              </div>

              {/* 右侧候选多图纵向滚动切换栏 (当生成多图时收敛浮现) */}
              {mediaList.length > 1 ? (
                <div className="omx-mv-thumbnails-rail" title="上下滚动切换浏览">
                  {mediaList.map((item) => {
                    const isSelected = item.id === activeItem?.id;
                    return (
                      <div
                        key={item.id}
                        className={`omx-mv-thumbnails-rail__item ${isSelected ? 'active' : ''}`}
                        onClick={() => handleSelectMedia(item)}
                        role="button"
                        tabIndex={0}
                        title={item.title || '切换图片'}
                      >
                        <img
                          src={item.url}
                          alt={item.title || '缩略图'}
                          className="omx-mv-thumbnails-rail__img"
                        />
                        {item.type === 'video' && item.duration ? (
                          <div className="omx-mv-thumbnails-rail__badge">{item.duration}</div>
                        ) : null}
                      </div>
                    );
                  })}
                  {isGenerating ? (
                    <div className="omx-mv-thumbnails-rail__item">
                      <GeneratingStateCard />
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
