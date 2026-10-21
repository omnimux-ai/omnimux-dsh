/**
 * Pure projection of the media list into Flow-style generation history.
 *
 * Each generation is one or more media items (batch results share `groupId`).
 * The submitted prompt snapshot lives on `request.prompt`; nothing here mutates
 * the store or touches storage, so the view can be rebuilt cheaply on every
 * snapshot change.
 */

/**
 * Prompt snapshot of one media item. `request.prompt` is the submitted value and
 * never changes when the composer draft changes afterwards.
 * @param {object} [item]
 * @returns {string}
 */
export function promptSnapshotOf(item) {
  const submitted = item?.request?.prompt;
  if (typeof submitted === 'string' && submitted.trim()) return submitted;
  return typeof item?.prompt === 'string' ? item.prompt.trim() : '';
}

/**
 * Aggregate status of one history entry.
 * @param {{ items?: object[] }} [entry]
 * @returns {'generating' | 'completed' | 'failed'}
 */
export function entryStatus(entry) {
  const items = Array.isArray(entry?.items) ? entry.items : [];
  if (items.some((item) => item?.status === 'generating')) return 'generating';
  if (items.some((item) => item?.status === 'completed')) return 'completed';
  return 'failed';
}

/**
 * The item a history card represents: the newest completed result, then a
 * generating placeholder, then the newest item (typically a failure).
 * @param {{ items?: object[] }} [entry]
 * @returns {object | null}
 */
export function pickEntryPrimaryItem(entry) {
  const items = Array.isArray(entry?.items) ? entry.items : [];
  return items.find((item) => item?.status === 'completed' && item.url)
    || items.find((item) => item?.status === 'generating')
    || items[0]
    || null;
}

/**
 * Local HH:MM for history cards. Full date stays in the card title.
 * @param {number} ts
 * @returns {string}
 */
export function formatHistoryTime(ts) {
  const value = Number(ts);
  if (!Number.isFinite(value) || value <= 0) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * Build history entries for one session.
 *
 * Items are grouped by `groupId || id`, sorted newest-first, and the entry keeps
 * the submitted prompt snapshot. A nullish sessionId keeps every item, matching
 * the tab's existing "no session yet" behaviour.
 * @param {object[]} [mediaList]
 * @param {string | null} [sessionId]
 * @returns {Array<{ id: string, groupId: string, items: object[], primary: object | null, prompt: string, status: 'generating' | 'completed' | 'failed', timestamp: number, kind: 'image' | 'video', count: number, hasDownload: boolean }>}
 */
export function buildHistoryEntries(mediaList = [], sessionId = null) {
  const list = (Array.isArray(mediaList) ? mediaList : []).filter((item) => (
    item && item.id && (!sessionId || item.sessionId === sessionId)
  ));

  const groups = new Map();
  for (const item of list) {
    const groupId = String(item.groupId || item.id);
    if (!groups.has(groupId)) groups.set(groupId, []);
    groups.get(groupId).push(item);
  }

  const entries = [];
  for (const [groupId, items] of groups) {
    items.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
    const entry = { id: groupId, groupId, items };
    const primary = pickEntryPrimaryItem(entry);
    const status = entryStatus(entry);
    const prompt = promptSnapshotOf(primary)
      || items.map(promptSnapshotOf).find((value) => value)
      || '';
    const timestamp = items.reduce((max, item) => Math.max(max, item.timestamp ?? 0), 0);
    const completedCount = items.filter((item) => item.status === 'completed').length;
    const failedCount = items.filter((item) => item.status === 'failed').length;
    entries.push({
      id: groupId,
      groupId,
      items,
      primary,
      prompt,
      status,
      timestamp,
      kind: primary?.type === 'video' ? 'video' : 'image',
      count: items.length,
      completedCount,
      failedCount,
      hasDownload: Boolean(primary?.url),
    });
  }

  entries.sort((a, b) => (b.timestamp - a.timestamp) || a.id.localeCompare(b.id));
  return entries;
}
