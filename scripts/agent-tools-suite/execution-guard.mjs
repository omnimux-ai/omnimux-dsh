/**
 * @file execution-guard.mjs
 * @description Layer 2 隔离调用测试器：验证工具在内存沙箱中的执行稳健度、边界处理与输出格式
 */

import { createMockToolContext } from './mock-context.mjs';

/**
 * 递归深度扫描值中是否含有 undefined 或数组稀疏空洞 (Non-lossless JSON)
 * @param {unknown} value
 * @param {string} path
 * @param {Set<unknown>} seen
 * @returns {string[]} 违背无损 JSON 的属性路径列表
 */
export function findUndefinedPaths(value, path = '$', seen = new Set()) {
  const violations = [];
  if (value === undefined) {
    violations.push(path);
    return violations;
  }
  if (value === null || typeof value !== 'object') {
    return violations;
  }
  if (seen.has(value)) {
    return violations;
  }
  seen.add(value);
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      if (!Object.prototype.hasOwnProperty.call(value, i)) {
        violations.push(`${path}[${i}] (hole)`);
      } else {
        violations.push(...findUndefinedPaths(value[i], `${path}[${i}]`, seen));
      }
    }
    return violations;
  }
  for (const key of Object.keys(value)) {
    if (value[key] === undefined) {
      violations.push(`${path}.${key}`);
    } else {
      violations.push(...findUndefinedPaths(value[key], `${path}.${key}`, seen));
    }
  }
  return violations;
}

/**
 * 检查错误消息是否反映了“已提供的必填参数仍被报缺失”的签名/读取错位问题
 * @param {string} errorText
 * @param {string[]} requiredKeys
 * @param {Record<string, unknown>} providedArgs
 * @returns {string | null} 命中的被误判缺失的参数名
 */
export function detectFalseMissingRequiredParam(errorText, requiredKeys, providedArgs) {
  if (!errorText || typeof errorText !== 'string') return null;
  for (const reqKey of requiredKeys) {
    if (providedArgs[reqKey] !== undefined) {
      const pattern = new RegExp(`(missing|required).*\\b${reqKey}\\b|缺少.*${reqKey}|${reqKey}.*未提供`, 'i');
      if (pattern.test(errorText)) {
        return reqKey;
      }
    }
  }
  return null;
}

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
      const emptyResult = await Promise.race([
        tool.execute({}, mockCtx),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Tool execution timeout (>3s)')), 3000)),
      ]);
      emptyArgsHandled = true;

      // 空参执行成功时，强制校验无损 JSON
      if (emptyResult !== undefined) {
        const undefPaths = findUndefinedPaths(emptyResult);
        if (undefPaths.length > 0) {
          return {
            ok: false,
            toolName: tool.name,
            phase: 'lossless_json_empty_args',
            error: `空参数 execute({}) 返回值不符合 DSH 无损 JSON (lossless JSON) 规范：检测到属性值为 undefined -> ${undefPaths.slice(0, 3).join(', ')}`,
          };
        }
      }
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
    const requiredKeys = tool.parameters?.required || [];
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

      // 深度校验返回值是否符合 DSH 无损 JSON 规范 (严禁包含 undefined 或数组空洞)
      const undefPaths = findUndefinedPaths(result);
      if (undefPaths.length > 0) {
        return {
          ok: false,
          toolName: tool.name,
          phase: 'lossless_json',
          error: `execute(mockArgs) 返回值不符合 DSH 无损 JSON (lossless JSON) 规范：检测到属性值为 undefined -> ${undefPaths.slice(0, 3).join(', ')}`,
        };
      }

      // 必填参数消费校验：若返回了包含参数缺失的错误对象，但该参数实际上已在 mockArgs 中提供
      if (result && typeof result === 'object' && result.ok === false && typeof result.error === 'string') {
        const falseMissing = detectFalseMissingRequiredParam(result.error, requiredKeys, mockArgs);
        if (falseMissing) {
          return {
            ok: false,
            toolName: tool.name,
            phase: 'argument_consumption',
            error: `execute() 返回参数缺失错误 "${result.error}"，但该必填参数 "${falseMissing}" 已在 mockArgs 中提供！表明工具实现未从首参读取 args`,
          };
        }
      }
    } catch (err) {
      const msg = err?.message || String(err);

      // 若抛出参数缺失异常，但该参数实际上已在 mockArgs 中提供
      const falseMissing = detectFalseMissingRequiredParam(msg, requiredKeys, mockArgs);
      if (falseMissing) {
        return {
          ok: false,
          toolName: tool.name,
          phase: 'argument_consumption',
          error: `execute() 抛出参数缺失异常 "${msg}"，但该必填参数 "${falseMissing}" 已在 mockArgs 中提供！表明工具实现未从首参读取 args`,
        };
      }

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
