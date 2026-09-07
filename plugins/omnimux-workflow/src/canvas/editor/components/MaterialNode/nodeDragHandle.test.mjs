/**
 * 节点拖拽热区契约：标题栏不能整行 nodrag（Gxgen 只在重命名 input 上 nodrag），
 * 文本节点未聚焦不加 nodrag（点输入框也能拖），双击才进编辑。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const headerSrc = readFileSync(join(here, 'NodeHeader.tsx'), 'utf8');
const nodeSrc = readFileSync(join(here, 'index.tsx'), 'utf8');
const cssSrc = readFileSync(join(here, '../../../theme/components.css'), 'utf8');

test('标题栏根节点不是 nodrag，重命名输入才是', () => {
  assert.doesNotMatch(headerSrc, /className="wf-node-header nodrag"/);
  assert.match(headerSrc, /className="wf-node-header"/);
  assert.match(headerSrc, /className="wf-node-header__input nodrag"/);
});

test('文本节点 textarea 包在可拖壳里，未聚焦不加 nodrag', () => {
  // 生成态会追加 --gsc；壳类名仍以 wf-material-node__text-shell 为根
  assert.match(nodeSrc, /className=\{`wf-material-node__text-shell\$\{/);
  assert.match(nodeSrc, /wf-material-node__text-shell--gsc/);
  assert.match(nodeSrc, /wf-material-node__text-editor nowheel/);
  assert.match(nodeSrc, /textEditing \? ' nodrag'/);
  assert.match(nodeSrc, /readOnly=\{!textEditing\}/);
  assert.match(nodeSrc, /onDoubleClick/);
  assert.match(nodeSrc, /if \(!textEditing\) e\.preventDefault\(\)/);
});

test('文本壳有 padding 作为拖拽边', () => {
  assert.match(cssSrc, /\.wf-material-node__text-shell \{[\s\S]*?padding:\s*12px/);
});

function sliceActionBlock(src, key) {
  const needle = `key: '${key}'`;
  const keyIdx = src.indexOf(needle);
  assert.ok(keyIdx >= 0, `missing action ${key}`);
  const start = src.lastIndexOf('{', keyIdx);
  assert.ok(start >= 0, `missing object start for ${key}`);
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error(`unclosed action ${key}`);
}

test('MaterialNode 顶栏走通用 FloatingTopPill，有素材才显示，生成媒体也会话', () => {
  assert.match(nodeSrc, /from '\.\.\/FloatingTopPill'/);
  assert.match(nodeSrc, /hasNodeMaterial/);
  assert.match(nodeSrc, /shouldShowNodeToolbar/);
  assert.match(nodeSrc, /key:\s*'add-to-conversation'/);
  assert.doesNotMatch(nodeSrc, /from '\.\/FloatingTopPill'/);
  assert.match(nodeSrc, /showReplaceButton/);
});

test('MaterialNode chat 胶囊是次区图标：section secondary，无可见 label，title 仍走 i18n', () => {
  const chat = sliceActionBlock(nodeSrc, 'add-to-conversation');
  assert.match(chat, /section:\s*'secondary'/);
  assert.match(chat, /icon:\s*MessageSquarePlus/);
  assert.match(chat, /title:\s*t\('pill\.addToConversation'\)/);
  assert.doesNotMatch(chat, /label:\s*t\('pill\.addToConversation'\)/);
  assert.doesNotMatch(chat, /variant:\s*'primary'/);
  assert.doesNotMatch(chat, /label:\s*['"]/);

  const edit = sliceActionBlock(nodeSrc, 'edit');
  assert.match(edit, /section:\s*'primary'/);
  assert.match(edit, /label:\s*t\('pill\.edit'\)/);

  const copy = sliceActionBlock(nodeSrc, 'copy');
  assert.match(copy, /section:\s*'secondary'/);

  const split = sliceActionBlock(nodeSrc, 'split');
  assert.match(split, /section:\s*'secondary'/);
});

test('MaterialNode 空状态图片生成节点胶囊契约：主区导入图片 + Upload 图标 + 原生选择器触发', () => {
  // 胶囊栏允许空态图片节点显示
  assert.match(nodeSrc, /allowEmpty:\s*isEmptyImageNode/);
  assert.match(nodeSrc, /isEmptyImageGenerateNode/);

  // 胶囊 action：import-image
  const importAction = sliceActionBlock(nodeSrc, 'import-image');
  assert.match(importAction, /section:\s*'primary'/);
  assert.match(importAction, /icon:\s*Upload/);
  assert.match(importAction, /label:\s*t\('pill\.importImage'\)/);
  assert.match(importAction, /title:\s*t\('pill\.importImage'\)/);
  assert.match(importAction, /event\.stopPropagation\(\)/);
  assert.match(importAction, /resourcePicker\.fillImportNode\(\)/);
});

test('MaterialNode 拖拽与就地蜕变契约：空态图片节点支持拖入，传入 edges 并断开上游边', () => {
  // 拖入条件包含 isEmptyImageNode
  assert.match(nodeSrc, /canAcceptDrop\s*=\s*kind === 'import' \|\| isEmptyImageNode/);
  assert.match(nodeSrc, /if \(!canAcceptDrop\) return/);

  // 导入计划传入当前 edges，断开上游边应用至画布
  assert.match(nodeSrc, /edges:\s*state\.edges/);
  assert.match(nodeSrc, /removeEdgeIds:\s*plan\.removeEdgeIds/);
});
