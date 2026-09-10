/**
 * @file mock-context.mjs
 * @description 构造符合 DSH 规范的隔离测试上下文 (Mock ToolRunContext / Plugin Context)
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * 创建隔离的测试上下文
 * @param {object} [options]
 * @param {boolean} [options.isReadOnly=false] 是否为只读沙箱模式
 * @param {string} [options.sessionId='test-session-mock'] 会话 ID
 * @returns {object}
 */
export function createMockToolContext(options = {}) {
  const isReadOnly = options.isReadOnly ?? false;
  const sessionId = options.sessionId ?? `session-${Date.now()}`;
  const tempDir = mkdtempSync(join(tmpdir(), 'dsh-tool-test-'));

  const logs = [];
  const registeredTools = new Map();

  const ctx = {
    sessionId,
    workspaceDir: tempDir,
    isReadOnly,
    logs,
    tools: {
      register(tool) {
        if (!tool || !tool.name) return;
        registeredTools.set(tool.name, tool);
      },
      get(name) {
        return registeredTools.get(name);
      },
      has(name) {
        return registeredTools.has(name);
      },
      list() {
        return [...registeredTools.values()];
      },
    },
    systemPrompt: {
      section: () => () => {},
    },
    logger: {
      info: (...args) => logs.push({ level: 'info', args }),
      warn: (...args) => logs.push({ level: 'warn', args }),
      error: (...args) => logs.push({ level: 'error', args }),
    },
    // DSH ToolRunContext 标准契约接口
    signal: {
      aborted: false,
      throwIfAborted() {},
    },
    agent: {
      session: {
        id: sessionId,
      },
      workspace: {
        dir: tempDir,
        readOnly: isReadOnly,
      },
    },
    cleanup() {
      try {
        rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    },
  };

  return ctx;
}
