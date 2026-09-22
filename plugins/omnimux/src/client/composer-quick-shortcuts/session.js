/**
 * 会话标识派生：快捷方式与附件托盘共用的**唯一实现**。
 *
 * 四条快捷方式渲染在输入框下方（`conversation.input.dock`），链接卡槽与素材导轨
 * 渲染在输入框内侧（`conversation.input.attachments`）——两个插槽、两棵独立的
 * React 树，却共享同一份会话级状态。两侧只要有一侧算出别的会话 id，就会出现
 * 「链接卡槽永不出现」「技能胶囊 ✕ 不回写」「模型钉到不存在的会话」这类错位。
 * 因此派生链收敛到本函数，两侧都调它，绝不各写一份。
 */

/**
 * 按同一条优先级链解析当前会话 id：
 * `session.sessionId` → 插槽透传的 `sessionId` → `session.id` → 宿主当前会话 → `'default'`。
 * 空串、纯空白与非法值一律跳过，绝不返回空会话 id（空 id 会写到谁都认不出的那一行）。
 *
 * @param {{ sessionId?: string, id?: string } | null | undefined} session 会话对象
 * @param {string | null | undefined} sessionId 插槽透传的会话 id
 * @param {string | null | undefined} activeSessionId 宿主当前激活的会话 id
 * @returns {string} 非空会话 id；全部缺失时返回 `'default'`
 */
export function resolveComposerSessionId(session, sessionId, activeSessionId) {
  const sessionObj = session && typeof session === 'object' ? session : null;
  // 空串、纯空白、非字符串的一律跳过：它们当 store 键既认不出也回写不到。
  const candidates = [
    sessionObj && sessionObj.sessionId,
    sessionId,
    sessionObj && sessionObj.id,
    activeSessionId,
  ];
  for (const value of candidates) {
    const text = typeof value === 'string' ? value : value ? String(value) : '';
    if (text.trim()) return text;
  }
  return 'default';
}

export default resolveComposerSessionId;
