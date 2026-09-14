import { COMMENT_FILE_PREFIX, MAX_COMMENT_BYTES, parseCommentSnapshot, formatCommentSnapshot } from './comment-snapshot.js';

/** Expand only this step's admitted comment files, never the active canvas or historical messages. */
export function mountCommentInjector(ctx) {
  return ctx.on('agent/pre-step', async ({ agent, messages, signal }, next) => {
    const decision = await next();
    if (!decision || decision.kind === 'reject' || signal?.aborted) return decision;
    const claimed = new Set((messages || []).filter(message => typeof message.id === 'string' && message.role === 'user' && message.source?.kind === 'user').map(message => message.id));
    const output = [];
    for (const message of decision.messages || []) {
      if (!claimed.has(message.id)) { output.push(message); continue; }
      const content = [...message.content];
      for (const part of message.content) {
        const ref = part.type === 'file' ? part.attachment : null;
        if (!ref || typeof ref.name !== 'string' || !ref.name.startsWith(COMMENT_FILE_PREFIX) || !ref.name.endsWith('.json')) continue;
        if (!Number.isSafeInteger(ref.bytes) || ref.bytes < 1 || ref.bytes > MAX_COMMENT_BYTES) throw new Error('评论附件大小无效');
        const attachments = ctx.get?.('attachments') || ctx.attachments;
        if (typeof attachments?.readFileStream !== 'function') throw new Error('当前环境不能读取评论附件');
        const chunks = [];
        let bytes = 0;
        for await (const chunk of attachments.readFileStream(ref, signal)) {
          bytes += chunk.byteLength;
          if (bytes > MAX_COMMENT_BYTES) throw new Error('评论附件超过大小限制');
          chunks.push(chunk);
        }
        if (bytes !== ref.bytes) throw new Error('评论附件长度不一致');
        const data = new Uint8Array(bytes);
        let offset = 0;
        for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
        const snapshot = parseCommentSnapshot(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data)), agent?.session?.id);
        if (!snapshot) throw new Error('评论附件格式或会话不匹配');
        content.push({ type: 'text', text: formatCommentSnapshot(snapshot) });
      }
      output.push({ ...message, content });
    }
    return { ...decision, messages: output };
  }, { prepend: true });
}
