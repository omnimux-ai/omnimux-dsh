export const COMMENT_FILE_PREFIX = 'omnimux-canvas-comments-';
export const COMMENT_SCHEMA = 'omnimux.canvas-comments.v1';
export const MAX_COMMENT_BYTES = 64 * 1024;

/** Validate untrusted attachment data before projecting it as ordinary user text. */
export function parseCommentSnapshot(value, sessionId) {
  if (!value || value.schema !== COMMENT_SCHEMA || value.sessionId !== sessionId || !Array.isArray(value.media) || !value.media.length) return null;
  for (const media of value.media) {
    if (!media || typeof media !== 'object' || typeof media.id !== 'string' || !media.id || typeof media.title !== 'string' || !Array.isArray(media.comments) || !media.comments.length) return null;
    for (const comment of media.comments) {
      if (!comment || typeof comment !== 'object' || typeof comment.id !== 'string' || !Number.isSafeInteger(comment.index) || comment.index < 1 || typeof comment.text !== 'string' || !comment.text.trim()) return null;
      if (![comment.xPercent, comment.yPercent].every(n => Number.isFinite(n) && n >= 0 && n <= 100)) return null;
    }
  }
  return value;
}

export function formatCommentSnapshot(snapshot) {
  return snapshot.media.map(media => [
    `图片评论：${media.title || media.id}`,
    `图片标识：${media.id}`,
    ...media.comments.map(comment => `编号 ${comment.index} [水平 ${comment.xPercent.toFixed(1)}%, 垂直 ${comment.yPercent.toFixed(1)}%]：${comment.text}`),
  ].join('\n')).join('\n\n');
}
