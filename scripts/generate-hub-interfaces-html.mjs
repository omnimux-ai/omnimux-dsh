#!/usr/bin/env node
/**
 * scripts/generate-hub-interfaces-html.mjs
 *
 * 执行中枢接口全景面板生成器：动态汇总执行中枢接入的四类接口并产出持久化、自包含的单文件页面。
 *
 *   ① 模型能力接口   plugins/omnimux/src/catalog/specs/*.yaml（契约加载器 + 品牌解析器）+ dispositions.json
 *   ② 智能体工具接口 node scripts/verify-plugin-agent-tools.mjs 的静态扫描输出（治理门禁同源）
 *   ③ 账号接入平台   plugins/omnimux-accounts/src/client/platforms.js（注册表）+ accounts/publish 文案真源
 *   ④ 发布通道       plugins/omnimux-publish/src/config.js / account-policy.js / submit-media.js
 *                    + plugins/omnimux/src/official/provider.js（hub 社交 provider 门禁）
 *
 * 全部标识均取自上述源码真源，页面不维护任何手工抄录的接口清单；脚本仅内置分档与展示文案常量。
 * 视觉遵循 design.md §3.6「Ink & Paper / Structural Monochrome」：黑白中性双主题、无紫色、无品牌亮蓝滥用。
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const rel = (p) => path.relative(rootDir, p).split(path.sep).join('/');
const mod = (p) => path.join(rootDir, p);

// ════════════════════════════════════════════════════════════════════════
// ① 模型能力接口
// ════════════════════════════════════════════════════════════════════════

const { loadAll, DEFAULT_SPECS_DIR } = await import(mod('plugins/omnimux/src/catalog/contract/load.js'));
const { resolveModelBrand } = await import(mod('plugins/omnimux/src/brand/model-brands.js'));

const index = loadAll(DEFAULT_SPECS_DIR, { useCache: false });
const dispositionsPath = mod('plugins/omnimux/src/catalog/contract/dispositions.json');
const dispositionsDoc = JSON.parse(fs.readFileSync(dispositionsPath, 'utf8'));
const MODEL_SPECS_SOURCE = rel(DEFAULT_SPECS_DIR) + '/*.yaml';

/** 展示用文案常量（非数据真源）：品牌 key → 中文名。 */
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

/** 展示用文案常量（非数据真源）：管理分组 key → 中文名。 */
const groupNames = {
  text: '文本与对话 (Text)',
  image: '图像生成与编辑 (Image)',
  video: '视频生成与动画 (Video)',
  audio: '音频与语音合成 (Audio)',
  reader: '网页提取与阅读 (Reader)'
};

/** @type {Array<Record<string, unknown>>} */
const models = [];
for (const m of index.all()) {
  const brandKey = resolveModelBrand(m.id) || 'other';
  let brand = brandNames[brandKey] || brandKey;

  // 厂商细化归类（与模型契约家族对齐）
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
  const listedOperations = (m.operations || []).filter((op) => op.listed);

  models.push({
    id: m.id,
    label: m.label,
    family: m.family || '',
    brand,
    groupKey,
    group: groupNames[groupKey] || groupKey,
    aliases: m.aliases || [],
    listed: listedOperations.length > 0,
    listedOperationCount: listedOperations.length,
    operationCount: (m.operations || []).length,
    operations: (m.operations || []).map((op) => ({ id: op.id, label: op.label || op.id, listed: !!op.listed }))
  });
}

const modelStats = {
  total: models.length,
  listed: models.filter((m) => m.listed).length,
  draft: models.filter((m) => !m.listed).length,
  dispositions: Array.isArray(dispositionsDoc.dispositions) ? dispositionsDoc.dispositions.length : 0
};

// ════════════════════════════════════════════════════════════════════════
// ② 智能体工具接口（治理门禁同源：静态扫描 stdout）
// ════════════════════════════════════════════════════════════════════════

const AGENT_TOOLS_SCANNER = 'scripts/verify-plugin-agent-tools.mjs';
const stripAnsi = (text) => text.replace(/\u001b\[[0-9;]*m/g, '');

const scanRun = spawnSync(process.execPath, [AGENT_TOOLS_SCANNER], {
  cwd: rootDir,
  encoding: 'utf8',
  maxBuffer: 32 * 1024 * 1024,
  env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' }
});
if (scanRun.error) throw scanRun.error;
const scanOut = stripAnsi(`${scanRun.stdout || ''}\n${scanRun.stderr || ''}`);
if (!scanOut.includes('代码已实装工具')) {
  throw new Error(`${AGENT_TOOLS_SCANNER} 未输出「代码已实装工具」扫描结果，无法汇总智能体工具接口（退出码 ${scanRun.status}）`);
}

/** 扫描输出逐插件打印：`📦 [plugin]` 分组头 + `ℹ 代码已实装工具 (N 个): a, b, c`。 */
const toolPlugins = [];
{
  let current = null;
  for (const line of scanOut.split('\n')) {
    const trimmed = line.trim();
    const header = trimmed.match(/^📦\s*\[(.+?)\]\s*$/);
    if (header) {
      current = { plugin: header[1].trim(), tools: [] };
      toolPlugins.push(current);
      continue;
    }
    const tools = trimmed.match(/^ℹ\s*代码已实装工具\s*\((\d+)\s*个\)\s*:\s*(.*)$/);
    if (!tools || !current) continue;
    const names = tools[2].split(',').map((t) => t.trim()).filter((t) => t !== '' && t !== '(none)');
    if (names.length === 0) continue;
    current.tools.push(...names);
  }
}

const toolTotal = toolPlugins.reduce((sum, plugin) => sum + plugin.tools.length, 0);
const scannerTotalMatch = scanOut.match(/真实扫描代码已实装工具数:\s*(\d+)\s*个/);
const scannerTotal = scannerTotalMatch ? Number(scannerTotalMatch[1]) : null;
if (scannerTotal !== null && scannerTotal !== toolTotal) {
  throw new Error(`工具统计与门禁汇总不一致：逐插件累加 ${toolTotal}，门禁总览 ${scannerTotal}`);
}

const toolSections = toolPlugins.filter((plugin) => plugin.tools.length > 0);
const toolStats = {
  total: toolTotal,
  plugins: toolSections.length,
  scannedPlugins: toolPlugins.length,
  scannerTotal
};

// ════════════════════════════════════════════════════════════════════════
// ③ 账号接入平台
// ════════════════════════════════════════════════════════════════════════

const ACCOUNTS_PLATFORMS_SOURCE = 'plugins/omnimux-accounts/src/client/platforms.js';
const ACCOUNTS_SOURCE = 'plugins/omnimux-accounts/src/client/platforms.js + client/locales.js';

const accountsPlatforms = await import(mod(ACCOUNTS_PLATFORMS_SOURCE));
const accountsLocales = await import(mod('plugins/omnimux-accounts/src/client/locales.js'));
const publishLocales = await import(mod('plugins/omnimux-publish/src/client/locales.js'));

/** 中文名取自两份文案真源：账号插件（`platform.<id>`）与发布插件（`platform.<id>`，含下划线键）。 */
function platformLabel(id) {
  for (const table of [accountsLocales.zh, publishLocales.zh]) {
    if (!table) continue;
    for (const key of [`platform.${id}`, `platform.${String(id).replace(/_/g, '-')}`]) {
      if (typeof table[key] === 'string' && table[key] !== '') return table[key];
    }
  }
  return id;
}

const connectedPlatforms = [...(accountsPlatforms.SUPPORTED_PLATFORMS || [])];
const comingPlatforms = [...(accountsPlatforms.COMING_PLATFORMS || [])];
const localeOnlyPlatforms = Object.keys(accountsLocales.zh || {})
  .filter((key) => key.startsWith('platform.') && !key.startsWith('platform.desc.'))
  .map((key) => key.slice('platform.'.length))
  .filter((id) => !connectedPlatforms.includes(id) && !comingPlatforms.includes(id));

const platformTier = (id) => {
  if (connectedPlatforms.includes(id)) return 'connected';
  if (comingPlatforms.includes(id)) return 'coming';
  return 'locale';
};

const accountPlatforms = [...connectedPlatforms, ...comingPlatforms, ...localeOnlyPlatforms].map((id) => ({
  id,
  label: platformLabel(id),
  tier: platformTier(id)
}));

const accountStats = {
  total: accountPlatforms.length,
  connected: connectedPlatforms.length,
  coming: comingPlatforms.length,
  localeOnly: localeOnlyPlatforms.length
};

// ════════════════════════════════════════════════════════════════════════
// ④ 发布通道
// ════════════════════════════════════════════════════════════════════════

const PUBLISH_CONFIG_SOURCE = 'plugins/omnimux-publish/src/config.js';
const PUBLISH_POLICY_SOURCE = 'plugins/omnimux-publish/src/account-policy.js';
const PUBLISH_MEDIA_SOURCE = 'plugins/omnimux-publish/src/submit-media.js + src/hubtools.js';
const PUBLISH_PROVIDER_SOURCE = 'plugins/omnimux/src/official/provider.js';

const publishConfig = await import(mod(PUBLISH_CONFIG_SOURCE));
const publishPolicy = await import(mod(PUBLISH_POLICY_SOURCE));
const builtinPlatforms = publishConfig.BUILTIN_PLATFORMS || {};

const publishPlatforms = Object.entries(builtinPlatforms).map(([id, row]) => ({
  id,
  label: platformLabel(id),
  mediaTypes: Array.isArray(row.media_types) ? [...row.media_types] : [],
  supportsCover: row.supports_cover === true,
  supportsSchedule: row.supports_schedule === true,
  supportsOriginalDeclaration: row.supports_original_declaration === true,
  supportsAiDeclaration: row.supports_ai_declaration === true,
  maxImages: typeof row.max_images === 'number' ? row.max_images : null
}));

/** hub 社交 provider 门禁为字面量联合类型，按源码真源提取标识。 */
function extractSocialProviders() {
  const source = fs.readFileSync(mod(PUBLISH_PROVIDER_SOURCE), 'utf8');
  const typedef = source.split('\n').find((line) => line.includes('SocialProvider */')) || '';
  const ids = [...typedef.matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]);
  if (ids.length === 0) throw new Error(`${PUBLISH_PROVIDER_SOURCE} 未声明 SocialProvider 标识，无法汇总账号来源通道`);
  return ids;
}
const socialProviders = extractSocialProviders();

/** 发布插件对上游通道的程序化调用面（hubtools.js 的 exec 字面量）。 */
function extractHubToolNames() {
  const source = fs.readFileSync(mod('plugins/omnimux-publish/src/hubtools.js'), 'utf8');
  return [...new Set([...source.matchAll(/exec\('([a-z0-9_]+)'/g)].map((m) => m[1]))].sort();
}
const hubToolNames = extractHubToolNames();

const mediaChannelSource = fs.readFileSync(mod('plugins/omnimux-publish/src/submit-media.js'), 'utf8');
const submitSource = fs.readFileSync(mod('plugins/omnimux-publish/src/submit.js'), 'utf8');
const mediaChannelWired = mediaChannelSource.includes('channel.presign(') && mediaChannelSource.includes('channel.putBytes(');
const policyGateWired = submitSource.includes('PUBLISH_PROVIDER');

/** @type {Array<{id: string, label: string, kind: string, detail: string, source: string}>} */
const publishChannels = [
  {
    id: 'tiktok_direct',
    label: '官方直投通道',
    kind: 'direct',
    detail: `发布插件仅接受 provider = ${publishPolicy.PUBLISH_PROVIDER} 的 TikTok 官方授权账号${policyGateWired ? '（提交前逐任务校验 provider，不匹配即拦截）' : ''}`,
    source: PUBLISH_POLICY_SOURCE
  },
  {
    id: 'media_presign_put',
    label: '媒体预签名直传通道',
    kind: 'media',
    detail: mediaChannelWired
      ? '草稿媒体按需申请预签名地址后以 PUT 直传（无 secret header），回填公共地址供投递使用'
      : '未检测到预签名直传链路',
    source: PUBLISH_MEDIA_SOURCE
  },
  // provider 白名单中非直投的成员：仅服务账号与分析链路，发布插件不消费该来源
  ...socialProviders.filter((provider) => provider !== publishPolicy.PUBLISH_PROVIDER).map((provider) => ({
    id: provider,
    label: '通用社交账号来源',
    kind: 'provider',
    detail: 'hub 社交 provider 门禁白名单成员，仅服务账号列表/连接与分析链路；发布插件只消费官方直投通道',
    source: PUBLISH_PROVIDER_SOURCE
  }))
];

// 投递通道与账号来源语义不同，计数必须分开：accountSources 不参与投递
const deliveryChannels = publishChannels.filter((channel) => channel.kind !== 'provider');
const providerSources = publishChannels.filter((channel) => channel.kind === 'provider');

const publishStats = {
  channels: deliveryChannels.length,
  accountSources: providerSources.length,
  platforms: publishPlatforms.length,
  directProvider: publishPolicy.PUBLISH_PROVIDER,
  hubTools: hubToolNames.length
};

// ════════════════════════════════════════════════════════════════════════
// 页面渲染
// ════════════════════════════════════════════════════════════════════════

const generatedAt = new Date().toLocaleString('zh-CN', { hour12: false });
const fingerprint = String(index.contentFingerprint || '').slice(0, 10);
const esc = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const haystack = (...parts) => parts.flat().filter(Boolean).join(' ').toLowerCase().replace(/"/g, '');

/** 深色主题 Token 块（单一来源，注入到媒体查询与手动切换两处选择器下）。 */
const darkTokens = `
      --dsw-alias-bg-base: #0C0F17;
      --dsw-alias-bg-primary: #111113;
      --dsw-alias-bg-layer-1: rgba(255, 255, 255, 0.04);
      --dsw-alias-bg-layer-2: rgba(255, 255, 255, 0.06);
      --dsw-alias-bg-layer-3: rgba(255, 255, 255, 0.08);
      --dsw-alias-bg-elevated: #151A26;
      --dsw-alias-border-l1: rgba(255, 255, 255, 0.06);
      --dsw-alias-border-l2: rgba(255, 255, 255, 0.12);
      --dsw-alias-border-l3: rgba(255, 255, 255, 0.22);
      --dsw-alias-label-primary: #FFFFFF;
      --dsw-alias-label-secondary: rgba(255, 255, 255, 0.72);
      --dsw-alias-label-tertiary: rgba(255, 255, 255, 0.40);
      --dsw-alias-label-dimmed: rgba(255, 255, 255, 0.28);
      --dsw-alias-card: #151A26;
      --dsw-alias-card-border: rgba(255, 255, 255, 0.08);
      --dsw-alias-hover: rgba(255, 255, 255, 0.08);
      --dsw-alias-active: rgba(255, 255, 255, 0.14);
      --dsw-alias-mask: rgba(0, 0, 0, 0.55);
      --dsw-alias-cta-fill: #FFFFFF;
      --dsw-alias-cta-label: #111113;
      --dsw-alias-status-success: #4ADE80;
      --dsw-alias-status-warn: #FBBF24;
      --dsw-alias-status-success-bg: rgba(34, 197, 94, 0.12);
      --dsw-alias-status-warn-bg: rgba(245, 158, 11, 0.12);
      --dsw-alias-grid-dot: rgba(255, 255, 255, 0.07);
`;

const lightTokens = `
      --dsw-alias-bg-base: #FFFFFF;
      --dsw-alias-bg-primary: #F8F8F9;
      --dsw-alias-bg-layer-1: #F7F7F8;
      --dsw-alias-bg-layer-2: #F0F1F3;
      --dsw-alias-bg-layer-3: #E5E7EB;
      --dsw-alias-bg-elevated: #FFFFFF;
      --dsw-alias-border-l1: rgba(0, 0, 0, 0.06);
      --dsw-alias-border-l2: rgba(0, 0, 0, 0.12);
      --dsw-alias-border-l3: rgba(0, 0, 0, 0.22);
      --dsw-alias-label-primary: #111827;
      --dsw-alias-label-secondary: #4B5563;
      --dsw-alias-label-tertiary: #9CA3AF;
      --dsw-alias-label-dimmed: #CBD5E1;
      --dsw-alias-card: #FFFFFF;
      --dsw-alias-card-border: rgba(0, 0, 0, 0.08);
      --dsw-alias-hover: rgba(0, 0, 0, 0.05);
      --dsw-alias-active: rgba(0, 0, 0, 0.09);
      --dsw-alias-mask: rgba(0, 0, 0, 0.35);
      --dsw-alias-cta-fill: #111827;
      --dsw-alias-cta-label: #FFFFFF;
      --dsw-alias-status-success: #16A34A;
      --dsw-alias-status-warn: #D97706;
      --dsw-alias-status-success-bg: rgba(34, 197, 94, 0.12);
      --dsw-alias-status-warn-bg: rgba(245, 158, 11, 0.12);
      --dsw-alias-grid-dot: rgba(0, 0, 0, 0.05);
`;

const TIER_LABEL = {
  connected: '已开放连接',
  coming: '规划中',
  locale: '仅文案占位'
};
const TIER_NOTE = {
  connected: '账号注册表已声明，可在账号中心发起连接',
  coming: '账号注册表已登记，连接入口尚未开放',
  locale: '仅存在平台名称文案，未在账号注册表声明接入'
};

function statusChip(tier) {
  const tone = tier === 'connected' ? ' chip-status-ok' : tier === 'coming' ? ' chip-status-warn' : '';
  return `<span class="chip${tone}">${esc(TIER_LABEL[tier])}</span>`;
}

function modelCards() {
  const groups = new Map();
  for (const model of models) {
    if (!groups.has(model.group)) groups.set(model.group, []);
    groups.get(model.group).push(model);
  }
  const order = ['文本与对话 (Text)', '图像生成与编辑 (Image)', '视频生成与动画 (Video)', '音频与语音合成 (Audio)', '网页提取与阅读 (Reader)'];
  return [...groups.entries()]
    .sort((a, b) => {
      const ai = order.indexOf(a[0]);
      const bi = order.indexOf(b[0]);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi) || a[0].localeCompare(b[0]);
    })
    .map(([group, rows]) => `
      <div class="group" data-group>
        <div class="group-head">
          <h3 class="group-title">${esc(group)}</h3>
          <span class="group-count mono" data-group-count>${rows.length}</span>
        </div>
        <div class="grid grid-model">
          ${rows.map((model) => `
          <article class="card item" data-cat="models" data-search="${esc(haystack(model.id, model.label, model.brand, model.family, model.aliases, model.operations.map((op) => op.label)))}">
            <div class="card-head">
              <span class="card-kicker">${esc(model.brand)}</span>
              <span class="chip${model.listed ? ' chip-status-ok' : ''}">${model.listed ? '已就绪' : '已登记'}</span>
            </div>
            <h4 class="card-title">${esc(model.label)}</h4>
            <button type="button" class="copy mono" data-copy="${esc(model.id)}" title="点击复制标识">${esc(model.id)}</button>
            ${model.aliases.length > 0 ? `<p class="card-meta mono" title="${esc(model.aliases.join(', '))}">别名 ${esc(model.aliases.join(' / '))}</p>` : ''}
            <ul class="tags">
              ${model.operations.map((op) => `<li class="tag${op.listed ? ' tag-listed' : ''}">${esc(op.label)}</li>`).join('')}
            </ul>
            <p class="card-foot mono">${model.listedOperationCount}/${model.operationCount} 个操作已就绪</p>
          </article>`).join('')}
        </div>
      </div>`).join('');
}

function toolGroups() {
  return toolSections.map((plugin) => `
      <div class="group" data-group>
        <div class="group-head">
          <h3 class="group-title mono">${esc(plugin.plugin)}</h3>
          <span class="group-count mono" data-group-count>${plugin.tools.length}</span>
        </div>
        <div class="grid grid-tool">
          ${plugin.tools.map((tool) => `<button type="button" class="tool item mono" data-cat="tools" data-copy="${esc(tool)}" data-search="${esc(haystack(tool, plugin.plugin))}" title="点击复制工具名">${esc(tool)}</button>`).join('')}
        </div>
      </div>`).join('');
}

function accountCards() {
  return accountPlatforms.map((platform) => `
          <article class="card item" data-cat="platforms" data-search="${esc(haystack(platform.id, platform.label, TIER_LABEL[platform.tier]))}">
            <div class="card-head">
              <span class="card-kicker">账号接入</span>
              ${statusChip(platform.tier)}
            </div>
            <h4 class="card-title">${esc(platform.label)}</h4>
            <button type="button" class="copy mono" data-copy="${esc(platform.id)}" title="点击复制平台标识">${esc(platform.id)}</button>
            <p class="card-foot">${esc(TIER_NOTE[platform.tier])}</p>
          </article>`).join('');
}

function channelCards(list) {
  return list.map((channel) => `
          <article class="card item" data-cat="channels" data-search="${esc(haystack(channel.id, channel.label, channel.kind))}">
            <div class="card-head">
              <span class="card-kicker">投递通道</span>
              <span class="chip">${esc(channel.kind === 'direct' ? '直投' : channel.kind === 'media' ? '媒体通道' : '账号来源')}</span>
            </div>
            <h4 class="card-title">${esc(channel.label)}</h4>
            <button type="button" class="copy mono" data-copy="${esc(channel.id)}" title="点击复制通道标识">${esc(channel.id)}</button>
            <p class="card-foot">${esc(channel.detail)}</p>
          </article>`).join('');
}

const ACCOUNT_AVAILABILITY = {
  connected: '已开放连接',
  coming: '规划中',
  none: '未接入账号'
};

function platformMatrixRows() {
  return publishPlatforms.map((platform) => {
    const tier = platformTier(platform.id);
    const availability = ACCOUNT_AVAILABILITY[tier] || ACCOUNT_AVAILABILITY.none;
    return `
            <tr class="item" data-cat="channels" data-search="${esc(haystack(platform.id, platform.label, availability))}">
              <td><span class="mono">${esc(platform.id)}</span><span class="cell-sub">${esc(platform.label)}</span></td>
              <td>${esc(availability)}</td>
              <td>${platform.mediaTypes.map((type) => `<span class="tag">${esc(type === 'video' ? '视频' : type === 'image' ? '图文' : type)}</span>`).join('')}</td>
              <td class="cell-flag">${platform.supportsCover ? '支持' : '—'}</td>
              <td class="cell-flag">${platform.supportsSchedule ? '支持' : '—'}</td>
              <td class="cell-flag">${platform.supportsOriginalDeclaration ? '支持' : '—'}</td>
              <td class="cell-flag">${platform.supportsAiDeclaration ? '支持' : '—'}</td>
              <td class="cell-num mono">${platform.maxImages === null ? '—' : platform.maxImages}</td>
            </tr>`;
  }).join('');
}

const statsCards = [
  { key: 'models', label: '模型能力接口', value: modelStats.total, unit: '款', note: `已就绪 ${modelStats.listed} · 已登记 ${modelStats.draft} · 处置规则 ${modelStats.dispositions} 条` },
  { key: 'tools', label: '智能体工具接口', value: toolStats.total, unit: '个', note: `跨 ${toolStats.plugins} 个插件（扫描 ${toolStats.scannedPlugins} 个）` },
  { key: 'platforms', label: '账号接入平台', value: accountStats.total, unit: '个', note: `已开放连接 ${accountStats.connected} · 规划中 ${accountStats.coming} · 仅文案占位 ${accountStats.localeOnly}` },
  { key: 'channels', label: '发布投递通道', value: publishStats.channels, unit: '条', note: `直投 ${publishStats.directProvider} · 媒体预签名直传 · 账号来源 ${publishStats.accountSources} 条另计` }
];

const payload = {
  generatedAt,
  fingerprint,
  stats: {
    models: modelStats,
    tools: { total: toolStats.total, plugins: toolStats.plugins, pluginsWithTools: toolSections.map((p) => ({ plugin: p.plugin, count: p.tools.length })) },
    platforms: accountStats,
    channels: publishStats
  },
  filters: {
    models: models.length,
    tools: toolStats.total,
    platforms: accountPlatforms.length,
    channels: publishChannels.length + publishPlatforms.length
  }
};

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>OmniMux 执行中枢 — 接口全景面板</title>
<style>
:root {
${lightTokens}
    --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", "Hiragino Sans GB", "Source Han Sans SC", sans-serif;
    --font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, "Liberation Mono", monospace;
    --radius-control: 8px;
    --radius-card: 12px;
    color-scheme: light dark;
  }
@media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
${darkTokens}
    }
  }
  :root[data-theme="dark"] {
${darkTokens}
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    background-color: var(--dsw-alias-bg-base);
    background-image: radial-gradient(var(--dsw-alias-grid-dot) 1px, transparent 1px);
    background-size: 20px 20px;
    color: var(--dsw-alias-label-primary);
    font-family: var(--font-sans);
    font-size: 13px;
    line-height: 18px;
    padding: 32px 24px 48px;
    -webkit-font-smoothing: antialiased;
  }

  .mono { font-family: var(--font-mono); font-size: 12px; line-height: 18px; }
  .container { max-width: 1280px; margin: 0 auto; }

  /* ── 页头 ─────────────────────────────────────────────── */
  .page-head {
    display: flex; align-items: flex-start; justify-content: space-between;
    gap: 16px; flex-wrap: wrap; padding-bottom: 20px;
    border-bottom: 1px solid var(--dsw-alias-border-l1);
  }
  .page-title { font-size: 20px; line-height: 28px; font-weight: 600; letter-spacing: -0.01em; }
  .page-lead { font-size: 13px; line-height: 18px; color: var(--dsw-alias-label-secondary); margin-top: 4px; max-width: 720px; }
  .head-side { display: flex; align-items: center; gap: 16px; }
  .meta-list { display: flex; gap: 20px; }
  .meta-list dt { font-size: 12px; line-height: 16px; color: var(--dsw-alias-label-tertiary); }
  .meta-list dd { font-family: var(--font-mono); font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }

  /* ── 按钮 ─────────────────────────────────────────────── */
  .btn {
    display: inline-flex; align-items: center; gap: 6px;
    height: 32px; padding: 0 12px; box-sizing: border-box;
    border-radius: var(--radius-control); border: 1px solid var(--dsw-alias-border-l2);
    background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary);
    font-family: var(--font-sans); font-size: 13px; line-height: 18px;
    cursor: pointer; transition: transform 120ms cubic-bezier(0.16, 1, 0.3, 1);
  }
  .btn:hover { border-color: var(--dsw-alias-border-l3); background: var(--dsw-alias-hover); }
  .btn:active { transform: scale(0.96); }
  .btn svg { width: 14px; height: 14px; display: block; }

  /* ── 概览统计 ─────────────────────────────────────────── */
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(212px, 1fr)); gap: 12px; margin: 20px 0; }
  .stat {
    background: var(--dsw-alias-card); border: 1px solid var(--dsw-alias-card-border);
    border-radius: var(--radius-card); padding: 14px 16px;
  }
  .stat-label { font-size: 12px; line-height: 16px; color: var(--dsw-alias-label-secondary); }
  .stat-value { font-family: var(--font-mono); font-size: 28px; line-height: 36px; font-weight: 600; letter-spacing: -0.02em; margin-top: 2px; }
  .stat-unit { font-family: var(--font-sans); font-size: 12px; line-height: 16px; font-weight: 400; color: var(--dsw-alias-label-tertiary); margin-left: 4px; }
  .stat-note { font-size: 12px; line-height: 16px; color: var(--dsw-alias-label-tertiary); margin-top: 4px; }

  /* ── 工具栏（单行流） ─────────────────────────────────── */
  .toolbar {
    display: flex; flex-wrap: nowrap; align-items: center; gap: 10px;
    background: var(--dsw-alias-card); border: 1px solid var(--dsw-alias-card-border);
    border-radius: var(--radius-card); padding: 10px 12px; margin-bottom: 8px;
  }
  .search-wrap { position: relative; flex: 1 1 200px; min-width: 140px; max-width: 300px; display: flex; }
  .search-wrap svg { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); width: 14px; height: 14px; color: var(--dsw-alias-label-tertiary); pointer-events: none; }
  .search-input {
    width: 100%; height: 32px; box-sizing: border-box; padding: 0 10px 0 32px;
    border-radius: var(--radius-control); border: 1px solid var(--dsw-alias-border-l2);
    background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary);
    font-family: var(--font-sans); font-size: 13px; line-height: 18px; outline: none;
  }
  .search-input::placeholder { color: var(--dsw-alias-label-tertiary); }
  .search-input:focus { border-color: var(--dsw-alias-label-primary); box-shadow: 0 0 0 2px var(--dsw-alias-active); }
  .filters { display: flex; flex-wrap: nowrap; gap: 6px; flex-shrink: 0; overflow-x: auto; }
  .chip {
    display: inline-flex; align-items: center; gap: 6px;
    height: 32px; box-sizing: border-box; padding: 0 10px;
    border-radius: var(--radius-control); border: 1px solid var(--dsw-alias-border-l2);
    background: transparent; color: var(--dsw-alias-label-secondary);
    font-family: var(--font-sans); font-size: 13px; line-height: 18px; white-space: nowrap;
    cursor: pointer; transition: transform 120ms cubic-bezier(0.16, 1, 0.3, 1);
  }
  .chip:hover { background: var(--dsw-alias-hover); color: var(--dsw-alias-label-primary); }
  .chip:active { transform: scale(0.96); }
  .chip.is-active { background: var(--dsw-alias-cta-fill); border-color: var(--dsw-alias-cta-fill); color: var(--dsw-alias-cta-label); font-weight: 500; }
  .chip .n { font-family: var(--font-mono); font-size: 12px; color: var(--dsw-alias-label-tertiary); }
  .chip.is-active .n { color: var(--dsw-alias-cta-label); opacity: 0.7; }
  .result-line { font-size: 12px; line-height: 16px; color: var(--dsw-alias-label-tertiary); margin: 0 0 20px 2px; }

  /* ── 内容区 ───────────────────────────────────────────── */
  .block { margin-bottom: 36px; }
  .block-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding-bottom: 10px; border-bottom: 1px solid var(--dsw-alias-border-l1); margin-bottom: 16px; }
  .block-title { font-size: 16px; line-height: 22px; font-weight: 600; }
  .block-desc { font-size: 12px; line-height: 16px; color: var(--dsw-alias-label-tertiary); margin-top: 2px; }
  .block-count { font-family: var(--font-mono); font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); flex-shrink: 0; }
  .block-source { font-family: var(--font-mono); font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-tertiary); margin-top: 10px; word-break: break-all; }

  .group { margin-bottom: 20px; }
  .group-head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 8px; }
  .group-title { font-size: 14px; line-height: 20px; font-weight: 500; }
  .group-count { color: var(--dsw-alias-label-tertiary); }

  .grid { display: grid; gap: 12px; }
  .grid-model { grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); }
  .grid-tool { grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); }
  .grid-card { grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }

  .card {
    display: flex; flex-direction: column; gap: 6px;
    background: var(--dsw-alias-card); border: 1px solid var(--dsw-alias-card-border);
    border-radius: var(--radius-card); padding: 14px 16px;
  }
  .card:hover { border-color: var(--dsw-alias-border-l3); }
  .card-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .card-kicker { font-size: 12px; line-height: 16px; color: var(--dsw-alias-label-secondary); }
  .card-title { font-size: 14px; line-height: 20px; font-weight: 500; }
  .card-meta { color: var(--dsw-alias-label-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .card-foot { font-size: 12px; line-height: 16px; color: var(--dsw-alias-label-tertiary); }

  .chip-status-ok { color: var(--dsw-alias-status-success); border-color: var(--dsw-alias-status-success-bg); background: var(--dsw-alias-status-success-bg); }
  .chip-status-warn { color: var(--dsw-alias-status-warn); border-color: var(--dsw-alias-status-warn-bg); background: var(--dsw-alias-status-warn-bg); }
  .card .chip { height: 24px; padding: 0 8px; font-size: 12px; line-height: 16px; cursor: default; }
  .card .chip:hover { background: var(--dsw-alias-bg-layer-1); }
  .card .chip-status-ok:hover { background: var(--dsw-alias-status-success-bg); }
  .card .chip-status-warn:hover { background: var(--dsw-alias-status-warn-bg); }

  .copy {
    align-self: flex-start; height: 24px; box-sizing: border-box; padding: 0 8px;
    display: inline-flex; align-items: center; max-width: 100%;
    border: 1px solid var(--dsw-alias-card-border); border-radius: var(--radius-control);
    background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-secondary);
    font-family: var(--font-mono); font-size: 12px; line-height: 18px;
    cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .copy:hover { background: var(--dsw-alias-hover); color: var(--dsw-alias-label-primary); }
  .copy.is-copied { background: var(--dsw-alias-cta-fill); color: var(--dsw-alias-cta-label); border-color: var(--dsw-alias-cta-fill); }

  .tags { display: flex; flex-wrap: wrap; gap: 6px; list-style: none; margin-top: 2px; }
  .tag {
    display: inline-flex; align-items: center; height: 22px; padding: 0 8px;
    border: 1px solid var(--dsw-alias-card-border); border-radius: 6px;
    background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-secondary);
    font-size: 12px; line-height: 16px;
  }
  .tag-listed { border-color: var(--dsw-alias-border-l3); color: var(--dsw-alias-label-primary); }

  .tool {
    justify-content: flex-start; height: 32px; box-sizing: border-box; padding: 0 10px;
    border-radius: var(--radius-control); border: 1px solid var(--dsw-alias-card-border);
    background: var(--dsw-alias-card); color: var(--dsw-alias-label-secondary);
    cursor: pointer; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .tool:hover { background: var(--dsw-alias-hover); color: var(--dsw-alias-label-primary); border-color: var(--dsw-alias-border-l3); }
  .tool.is-copied { background: var(--dsw-alias-cta-fill); color: var(--dsw-alias-cta-label); border-color: var(--dsw-alias-cta-fill); }

  .table-wrap { border: 1px solid var(--dsw-alias-card-border); border-radius: var(--radius-card); overflow: hidden; background: var(--dsw-alias-card); }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--dsw-alias-border-l1); vertical-align: middle; }
  th { height: 34px; font-size: 12px; line-height: 16px; font-weight: 500; color: var(--dsw-alias-label-secondary); border-bottom: 1px solid var(--dsw-alias-border-l2); white-space: nowrap; }
  td { font-size: 13px; line-height: 18px; min-height: 40px; color: var(--dsw-alias-label-primary); }
  tbody tr:hover { background: var(--dsw-alias-hover); }
  tbody tr:last-child td { border-bottom: none; }
  .cell-sub { display: block; font-size: 12px; line-height: 16px; color: var(--dsw-alias-label-tertiary); }
  .cell-flag, .cell-num { font-size: 12px; line-height: 16px; color: var(--dsw-alias-label-secondary); white-space: nowrap; }

  .empty { padding: 40px 24px; text-align: center; border: 1px dashed var(--dsw-alias-border-l2); border-radius: var(--radius-card); }
  .empty-title { font-size: 14px; line-height: 20px; font-weight: 500; }
  .empty-desc { font-size: 13px; line-height: 18px; color: var(--dsw-alias-label-secondary); margin-top: 4px; }
  .empty[hidden] { display: none; }

  .is-hidden { display: none !important; }

  footer { margin-top: 40px; padding-top: 18px; border-top: 1px solid var(--dsw-alias-border-l1); }
  .sources { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px 24px; }
  .source-title { font-size: 12px; line-height: 16px; font-weight: 500; color: var(--dsw-alias-label-secondary); }
  .source-path { font-family: var(--font-mono); font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-tertiary); word-break: break-all; }
  .footer-note { margin-top: 16px; font-size: 12px; line-height: 16px; color: var(--dsw-alias-label-tertiary); }

  @media (max-width: 720px) {
    .toolbar { flex-wrap: wrap; }
    .filters { flex-wrap: wrap; }
  }
</style>
</head>
<body>
<div class="container">
  <header class="page-head">
    <div>
      <h1 class="page-title">OmniMux 执行中枢 — 接口全景面板</h1>
      <p class="page-lead">执行中枢接入的四类接口：模型能力、智能体工具、账号接入平台、发布通道。全部标识实时映射自本地代码真源，页面自包含、可离线打开。</p>
    </div>
    <div class="head-side">
      <button type="button" class="btn" id="themeToggle" aria-pressed="false">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path></svg>
        <span id="themeLabel">深色</span>
      </button>
      <dl class="meta-list">
        <div><dt>生成时间</dt><dd>${esc(generatedAt)}</dd></div>
        <div><dt>契约指纹</dt><dd>${esc(fingerprint)}</dd></div>
      </dl>
    </div>
  </header>

  <section class="stats" aria-label="接口概览统计">
    ${statsCards.map((card) => `<article class="stat" data-stat="${card.key}" data-count="${card.value}">
      <div class="stat-label">${esc(card.label)}</div>
      <div class="stat-value">${card.value}<span class="stat-unit">${esc(card.unit)}</span></div>
      <div class="stat-note">${esc(card.note)}</div>
    </article>`).join('\n    ')}
  </section>

  <div class="toolbar">
    <div class="search-wrap">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-3.6-3.6"></path></svg>
      <input type="search" id="search" class="search-input" placeholder="搜索模型、工具、平台或通道" aria-label="搜索接口标识">
    </div>
    <div class="filters" id="filters" role="group" aria-label="接口分类过滤">
      <button type="button" class="chip is-active" data-filter="all">全部接口</button>
      <button type="button" class="chip" data-filter="models">模型能力 <span class="n">${payload.filters.models}</span></button>
      <button type="button" class="chip" data-filter="tools">智能体工具 <span class="n">${payload.filters.tools}</span></button>
      <button type="button" class="chip" data-filter="platforms">账号接入平台 <span class="n">${payload.filters.platforms}</span></button>
      <button type="button" class="chip" data-filter="channels">发布与账号来源 <span class="n">${payload.filters.channels}</span></button>
    </div>
  </div>
  <p class="result-line" id="resultLine" role="status"></p>

  <main>
    <section class="block" data-cat="models" id="sec-models">
      <div class="block-head">
        <div>
          <h2 class="block-title">模型能力接口</h2>
          <p class="block-desc">执行中枢的模型契约：按模态分组的可调用模型与操作；「已就绪」表示存在 listed 操作。</p>
        </div>
        <span class="block-count" data-block-count>${models.length}</span>
      </div>
      ${modelCards()}
      <p class="block-source">来源：${esc(MODEL_SPECS_SOURCE)}（loadAll 实时加载）· ${esc(rel(dispositionsPath))}（${modelStats.dispositions} 条处置规则）· 品牌归类 plugins/omnimux/src/brand/model-brands.js</p>
      <div class="empty" data-empty hidden>
        <div class="empty-title">未找到匹配的模型</div>
        <p class="empty-desc">换一个关键词，或清空搜索条件后重试。</p>
      </div>
    </section>

    <section class="block" data-cat="tools" id="sec-tools">
      <div class="block-head">
        <div>
          <h2 class="block-title">智能体工具接口</h2>
          <p class="block-desc">执行中枢 ctx.tools 注册的智能体工具，按插件分组；与治理门禁静态扫描同源（同一脚本、同一次运行）。</p>
        </div>
        <span class="block-count" data-block-count>${toolStats.total}</span>
      </div>
      ${toolGroups()}
      <p class="block-source">来源：node ${esc(AGENT_TOOLS_SCANNER)} 的静态扫描输出（逐插件「代码已实装工具」，标注 (none) 者跳过）</p>
      <div class="empty" data-empty hidden>
        <div class="empty-title">未找到匹配的工具</div>
        <p class="empty-desc">换一个关键词，或清空搜索条件后重试。</p>
      </div>
    </section>

    <section class="block" data-cat="platforms" id="sec-platforms">
      <div class="block-head">
        <div>
          <h2 class="block-title">账号接入平台</h2>
          <p class="block-desc">账号注册表声明的平台，以及仅在文案层存在、尚未声明接入的平台标识，三档如实区分。</p>
        </div>
        <span class="block-count" data-block-count>${accountPlatforms.length}</span>
      </div>
      <div class="grid grid-card">${accountCards()}</div>
      <p class="block-source">来源：${esc(ACCOUNTS_SOURCE)}（SUPPORTED_PLATFORMS / COMING_PLATFORMS 与 platform.* 文案），中文名同时取自 plugins/omnimux-publish/src/client/locales.js</p>
      <div class="empty" data-empty hidden>
        <div class="empty-title">未找到匹配的平台</div>
        <p class="empty-desc">换一个关键词，或清空搜索条件后重试。</p>
      </div>
    </section>

    <section class="block" data-cat="channels" id="sec-channels">
      <div class="block-head">
        <div>
          <h2 class="block-title">发布通道</h2>
          <p class="block-desc">发布插件实装的投递通道，以及已声明能力的平台矩阵；通道实装与平台能力声明分栏呈现，互不替代。</p>
        </div>
        <span class="block-count" data-block-count>${publishChannels.length + publishPlatforms.length}</span>
      </div>
      <div class="group" data-group>
        <div class="group-head">
          <h3 class="group-title">投递通道</h3>
          <span class="group-count mono" data-group-count>${deliveryChannels.length}</span>
        </div>
        <div class="grid grid-card">${channelCards(deliveryChannels)}</div>
      </div>
      <div class="group" data-group>
        <div class="group-head">
          <h3 class="group-title">账号来源（不参与发布投递）</h3>
          <span class="group-count mono" data-group-count>${providerSources.length}</span>
        </div>
        <div class="grid grid-card">${channelCards(providerSources)}</div>
      </div>
      <div class="group" data-group>
        <div class="group-head">
          <h3 class="group-title">平台能力矩阵（渠道方声明，非已打通投递）</h3>
          <span class="group-count mono" data-group-count>${publishPlatforms.length}</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>平台</th><th>账号可用性</th><th>内容类型</th><th>封面</th><th>定时</th><th>原创声明</th><th>AI 声明</th><th>图文上限</th>
              </tr>
            </thead>
            <tbody>${platformMatrixRows()}
            </tbody>
          </table>
        </div>
      </div>
      <p class="block-source">来源：${esc(PUBLISH_CONFIG_SOURCE)}（BUILTIN_PLATFORMS 能力矩阵）· ${esc(PUBLISH_POLICY_SOURCE)}（PUBLISH_PROVIDER = ${esc(publishPolicy.PUBLISH_PROVIDER)}）· ${esc(PUBLISH_MEDIA_SOURCE)}（预签名 PUT 直传）· ${esc(PUBLISH_PROVIDER_SOURCE)}（社交 provider 白名单 ${esc(socialProviders.join(' / '))}）· 上游工具 ${esc(hubToolNames.join(', '))}</p>
      <div class="empty" data-empty hidden>
        <div class="empty-title">未找到匹配的通道</div>
        <p class="empty-desc">换一个关键词，或清空搜索条件后重试。</p>
      </div>
    </section>
  </main>

  <footer>
    <div class="sources">
      <div>
        <div class="source-title">模型能力接口</div>
        <div class="source-path">${esc(MODEL_SPECS_SOURCE)} · ${esc(rel(dispositionsPath))} · plugins/omnimux/src/brand/model-brands.js</div>
      </div>
      <div>
        <div class="source-title">智能体工具接口</div>
        <div class="source-path">${esc(AGENT_TOOLS_SCANNER)}（治理门禁同源静态扫描，实测 ${toolStats.total} 个）</div>
      </div>
      <div>
        <div class="source-title">账号接入平台</div>
        <div class="source-path">${esc(ACCOUNTS_PLATFORMS_SOURCE)} · plugins/omnimux-accounts/src/client/locales.js · plugins/omnimux-publish/src/client/locales.js</div>
      </div>
      <div>
        <div class="source-title">发布通道</div>
        <div class="source-path">${esc(PUBLISH_CONFIG_SOURCE)} · ${esc(PUBLISH_POLICY_SOURCE)} · ${esc(PUBLISH_MEDIA_SOURCE)} · ${esc(PUBLISH_PROVIDER_SOURCE)}</div>
      </div>
    </div>
    <p class="footer-note">生成时间 ${esc(generatedAt)} · 生成命令 node scripts/generate-hub-interfaces-html.mjs · 契约指纹 ${esc(fingerprint)} · 界面标识与中文名全部取自上述源码真源，页面仅内置分档与展示文案常量。</p>
  </footer>
</div>

<script id="hub-data" type="application/json">${JSON.stringify(payload).replace(/</g, '\\u003c')}</script>
<script>
(function () {
  var root = document.documentElement;
  var toggle = document.getElementById('themeToggle');
  var label = document.getElementById('themeLabel');
  var prefersDark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function resolvedTheme() {
    if (root.dataset.theme === 'dark' || root.dataset.theme === 'light') return root.dataset.theme;
    return prefersDark && prefersDark.matches ? 'dark' : 'light';
  }
  function syncToggle() {
    var theme = resolvedTheme();
    label.textContent = theme === 'dark' ? '浅色' : '深色';
    toggle.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
    toggle.setAttribute('aria-label', theme === 'dark' ? '切换到浅色主题' : '切换到深色主题');
  }
  toggle.addEventListener('click', function () {
    var next = resolvedTheme() === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    try { window.localStorage.setItem('hub-interfaces-theme', next); } catch (error) {}
    syncToggle();
  });
  try {
    var stored = window.localStorage.getItem('hub-interfaces-theme');
    if (stored === 'dark' || stored === 'light') root.dataset.theme = stored;
  } catch (error) {}
  if (prefersDark && prefersDark.addEventListener) prefersDark.addEventListener('change', syncToggle);
  syncToggle();

  var search = document.getElementById('search');
  var resultLine = document.getElementById('resultLine');
  var blocks = Array.prototype.slice.call(document.querySelectorAll('.block'));
  var filterButtons = Array.prototype.slice.call(document.querySelectorAll('.chip[data-filter]'));
  var state = { query: '', filter: 'all' };

  function apply() {
    var query = state.query.trim().toLowerCase();
    var visibleTotal = 0;

    blocks.forEach(function (block) {
      var categoryMatches = state.filter === 'all' || block.dataset.cat === state.filter;
      var items = Array.prototype.slice.call(block.querySelectorAll('.item'));
      var visibleInBlock = 0;

      items.forEach(function (item) {
        var matches = query === '' || (item.dataset.search || '').indexOf(query) !== -1;
        var shown = categoryMatches && matches;
        item.classList.toggle('is-hidden', !shown);
        if (shown) visibleInBlock += 1;
      });

      Array.prototype.slice.call(block.querySelectorAll('[data-group]')).forEach(function (group) {
        var groupItems = Array.prototype.slice.call(group.querySelectorAll('.item'));
        var shown = groupItems.filter(function (item) { return !item.classList.contains('is-hidden'); }).length;
        group.classList.toggle('is-hidden', groupItems.length > 0 && shown === 0);
        var counter = group.querySelector('[data-group-count]');
        if (counter) counter.textContent = String(shown);
      });

      block.classList.toggle('is-hidden', !categoryMatches);
      var empty = block.querySelector('[data-empty]');
      if (empty) empty.hidden = !(categoryMatches && visibleInBlock === 0);
      var blockCount = block.querySelector('[data-block-count]');
      if (blockCount) blockCount.textContent = String(visibleInBlock);
      visibleTotal += visibleInBlock;
    });

    resultLine.textContent = '当前显示 ' + visibleTotal + ' 条接口记录' + (state.filter === 'all' ? '' : '（分类过滤已启用）') + (query === '' ? '' : '（关键词：' + state.query.trim() + '）');
  }

  search.addEventListener('input', function (event) {
    state.query = event.target.value;
    apply();
  });

  filterButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      state.filter = button.dataset.filter;
      filterButtons.forEach(function (other) { other.classList.toggle('is-active', other === button); });
      apply();
    });
  });

  function markCopied(element) {
    element.classList.add('is-copied');
    window.setTimeout(function () { element.classList.remove('is-copied'); }, 1200);
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var scratch = document.createElement('textarea');
      scratch.value = text;
      scratch.setAttribute('readonly', '');
      scratch.style.position = 'fixed';
      scratch.style.opacity = '0';
      document.body.appendChild(scratch);
      scratch.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(scratch);
      ok ? resolve() : reject(new Error('copy failed'));
    });
  }

  document.addEventListener('click', function (event) {
    var target = event.target.closest ? event.target.closest('[data-copy]') : null;
    if (!target) return;
    copyText(target.dataset.copy).then(function () {
      markCopied(target);
    }).catch(function () {
      markCopied(target);
    });
  });

  apply();
})();
</script>
</body>
</html>
`;

const cleaned = html.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n');

const outDir = mod('docs/tools');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'hub-interfaces.html');
fs.writeFileSync(outPath, cleaned, 'utf8');

console.log(`接口全景面板生成成功: ${rel(outPath)}`);
console.log(`  模型能力接口    ${modelStats.total} 款（已就绪 ${modelStats.listed} / 已登记 ${modelStats.draft}，处置规则 ${modelStats.dispositions} 条）`);
console.log(`  智能体工具接口  ${toolStats.total} 个（跨 ${toolStats.plugins} 个插件；门禁总览 ${toolStats.scannerTotal} 个，逐插件累加一致）`);
console.log(`  账号接入平台    ${accountStats.total} 个（已开放连接 ${accountStats.connected} / 规划中 ${accountStats.coming} / 仅文案占位 ${accountStats.localeOnly}）`);
console.log(`  发布投递通道    ${publishStats.channels} 条（直投 ${publishStats.directProvider}；账号来源 ${publishStats.accountSources} 条另计；平台能力矩阵 ${publishStats.platforms} 项为渠道声明）`);
