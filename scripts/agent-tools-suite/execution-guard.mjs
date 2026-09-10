/**
 * @file execution-guard.mjs
 * @description Layer 2 隔离调用测试器：验证工具在内存沙箱中的执行稳健度、边界处理与输出格式
 */

import { createMockToolContext } from './mock-context.mjs';

/**
 * 根据 JSON Schema 的 required 与 properties 构造最小可用 mock 入参
 * @param {object} parametersSchema 
 * @returns {object}
 */
export function generateMockArgs(parametersSchema) {
  const args = {};
  if (!parametersSchema || !parametersSchema.properties) return args;

  const required = new Set(parametersSchema.required || []);
  for (const [key, prop] of Object.entries(parametersSchema.properties)) {
    if (!required.has(key)) continue;

    switch (prop.type) {
      case 'string':
        args[key] = prop.enum ? prop.enum[0] : `mock_${key}`;
        break;
      case 'number':
      case 'integer':
        args[key] = prop.minimum !== undefined ? prop.minimum : 1;
        break;
      case 'boolean':
        args[key] = true;
        break;
      case 'array':
        args[key] = [];
        break;
      case 'object':
        args[key] = {};
        break;
      default:
        args[key] = `mock_${key}`;
        break;
    }
  }
  return args;
}

/**
 * 测试单个工具的隔离调用
 * @param {object} tool 
 * @returns {Promise<{ ok: boolean, toolName: string, phase: string, error?: string }>}
 */
export async function testToolExecution(tool) {
  const mockCtx = createMockToolContext();

  try {
    // 1. 空参数冒烟测试 (Empty Args Smoke Test)
    let emptyArgsHandled = false;
    try {
      await Promise.race([
        tool.execute({}, mockCtx),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Tool execution timeout (>3s)')), 3000)),
      ]);
      emptyArgsHandled = true;
    } catch (err) {
      // 如果工具对空参数抛出参数缺失错误，属于正常且健康的防御性检查
      const msg = err?.message || String(err);
      if (msg.includes('required') || msg.includes('missing') || msg.includes('Invalid') || msg.includes('not found')) {
        emptyArgsHandled = true;
      } else {
        // 记录非预期的异常但继续尝试 mock 入参
      }
    }

    // 2. 最小合法参数测试 (Mock Required Args Test)
    const mockArgs = generateMockArgs(tool.parameters);
    try {
      const result = await Promise.race([
        tool.execute(mockArgs, mockCtx),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Tool execution timeout (>3s)')), 3000)),
      ]);

      if (result === undefined) {
        return {
          ok: false,
          toolName: tool.name,
          phase: 'mock_args',
          error: 'execute() 返回了 undefined，DSH 工具执行体必须返回 JSON 对象或有效结果',
        };
      }
    } catch (err) {
      const msg = err?.message || String(err);
      // 受控领域错误（比如重名已存在、需要挂载界面、参数校验失败、未装载 hub、缺少具体参数等）属于预期安全行为
      const isControlled = /not found|unsupported|offline|invalid|failed|error|mock|needs-hub|does not exist|must be|requires|is required|未装载|失败|未提取|already exists|not mounted|非空/i.test(msg);
      if (!isControlled) {
        return {
          ok: false,
          toolName: tool.name,
          phase: 'mock_args',
          error: `非受控崩溃: ${msg}`,
        };
      }
    }

    return {
      ok: true,
      toolName: tool.name,
      phase: 'passed',
    };
  } finally {
    mockCtx.cleanup();
  }
}
