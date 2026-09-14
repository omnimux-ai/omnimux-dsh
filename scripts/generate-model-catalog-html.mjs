#!/usr/bin/env node
/**
 * scripts/generate-model-catalog-html.mjs
 * 
 * 动态加载当前仓库真实的模型契约规格与治理配置，生成持久化的、自包含的交互式全景模型面板 HTML。
 * 零静态冗余，随本地契约规格即时映射。
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// 动态导入 Hub 契约加载器与品牌解析器
const { loadAll, DEFAULT_SPECS_DIR } = await import(path.join(rootDir, 'plugins/omnimux/src/catalog/contract/load.js'));
const { resolveModelBrand } = await import(path.join(rootDir, 'plugins/omnimux/src/brand/model-brands.js'));

const index = loadAll(DEFAULT_SPECS_DIR, { useCache: false });
const dispPath = path.join(rootDir, 'plugins/omnimux/src/catalog/contract/dispositions.json');
const dispositionsDoc = JSON.parse(fs.readFileSync(dispPath, 'utf8'));

// 品牌与模态映射
const brandNames = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  deepseek: 'DeepSeek',
  xai: 'xAI (Grok)',
  alibaba: '阿里通义 (Aliyun/Wan)',
  bytedance: '字节跳动 (Doubao/Seed)',
  kuaishou: '快手 (Kling)',
  minimax: 'MiniMax',
  midjourney: 'Midjourney',
  suno: 'Suno',
  jina: 'Jina AI',
  elevenlabs: 'ElevenLabs'
};

const groupNames = {
  text: '文本与对话 (Text)',
  image: '图像生成与编辑 (Image)',
  video: '视频生成与动画 (Video)',
  audio: '音频与语音合成 (Audio)',
  reader: '网页提取与阅读 (Reader)'
};

const models = [];
for (const m of index.all()) {
  let brandKey = resolveModelBrand(m.id) || 'other';
  let brand = brandNames[brandKey] || brandKey;

  // 厂商细化归类
  if (brandKey === 'grok' || m.id.startsWith('grok-')) brand = 'xAI (Grok)';
  else if (brandKey === 'kling' || m.id.startsWith('kling-')) brand = '快手 (Kling)';
  else if (brandKey === 'veo' || m.id.startsWith('veo-')) brand = 'Google (Veo)';
  else if (m.id.startsWith('wan')) brand = '阿里通义 (Wan 万相)';
  else if (m.id.startsWith('nanobanana') || m.id.startsWith('nano_banana')) brand = 'Google (NanoBanana)';
  else if (m.id.startsWith('seedance') || m.id.startsWith('seedream') || m.id.startsWith('seed-') || m.id.startsWith('doubao')) brand = '字节跳动 (Doubao/Seed)';
  else if (m.id.startsWith('minimax') || m.id.startsWith('h3-')) brand = 'MiniMax';
  else if (m.id === 'glm-5.3') brand = '智谱 AI (Zhipu/GLM)';
  else if (m.id === 'kimi-k3') brand = '月之暗面 (Moonshot/Kimi)';
  else if (m.id === 'omni_flash') brand = 'Google (Omni Flash)';
  else if (m.id === 'jina-reader-v1') brand = 'Jina AI';
  else if (m.id === 'whisper-1') brand = 'OpenAI (Whisper)';

  const groupKey = m.managementGroup || 'other';
  const group = groupNames[groupKey] || groupKey;
  const isListed = m.operations && m.operations.some(op => op.listed);

  models.push({
    id: m.id,
    label: m.label,
    family: m.family || '',
    brand,
    groupKey,
    group,
    aliases: m.aliases || [],
    isListed,
    operations: (m.operations || []).map(o => ({
      id: o.id,
      label: o.label || o.id,
      listed: !!o.listed,
      outputType: o.output?.type || '',
      inputs: (o.inputs || []).map(inp => ({
        slot: inp.slot,
        type: inp.type,
        role: inp.role || '',
        required: (inp.min ?? 1) > 0
      }))
    })),
    routing: m.routing || null
  });
}

// 统计
const stats = {
  total: models.length,
  listedCount: models.filter(m => m.isListed).length,
  registeredCount: models.filter(m => !m.isListed).length,
  dispositionsCount: dispositionsDoc.dispositions.length,
  byGroup: {},
  byBrand: {}
};

for (const m of models) {
  stats.byGroup[m.group] = (stats.byGroup[m.group] || 0) + 1;
  stats.byBrand[m.brand] = (stats.byBrand[m.brand] || 0) + 1;
}

// 生成自包含单文件 HTML
const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OmniMux 执行中枢 — 模型能力契约全景看板</title>
  <style>
    :root {
      --bg: #0B0D13;
      --card-bg: #141824;
      --card-border: rgba(255, 255, 255, 0.08);
      --card-hover: #1A2030;
      --text: #F3F4F6;
      --text-muted: #9CA3AF;
      --accent: #3B82F6;
      --accent-light: #60A5FA;
      --green: #10B981;
      --green-bg: rgba(16, 185, 129, 0.12);
      --green-border: rgba(16, 185, 129, 0.3);
      --amber: #F59E0B;
      --amber-bg: rgba(245, 158, 11, 0.12);
      --amber-border: rgba(245, 158, 11, 0.3);
      --purple: #8B5CF6;
      --purple-bg: rgba(139, 92, 246, 0.12);
      --font-sans: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
      --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg);
      color: var(--text);
      font-family: var(--font-sans);
      line-height: 1.5;
      padding: 32px 24px;
      -webkit-font-smoothing: antialiased;
    }

    .container { max-width: 1280px; margin: 0 auto; }
    
    header {
      margin-bottom: 28px;
      border-bottom: 1px solid var(--card-border);
      padding-bottom: 20px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      flex-wrap: wrap;
      gap: 16px;
    }
    .title-area h1 { font-size: 24px; font-weight: 700; letter-spacing: -0.02em; display: flex; align-items: center; gap: 10px; }
    .title-area p { color: var(--text-muted); font-size: 14px; margin-top: 4px; }
    .badge-live {
      background: var(--green-bg);
      color: var(--green);
      border: 1px solid var(--green-border);
      padding: 2px 8px;
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 600;
    }

    .stats-bar {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
      margin-bottom: 24px;
    }
    .stat-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 14px 16px;
    }
    .stat-label { font-size: 12px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
    .stat-value { font-size: 24px; font-weight: 700; font-family: var(--font-mono); }

    .controls-bar {
      display: flex;
      gap: 12px;
      margin-bottom: 24px;
      flex-wrap: wrap;
      align-items: center;
      background: var(--card-bg);
      padding: 12px 16px;
      border-radius: 12px;
      border: 1px solid var(--card-border);
    }
    .search-input {
      flex: 1;
      min-width: 220px;
      background: #0E121B;
      border: 1px solid var(--card-border);
      color: var(--text);
      padding: 8px 14px;
      border-radius: 8px;
      font-size: 14px;
      outline: none;
    }
    .search-input:focus { border-color: var(--accent); }

    .filter-btn {
      background: transparent;
      border: 1px solid var(--card-border);
      color: var(--text-muted);
      padding: 6px 12px;
      border-radius: 8px;
      font-size: 13px;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .filter-btn:hover { background: rgba(255, 255, 255, 0.05); color: var(--text); }
    .filter-btn.active {
      background: var(--accent);
      border-color: var(--accent);
      color: #fff;
      font-weight: 600;
    }

    .group-section { margin-bottom: 36px; }
    .group-header {
      font-size: 16px;
      font-weight: 600;
      color: var(--text);
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
      border-left: 3px solid var(--accent);
      padding-left: 8px;
    }
    .group-count { font-size: 12px; color: var(--text-muted); font-family: var(--font-mono); }

    .models-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
      gap: 16px;
    }
    .model-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 16px;
      transition: transform 0.15s ease, border-color 0.15s ease;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .model-card:hover {
      border-color: rgba(255, 255, 255, 0.2);
      transform: translateY(-2px);
    }
    .model-card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 8px;
      gap: 8px;
    }
    .model-brand { font-size: 12px; font-weight: 600; color: var(--accent-light); }
    .status-pill {
      font-size: 11px;
      padding: 2px 7px;
      border-radius: 9999px;
      font-weight: 600;
      white-space: nowrap;
    }
    .status-pill.ready { background: var(--green-bg); color: var(--green); border: 1px solid var(--green-border); }
    .status-pill.registered { background: var(--amber-bg); color: var(--amber); border: 1px solid var(--amber-border); }

    .model-name { font-size: 16px; font-weight: 600; margin-bottom: 4px; color: var(--text); }
    .model-id-code {
      font-family: var(--font-mono);
      font-size: 12px;
      color: var(--text-muted);
      background: rgba(0,0,0,0.3);
      padding: 2px 6px;
      border-radius: 4px;
      display: inline-block;
      cursor: pointer;
      user-select: all;
    }
    .model-id-code:hover { color: #fff; background: rgba(255,255,255,0.1); }

    .ops-tag-list {
      margin-top: 14px;
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .op-tag {
      font-size: 11px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.08);
      color: #D1D5DB;
      padding: 2px 8px;
      border-radius: 6px;
    }
    .op-tag.listed {
      border-color: rgba(59, 130, 246, 0.3);
      background: rgba(59, 130, 246, 0.1);
      color: #93C5FD;
    }

    .alias-info {
      margin-top: 10px;
      font-size: 11px;
      color: #6B7280;
      font-family: var(--font-mono);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .footer {
      margin-top: 48px;
      padding-top: 20px;
      border-top: 1px solid var(--card-border);
      text-align: center;
      font-size: 12px;
      color: var(--text-muted);
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="title-area">
        <h1>OmniMux 模型中枢全景看板 <span class="badge-live">实时映射</span></h1>
        <p>动态映射代码层真实契约规格与处置规则（零静态缓存，开箱即用）</p>
      </div>
      <div style="font-size: 12px; color: var(--text-muted); font-family: var(--font-mono); text-align: right;">
        生成时间: ${new Date().toLocaleString('zh-CN', { hour12: false })}<br>
        契约指纹: <span style="color:var(--accent-light);">${index.contentFingerprint.slice(0, 10)}</span>
      </div>
    </header>

    <div class="stats-bar">
      <div class="stat-card">
        <div class="stat-label">已接入契约模型</div>
        <div class="stat-value" style="color: var(--text);">${stats.total} <span style="font-size:14px;color:var(--text-muted);font-weight:normal;">款</span></div>
      </div>
      <div class="stat-card">
        <div class="stat-label">已就绪可调用</div>
        <div class="stat-value" style="color: var(--green);">${stats.listedCount} <span style="font-size:14px;color:var(--text-muted);font-weight:normal;">款</span></div>
      </div>
      <div class="stat-card">
        <div class="stat-label">已登记草稿/存根</div>
        <div class="stat-value" style="color: var(--amber);">${stats.registeredCount} <span style="font-size:14px;color:var(--text-muted);font-weight:normal;">款</span></div>
      </div>
      <div class="stat-card">
        <div class="stat-label">治理处置规则</div>
        <div class="stat-value" style="color: var(--purple);">${stats.dispositionsCount} <span style="font-size:14px;color:var(--text-muted);font-weight:normal;">条</span></div>
      </div>
    </div>

    <div class="controls-bar">
      <input type="text" id="searchInput" class="search-input" placeholder="搜索模型名称、模型 ID、所属厂商/品牌...">
      <div style="display:flex;gap:6px;flex-wrap:wrap;" id="filterButtons">
        <button class="filter-btn active" data-filter="all">全部模态</button>
        <button class="filter-btn" data-filter="video">视频生成 (${stats.byGroup[groupNames.video] || 0})</button>
        <button class="filter-btn" data-filter="image">图像生图 (${stats.byGroup[groupNames.image] || 0})</button>
        <button class="filter-btn" data-filter="text">文本对话 (${stats.byGroup[groupNames.text] || 0})</button>
        <button class="filter-btn" data-filter="audio">音频语音 (${stats.byGroup[groupNames.audio] || 0})</button>
        <button class="filter-btn" data-filter="reader">网页抓取 (${stats.byGroup[groupNames.reader] || 0})</button>
      </div>
    </div>

    <div id="modelsContainer"></div>

    <div class="footer">
      OmniMux 模型能力契约系统 · 架构与治理看板 · 自动编译自 <code>plugins/omnimux/src/catalog/specs/*.yaml</code>
    </div>
  </div>

  <script>
    const allModels = ${JSON.stringify(models)};
    const container = document.getElementById('modelsContainer');
    const searchInput = document.getElementById('searchInput');
    const filterButtons = document.querySelectorAll('.filter-btn');

    let currentFilter = 'all';
    let searchQuery = '';

    function render() {
      container.innerHTML = '';

      // 过滤
      const filtered = allModels.filter(m => {
        const matchesFilter = (currentFilter === 'all') || (m.groupKey === currentFilter);
        const q = searchQuery.toLowerCase();
        const matchesSearch = !q || 
          m.id.toLowerCase().includes(q) || 
          m.label.toLowerCase().includes(q) || 
          m.brand.toLowerCase().includes(q) ||
          m.aliases.some(a => a.toLowerCase().includes(q));
        return matchesFilter && matchesSearch;
      });

      if (filtered.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:48px;color:var(--text-muted);">未找到匹配的模型</div>';
        return;
      }

      // 按模态分组
      const groups = {};
      for (const m of filtered) {
        groups[m.group] = groups[m.group] || [];
        groups[m.group].push(m);
      }

      for (const [groupName, groupModels] of Object.entries(groups)) {
        const section = document.createElement('div');
        section.className = 'group-section';

        const header = document.createElement('div');
        header.className = 'group-header';
        header.innerHTML = groupName + ' <span class="group-count">(' + groupModels.length + ')</span>';
        section.appendChild(header);

        const grid = document.createElement('div');
        grid.className = 'models-grid';

        for (const m of groupModels) {
          const card = document.createElement('div');
          card.className = 'model-card';

          const opsHtml = m.operations.map(o => 
            '<span class="op-tag ' + (o.listed ? 'listed' : '') + '">' + o.label + '</span>'
          ).join('');

          const aliasHtml = m.aliases && m.aliases.length > 0 
            ? '<div class="alias-info" title="过渡别名: ' + m.aliases.join(', ') + '">别名: ' + m.aliases.join(', ') + '</div>'
            : '';

          card.innerHTML = 
            '<div>' +
              '<div class="model-card-header">' +
                '<span class="model-brand">' + m.brand + '</span>' +
                '<span class="status-pill ' + (m.isListed ? 'ready' : 'registered') + '">' + 
                  (m.isListed ? '● 已就绪' : '○ 已登记') + 
                '</span>' +
              '</div>' +
              '<div class="model-name">' + m.label + '</div>' +
              '<code class="model-id-code" title="点击复制 ID">' + m.id + '</code>' +
              aliasHtml +
            '</div>' +
            '<div class="ops-tag-list">' + opsHtml + '</div>';

          grid.appendChild(card);
        }

        section.appendChild(grid);
        container.appendChild(section);
      }
    }

    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.trim();
      render();
    });

    filterButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        filterButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.dataset.filter;
        render();
      });
    });

    // 复制 ID 交互
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('model-id-code')) {
        const id = e.target.textContent;
        navigator.clipboard.writeText(id).then(() => {
          const orig = e.target.textContent;
          e.target.textContent = '已复制！';
          e.target.style.color = 'var(--green)';
          setTimeout(() => {
            e.target.textContent = orig;
            e.target.style.color = '';
          }, 1200);
        });
      }
    });

    render();
  </script>
</body>
</html>
`;

const outDir = path.join(rootDir, 'docs/tools');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}
const outPath = path.join(outDir, 'model-catalog.html');
fs.writeFileSync(outPath, html, 'utf8');

console.log('✅ 模型全景面板生成成功: ' + path.relative(rootDir, outPath));
console.log('📊 涵盖模型: ' + stats.total + ' 款 | 就绪: ' + stats.listedCount + ' | 登记: ' + stats.registeredCount);
