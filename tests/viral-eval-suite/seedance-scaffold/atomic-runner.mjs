/**
 * 原子模型调用工具 (Atomic Model Runner)
 * 严格按照场景路由模型渠道，经真实连通性探针检验：
 * 1. 文本生成类 ➔ CPA 网关 'claude-opus-4-6-thinking' (Claude 4.6 Opus)
 * 2. 多模态/非文本 ➔ CPA 网关 'gemini-3.8-flash-high' (Gemini 3.8 Flash)
 * 3. 代理中枢 ➔ DeepSeek 官方直连 'deepseek-chat'
 */

import http from 'http';
import https from 'https';
import fs from 'fs';
import yaml from 'yaml';

// 读取本地已配置凭据
const credsRaw = fs.readFileSync('/Users/x/.dsh/.credentials.yaml', 'utf-8');
const creds = yaml.parse(credsRaw)?.refs || {};

const ENDPOINTS = {
  cpa: {
    url: 'http://127.0.0.1:8317/v1/chat/completions',
    key: creds.CPA_API_KEY,
  },
  deepseek: {
    url: 'https://api.deepseek.com/chat/completions',
    key: creds.DEEPSEEK_API_KEY,
  },
};

/**
 * 原子调用函数
 * @param {Object} options
 * @param {'claude-opus-4-6-thinking' | 'gemini-3.8-flash-high' | 'deepseek-chat'} options.modelId
 * @param {string} options.systemPrompt
 * @param {string} options.userPrompt
 * @param {'none' | 'low' | 'medium' | 'high'} [options.thinkingLevel='none']
 * @param {number} [options.temperature=0.7]
 */
export async function runAtomicModel(options) {
  const {
    modelId,
    systemPrompt,
    userPrompt,
    thinkingLevel = 'none',
    temperature = 0.7,
  } = options;

  const isDeepSeek = modelId === 'deepseek-chat';
  const target = isDeepSeek ? ENDPOINTS.deepseek : ENDPOINTS.cpa;

  if (!target.key && !isDeepSeek) {
    throw new Error(`[AtomicRunner] 缺失目标渠道凭据`);
  }

  const payload = {
    model: modelId,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature,
  };

  const payloadStr = JSON.stringify(payload);
  const parsedUrl = new URL(target.url);
  const transport = parsedUrl.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const req = transport.request(
      target.url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${target.key}`,
          'Content-Length': Buffer.byteLength(payloadStr),
        },
        timeout: 30000,
      },
      (res) => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const data = JSON.parse(body);
              const content = data.choices?.[0]?.message?.content || '';
              resolve({
                modelId,
                content,
                usage: data.usage,
              });
            } catch (err) {
              reject(new Error(`[AtomicRunner] JSON解析失败: ${body}`));
            }
          } else {
            reject(new Error(`[AtomicRunner] HTTP ${res.statusCode}: ${body}`));
          }
        });
      }
    );

    req.on('error', reject);
    req.write(payloadStr);
    req.end();
  });
}
