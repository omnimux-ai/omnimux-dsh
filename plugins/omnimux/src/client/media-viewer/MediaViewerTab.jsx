import React, { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { getGlobalMediaViewerStore } from './media-viewer-store.js';
import { GeneratingStateCard } from './GeneratingStateCard.jsx';
import { GenerationTasks } from './GenerationTasks.jsx';
import { currentSessionId } from '../workbench/host-adapter.js';
import { injectMediaViewerStyles } from './styles.js';
import { syncImageCanvasStage } from './image-canvas-stage.js';
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
const noSubscription = () => () => {};

export function MediaViewerTab({ scope, sessions, imageUrl, readFile }) {
  const getSessionSnapshot = () => sessions?.list?.getSnapshot().current || currentSessionId();
  const sessionId = useSyncExternalStore(sessions?.list?.subscribe || noSubscription, getSessionSnapshot, getSessionSnapshot);
  useEffect(() => {
    injectMediaViewerStyles();
  }, []);

  const store = getGlobalMediaViewerStore();
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  const { mediaList, activeId, subViewMode, layoutMode, zoom, isGenerating, isAnnotating } = state;

  const sessionMediaList = React.useMemo(() => {
    if (!sessionId) return mediaList;
    return mediaList.filter((m) => m.sessionId === sessionId);
  }, [mediaList, sessionId]);

  const activeItem = sessionMediaList.find((m) => m.id === activeId) || sessionMediaList[0];
  const timelineGroups = store.getTimelineGroups(sessionId);

  // 会话切换时，若当前 activeId 不属于当前会话的媒体列表，自动联动选中该会话的第一张素材
  useEffect(() => {
    if (!sessionId || sessionMediaList.length === 0) return;
    const exists = sessionMediaList.some((m) => m.id === activeId);
    if (!exists) {
      store.setActiveId(sessionMediaList[0].id);
    }
  }, [sessionId, sessionMediaList, activeId]);

  const imageRef = useRef(null);
  const viewerRootRef = useRef(null);
  const stageRef = useRef(null);
  const [draftText, setDraftText] = useState('');

  // 缩放平移与跨图记忆锁定引擎
  const [zoomScale, setZoomScale] = useState(1.0);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ startX: 0, startY: 0 });

  const annotations = store.getAnnotations(activeItem?.id);
  const savedAnnotations = annotations.filter((a) => a.status === 'saved');

  // 鼠标滚轮与触控板/手写板双指捏合无级平滑缩放
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const handleWheel = (e) => {
      e.preventDefault();
      const zoomFactor = e.ctrlKey ? 0.04 : 0.0015;
      const delta = -e.deltaY * zoomFactor;
      setZoomScale((prev) => {
        const next = Math.min(Math.max(prev * (1 + delta), 0.15), 5.0);
        store.setZoom(Math.round(next * 100));
        return next;
      });
    };
    stage.addEventListener('wheel', handleWheel, { passive: false });
    return () => stage.removeEventListener('wheel', handleWheel);
  }, [subViewMode]);

  // 全局鼠标拖拽释放兜底
  useEffect(() => {
    const handleGlobalMouseUp = () => setIsDragging(false);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, []);

  // 画布身份投影：单图浏览 = 图像画布。hub 侧的原生输入框投射规则以该标识为键，
  // 只有画布 + 右侧栏全屏才把输入框悬浮到画布底端（Issue #1821）。
  useLayoutEffect(() => {
    const root = viewerRootRef.current;
    if (!root) return undefined;
    let alive = true;
    const sync = () => {
      if (alive) syncImageCanvasStage(root, { subViewMode, hasActiveMedia: Boolean(activeItem?.id) });
    };
    sync();
    // 标签页前后切换会改变舞台可见性：同步前台标识，避免后台标签仍声明画布在前台。
    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(sync);
      observer.observe(root);
      return () => {
        alive = false;
        observer.disconnect();
      };
    }
    return () => {
      alive = false;
    };
  }, [subViewMode, activeItem?.id]);

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

  // 切换图片：严格保持当前缩放比例不变（跨图锁定）
  const handleSelectMedia = (item) => {
    store.setActiveId(item.id);
    store.setSubViewMode('single');
  };

  const handleResetZoom = () => {
    setZoomScale(1.0);
    setPanOffset({ x: 0, y: 0 });
    store.setZoom(100);
  };

  const handleMouseDown = (e) => {
    if (e.button !== 0 || isAnnotating) return;
    if (e.target.closest('.omx-mv-thumbnails-rail') || e.target.closest('.omx-mv-annotation-popover') || e.target.closest('.omx-mv-annotation-pin')) {
      return;
    }
    setIsDragging(true);
    dragStartRef.current = {
      startX: e.clientX - panOffset.x,
      startY: e.clientY - panOffset.y,
    };
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    setPanOffset({
      x: e.clientX - dragStartRef.current.startX,
      y: e.clientY - dragStartRef.current.startY,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleDoubleClick = (e) => {
    if (isAnnotating) return;
    if (e.target.closest('.omx-mv-thumbnails-rail') || e.target.closest('.omx-mv-annotation-popover') || e.target.closest('.omx-mv-annotation-pin')) {
      return;
    }
    if (Math.abs(zoomScale - 1.0) < 0.08) {
      setZoomScale(1.5);
      store.setZoom(150);
    } else {
      handleResetZoom();
    }
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
    <div className="omx-media-viewer" ref={viewerRootRef} data-layout-mode={layoutMode}>
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
                onClick={() => {
                  const levels = [0.5, 0.7, 1.0, 1.5, 2.0];
                  let idx = levels.indexOf(Math.round(zoomScale * 10) / 10);
                  idx = (idx + 1) % levels.length;
                  const next = levels[idx];
                  setZoomScale(next);
                  setPanOffset({ x: 0, y: 0 });
                  store.setZoom(Math.round(next * 100));
                }}
                title="调整缩放比例 (滚轮/手势可无级缩放，双击画面快速复位)"
              >
                <span>{Math.round(zoomScale * 100)}%</span>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {Math.abs(zoomScale - 1.0) >= 0.05 ? (
                <button // exempt-ui01: 适应窗口按钮
                  type="button"
                  className="omx-mv-btn"
                  onClick={handleResetZoom}
                  title="恢复适合窗口大小"
                >
                  适应窗口
                </button>
              ) : null}
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
        <div className="omx-mv-viewport" data-has-generation={state.generationTasks.some((task) => task.sessionId === sessionId) || undefined}>
          <GenerationTasks tasks={state.generationTasks.filter((task) => task.sessionId === sessionId)} imageUrl={imageUrl} readFile={readFile} />
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
                      {group.items[0].type === 'video' ? (
                        <video
                          src={group.items[0].url ? `${group.items[0].url}#t=0.001` : ''}
                          muted
                          playsInline
                          preload="metadata"
                        />
                      ) : (
                        <img src={group.items[0].url} alt={group.items[0].title || '图片'} />
                      )}
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
                          {it.type === 'video' ? (
                            <video
                              src={it.url ? `${it.url}#t=0.001` : ''}
                              muted
                              playsInline
                              preload="metadata"
                            />
                          ) : (
                            <img src={it.url} alt={it.title || '图片'} />
                          )}
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
            /* 单图大画布展示区与左上角 1:1 居中微型缩略图悬浮栏 */
            <div
              className="omx-mv-single-stage"
              ref={stageRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onDoubleClick={handleDoubleClick}
            >
              {/* 左上角候选多图纵向微型 1:1 居中滚动切换栏 (对标参考图) */}
              {(sessionMediaList || mediaList).length > 1 ? (
                <div className="omx-mv-thumbnails-rail" title="点击切换图片 (保持当前缩放比例)">
                  {(sessionMediaList || mediaList).map((item) => {
                    const isSelected = item.id === activeItem?.id;
                    return (
                      <div
                        key={item.id}
                        className={`omx-mv-thumbnails-rail__item ${isSelected ? 'active' : 'inactive'}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectMedia(item);
                        }}
                        role="button"
                        tabIndex={0}
                        title={item.title || '切换图片'}
                      >
                        {item.type === 'video' ? (
                          <>
                            <video
                              src={item.url ? `${item.url}#t=0.001` : ''}
                              className="omx-mv-thumbnails-rail__img"
                              muted
                              preload="metadata"
                              playsInline
                            />
                            <div className="omx-mv-thumbnails-rail__play-icon" title="视频素材">
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                                <polygon points="6 3 20 12 6 21 6 3" />
                              </svg>
                            </div>
                          </>
                        ) : (
                          <img
                            src={item.url}
                            alt={item.title || '缩略图'}
                            className="omx-mv-thumbnails-rail__img"
                          />
                        )}
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

              <div
                className={`omx-mv-display ${isAnnotating ? 'is-annotating' : ''}`}
                onClick={handleImageClick}
                style={{
                  transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomScale})`,
                  cursor: isDragging ? 'grabbing' : (zoomScale > 1.05 ? 'grab' : 'default'),
                }}
              >
                {activeItem?.type === 'video' ? (
                  <video src={activeItem.url} controls autoPlay playsInline />
                ) : activeItem?.url ? (
                  <img
                    ref={imageRef}
                    src={activeItem?.url}
                    alt={activeItem?.title || '预览'}
                  />
                ) : !state.generationTasks.some((task) => task.sessionId === sessionId) ? (
                  <div className="omx-mv-empty-state">
                    <svg className="omx-mv-empty-state__icon" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
                      <circle cx="9" cy="9" r="2"/>
                      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
                    </svg>
                    <span className="omx-mv-empty-state__text">当前会话暂无生成的图片或视频</span>
                  </div>
                ) : null}

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
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
