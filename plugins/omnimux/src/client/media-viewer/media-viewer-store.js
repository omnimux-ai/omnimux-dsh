/**
 * Media Viewer Store.
 * Manages media items (images & videos), timeline grouping, active selection,
 * view sub-modes (grid timeline vs single detail), and layout modes (3col vs 2col).
 */

export const MEDIA_VIEWER_TAB_ID = 'omnimux:media-viewer';

/**
 * @typedef {Object} MediaItem
 * @property {string} id
 * @property {string} [sessionId]
 * @property {number} timestamp
 * @property {string} url
 * @property {string} [title]
 * @property {'image' | 'video'} type
 * @property {string} [duration]
 * @property {string} [groupId]
 */

/**
 * Format timestamp into standard Chinese date string: e.g. "2026年9月13日 20:29"
 * @param {number} ts
 * @returns {string}
 */
export function formatTimelineDate(ts) {
  const date = new Date(ts);
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${y}年${m}月${d}日 ${hh}:${mm}`;
}

export function createMediaViewerStore(initialState = {}) {
  let state = {
    mediaList: initialState.mediaList || [],
    activeId: initialState.activeId || null,
    subViewMode: initialState.subViewMode || 'single', // 'single' (大图浏览/画布模式) | 'grid' (时间线模式)
    layoutMode: initialState.layoutMode || '3col',   // '3col' (三栏模式) | '2col' (两栏模式)
    zoom: initialState.zoom || 100,                  // 50, 70, 100, 150
    isGenerating: Boolean(initialState.isGenerating),
    generatingTask: initialState.generatingTask || null,
    generationTasks: initialState.generationTasks || [],
    isAnnotating: Boolean(initialState.isAnnotating),  // 是否处于打点评论状态
    annotationsByMediaId: initialState.annotationsByMediaId || {}, // mediaId -> AnnotationItem[]
  };

  const listeners = new Set();
  let composerSessionId = null;

  function notify() {
    for (const listener of listeners) {
      try {
        listener(state);
      } catch (err) {
        console.error('[MediaViewerStore] listener error:', err);
      }
    }
  }

  return {
    getSnapshot() {
      return state;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    addMedia(item) {
      const id = item.id || `media_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const timestamp = item.timestamp || Date.now();
      const newItem = {
        id,
        timestamp,
        type: item.type || 'image',
        url: item.url,
        title: item.title || '',
        duration: item.duration || '',
        groupId: item.groupId || String(timestamp),
        ...item,
      };

      const existingIndex = state.mediaList.findIndex((m) => m.id === id);
      let nextList;
      if (existingIndex >= 0) {
        nextList = [...state.mediaList];
        nextList[existingIndex] = { ...nextList[existingIndex], ...newItem };
      } else {
        nextList = [...state.mediaList, newItem];
      }

      state = {
        ...state,
        mediaList: nextList,
        activeId: state.activeId || id,
      };
      notify();
      return newItem;
    },

    setActiveId(id) {
      if (state.activeId === id) return;
      state = { ...state, activeId: id };
      notify();
    },

    setSubViewMode(mode) {
      if (state.subViewMode === mode) return;
      state = { ...state, subViewMode: mode };
      notify();
    },

    setLayoutMode(mode) {
      if (state.layoutMode === mode) return;
      state = { ...state, layoutMode: mode };
      notify();
    },

    setZoom(zoom) {
      if (state.zoom === zoom) return;
      state = { ...state, zoom };
      notify();
    },

    cycleZoom() {
      const levels = [50, 70, 100, 150];
      let idx = levels.indexOf(state.zoom);
      idx = (idx + 1) % levels.length;
      state = { ...state, zoom: levels[idx] };
      notify();
    },

    /** @param {{ sessionId: string, requestId: string, status: string, media?: MediaItem[] }} task */
    updateGeneration(task) {
      if (!task.sessionId || !task.requestId) return;
      if (task.status === 'success' && !task.media?.some((item) => item.url || item.attachment?.attachmentId || (item.type === 'video' && typeof item.path === 'string' && item.path.length))) return;
      const index = state.generationTasks.findIndex((item) => item.sessionId === task.sessionId && item.requestId === task.requestId);
      const previous = state.generationTasks[index];
      if (previous && ['success', 'failure', 'cancelled', 'unresolved'].includes(previous.status)) return;
      const next = { ...previous, ...task };
      const tasks = [...state.generationTasks];
      if (index < 0) tasks.push(next);
      else tasks[index] = next;
      state = { ...state, generationTasks: tasks };
      notify();
    },

    setGenerating(isGenerating, generatingTask = null) {
      state = {
        ...state,
        isGenerating: Boolean(isGenerating),
        generatingTask,
      };
      notify();
    },

    setAnnotating(enabled) {
      const isAnnotating = Boolean(enabled);
      if (state.isAnnotating === isAnnotating) return;
      state = { ...state, isAnnotating };
      notify();
    },

    getAnnotations(mediaId) {
      if (!mediaId) return [];
      return state.annotationsByMediaId[mediaId] || [];
    },

    addDraftAnnotation(mediaId, { xPercent, yPercent }) {
      if (!mediaId) return null;
      const currentList = state.annotationsByMediaId[mediaId] || [];
      // Clean up any uncommitted drafts first
      const cleanedList = currentList.filter((a) => a.status === 'saved');
      const nextIndex = cleanedList.length + 1;
      const draftItem = {
        id: `ann_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        index: nextIndex,
        xPercent: Math.max(0, Math.min(100, xPercent)),
        yPercent: Math.max(0, Math.min(100, yPercent)),
        text: '',
        status: 'draft',
        createdAt: Date.now(),
      };
      state = {
        ...state,
        annotationsByMediaId: {
          ...state.annotationsByMediaId,
          [mediaId]: [...cleanedList, draftItem],
        },
      };
      notify();
      return draftItem;
    },

    bindComposerSession(sessionId) {
      composerSessionId = sessionId && sessionId !== 'default' ? sessionId : null;
    },

    removeSubmittedComments(sessionId, ids) {
      const remove = new Set(ids);
      const annotationsByMediaId = Object.fromEntries(Object.entries(state.annotationsByMediaId).map(([id, comments]) => [id, comments.filter(comment => comment.sessionId !== sessionId || !remove.has(comment.id))]));
      state = { ...state, annotationsByMediaId };
      notify();
    },

    commitAnnotation(mediaId, annotationId, text) {
      if (!mediaId || !annotationId) return;
      const trimmed = (text || '').trim();
      const currentList = state.annotationsByMediaId[mediaId] || [];
      if (!trimmed) {
        // Empty text: cancel draft
        const filtered = currentList.filter((a) => a.id !== annotationId);
        state = {
          ...state,
          annotationsByMediaId: {
            ...state.annotationsByMediaId,
            [mediaId]: filtered,
          },
        };
        notify();
        return;
      }

      const nextList = currentList.map((a) => {
        if (a.id === annotationId) {
          return { ...a, id: a.status === 'saved' && a.text !== trimmed ? `ann_${crypto.randomUUID()}` : a.id, text: trimmed, status: 'saved', sessionId: a.sessionId || composerSessionId };
        }
        return a;
      });

      state = {
        ...state,
        annotationsByMediaId: {
          ...state.annotationsByMediaId,
          [mediaId]: nextList,
        },
      };
      notify();
    },

    cancelDraftAnnotation(mediaId, annotationId) {
      if (!mediaId) return;
      const currentList = state.annotationsByMediaId[mediaId] || [];
      const filtered = annotationId
        ? currentList.filter((a) => a.id !== annotationId || a.status === 'saved')
        : currentList.filter((a) => a.status === 'saved');
      state = {
        ...state,
        annotationsByMediaId: {
          ...state.annotationsByMediaId,
          [mediaId]: filtered,
        },
      };
      notify();
    },

    removeAnnotation(mediaId, annotationId) {
      if (!mediaId || !annotationId) return;
      const currentList = state.annotationsByMediaId[mediaId] || [];
      const remaining = currentList.filter((a) => a.id !== annotationId);
      // Re-index remaining annotations sequentially (1, 2, 3...)
      const reindexed = remaining.map((a, idx) => ({ ...a, index: idx + 1 }));
      state = {
        ...state,
        annotationsByMediaId: {
          ...state.annotationsByMediaId,
          [mediaId]: reindexed,
        },
      };
      notify();
    },

    clearAnnotations(mediaId) {
      if (!mediaId) return;
      state = {
        ...state,
        annotationsByMediaId: {
          ...state.annotationsByMediaId,
          [mediaId]: [],
        },
      };
      notify();
    },

    /**
     * Generate structured model instruction prompt from saved annotations
     */
    formatAnnotationsPrompt(mediaId) {
      if (!mediaId) return '';
      const list = (state.annotationsByMediaId[mediaId] || []).filter((a) => a.status === 'saved');
      if (list.length === 0) return '';
      const lines = [
        `【图片局部修改指示（共 ${list.length} 处标注）】`,
        `请参考原图并在以下各编号标记所在局部区域执行修改：`,
      ];
      for (const item of list) {
        lines.push(`- 标记 ❶ (编号 ${item.index}) [位置: 相对原图水平 ${item.xPercent.toFixed(1)}%, 垂直 ${item.yPercent.toFixed(1)}%]：用户的修改意见是「${item.text}」`);
      }
      lines.push(`请严格锁定上述标记位置的局部范围进行微调重绘，其他非标记区域与背景保持完全一致。`);
      return lines.join('\n');
    },

    /**
     * Group items into timeline buckets sorted by timestamp ascending.
     * Items in the same group or minute bucket are grouped together for multi-card row rendering.
     */
    getTimelineGroups() {
      const groups = new Map();
      for (const item of state.mediaList) {
        const timeKey = formatTimelineDate(item.timestamp);
        const key = item.groupId ? `${timeKey}#${item.groupId}` : timeKey;
        if (!groups.has(key)) {
          groups.set(key, {
            timeKey,
            timestamp: item.timestamp,
            items: [],
          });
        }
        groups.get(key).items.push(item);
      }

      return Array.from(groups.values()).sort((a, b) => a.timestamp - b.timestamp);
    },
  };
}

let globalMediaStore = null;

export function getGlobalMediaViewerStore() {
  if (!globalMediaStore) {
    globalMediaStore = createMediaViewerStore();
  }
  return globalMediaStore;
}
