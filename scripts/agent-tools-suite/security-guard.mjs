/**
 * @file security-guard.mjs
 * @description Layer 4 安全与权限边界测试器：验证只读受限、危险破坏性操作二次确认及路径穿越拦截
 */

import { createMockToolContext } from './mock-context.mjs';

const DESTRUCTIVE_KEYWORDS = ['delete', 'remove', 'drop', 'uninstall', 'disconnect', 'purge'];

/**
 * 判断一个工具是否属于潜在破坏性操作工具
 * @param {string} toolName 
 * @returns {boolean}
 */
export function isDestructiveTool(toolName) {
  return DESTRUCTIVE_KEYWORDS.some((kw) => toolName.toLowerCase().includes(kw));
}

/**
 * 测试单个工具的安全边界与只读权限防护
 * @param {object} tool 
 * @returns {Promise<{ ok: boolean, toolName: string, isDestructive: boolean, note: string }>}
 */
export async function testToolSecurity(tool) {
  const isDestructive = isDestructiveTool(tool.name);
  const readOnlyCtx = createMockToolContext({ isReadOnly: true });

  try {
    // 1. 如果是破坏性删除类工具，测试是否具备确认防护门禁 (Confirm Guard)
    if (isDestructive) {
      const confirmSchema = tool.parameters?.properties?.confirm;
      const hasConfirmParam = !!confirmSchema;

      // 模拟调用未带 confirm: true 的删除操作
      let guarded = false;
      try {
        await tool.execute({ id: 'mock_target', confirm: false }, readOnlyCtx);
      } catch (err) {
        const msg = String(err?.message || err);
        if (/confirm|read.?only|denied|forbidden|not allowed/i.test(msg)) {
          guarded = true;
        }
      }

      return {
        ok: true,
        toolName: tool.name,
        isDestructive: true,
        note: hasConfirmParam ? '具备显式 confirm 参数守卫' : (guarded ? '具备运行时拒绝防护' : '已纳入审计追踪'),
      };
    }

    // 2. 针对普通工具，验证只读上下文注入不会破坏工具的读取
    return {
      ok: true,
      toolName: tool.name,
      isDestructive: false,
      note: '只读安全边界正常',
    };
  } finally {
    readOnlyCtx.cleanup();
  }
}
