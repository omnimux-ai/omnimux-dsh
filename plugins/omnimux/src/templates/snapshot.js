/**
 * @file snapshot.js
 * Host 专用的版本化模板快照：从发布包内读取 creative-templates.json 原始
 * UTF-8 字节，dataVersion 为原始字节的小写十六进制 SHA-256（相同内容稳定）。
 * items 保持 JSON 原始有序记录，不带 featured 应用，也不做摘要投影。
 * 仅运行在 Node 环境；浏览器侧请走 GET /omnimux/templates/creative。
 */

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const CREATIVE_TEMPLATES_URL = new URL('./creative-templates.json', import.meta.url);

/**
 * 包内模板数据缺失或不可读时抛出；HTTP 路由据此映射 503
 * `templates-unavailable`。
 */
export class TemplatesDataUnavailableError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'TemplatesDataUnavailableError';
    this.code = 'templates-unavailable';
  }
}

/**
 * @returns {{ schemaVersion: 1, dataVersion: string, items: Array<object> }}
 */
export function getCreativeTemplatesSnapshot() {
  let rawBytes;
  try {
    rawBytes = readFileSync(CREATIVE_TEMPLATES_URL);
  } catch (error) {
    throw new TemplatesDataUnavailableError('creative templates data is unavailable', {
      cause: error,
    });
  }
  const dataVersion = createHash('sha256').update(rawBytes).digest('hex');
  return {
    schemaVersion: 1,
    dataVersion,
    items: JSON.parse(rawBytes.toString('utf8')),
  };
}
