/**
 * ComfyUI 工作流卡片源码契约（Issue #3751）：
 * 单宿主（卡片自己承载状态机与真页面）、整屏不重建 iframe、iframe 挂载受控、
 * 只有这个节点类型可缩放、旧全屏层没有残留。
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const canvasRoot = join(here, '../..');
const cardSrc = readFileSync(join(here, 'comfyPage.tsx'), 'utf8');
const panelSrc = readFileSync(join(here, '../../editor/components/ComfyPagePanel.tsx'), 'utf8');
const toolbarSrc = readFileSync(join(here, '../../editor/components/Toolbar.tsx'), 'utf8');
const cssSrc = readFileSync(join(here, '../../theme/comfyPage.css'), 'utf8');

test('卡片自己承载面板：状态机与真页面都在卡片里，不需要先点「打开」', () => {
  assert.match(cardSrc, /import \{ ComfyPagePanel \} from '\.\.\/\.\.\/editor\/components\/ComfyPagePanel'/);
  assert.match(cardSrc, /<ComfyPagePanel/);
  assert.match(cardSrc, /nodeId=\{id\}/);
  assert.match(cardSrc, /frameMounted=\{frameMounted\}/);
  assert.match(cardSrc, /onReadyChange=\{setReady\}/);
  // 旧的「打开」入口整块消失：没有事件派发、没有旧卡片 markup、没有旧文案键。
  assert.equal(cardSrc.includes('COMFY_PAGE_OPEN_EVENT'), false);
  assert.equal(cardSrc.includes('wf-comfy-page-card'), false);
  assert.equal(cardSrc.includes('comfyPage.card.open'), false);
  assert.equal(cardSrc.includes('ComfyPageOverlay'), false);
});

test('整屏是同一张卡片的几何，不移动 DOM、不重建 iframe', () => {
  assert.match(cardSrc, /comfyFullscreenGeometry/);
  assert.match(cardSrc, /wf-comfy-page-node--fullscreen/);
  assert.match(cardSrc, /--wf-comfy-inverse/);
  // 整屏靠样式与 z-index，不靠「换宿主」：没有 portal、没有第二处 iframe。
  assert.equal(cardSrc.includes('createPortal'), false);
  assert.equal(cardSrc.includes('<iframe'), false, 'iframe 只在面板里，整屏不产生第二份');
  assert.match(cssSrc, /\.wf-comfy-page-node--fullscreen \{/);
  assert.match(cssSrc, /\.wf-comfy-page-node--fullscreen \.wf-comfy-page-node__card \{/);
  // 面板不再是固定整屏层：它是卡片里的普通内容。
  assert.match(cssSrc, /\.wf-comfy-page-panel \{/);
  assert.equal(/\.wf-comfy-page-panel \{[^}]*position:\s*fixed/.test(cssSrc), false);
  assert.equal(cssSrc.includes('wf-comfy-page-overlay'), false);
  assert.equal(cssSrc.includes('wf-comfy-page-card'), false);
});

test('iframe 挂载受控：可见/选中 + 就绪 + 名额，未挂载时给占位', () => {
  assert.match(cardSrc, /shouldMountComfyFrame\(/);
  assert.match(cardSrc, /useComfyFrameSlots/);
  assert.match(cardSrc, /claimSlot\(id\)/);
  assert.match(cardSrc, /releaseSlot\(id\)/);
  assert.match(panelSrc, /frameMounted \? \(/);
  assert.match(panelSrc, /comfyPage\.card\.framePaused/);
  assert.match(cssSrc, /\.wf-comfy-page-panel__frame-paused/);
  // 就绪信号由面板上报，卡片据此申请名额。
  assert.match(panelSrc, /onReadyChange\?\.\(pageReady\)/);
});

test('只有这个节点类型可缩放，且尺寸有下限并写回节点', () => {
  assert.match(cardSrc, /<NodeResizer/);
  assert.match(cardSrc, /minWidth=\{COMFY_CARD_MIN_WIDTH\}/);
  assert.match(cardSrc, /minHeight=\{COMFY_CARD_MIN_HEIGHT\}/);
  assert.match(cardSrc, /clampComfyCardSize\(params\.width, params\.height\)/);
  const definitions = readdirSync(here).filter((name) => name.endsWith('.tsx'));
  const withResizer = definitions.filter((name) =>
    readFileSync(join(here, name), 'utf8').includes('NodeResizer'),
  );
  assert.deepEqual(withResizer, ['comfyPage.tsx'], '缩放只属于这个节点类型');
});

test('工具栏两个按钮复用既有胶囊与既有能力', () => {
  assert.match(cardSrc, /<FloatingTopPill actions=\{pillActions\}/);
  assert.match(cardSrc, /t\('pill\.fullscreen'\)/);
  assert.match(cardSrc, /t\('pill\.addToConversation'\)/);
  assert.match(cardSrc, /useAddToConversation\(\)/);
  assert.match(cardSrc, /buildConversationPayloadFromNode\(\{/);
  assert.match(cardSrc, /nodeType: 'comfy-page'/);
  // 整屏态下按钮语义变成「退出全屏」。
  assert.match(cardSrc, /comfyPage\.card\.exitFullscreen/);
});

test('底部：工作流名 + 使用模板，模板面板复用画布既有的那一份', () => {
  assert.match(cardSrc, /wf-comfy-page-node__footer/);
  assert.match(cardSrc, /comfyPage\.card\.unnamedWorkflow/);
  assert.match(cardSrc, /COMFY_PAGE_TEMPLATE_EVENT/);
  assert.match(cardSrc, /comfyPage\.card\.useTemplate/);
  // 事件由工具栏接住并打开已有面板，不在这里再挂一份模板面板。
  assert.match(toolbarSrc, /COMFY_PAGE_TEMPLATE_EVENT/);
  assert.match(toolbarSrc, /setIsTemplateMenuOpen\(true\)/);
  assert.equal(cardSrc.includes('WorkflowTemplatePanel'), false);
});

test('旧全屏层已删除，画布里没有第二入口与死引用', () => {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full);
    }
  };
  walk(canvasRoot);
  const stale = files.filter((file) => {
    const text = readFileSync(file, 'utf8');
    return text.includes('ComfyPageOverlay') || text.includes('COMFY_PAGE_OPEN_EVENT');
  });
  assert.deepEqual(stale, [], '旧全屏层与其事件名不得残留');
  assert.equal(
    readdirSync(join(here, '../../editor/components')).includes('ComfyPageOverlay.tsx'),
    false,
  );
});
