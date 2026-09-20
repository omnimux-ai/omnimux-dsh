import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..');

let inputJsonPath = join(REPO, 'deliverables', 'omnimux-batch-shoot-run-20260920', 'scripts-12.json');
if (!existsSync(inputJsonPath)) {
  const fallback = '/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/deliverables/omnimux-batch-shoot-run-20260920/scripts-12.json';
  if (existsSync(fallback)) inputJsonPath = fallback;
}
const scriptsData = existsSync(inputJsonPath)
  ? JSON.parse(readFileSync(inputJsonPath, 'utf8'))
  : { product: '护发精油', total: 0, scripts: [] };

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>第一关 · 分镜脚本验收与八维度打分台</title>
  <style>
    :root {
      --bg-base: #111113;
      --bg-surface: #18181b;
      --bg-card: #1f1f23;
      --bg-elevated: #27272b;
      --border-color: rgba(255, 255, 255, 0.08);
      --border-focus: #7961f2;
      --text-primary: #f4f4f5;
      --text-secondary: #a1a1aa;
      --text-muted: #71717a;
      --brand-purple: #7961f2;
      --brand-glow: rgba(121, 97, 242, 0.25);
      --success: #22c55e;
      --success-bg: rgba(34, 197, 94, 0.12);
      --danger: #ef4444;
      --danger-bg: rgba(239, 68, 68, 0.15);
      --warning: #f59e0b;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      background-color: var(--bg-base);
      color: var(--text-primary);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.5;
      height: 100vh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    header {
      background: var(--bg-surface);
      border-bottom: 1px solid var(--border-color);
      padding: 12px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
    }
    .header-left h1 {
      font-size: 16px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .tag {
      font-size: 11px;
      font-weight: 500;
      padding: 2px 8px;
      border-radius: 4px;
      background: rgba(121, 97, 242, 0.15);
      color: #a78bfa;
      border: 1px solid rgba(121, 97, 242, 0.3);
    }
    .header-left p {
      font-size: 12px;
      color: var(--text-muted);
    }
    .header-actions {
      display: flex;
      gap: 10px;
      align-items: center;
    }
    button {
      font-family: inherit;
      cursor: pointer;
      border-radius: 6px;
      padding: 6px 14px;
      font-size: 13px;
      font-weight: 500;
      transition: all 0.15s ease;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .btn-ink {
      background: #ffffff;
      color: #000000;
      border: none;
    }
    .btn-ink:hover {
      background: #e4e4e7;
    }
    .btn-ghost {
      background: var(--bg-elevated);
      color: var(--text-primary);
      border: 1px solid var(--border-color);
    }
    .btn-ghost:hover {
      background: rgba(255, 255, 255, 0.1);
    }
    .metrics-bar {
      background: var(--bg-surface);
      border-bottom: 1px solid var(--border-color);
      padding: 10px 24px;
      display: flex;
      gap: 28px;
      flex-shrink: 0;
    }
    .metric-item {
      display: flex;
      align-items: baseline;
      gap: 8px;
    }
    .metric-label {
      font-size: 12px;
      color: var(--text-muted);
    }
    .metric-val {
      font-size: 18px;
      font-weight: 700;
      color: var(--text-primary);
    }
    .metric-sub {
      font-size: 11px;
      color: var(--text-secondary);
    }
    .main-container {
      display: flex;
      flex: 1;
      overflow: hidden;
    }
    .sidebar {
      width: 340px;
      background: var(--bg-surface);
      border-right: 1px solid var(--border-color);
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
    }
    .sidebar-header {
      padding: 12px 16px;
      border-bottom: 1px solid var(--border-color);
      font-size: 12px;
      color: var(--text-secondary);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .script-list {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .script-card {
      padding: 10px 12px;
      border-radius: 8px;
      background: var(--bg-card);
      border: 1px solid transparent;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .script-card:hover {
      background: var(--bg-elevated);
    }
    .script-card.active {
      background: var(--bg-elevated);
      border-color: var(--border-focus);
      box-shadow: 0 0 0 1px var(--border-focus);
    }
    .card-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 4px;
    }
    .card-index {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-primary);
    }
    .card-fp {
      font-family: monospace;
      font-size: 11px;
      color: #a78bfa;
    }
    .card-badge {
      font-size: 10px;
      padding: 1px 6px;
      border-radius: 4px;
      font-weight: 600;
    }
    .badge-pass {
      background: var(--success-bg);
      color: var(--success);
    }
    .badge-fail {
      background: var(--danger-bg);
      color: var(--danger);
    }
    .badge-pending {
      background: rgba(255, 255, 255, 0.05);
      color: var(--text-muted);
    }
    .card-meta {
      font-size: 11px;
      color: var(--text-secondary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .card-hook {
      font-size: 11px;
      color: var(--text-muted);
      margin-top: 4px;
      line-height: 1.3;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .content-area {
      flex: 1;
      display: flex;
      overflow: hidden;
    }
    .script-detail {
      flex: 1.2;
      border-right: 1px solid var(--border-color);
      overflow-y: auto;
      padding: 20px 24px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .section-title {
      font-size: 13px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-secondary);
      margin-bottom: 8px;
    }
    .detail-hero {
      background: var(--bg-surface);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 16px;
    }
    .detail-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin-bottom: 12px;
    }
    .grid-cell .label {
      font-size: 11px;
      color: var(--text-muted);
    }
    .grid-cell .val {
      font-size: 13px;
      font-weight: 500;
      color: var(--text-primary);
    }
    .hook-quote {
      background: rgba(121, 97, 242, 0.08);
      border-left: 3px solid var(--brand-purple);
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 13px;
      color: #ddd6fe;
      margin-top: 8px;
    }
    .shots-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
      margin-top: 6px;
    }
    .shots-table th {
      background: var(--bg-card);
      color: var(--text-muted);
      text-align: left;
      padding: 8px 10px;
      font-weight: 500;
      border: 1px solid var(--border-color);
    }
    .shots-table td {
      padding: 10px;
      border: 1px solid var(--border-color);
      vertical-align: top;
    }
    .shots-table tr:nth-child(even) {
      background: rgba(255, 255, 255, 0.015);
    }
    .prompt-text {
      color: #93c5fd;
      font-family: monospace;
      font-size: 11px;
      line-height: 1.4;
    }
    .voiceover-text {
      color: #fef08a;
      font-size: 12px;
      margin-bottom: 4px;
    }
    .onscreen-text {
      color: #a7f3d0;
      font-size: 11px;
      background: rgba(16, 185, 129, 0.1);
      display: inline-block;
      padding: 1px 6px;
      border-radius: 3px;
    }
    .grading-panel {
      width: 440px;
      overflow-y: auto;
      padding: 20px 24px;
      background: var(--bg-surface);
      display: flex;
      flex-direction: column;
      gap: 16px;
      flex-shrink: 0;
    }
    .score-summary-card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 14px 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .score-summary-card.pass {
      border-color: rgba(34, 197, 94, 0.4);
      background: rgba(34, 197, 94, 0.05);
    }
    .score-summary-card.veto {
      border-color: rgba(239, 68, 68, 0.4);
      background: rgba(239, 68, 68, 0.08);
    }
    .current-score-num {
      font-size: 28px;
      font-weight: 800;
    }
    .rubric-card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 12px 14px;
    }
    .rubric-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
    }
    .rubric-name {
      font-size: 13px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .rubric-desc {
      font-size: 11px;
      color: var(--text-muted);
      margin-bottom: 8px;
    }
    .scale-buttons {
      display: flex;
      gap: 6px;
    }
    .scale-btn {
      flex: 1;
      padding: 6px 0;
      text-align: center;
      background: var(--bg-elevated);
      color: var(--text-secondary);
      border: 1px solid var(--border-color);
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.1s ease;
    }
    .scale-btn:hover {
      background: rgba(255, 255, 255, 0.1);
      color: var(--text-primary);
    }
    .scale-btn.active {
      background: var(--brand-purple);
      color: #ffffff;
      border-color: var(--brand-purple);
      box-shadow: 0 0 10px var(--brand-glow);
    }
    .veto-box {
      background: rgba(239, 68, 68, 0.08);
      border: 1px solid rgba(239, 68, 68, 0.25);
      border-radius: 8px;
      padding: 12px 14px;
      display: flex;
      align-items: flex-start;
      gap: 10px;
    }
    .veto-box input[type="checkbox"] {
      margin-top: 3px;
      accent-color: var(--danger);
      width: 16px;
      height: 16px;
      cursor: pointer;
    }
    .veto-content {
      font-size: 12px;
    }
    .veto-title {
      font-weight: 600;
      color: #f87171;
    }
    .veto-desc {
      color: #fca5a5;
      font-size: 11px;
    }
  </style>
</head>
<body>
  <header>
    <div class="header-left">
      <h1>
        第一关 · 分镜脚本业务验收打分台
        <span class="tag">PRD §8.2 标准</span>
      </h1>
      <p>电商批量测品工作流 · 12 条配方分镜脚本八维度深度评审（G1–G8）</p>
    </div>
    <div class="header-actions">
      <button class="btn-ghost" onclick="batchPrefill(4)">⚡ 一键预填 4 分</button>
      <button class="btn-ghost" onclick="exportMarkdown()">📄 复制 Markdown 报告</button>
      <button class="btn-ink" onclick="exportJSON()">💾 导出评分 JSON</button>
    </div>
  </header>

  <div class="metrics-bar">
    <div class="metric-item">
      <span class="metric-label">评审样本数</span>
      <span class="metric-val" id="metric-total">12</span>
      <span class="metric-sub">条配方</span>
    </div>
    <div class="metric-item">
      <span class="metric-label">全批次均分</span>
      <span class="metric-val" id="metric-avg">0.0</span>
      <span class="metric-sub">分 (目标 ≥ 3.5)</span>
    </div>
    <div class="metric-item">
      <span class="metric-label">合格通过率</span>
      <span class="metric-val" id="metric-passrate">0%</span>
      <span class="metric-sub" id="metric-passcount">0/12 通过</span>
    </div>
    <div class="metric-item">
      <span class="metric-label">合规否决数</span>
      <span class="metric-val" id="metric-veto" style="color: var(--danger)">0</span>
      <span class="metric-sub">条违规</span>
    </div>
  </div>

  <div class="main-container">
    <aside class="sidebar">
      <div class="sidebar-header">
        <span>脚本候选清单 (12 条)</span>
        <span id="progress-text">已评 0/12</span>
      </div>
      <div class="script-list" id="script-list"></div>
    </aside>

    <main class="content-area">
      <div class="script-detail" id="script-detail"></div>

      <div class="grading-panel">
        <div class="score-summary-card" id="score-summary-card">
          <div>
            <div class="section-title" style="margin-bottom:2px">当前条目评分</div>
            <div style="font-size:12px; color:var(--text-muted)" id="current-verdict">待完成所有维度打分</div>
          </div>
          <div class="current-score-num" id="current-avg-num">--</div>
        </div>

        <div class="veto-box">
          <input type="checkbox" id="veto-checkbox" onchange="toggleVeto(this.checked)">
          <div class="veto-content">
            <div class="veto-title">G7 平台合规（一票否决项）</div>
            <div class="veto-desc">勾选此项判定该脚本含有绝对化用语或疗效虚假承诺，直接否决该条，不计入均分。</div>
          </div>
        </div>

        <div id="rubrics-container" style="display:flex; flex-direction:column; gap:10px;"></div>
      </div>
    </main>
  </div>

  <script>
    const rawData = ${JSON.stringify(scriptsData)};
    const scripts = rawData.scripts || [];

    const RUBRICS = [
      { id: "g1", name: "G1 Hook 强度", desc: "前 3 秒能否拦住划走（5分: 强烈冲突/悬念/数字; 1分: 泛泛开场介绍）" },
      { id: "g2", name: "G2 卖点落地", desc: "卖点是否转成可感知表述（5分: 场景化比对; 1分: 枯燥形容词堆砌）" },
      { id: "g3", name: "G3 手法贴合", desc: "是否切实采用指定手法结构（5分: 镜头节奏清晰可辨; 1分: 仅贴标签）" },
      { id: "g4", name: "G4 口播自然度", desc: "口播语气像不像真人（5分: 自然口语带呼吸感; 1分: 机械说明书腔）" },
      { id: "g5", name: "G5 画面可执行", desc: "visual 能否直接喂生图模型（5分: 英文提示词、主体光影细节丰富; 1分: 抽象中文）" },
      { id: "g6", name: "G6 结构完整", desc: "时长 15-45 秒、4-8 分镜、有起伏、有明确 CTA" },
      { id: "g8", name: "G8 批次差异化", desc: "与本批次其他脚本是否肉眼可辨差异（5分: 视角结构迥异; 1分: 换皮同构）" }
    ];

    let scores = {};
    let currentIndex = 0;

    // localStorage 在沙箱化预览（如侧边栏 iframe）中可能被禁用并抛 SecurityError，
    // 读写必须带兜底：缓存不可用时静默降级为不持久化，绝不能阻断页面初始化。
    const SCORE_CACHE_KEY = "omnimux_batch_scorecard_scores";
    function loadCache() {
      try {
        const raw = localStorage.getItem(SCORE_CACHE_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        return null;
      }
    }
    function saveCache(value) {
      try {
        localStorage.setItem(SCORE_CACHE_KEY, JSON.stringify(value));
      } catch (e) {}
    }

    const cache = loadCache();
    if (cache && typeof cache === "object") {
      scores = cache;
    }
    scripts.forEach(s => {
      if (!scores[s.fingerprint]) {
        scores[s.fingerprint] = { g1: 0, g2: 0, g3: 0, g4: 0, g5: 0, g6: 0, g8: 0, veto: false };
      }
    });

    function saveScores() {
      saveCache(scores);
      updateMetrics();
      renderSidebar();
    }

    function renderSidebar() {
      const list = document.getElementById("script-list");
      list.innerHTML = "";
      let completedCount = 0;

      scripts.forEach((s, idx) => {
        const sc = scores[s.fingerprint] || {};
        const { avg, pass, completed, veto } = evaluateScript(sc);
        if (completed) completedCount++;

        const card = document.createElement("div");
        card.className = "script-card" + (idx === currentIndex ? " active" : "");
        card.onclick = () => selectScript(idx);

        let badgeHtml = '<span class="card-badge badge-pending">待评</span>';
        if (veto) {
          badgeHtml = '<span class="card-badge badge-fail">违规否决</span>';
        } else if (completed) {
          badgeHtml = pass
            ? '<span class="card-badge badge-pass">' + avg.toFixed(1) + '分 通过</span>'
            : '<span class="card-badge badge-fail">' + avg.toFixed(1) + '分 未达标</span>';
        }

        card.innerHTML = 
          '<div class="card-top">' +
            '<span class="card-index">#' + (idx + 1) + ' ' + (s.identity || "") + '</span>' +
            badgeHtml +
          '</div>' +
          '<div class="card-meta">' + s.vertical + ' · ' + s.method + ' · ' + s.hook + '</div>' +
          '<div class="card-hook">' + ((s.script && s.script.hookLine) || "无开场白") + '</div>';
        list.appendChild(card);
      });

      document.getElementById("progress-text").innerText = '已评 ' + completedCount + '/' + scripts.length;
    }

    function evaluateScript(sc) {
      if (sc.veto) return { avg: 0, pass: false, completed: true, veto: true };
      const keys = ["g1", "g2", "g3", "g4", "g5", "g6", "g8"];
      const vals = keys.map(k => sc[k] || 0);
      const isAllFilled = vals.every(v => v > 0);
      if (!isAllFilled) return { avg: 0, pass: false, completed: false, veto: false };
      
      const sum = vals.reduce((a, b) => a + b, 0);
      const avg = sum / vals.length;
      const noItemBelowTwo = vals.every(v => v > 2);
      const pass = (avg >= 3.5) && noItemBelowTwo;
      return { avg, pass, completed: true, veto: false };
    }

    function selectScript(idx) {
      currentIndex = idx;
      renderSidebar();
      renderDetail();
      renderGrading();
    }

    function renderDetail() {
      const s = scripts[currentIndex];
      const detail = document.getElementById("script-detail");
      if (!s) return;

      const sc = s.script || {};
      const shots = sc.shots || [];

      let shotsHtml = "";
      shots.forEach(shot => {
        shotsHtml += 
          '<tr>' +
            '<td style="text-align:center; font-weight:600">' + shot.idx + '</td>' +
            '<td style="text-align:center; color:var(--text-muted)">' + shot.durationSec + 's</td>' +
            '<td><div class="prompt-text">' + escapeHtml(shot.visual || "") + '</div></td>' +
            '<td>' +
              '<div class="voiceover-text">' + escapeHtml(shot.voiceover || "") + '</div>' +
              (shot.onScreenText ? '<span class="onscreen-text">' + escapeHtml(shot.onScreenText) + '</span>' : '') +
            '</td>' +
          '</tr>';
      });

      detail.innerHTML = 
        '<div class="detail-hero">' +
          '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px">' +
            '<h2 style="font-size:15px; font-weight:600">脚本 #' + (currentIndex + 1) + ' · ' + s.identity + '</h2>' +
            '<span class="card-fp">配方指纹: ' + s.fingerprint + '</span>' +
          '</div>' +
          '<div class="detail-grid">' +
            '<div class="grid-cell"><span class="label">垂类品类</span><div class="val">' + s.vertical + '</div></div>' +
            '<div class="grid-cell"><span class="label">广告手法</span><div class="val">' + s.method + '</div></div>' +
            '<div class="grid-cell"><span class="label">前3秒 Hook</span><div class="val">' + s.hook + '</div></div>' +
            '<div class="grid-cell"><span class="label">画面形态</span><div class="val">' + s.format + '</div></div>' +
            '<div class="grid-cell"><span class="label">分镜总数</span><div class="val">' + shots.length + ' 镜</div></div>' +
            '<div class="grid-cell"><span class="label">行动号召 (CTA)</span><div class="val" style="color:#a78bfa">' + escapeHtml(sc.cta || "") + '</div></div>' +
          '</div>' +
          '<div class="hook-quote"><strong>前 3 秒黄金口播：</strong>' + escapeHtml(sc.hookLine || "") + '</div>' +
          '<div style="margin-top:8px; font-size:11px; color:var(--text-muted)"><strong>发布文案：</strong>' + escapeHtml(sc.caption || "") + '</div>' +
        '</div>' +
        '<div>' +
          '<div class="section-title">分镜镜头明细 (' + shots.length + ' 镜)</div>' +
          '<table class="shots-table">' +
            '<thead>' +
              '<tr>' +
                '<th style="width:40px; text-align:center">镜</th>' +
                '<th style="width:50px; text-align:center">时长</th>' +
                '<th>画面视觉提示词 (Visual Prompt)</th>' +
                '<th>口播与花字 (Voiceover & Text)</th>' +
              '</tr>' +
            '</thead>' +
            '<tbody>' + shotsHtml + '</tbody>' +
          '</table>' +
        '</div>';
    }

    function renderGrading() {
      const s = scripts[currentIndex];
      const sc = scores[s.fingerprint] || {};
      const container = document.getElementById("rubrics-container");
      container.innerHTML = "";

      const evalRes = evaluateScript(sc);
      const summaryCard = document.getElementById("score-summary-card");
      const verdict = document.getElementById("current-verdict");
      const avgNum = document.getElementById("current-avg-num");

      summaryCard.className = "score-summary-card" + (evalRes.veto ? " veto" : (evalRes.pass ? " pass" : ""));
      if (evalRes.veto) {
        verdict.innerText = "已判定合规违规（一票否决不通过）";
        verdict.style.color = "var(--danger)";
        avgNum.innerText = "VETO";
        avgNum.style.color = "var(--danger)";
      } else if (evalRes.completed) {
        verdict.innerText = evalRes.pass ? "符合要求，通过第一关验收" : "均分未达3.5或单项≤2分，未达标";
        verdict.style.color = evalRes.pass ? "var(--success)" : "var(--danger)";
        avgNum.innerText = evalRes.avg.toFixed(1);
        avgNum.style.color = evalRes.pass ? "var(--success)" : "var(--text-primary)";
      } else {
        verdict.innerText = "打分未完成";
        verdict.style.color = "var(--text-muted)";
        avgNum.innerText = "--";
        avgNum.style.color = "var(--text-primary)";
      }

      document.getElementById("veto-checkbox").checked = !!sc.veto;

      RUBRICS.forEach(r => {
        const card = document.createElement("div");
        card.className = "rubric-card";
        const val = sc[r.id] || 0;

        let btnsHtml = "";
        for (let i = 1; i <= 5; i++) {
          btnsHtml += '<button class="scale-btn' + (val === i ? " active" : "") + '" onclick="setScore(\\'' + r.id + '\\', ' + i + ')">' + i + '分</button>';
        }

        card.innerHTML = 
          '<div class="rubric-header">' +
            '<span class="rubric-name">' + r.name + '</span>' +
            '<span style="font-size:12px; font-weight:700; color:' + (val > 0 ? "var(--brand-purple)" : "var(--text-muted)") + '">' + (val > 0 ? val + " 分" : "未评") + '</span>' +
          '</div>' +
          '<div class="rubric-desc">' + r.desc + '</div>' +
          '<div class="scale-buttons">' + btnsHtml + '</div>';
        container.appendChild(card);
      });
    }

    function setScore(rubricId, val) {
      const s = scripts[currentIndex];
      scores[s.fingerprint][rubricId] = val;
      saveScores();
      renderGrading();
    }

    function toggleVeto(isVeto) {
      const s = scripts[currentIndex];
      scores[s.fingerprint].veto = isVeto;
      saveScores();
      renderGrading();
    }

    function batchPrefill(defaultScore) {
      scripts.forEach(s => {
        const sc = scores[s.fingerprint];
        RUBRICS.forEach(r => {
          if (!sc[r.id] || sc[r.id] === 0) {
            sc[r.id] = defaultScore;
          }
        });
      });
      saveScores();
      renderGrading();
    }

    function updateMetrics() {
      let totalPassed = 0;
      let totalVeto = 0;
      let sumAvg = 0;
      let completedCount = 0;

      scripts.forEach(s => {
        const sc = scores[s.fingerprint] || {};
        const { avg, pass, completed, veto } = evaluateScript(sc);
        if (veto) totalVeto++;
        if (completed && !veto) {
          sumAvg += avg;
          completedCount++;
        }
        if (pass) totalPassed++;
      });

      const batchAvg = completedCount > 0 ? (sumAvg / completedCount).toFixed(2) : "0.0";
      const passRate = scripts.length > 0 ? Math.round((totalPassed / scripts.length) * 100) : 0;

      document.getElementById("metric-total").innerText = scripts.length;
      document.getElementById("metric-avg").innerText = batchAvg;
      document.getElementById("metric-passrate").innerText = passRate + "%";
      document.getElementById("metric-passcount").innerText = totalPassed + "/" + scripts.length + " 通过";
      document.getElementById("metric-veto").innerText = totalVeto;
    }

    function exportJSON() {
      const payload = {
        evaluatedAt: new Date().toISOString(),
        product: rawData.product,
        seed: rawData.seed,
        total: scripts.length,
        scores: scores
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = 'scorecard-batch-' + (rawData.seed || "run") + '.json';
      a.click();
    }

    function exportMarkdown() {
      let md = "# 第一关 · 分镜脚本八维度验收报告\\n\\n";
      md += '| 评审时间 | ' + new Date().toLocaleString() + ' |\\n';
      md += '| 测试商品 | ' + (rawData.product || "未指定") + ' |\\n';
      md += '| 样本批次 | seed=' + rawData.seed + ' · 12 条 |\\n\\n';
      md += "## 评审明细表\\n\\n";
      md += "| # | 指纹 | 角色 | 手法 | Hook | G1 | G2 | G3 | G4 | G5 | G6 | G8 | 均分 | 结论 |\\n";
      md += "| ---: | :--- | :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |\\n";

      scripts.forEach((s, idx) => {
        const sc = scores[s.fingerprint] || {};
        const { avg, pass, veto } = evaluateScript(sc);
        const verdict = veto ? "**违规否决**" : (pass ? "✅ 通过" : "❌ 不达标");
        md += '| ' + (idx + 1) + ' | \`' + s.fingerprint + '\` | ' + s.identity + ' | ' + s.method + ' | ' + s.hook + ' | ' + (sc.g1||0) + ' | ' + (sc.g2||0) + ' | ' + (sc.g3||0) + ' | ' + (sc.g4||0) + ' | ' + (sc.g5||0) + ' | ' + (sc.g6||0) + ' | ' + (sc.g8||0) + ' | ' + (veto ? "--" : avg.toFixed(1)) + ' | ' + verdict + ' |\\n';
      });

      navigator.clipboard.writeText(md).then(() => {
        alert("Markdown 报告已成功复制到剪贴板！");
      }).catch(err => {
        prompt("请手动复制 Markdown 报告：", md);
      });
    }

    function escapeHtml(str) {
      if (!str) return "";
      return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    selectScript(0);
    updateMetrics();
  </script>
</body>
</html>`;

const outPath1 = join(REPO, 'scripts', 'workflows', 'evaluation', 'scorecard.html');
const outPath2 = join(REPO, 'deliverables', 'omnimux-batch-shoot-run-20260920', 'scorecard.html');

mkdirSync(dirname(outPath1), { recursive: true });
mkdirSync(dirname(outPath2), { recursive: true });

writeFileSync(outPath1, html, 'utf8');
writeFileSync(outPath2, html, 'utf8');
console.log('Scorecard generated successfully at:');
console.log(' - ' + outPath1);
console.log(' - ' + outPath2);
