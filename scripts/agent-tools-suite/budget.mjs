/**
 * @file budget.mjs
 * @description Layer 5 上下文预算：度量插件工具定义与系统提示词段的体积，
 * 找出疑似重复工具与每轮变化的「易变」提示词段，并按提交基线做棘轮判定（只拦新增）。
 *
 * 规则唯一来源：docs/contracts/dsh-plugin-engineering-practices.md「九、上下文预算与缓存站位」。
 * 口径：字符数（UTF-16 length），不是 token 数。
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export const BUDGET_LIMITS = Object.freeze({
  // 单个新工具定义（name + description + parameters 序列化）字符上限
  toolChars: 2000,
  // 插件工具定义总字符相对基线允许的增长比例
  pluginGrowth: 1.1,
  // 同插件两工具描述的字符二元组 Dice 相似度阈值
  duplicateSimilarity: 0.8,
});

export const BASELINE_VERSION = 1;

/** 工具定义的模型可见部分 */
export function toolDefinitionChars(tool) {
  return JSON.stringify({ name: tool.name, description: tool.description, parameters: tool.parameters }).length;
}

function bigrams(text) {
  const normalized = String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const grams = new Map();
  for (let i = 0; i < normalized.length - 1; i++) {
    const gram = normalized.slice(i, i + 2);
    grams.set(gram, (grams.get(gram) || 0) + 1);
  }
  return grams;
}

/** 字符二元组 Dice 系数，0..1 */
export function descriptionSimilarity(a, b) {
  const ga = bigrams(a);
  const gb = bigrams(b);
  let sizeA = 0;
  let sizeB = 0;
  for (const n of ga.values()) sizeA += n;
  for (const n of gb.values()) sizeB += n;
  if (sizeA === 0 || sizeB === 0) return 0;
  let overlap = 0;
  for (const [gram, n] of ga) overlap += Math.min(n, gb.get(gram) || 0);
  return (2 * overlap) / (sizeA + sizeB);
}

export function duplicateKey(a, b) {
  return [a, b].sort().join('~');
}

/**
 * 在同一插件内找疑似重复工具对（只看有完整定义的动态工具）。
 * @param {Array<object>} tools
 */
export function findDuplicatePairs(tools, threshold = BUDGET_LIMITS.duplicateSimilarity) {
  const byPlugin = new Map();
  for (const tool of tools) {
    if (tool._source === 'static') continue;
    const list = byPlugin.get(tool._plugin) || [];
    list.push(tool);
    byPlugin.set(tool._plugin, list);
  }
  const pairs = [];
  for (const [plugin, list] of byPlugin) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const similarity = descriptionSimilarity(list[i].description, list[j].description);
        if (similarity >= threshold) {
          pairs.push({ plugin, key: duplicateKey(list[i].name, list[j].name), similarity: Math.round(similarity * 100) / 100 });
        }
      }
    }
  }
  return pairs.sort((a, b) => a.key.localeCompare(b.key));
}

// 两次求值使用同一个合成会话上下文，只改变时钟与随机序列：差异只能来自时间或随机数
const SYNTHETIC_ASSEMBLE = Object.freeze({
  agent: { id: 'budget-probe', session: { id: 'budget-probe', header: { id: 'budget-probe' } } },
});

/**
 * 在受控的时钟（Date.now / new Date() / performance.now）与随机序列（Math.random / crypto.randomUUID）下求值一次提示词文本。
 * 读外部状态（文件、网络、全局可变量）的段落无法用此法暴露，属已知局限。
 * @returns {{ text: string, error?: string }}
 */
function renderUnder(text, { now, seed }) {
  if (typeof text !== 'function') return { text: String(text ?? '') };
  const RealDate = Date;
  const realRandom = Math.random;
  const realPerfNow = performance.now.bind(performance);
  const realUUID = globalThis.crypto?.randomUUID?.bind(globalThis.crypto);
  let state = seed;
  const next = () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
  class FixedDate extends RealDate {
    constructor(...args) {
      super(...(args.length === 0 ? [now] : args));
    }
    static now() {
      return now;
    }
  }
  globalThis.Date = FixedDate;
  Math.random = next;
  performance.now = () => now % 1e7;
  if (realUUID) globalThis.crypto.randomUUID = () => `${Math.floor(next() * 1e16).toString(16).padStart(14, '0')}`;
  try {
    return { text: String(text(SYNTHETIC_ASSEMBLE) ?? '') };
  } catch (err) {
    return { text: '', error: String(err?.message || err).split('\n')[0].slice(0, 160) };
  } finally {
    globalThis.Date = RealDate;
    Math.random = realRandom;
    performance.now = realPerfNow;
    if (realUUID) globalThis.crypto.randomUUID = realUUID;
  }
}

/**
 * 度量一条提示词贡献：字符数与是否易变。
 * 只有 section 会因文本变化而原地替换系统消息；context 是宿主设计的缓存安全通道，不判易变。
 * 求值抛错的段落记 renderError，不中断整个套件，也不判易变（无法判定）。
 */
export function measurePrompt(contribution) {
  const first = renderUnder(contribution.text, { now: 1_800_000_000_000, seed: 7 });
  const second = renderUnder(contribution.text, { now: 1_800_000_061_000, seed: 1234567 });
  const renderError = first.error || second.error;
  return {
    plugin: contribution.plugin,
    kind: contribution.kind,
    name: contribution.name,
    chars: first.text.length,
    dynamic: typeof contribution.text === 'function',
    volatile: !renderError && contribution.kind === 'section' && first.text !== second.text,
    ...(renderError ? { renderError } : {}),
  };
}

/**
 * 汇总一次装配的上下文预算报告。
 * @param {{ tools: Map<string, object>, prompts: Array<object>, plugins?: Array<{ name: string, dynamic: boolean }> }} surfaces
 */
export function buildBudgetReport({ tools, prompts, plugins = [] }) {
  const toolList = [...tools.values()];
  const perPlugin = {};
  const ensure = (name) => {
    perPlugin[name] ??= { tools: 0, toolChars: 0, staticTools: 0, promptChars: 0, sections: 0 };
    return perPlugin[name];
  };
  for (const plugin of plugins) ensure(plugin.name).dynamicLoad = plugin.dynamic;

  const toolSizes = [];
  for (const tool of toolList) {
    const row = ensure(tool._plugin);
    row.tools++;
    if (tool._source === 'static') {
      // 静态正则提取的参数被置空，体积不可信：只计数，不进入字符合计与超标判定
      row.staticTools++;
      continue;
    }
    const chars = toolDefinitionChars(tool);
    row.toolChars += chars;
    toolSizes.push({ plugin: tool._plugin, name: tool.name, chars });
  }

  const promptRows = prompts.map(measurePrompt);
  for (const prompt of promptRows) {
    const row = ensure(prompt.plugin);
    row.promptChars += prompt.chars;
    row.sections++;
  }

  const totals = Object.values(perPlugin).reduce(
    (acc, row) => ({
      tools: acc.tools + row.tools,
      toolChars: acc.toolChars + row.toolChars,
      staticTools: acc.staticTools + row.staticTools,
      promptChars: acc.promptChars + row.promptChars,
    }),
    { tools: 0, toolChars: 0, staticTools: 0, promptChars: 0 },
  );

  return {
    unit: 'chars',
    perPlugin,
    totals,
    toolSizes: toolSizes.sort((a, b) => b.chars - a.chars),
    prompts: promptRows,
    duplicates: findDuplicatePairs(toolList),
    volatile: promptRows.filter((p) => p.volatile).map((p) => `${p.plugin}:${p.name}`).sort(),
    // 实际纳入度量的插件（工具字符或提示词段 > 0）与提示词段键，用于发现「门禁自己失灵」的静默缩水
    measuredPlugins: Object.entries(perPlugin)
      .filter(([, row]) => row.toolChars > 0 || row.sections > 0)
      .map(([name]) => name)
      .sort(),
    sectionKeys: promptRows.map((p) => `${p.plugin}:${p.name}`).sort(),
    renderErrors: promptRows.filter((p) => p.renderError).map((p) => ({ key: `${p.plugin}:${p.name}`, error: p.renderError })),
  };
}

/**
 * 棘轮判定：只有相对基线新增的问题才算失败。
 * @param {ReturnType<typeof buildBudgetReport>} report
 * @param {object} baseline
 */
export function evaluateAgainstBaseline(report, baseline, limits = BUDGET_LIMITS) {
  const failures = [];
  const knownTools = new Set(baseline.tools || []);
  const knownDuplicates = new Set(baseline.duplicates || []);
  const knownVolatile = new Set(baseline.volatile || []);
  const pluginBase = baseline.pluginToolChars || {};

  for (const tool of report.toolSizes) {
    if (!knownTools.has(tool.name) && tool.chars > limits.toolChars) {
      failures.push({ kind: 'new-tool-over-budget', subject: tool.name, detail: `${tool.chars} > ${limits.toolChars} chars` });
    }
  }
  for (const [plugin, row] of Object.entries(report.perPlugin)) {
    const base = pluginBase[plugin];
    if (typeof base === 'number' && base > 0 && row.toolChars > base * limits.pluginGrowth) {
      failures.push({
        kind: 'plugin-tool-growth',
        subject: plugin,
        detail: `${row.toolChars} > ${base} × ${limits.pluginGrowth}`,
      });
    }
  }
  for (const pair of report.duplicates) {
    if (!knownDuplicates.has(pair.key)) {
      failures.push({ kind: 'new-duplicate-tools', subject: pair.key, detail: `similarity ${pair.similarity}` });
    }
  }
  for (const key of report.volatile) {
    if (!knownVolatile.has(key)) {
      failures.push({ kind: 'new-volatile-section', subject: key, detail: 'section text changes across turns; use systemPrompt.context' });
    }
  }
  // 门禁失灵防线：基线里度量过的插件或提示词段这次没量到，说明装载失败或缺构建产物，必须失败而不是放行
  const measured = new Set(report.measuredPlugins || []);
  for (const plugin of baseline.measuredPlugins || []) {
    if (!measured.has(plugin)) {
      failures.push({ kind: 'plugin-unmeasured', subject: plugin, detail: 'measured in baseline but missing now (load failure or missing build output)' });
    }
  }
  const sections = new Set(report.sectionKeys || []);
  for (const key of baseline.sectionKeys || []) {
    const [plugin] = key.split(':');
    if (measured.has(plugin) && !sections.has(key)) {
      failures.push({ kind: 'section-unmeasured', subject: key, detail: 'prompt section in baseline no longer captured; update baseline if it was removed on purpose' });
    }
  }
  for (const item of report.renderErrors || []) {
    if (!(baseline.renderErrors || []).includes(item.key)) {
      failures.push({ kind: 'section-render-error', subject: item.key, detail: item.error });
    }
  }
  return failures;
}

export function baselineFromReport(report, reason, date = new Date().toISOString().slice(0, 10)) {
  if (typeof reason !== 'string' || reason.trim().length < 8) {
    throw new Error('写入基线必须提供 --reason，且不少于 8 个字符');
  }
  const pluginToolChars = {};
  for (const [plugin, row] of Object.entries(report.perPlugin)) {
    if (row.toolChars > 0) pluginToolChars[plugin] = row.toolChars;
  }
  return {
    version: BASELINE_VERSION,
    unit: 'chars',
    updated: date,
    reason: reason.trim(),
    pluginToolChars: Object.fromEntries(Object.entries(pluginToolChars).sort(([a], [b]) => a.localeCompare(b))),
    measuredPlugins: report.measuredPlugins,
    sectionKeys: report.sectionKeys,
    renderErrors: report.renderErrors.map((item) => item.key).sort(),
    tools: report.toolSizes.map((t) => t.name).sort(),
    duplicates: report.duplicates.map((d) => d.key),
    volatile: report.volatile,
  };
}

const ARRAY_FIELDS = ['measuredPlugins', 'sectionKeys', 'renderErrors', 'tools', 'duplicates', 'volatile'];

/** 校验基线结构；任何字段缺失或类型不对都视为无效，不静默当作空基线 */
export function validateBaseline(parsed) {
  if (parsed?.version !== BASELINE_VERSION) return `version 必须为 ${BASELINE_VERSION}`;
  if (!parsed.pluginToolChars || typeof parsed.pluginToolChars !== 'object' || Array.isArray(parsed.pluginToolChars)) {
    return 'pluginToolChars 必须为对象';
  }
  for (const field of ARRAY_FIELDS) {
    if (!Array.isArray(parsed[field])) return `${field} 必须为数组`;
  }
  return null;
}

export function readBaseline(path) {
  if (!existsSync(path)) {
    throw new Error(`上下文预算基线不存在: ${path}（首次生成请运行 --budget --write-baseline --reason "<理由>"）`);
  }
  const parsed = JSON.parse(readFileSync(path, 'utf-8'));
  const problem = validateBaseline(parsed);
  if (problem) throw new Error(`上下文预算基线格式无效: ${path}（${problem}）`);
  return parsed;
}

export function writeBaseline(path, baseline) {
  writeFileSync(path, `${JSON.stringify(baseline, null, 2)}\n`);
}
