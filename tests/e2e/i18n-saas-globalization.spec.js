/**
 * E2E: 全插件矩阵多语言国际化与 SaaS 科技专业术语对齐端到端验证
 *
 * 覆盖场景：
 * 1. 侧边栏导航与工作台 Tab 在英文环境下的 SaaS 规范命名（Skills & Experts, AI Apps, Creative Canvas 等）
 * 2. 技能库 (My Skills) 核心官方与内置技能在中英文环境下的双语翻译解析（clip-craft, viral-video-replication 等）
 * 3. 创作画布资产抽屉 (Assets Drawer) 全量控件与浮层中英文双语对称（Canvas, Assets, Import Files, Search files 等）
 * 4. 动态系统语言环境切换与 fallback 优雅容错
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  WORKBENCH_TAB_TITLE_FALLBACKS,
  WORKBENCH_TAB_TITLE_FALLBACKS_EN,
  resolveWorkbenchTabTitle,
} from '../../plugins/omnimux/src/client/workbench/focus-state.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');

test('E2E: 场景 1 - 工作台 Tab 与侧边栏入口在英文环境下呈现标准 SaaS 专业英文术语', () => {
  // 1. 验证英文回退标题字典标准规范
  assert.equal(WORKBENCH_TAB_TITLE_FALLBACKS_EN['omnimux-market:plaza'], 'Skills & Experts');
  assert.equal(WORKBENCH_TAB_TITLE_FALLBACKS_EN['omnimux-workflow:canvas'], 'Creative Canvas');
  assert.equal(WORKBENCH_TAB_TITLE_FALLBACKS_EN['omnimux-workflow:library'], 'Projects');
  assert.equal(WORKBENCH_TAB_TITLE_FALLBACKS_EN['omnimux:media-viewer'], 'Image Generation');
  assert.equal(WORKBENCH_TAB_TITLE_FALLBACKS_EN['omnimux-device:library'], 'Devices');
  assert.equal(WORKBENCH_TAB_TITLE_FALLBACKS_EN['omnimux-assets:library'], 'Assets');

  // 2. 验证中文回退字典严格对应
  assert.equal(WORKBENCH_TAB_TITLE_FALLBACKS['omnimux-market:plaza'], '技能/专家');
  assert.equal(WORKBENCH_TAB_TITLE_FALLBACKS['omnimux-workflow:canvas'], '创作画布');
  assert.equal(WORKBENCH_TAB_TITLE_FALLBACKS['omnimux-workflow:library'], '项目');
  assert.equal(WORKBENCH_TAB_TITLE_FALLBACKS['omnimux:media-viewer'], '图像生成');

  // 3. 验证在自定义名称传入时优先使用自定义名称
  assert.equal(resolveWorkbenchTabTitle('omnimux-market:plaza', 'My Custom Skills', null), 'My Custom Skills');
});

test('E2E: 场景 2 - 技能市场 i18n 词典包含核心高频技能的专业 SaaS 英文描述与动态感知', () => {
  const marketI18nSrc = readFileSync(
    join(root, 'plugins/omnimux-market/src/client/i18n.js'),
    'utf8',
  );

  // 1. 验证 Skills & Experts 英文统一命名
  assert.match(marketI18nSrc, /"plaza\.title":\s*"Skills & Experts"/);
  assert.match(marketI18nSrc, /"workshop\.title":\s*"Skills & Experts"/);

  // 2. 验证核心技能的英文专业描述存在且符合 SaaS 科技规范
  assert.match(marketI18nSrc, /"skill\.desc\.clip-craft":/);
  assert.match(marketI18nSrc, /"skill\.desc\.cinematic-ai-comic-director":/);
  assert.match(marketI18nSrc, /"skill\.desc\.ip-character-consistency-studio":/);
  assert.match(marketI18nSrc, /"skill\.desc\.viral-video-replication":/);
  assert.match(marketI18nSrc, /"skill\.desc\.tiktok-shop-product-video-maker":/);
  assert.match(marketI18nSrc, /"skill\.desc\.3d-animation-short-generator":/);
  assert.match(marketI18nSrc, /"skill\.desc\.skill-creator":/);
  assert.match(marketI18nSrc, /"skill\.desc\.video-analysis":/);
  assert.match(marketI18nSrc, /"skill\.desc\.video-hook-analysis":/);

  // 3. 验证浏览器语言感知覆盖 window.__omnimuxLocale
  assert.match(marketI18nSrc, /window\.__omnimuxLocale/);
});

test('E2E: 场景 3 - 创作画布抽屉组件全量双语支持 (Canvas / Assets / Popovers)', async () => {
  const { default: zhDict } = await import('../../plugins/omnimux-workflow/src/canvas/i18n/dict.zh.ts');
  const { default: enDict } = await import('../../plugins/omnimux-workflow/src/canvas/i18n/dict.en.ts');

  // 抽屉头部 Tab
  assert.equal(zhDict['assets.tab.canvas'], '创作画布');
  assert.equal(enDict['assets.tab.canvas'], 'Canvas');
  assert.equal(zhDict['assets.tab.assets'], '资产');
  assert.equal(enDict['assets.tab.assets'], 'Assets');
  assert.equal(zhDict['assets.closeDrawer'], '关闭抽屉 (Esc / A)');
  assert.equal(enDict['assets.closeDrawer'], 'Close Drawer (Esc / A)');

  // 底部导入与操作按钮
  assert.equal(zhDict['assets.importFile'], '导入文件');
  assert.equal(enDict['assets.importFile'], 'Import Files');
  assert.equal(zhDict['assets.newFolder'], '新建文件夹');
  assert.equal(enDict['assets.newFolder'], 'New Folder');

  // 搜索与视图
  assert.equal(zhDict['assets.searchFiles'], '搜索文件');
  assert.equal(enDict['assets.searchFiles'], 'Search files');
  assert.equal(zhDict['assets.viewList'], '列表视图');
  assert.equal(enDict['assets.viewList'], 'List View');
  assert.equal(zhDict['assets.viewGrid'], '网格视图');
  assert.equal(enDict['assets.viewGrid'], 'Grid View');

  // 筛选器与空状态
  assert.equal(zhDict['assets.filter.type'], '类型');
  assert.equal(enDict['assets.filter.type'], 'Type');
  assert.equal(zhDict['assets.filter.time'], '时间');
  assert.equal(enDict['assets.filter.time'], 'Date');
  assert.equal(zhDict['assets.filter.tag'], '标签');
  assert.equal(enDict['assets.filter.tag'], 'Tags');
  assert.equal(zhDict['assets.emptyCanvas'], '创作画布暂无素材');
  assert.equal(enDict['assets.emptyCanvas'], 'No assets on canvas');
  assert.equal(zhDict['assets.emptyCanvasSub'], '请导入文件或添加节点并生成');
  assert.equal(enDict['assets.emptyCanvasSub'], 'Import files or generate from canvas nodes');

  // 选项浮层
  assert.equal(zhDict['assets.popover.sortNewest'], '最新优先');
  assert.equal(enDict['assets.popover.sortNewest'], 'Newest First');
  assert.equal(zhDict['assets.popover.sortOldest'], '最旧优先');
  assert.equal(enDict['assets.popover.sortOldest'], 'Oldest First');
  assert.equal(zhDict['assets.popover.all'], '全部');
  assert.equal(enDict['assets.popover.all'], 'All');
  assert.equal(zhDict['assets.popover.today'], '今天');
  assert.equal(enDict['assets.popover.today'], 'Today');
  assert.equal(zhDict['assets.popover.last7Days'], '近 7 天');
  assert.equal(enDict['assets.popover.last7Days'], 'Last 7 Days');
  assert.equal(zhDict['assets.tag.character'], '人物');
  assert.equal(enDict['assets.tag.character'], 'Character');
});

test('E2E: 场景 4 - 工作流 AI 应用 Tab 注册与本地化消除硬编码中文', async () => {
  const { zh, en } = await import('../../plugins/omnimux-workflow/src/client/locales.js');
  const indexSrc = readFileSync(
    join(root, 'plugins/omnimux-workflow/src/client/index.js'),
    'utf8',
  );

  // 1. 验证 index.js registerAppTab 不再写死中文 'AI 应用'
  assert.doesNotMatch(indexSrc, /title:\s*\(seed\)\s*=>\s*seed\?\.title\s*\|\|\s*'AI 应用'/);
  assert.match(indexSrc, /title:\s*\(seed\)\s*=>\s*seed\?\.title\s*\|\|\s*t\('workflow\.tab\.aiApps'\)/);

  // 2. 验证 locales.js 英文符合 SaaS 大写规范
  assert.equal(zh['projects.appCategoryUnknown'], 'AI 应用');
  assert.equal(en['projects.appCategoryUnknown'], 'AI Apps');
  assert.equal(en['projects.appCategoryVideo'], 'Video App');
  assert.equal(en['projects.appCategoryAudio'], 'Audio App');
  assert.equal(en['projects.appCategoryUnknown'], 'AI Apps');
});
