#!/usr/bin/env node
/**
 * scripts/generate-model-console.mjs
 *
 * 中枢模型检索面板生成器：把执行中枢已接入的模型与线路分组数据，汇总为一份自包含的单文件可视化页面。
 *
 * 数据真源（全部同源读取，页面不手工抄录任何清单）：
 *   ① 模型契约   plugins/omnimux/src/catalog/specs/*.yaml（契约加载器）
 *   ② 线路分组   plugins/omnimux/src/catalog/serving/channel-groups.js
 *   ③ 上架处置   plugins/omnimux/src/catalog/contract/dispositions.json
 *
 * 视觉遵循 design.md §3.6「Ink & Paper / Structural Monochrome」：黑白中性双主题，无紫色滥用。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const mod = (p) => path.join(rootDir, p);

const { loadAll, DEFAULT_SPECS_DIR } = await import(mod('plugins/omnimux/src/catalog/contract/load.js'));
const { MODEL_CHANNEL_GROUPS } = await import(mod('plugins/omnimux/src/catalog/serving/channel-groups.js'));
const { resolveModelBrand } = await import(mod('plugins/omnimux/src/brand/model-brands.js'));

const index = loadAll(DEFAULT_SPECS_DIR, { useCache: false });
const dispositionsDoc = JSON.parse(
  fs.readFileSync(mod('plugins/omnimux/src/catalog/contract/dispositions.json'), 'utf8'),
);

/** 展示用文案常量（非数据真源）：管理分组 → 中文名。 */
const GROUP_NAMES = {
  text: '文本与对话',
  image: '图像生成',
  video: '视频生成',
  audio: '音频与语音',
  reader: '网页提取',
};

/** 展示用文案常量（非数据真源）：品牌 key → 中文名。 */
const BRAND_NAMES = {
  openai: 'OpenAI', anthropic: 'Anthropic', google: 'Google', deepseek: 'DeepSeek',
  xai: 'xAI', alibaba: '阿里通义', bytedance: '字节跳动', kuaishou: '快手',
  minimax: 'MiniMax', zhipu: '智谱 AI', moonshot: '月之暗面', elevenlabs: 'ElevenLabs',
};

/** 品牌细化归类（与模型契约家族对齐，纯展示用）。 */
function brandOf(model) {
  const id = model.id;
  const key = resolveModelBrand(id) || 'other';
  if (key === 'grok' || id.startsWith('grok-')) return 'xAI (Grok)';
  if (key === 'kling' || id.startsWith('kling-')) return '快手 (Kling)';
  if (key === 'veo' || id.startsWith('veo-')) return 'Google (Veo)';
  if (id.startsWith('wan')) return '阿里通义 (Wan)';
  if (/^nano[-_]?banana/.test(id)) return 'Google (NanoBanana)';
  if (/^(seedance|seedream|seed-|doubao)/.test(id)) return '字节跳动 (Seed)';
  if (/^minimax/.test(id) || id.startsWith('h3-')) return 'MiniMax (海螺)';
  if (id === 'glm-5.3') return '智谱 AI (GLM)';
  if (id === 'kimi-k3') return '月之暗面 (Kimi)';
  if (id === 'jina-reader-v1') return 'Jina AI';
  if (id === 'whisper-1') return 'OpenAI (Whisper)';
  return BRAND_NAMES[key] || key;
}

/** 线路分组 → 展示用精简结构（字段名与真源保持一致，避免二次发明）。 */
function simplifyGroup(group) {
  const constraints = group.constraints || null;
  return {
    id: group.id,
    label: group.label || group.id,
    badge: group.badge || '',
    enabled: group.enabled !== false,
    wireModel: group.wireModel || null,
    wireGroup: group.wireGroup || null,
    pricing: group.pricing
      ? {
        pointsEstimate: group.pricing.pointsEstimate ?? null,
        discountRate: group.pricing.discountRate ?? null,
        billingMode: group.pricing.billingMode || '',
      }
      : null,
    sla: group.sla
      ? { stability24h: group.sla.stability24h ?? null, avgWaitTimeSec: group.sla.avgWaitTimeSec ?? null }
      : null,
    constraints: constraints
      ? {
        operations: constraints.operations || null,
        duration: constraints.parameters?.duration || null,
        resolution: constraints.parameters?.resolution || null,
        aspectRatio: constraints.parameters?.aspectRatio || null,
      }
      : null,
  };
}

const models = [];
for (const m of index.all()) {
  const operations = (m.operations || []).map((op) => ({
    id: op.id,
    label: op.label || op.id,
    listed: !!op.listed,
    inputs: (op.inputs || []).length,
  }));
  const listedCount = operations.filter((op) => op.listed).length;
  const groups = (MODEL_CHANNEL_GROUPS[m.id] || []).map(simplifyGroup);
  models.push({
    id: m.id,
    label: m.label || m.id,
    subtitle: m.subtitle || '',
    badge: m.badge || '',
    family: m.family || '',
    brand: brandOf(m),
    groupKey: m.managementGroup || 'other',
    groupName: GROUP_NAMES[m.managementGroup] || m.managementGroup || '未分类',
    aliases: m.aliases || [],
    operations,
    listedCount,
    operationCount: operations.length,
    ready: listedCount > 0,
    groups,
  });
}

const stats = {
  models: models.length,
  ready: models.filter((m) => m.ready).length,
  notReady: models.filter((m) => !m.ready).length,
  withGroups: models.filter((m) => m.groups.length > 0).length,
  groups: models.reduce((total, m) => total + m.groups.length, 0),
  operations: models.reduce((total, m) => total + m.listedCount, 0),
  dispositions: Array.isArray(dispositionsDoc.dispositions) ? dispositionsDoc.dispositions.length : 0,
  generatedAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
};

const payload = JSON.stringify({ models, stats }).replace(/</g, '\\u003c');

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>中枢模型检索面板</title>
<style>
  :root {
    --bg: #0C0F17;
    --card: #151A26;
    --card-hover: #1A2030;
    --line: rgba(255,255,255,0.08);
    --line-strong: rgba(255,255,255,0.16);
    --text: #E8EAF0;
    --text-dim: #9BA3B4;
    --text-faint: #6B7280;
    --ink: #FFFFFF;
    --ok: #4ADE80;
    --warn: #FBBF24;
    --muted: rgba(255,255,255,0.05);
    --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
    --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: var(--bg); color: var(--text); font-family: var(--sans);
    font-size: 13px; line-height: 18px; -webkit-font-smoothing: antialiased;
    padding: 40px 32px 64px;
  }
  .wrap { max-width: 1180px; margin: 0 auto; }

  header { margin-bottom: 28px; }
  h1 { font-size: 20px; line-height: 28px; font-weight: 600; letter-spacing: -0.01em; }
  .sub { color: var(--text-faint); font-size: 12px; margin-top: 6px; font-family: var(--mono); }

  .stats { display: grid; grid-template-columns: repeat(6, 1fr); gap: 1px; background: var(--line);
    border: 1px solid var(--line); border-radius: 12px; overflow: hidden; margin-bottom: 24px; }
  .stat { background: var(--card); padding: 16px 18px; }
  .stat b { display: block; font-size: 22px; line-height: 28px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .stat span { color: var(--text-faint); font-size: 12px; }
  .stat.accent b { color: var(--ok); }
  .stat.warn b { color: var(--warn); }

  .toolbar { display: flex; gap: 10px; align-items: center; margin-bottom: 16px; flex-wrap: wrap; }
  input[type=search] {
    flex: 1; min-width: 240px; background: var(--muted); border: 1px solid var(--line);
    border-radius: 10px; color: var(--text); padding: 9px 14px; font-size: 13px; font-family: var(--sans);
    outline: none; transition: border-color .15s;
  }
  input[type=search]:focus { border-color: var(--line-strong); }
  input[type=search]::placeholder { color: var(--text-faint); }
  .chips { display: flex; gap: 6px; }
  .chip {
    background: var(--muted); border: 1px solid transparent; color: var(--text-dim);
    border-radius: 8px; padding: 8px 13px; font-size: 12px; cursor: pointer; user-select: none;
    transition: all .15s; font-family: var(--sans);
  }
  .chip:hover { color: var(--text); }
  .chip[aria-pressed=true] { background: var(--ink); color: #0C0F17; font-weight: 500; }

  .list { border: 1px solid var(--line); border-radius: 12px; overflow: hidden; background: var(--card); }
  .row { border-bottom: 1px solid var(--line); }
  .row:last-child { border-bottom: none; }
  .head {
    display: grid; grid-template-columns: 22px 1fr auto auto; gap: 14px; align-items: center;
    padding: 14px 18px; cursor: pointer; transition: background .12s;
  }
  .head:hover { background: var(--card-hover); }
  .caret { color: var(--text-faint); font-size: 10px; transition: transform .15s; }
  .row[data-open=true] .caret { transform: rotate(90deg); }
  .name { font-size: 14px; line-height: 20px; font-weight: 500; }
  .meta { color: var(--text-faint); font-size: 12px; margin-top: 3px; font-family: var(--mono); }
  .tags { display: flex; gap: 6px; align-items: center; }
  .tag { font-size: 11px; padding: 3px 8px; border-radius: 6px; background: var(--muted); color: var(--text-dim); white-space: nowrap; }
  .tag.ok { color: var(--ok); }
  .tag.warn { color: var(--warn); }
  .tag.line { color: var(--text); border: 1px solid var(--line-strong); background: transparent; }

  .detail { display: none; padding: 4px 18px 20px 54px; background: rgba(0,0,0,0.18); }
  .row[data-open=true] .detail { display: block; }
  .sec { margin-top: 16px; }
  .sec h3 { font-size: 12px; font-weight: 600; color: var(--text-dim); margin-bottom: 8px; letter-spacing: .02em; }
  .gcard { border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; margin-bottom: 8px; background: var(--card); }
  .gcard .grow { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; flex-wrap: wrap; }
  .glabel { font-size: 13px; font-weight: 500; }
  .gbadge { color: var(--text-faint); font-size: 12px; }
  .grid2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px 18px; margin-top: 10px; }
  .kv { font-size: 12px; }
  .kv span { color: var(--text-faint); display: block; }
  .kv b { font-weight: 400; font-family: var(--mono); color: var(--text); }
  .ops { display: flex; flex-wrap: wrap; gap: 6px; }
  .op { font-size: 11px; padding: 4px 9px; border-radius: 6px; font-family: var(--mono);
    background: var(--muted); color: var(--text-faint); }
  .op.on { color: var(--text); background: rgba(255,255,255,0.10); }
  .empty { padding: 40px 18px; text-align: center; color: var(--text-faint); }
  footer { margin-top: 28px; color: var(--text-faint); font-size: 12px; font-family: var(--mono); text-align: center; }
  @media (max-width: 900px) {
    body { padding: 24px 16px 48px; }
    .stats { grid-template-columns: repeat(3, 1fr); }
    .head { grid-template-columns: 18px 1fr; }
    .tags { grid-column: 2; }
    .detail { padding-left: 18px; }
  }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>中枢模型检索面板</h1>
    <div class="sub" id="subtitle"></div>
  </header>

  <div class="stats" id="stats"></div>

  <div class="toolbar">
    <input type="search" id="q" placeholder="搜索型号名、标识或品牌…" autocomplete="off">
    <div class="chips" id="chips"></div>
  </div>

  <div class="list" id="list"></div>

  <footer id="footer"></footer>
</div>

<script id="payload" type="application/json">${payload}</script>
<script>
(function () {
  var DATA = JSON.parse(document.getElementById('payload').textContent);
  var MODELS = DATA.models, STATS = DATA.stats;
  var state = { q: '', group: 'all', onlyReady: false, open: {} };

  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  document.getElementById('subtitle').textContent =
    '数据真源：模型契约 YAML + 线路分组表 + 上架处置规则　·　生成于 ' + STATS.generatedAt;
  document.getElementById('footer').textContent =
    '共 ' + STATS.models + ' 款模型　·　' + STATS.groups + ' 条线路分组　·　' + STATS.dispositions + ' 条上架处置规则';

  var statDefs = [
    ['模型总数', STATS.models, ''],
    ['已就绪', STATS.ready, 'accent'],
    ['未就绪', STATS.notReady, STATS.notReady ? 'warn' : ''],
    ['已配线路', STATS.withGroups, ''],
    ['线路分组', STATS.groups, ''],
    ['就绪操作', STATS.operations, '']
  ];
  document.getElementById('stats').innerHTML = statDefs.map(function (d) {
    return '<div class="stat ' + d[2] + '"><b>' + d[1] + '</b><span>' + d[0] + '</span></div>';
  }).join('');

  var groupKeys = ['all'];
  MODELS.forEach(function (m) { if (groupKeys.indexOf(m.groupKey) < 0) groupKeys.push(m.groupKey); });
  var groupLabels = { all: '全部' };
  MODELS.forEach(function (m) { groupLabels[m.groupKey] = m.groupName; });
  var chips = document.getElementById('chips');
  chips.innerHTML = groupKeys.map(function (k) {
    return '<button class="chip" data-group="' + esc(k) + '" aria-pressed="' + (k === 'all') + '">' + esc(groupLabels[k] || k) + '</button>';
  }).join('') + '<button class="chip" data-ready="1" aria-pressed="false">仅看已就绪</button>';

  chips.addEventListener('click', function (e) {
    var btn = e.target.closest('.chip'); if (!btn) return;
    if (btn.dataset.ready) {
      state.onlyReady = !state.onlyReady;
      btn.setAttribute('aria-pressed', String(state.onlyReady));
    } else {
      state.group = btn.dataset.group;
      [].forEach.call(chips.querySelectorAll('.chip[data-group]'), function (c) {
        c.setAttribute('aria-pressed', String(c.dataset.group === state.group));
      });
    }
    render();
  });

  document.getElementById('q').addEventListener('input', function (e) {
    state.q = e.target.value.trim().toLowerCase();
    render();
  });

  function match(m) {
    if (state.group !== 'all' && m.groupKey !== state.group) return false;
    if (state.onlyReady && !m.ready) return false;
    if (!state.q) return true;
    var hay = (m.id + ' ' + m.label + ' ' + m.brand + ' ' + m.family + ' ' + m.aliases.join(' ')).toLowerCase();
    return hay.indexOf(state.q) >= 0;
  }

  function kv(label, value) {
    return '<div class="kv"><span>' + esc(label) + '</span><b>' + esc(value) + '</b></div>';
  }

  function renderGroup(g) {
    var facts = [];
    if (g.wireModel) facts.push(kv('上游型号', g.wireModel));
    if (g.wireGroup) facts.push(kv('上游分组', g.wireGroup));
    if (g.pricing && g.pricing.pointsEstimate != null) facts.push(kv('积分估算', g.pricing.pointsEstimate));
    if (g.pricing && g.pricing.billingMode) facts.push(kv('计费方式', g.pricing.billingMode));
    if (g.pricing && g.pricing.discountRate != null && g.pricing.discountRate !== 1) {
      facts.push(kv('倍率', g.pricing.discountRate));
    }
    if (g.sla && g.sla.stability24h != null) facts.push(kv('24h 稳定性', g.sla.stability24h + '%'));
    if (g.sla && g.sla.avgWaitTimeSec != null) facts.push(kv('平均等待', g.sla.avgWaitTimeSec + 's'));
    if (g.constraints && g.constraints.duration) facts.push(kv('时长契约', JSON.stringify(g.constraints.duration)));
    if (g.constraints && g.constraints.resolution) facts.push(kv('分辨率契约', JSON.stringify(g.constraints.resolution)));
    if (g.constraints && g.constraints.aspectRatio) facts.push(kv('画幅契约', JSON.stringify(g.constraints.aspectRatio)));
    if (g.constraints && g.constraints.operations) facts.push(kv('操作契约', g.constraints.operations.join(' / ')));

    return '<div class="gcard">'
      + '<div class="grow"><span class="glabel">' + esc(g.label) + '</span>'
      + '<span class="gbadge">' + esc(g.badge) + '</span></div>'
      + '<div class="grid2">' + facts.join('') + '</div>'
      + '</div>';
  }

  function renderRow(m) {
    var open = !!state.open[m.id];
    var tags = '<span class="tag">' + esc(m.brand) + '</span>';
    if (m.ready) tags += '<span class="tag ok">已就绪 ' + m.listedCount + '/' + m.operationCount + '</span>';
    else tags += '<span class="tag warn">未就绪</span>';
    if (m.groups.length) tags += '<span class="tag line">' + m.groups.length + ' 条线路</span>';
    else tags += '<span class="tag">无线路</span>';

    var ops = m.operations.map(function (op) {
      return '<span class="op' + (op.listed ? ' on' : '') + '">' + esc(op.label) + '</span>';
    }).join('');

    var detail = '<div class="detail">';
    if (m.aliases.length) {
      detail += '<div class="sec"><h3>兼容标识</h3><div class="ops">'
        + m.aliases.map(function (a) { return '<span class="op">' + esc(a) + '</span>'; }).join('')
        + '</div></div>';
    }
    detail += '<div class="sec"><h3>生成操作（' + m.listedCount + '/' + m.operationCount + ' 已就绪）</h3>'
      + '<div class="ops">' + ops + '</div></div>';
    detail += '<div class="sec"><h3>线路分组（' + m.groups.length + '）</h3>'
      + (m.groups.length ? m.groups.map(renderGroup).join('')
        : '<div class="kv"><span>该模型未配置渠道线路分组，走网关注册候选</span></div>')
      + '</div>';
    detail += '</div>';

    return '<div class="row" data-open="' + open + '" data-id="' + esc(m.id) + '">'
      + '<div class="head">'
      + '<span class="caret">▶</span>'
      + '<div><div class="name">' + esc(m.label) + '</div>'
      + '<div class="meta">' + esc(m.id) + (m.subtitle ? '　·　' + esc(m.subtitle) : '') + '</div></div>'
      + '<div class="tags">' + tags + '</div>'
      + '<div></div>'
      + '</div>' + detail + '</div>';
  }

  function render() {
    var rows = MODELS.filter(match);
    var list = document.getElementById('list');
    if (!rows.length) { list.innerHTML = '<div class="empty">没有匹配的模型</div>'; return; }
    list.innerHTML = rows.map(renderRow).join('');
  }

  document.getElementById('list').addEventListener('click', function (e) {
    var head = e.target.closest('.head'); if (!head) return;
    var row = head.parentElement;
    var id = row.dataset.id;
    state.open[id] = !state.open[id];
    row.dataset.open = String(!!state.open[id]);
  });

  render();
})();
</script>
</body>
</html>
`;

const outPath = mod('docs/tools/model-console.html');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, html, 'utf8');

console.log('模型检索面板生成成功: docs/tools/model-console.html');
console.log(`  模型 ${stats.models} 款（已就绪 ${stats.ready} / 未就绪 ${stats.notReady}）`);
console.log(`  线路分组 ${stats.groups} 条（覆盖 ${stats.withGroups} 款模型）`);
console.log(`  就绪操作 ${stats.operations} 个　·　上架处置规则 ${stats.dispositions} 条`);
