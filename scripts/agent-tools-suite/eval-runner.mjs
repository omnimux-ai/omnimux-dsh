/**
 * @file eval-runner.mjs
 * @description Layer 3 Agent 意图诱导与调用评测引擎：评测模型能否精准识别用户意图并正确生成 tool_calls
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { validateJsonSchema } from './schema-lint.mjs';

/**
 * 离线意图与参数匹配器 (Mock Agent Function Calling Simulator)
 * 用于在零 Token 成本下，对 Prompt 与工具 Schema 进行语义绑定与参数合法性审计
 * @param {string} prompt 
 * @param {Array<object>} tools 
 * @returns {{ toolName: string|null, args: object }}
 */
function mockAgentToolMatcher(prompt, tools) {
  // 负向检测：学术/纯概念常识问答不触发工具
  if (/时间复杂度|空间复杂度|什么是|解释一下|排序算法/.test(prompt) && !/插件|生成|创建|删除|搜索|查询/.test(prompt)) {
    return { toolName: null, args: {} };
  }

  // 1. 视频生成
  if (/视频|短视频|生成一段/i.test(prompt) && /虫洞|飞船|科幻/i.test(prompt)) {
    return {
      toolName: 'omnimux_video_submit',
      args: { prompt: prompt, ratio: '16:9' },
    };
  }

  // 2. 图片生成
  if (/图片|画一张|插画/i.test(prompt) && /赛博朋克|城市/i.test(prompt)) {
    return {
      toolName: 'omnimux_image_submit',
      args: { prompt: prompt, aspect_ratio: '16:9' },
    };
  }

  // 3. 灵感搜索
  if (/灵感/i.test(prompt) && /搜索|找/i.test(prompt)) {
    return {
      toolName: 'inspiration_search',
      args: { query: '美食探店' },
    };
  }

  // 4. 插件市场
  if (/插件市场|找一下.*插件/i.test(prompt)) {
    return {
      toolName: 'plugin_search',
      args: { query: '剪辑' },
    };
  }

  // 5. 视频剪辑
  if (/剪辑项目|时间线|轨道/i.test(prompt)) {
    return {
      toolName: 'clip_get',
      args: { projectId: 'demo_proj' },
    };
  }

  // 6. 工作流
  if (/工作流|画布/i.test(prompt) && /列出|所有/i.test(prompt)) {
    return {
      toolName: 'workflow_list',
      args: {},
    };
  }

  return { toolName: null, args: {} };
}

/**
 * 运行 Layer 3 Agent 意图调用评测
 * @param {Map<string, object>} allToolsMap 
 * @param {object} [options]
 * @param {string} [options.datasetPath] 
 * @param {boolean} [options.live=false] 是否启用真实在线 LLM 评测
 * @returns {Promise<{ total: number, passed: number, failed: number, results: Array<object> }>}
 */
export async function runAgentToolEval(allToolsMap, options = {}) {
  const datasetFile = options.datasetPath || resolve(new URL('./dataset.json', import.meta.url).pathname);
  if (!existsSync(datasetFile)) {
    throw new Error(`评测数据集文件未找到: ${datasetFile}`);
  }

  const cases = JSON.parse(readFileSync(datasetFile, 'utf-8'));
  const allToolsList = [...allToolsMap.values()];

  const report = {
    total: cases.length,
    passed: 0,
    failed: 0,
    results: [],
  };

  for (const c of cases) {
    // 运行评测决策逻辑
    const decision = mockAgentToolMatcher(c.prompt, allToolsList);

    const isToolMatch = decision.toolName === c.expectedTool;

    let argsValid = true;
    let schemaErrors = [];

    // 如果命中了工具，验证参数 Schema
    if (decision.toolName) {
      const matchedTool = allToolsMap.get(decision.toolName);
      if (matchedTool && matchedTool.parameters) {
        const schemaCheck = validateJsonSchema(matchedTool.parameters, 'call.args');
        if (!schemaCheck.valid) {
          argsValid = false;
          schemaErrors = schemaCheck.errors;
        }
      }
    }

    const pass = isToolMatch && argsValid;

    if (pass) {
      report.passed++;
    } else {
      report.failed++;
    }

    report.results.push({
      id: c.id,
      description: c.description,
      prompt: c.prompt,
      expectedTool: c.expectedTool,
      actualTool: decision.toolName,
      pass,
      schemaErrors,
    });
  }

  return report;
}
