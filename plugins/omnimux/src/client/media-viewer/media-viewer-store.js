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
    subViewMode: initialState.subViewMode || 'grid', // 'grid' (时间线模式) | 'single' (大图浏览模式)
    layoutMode: initialState.layoutMode || '3col',   // '3col' (三栏模式) | '2col' (两栏模式)
    zoom: initialState.zoom || 100,                  // 50, 70, 100, 150
    isGenerating: Boolean(initialState.isGenerating),
    generatingTask: initialState.generatingTask || null,
  };

  const listeners = new Set();

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

    setGenerating(isGenerating, generatingTask = null) {
      state = {
        ...state,
        isGenerating: Boolean(isGenerating),
        generatingTask,
      };
      notify();
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
