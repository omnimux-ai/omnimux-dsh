/**
 * @file schema-lint.mjs
 * @description Layer 1 契约验证器：对 DSH 工具进行深层 JSON Schema 与元数据合规校验
 */

const VALID_SCHEMA_TYPES = new Set(['string', 'number', 'integer', 'boolean', 'object', 'array', 'null']);

/**
 * 递归验证一个 JSON Schema 片段是否符合规范
 * @param {object} schema 
 * @param {string} path 
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateJsonSchema(schema, path = 'parameters') {
  const errors = [];

  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    return { valid: false, errors: [`${path} 必须是非空对象 (Object)`] };
  }

  // 1. 类型校验
  if (schema.type) {
    if (typeof schema.type === 'string') {
      if (!VALID_SCHEMA_TYPES.has(schema.type)) {
        errors.push(`${path}.type 具有非法类型: "${schema.type}"`);
      }
    } else if (Array.isArray(schema.type)) {
      for (const t of schema.type) {
        if (!VALID_SCHEMA_TYPES.has(t)) {
          errors.push(`${path}.type 联合类型中存在非法类型: "${t}"`);
        }
      }
    } else {
      errors.push(`${path}.type 必须为字符串或字符串数组`);
    }
  }

  // 2. properties 校验
  if (schema.properties !== undefined) {
    if (typeof schema.properties !== 'object' || Array.isArray(schema.properties)) {
      errors.push(`${path}.properties 必须为对象映射 (key -> schema)`);
    } else {
      for (const [propKey, propSchema] of Object.entries(schema.properties)) {
        const sub = validateJsonSchema(propSchema, `${path}.properties.${propKey}`);
        if (!sub.valid) {
          errors.push(...sub.errors);
        }
      }
    }
  }

  // 3. required 完整性校验：所有 required 字段必须在 properties 里定义
  if (schema.required !== undefined) {
    if (!Array.isArray(schema.required)) {
      errors.push(`${path}.required 必须为数组`);
    } else {
      const props = schema.properties || {};
      for (const reqField of schema.required) {
        if (typeof reqField !== 'string') {
          errors.push(`${path}.required 中的项必须为字符串`);
        } else if (!props[reqField]) {
          errors.push(`${path}.required 声明了必填字段 "${reqField}"，但该字段未在 properties 中声明`);
        }
      }
    }
  }

  // 4. items 校验（如果是 array 类型）
  if (schema.type === 'array' && schema.items !== undefined) {
    const itemSub = validateJsonSchema(schema.items, `${path}.items`);
    if (!itemSub.valid) {
      errors.push(...itemSub.errors);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * 校验完整的 DSH Tool 对象契约
 * @param {object} tool 
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateToolContract(tool) {
  const errors = [];

  if (!tool || typeof tool !== 'object') {
    return { valid: false, errors: ['工具必须为对象字面量'] };
  }

  // 1. name 校验
  if (!tool.name || typeof tool.name !== 'string') {
    errors.push('工具必须声明有效的 name 字符串');
  } else {
    if (!/^[a-z0-9_]+$/.test(tool.name)) {
      errors.push(`工具名称 "${tool.name}" 不符合 DSH 命名规范 (仅支持小写字母、数字与下划线)`);
    }
    if (tool.name.length < 2 || tool.name.length > 64) {
      errors.push(`工具名称 "${tool.name}" 长度必须在 2 到 64 字符之间`);
    }
  }

  // 2. description 校验
  if (!tool.description || typeof tool.description !== 'string') {
    errors.push(`工具 "${tool.name || 'unnamed'}" 缺少 description`);
  } else {
    const trimmed = tool.description.trim();
    if (trimmed.length < 8) {
      errors.push(`工具 "${tool.name}" description 太短 (${trimmed.length} 字)，难以引导 Agent 准确识别意图`);
    }
  }

  // 3. parameters JSON Schema 校验
  if (tool.parameters === undefined) {
    errors.push(`工具 "${tool.name}" 必须声明 parameters 对象`);
  } else {
    if (tool.parameters.type !== 'object') {
      errors.push(`工具 "${tool.name}" 的 parameters 根类型必须为 "object"`);
    }
    const schemaCheck = validateJsonSchema(tool.parameters, `${tool.name}.parameters`);
    if (!schemaCheck.valid) {
      errors.push(...schemaCheck.errors);
    }
  }

  // 4. output 契约校验 (DSH output 契约建议声明 schema 和 render 函数)
  if (!tool.output || typeof tool.output !== 'object') {
    errors.push(`工具 "${tool.name}" 缺少 output 契约定义 (必须声明 output { schema, render })`);
  } else {
    if (typeof tool.output.render !== 'function') {
      errors.push(`工具 "${tool.name}" 的 output 缺少 render 渲染函数`);
    }
  }

  // 5. execute 执行体校验
  if (typeof tool.execute !== 'function') {
    errors.push(`工具 "${tool.name}" 必须具备可执行的 execute() 异步函数`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
