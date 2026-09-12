/**
 * Issue #325: ConfigPanel 提示词原地展开，不再走全局 CustomModal。
 * Issue #330: 移除字数指示并收紧上下垂直间距。
 * Spacing pass: 8pt 栅格规范化 panel shell / prompt / 底栏内外边距。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const panelSrc = readFileSync(join(here, 'ConfigPanel/index.tsx'), 'utf8');
const cssSrc = readFileSync(join(here, '../../../theme/components.css'), 'utf8');
const zhSrc = readFileSync(join(here, '../../../i18n/dict.zh.ts'), 'utf8');
const enSrc = readFileSync(join(here, '../../../i18n/dict.en.ts'), 'utf8');

test('ConfigPanel 已彻底移除 CustomModal 与 expandedModal 弹窗', () => {
  assert.doesNotMatch(panelSrc, /CustomModal/);
  assert.doesNotMatch(panelSrc, /expandedModal/);
  assert.doesNotMatch(panelSrc, /setExpandedModal/);
  assert.doesNotMatch(panelSrc, /wf-config-panel__modal-textarea/);
  assert.doesNotMatch(cssSrc, /\.wf-config-panel__modal-textarea/);
});

test('ConfigPanel 原地展开切换：isExpanded / Minimize2 / Maximize2 / 动态 rows', () => {
  assert.match(panelSrc, /const \[isExpanded, setIsExpanded\] = useState\(false\)/);
  assert.match(panelSrc, /setIsExpanded\(\(prev\) => !prev\)/);
  assert.match(panelSrc, /Minimize2/);
  assert.match(panelSrc, /Maximize2/);
  assert.match(panelSrc, /isExpanded \? <Minimize2 size=\{13\} \/> : <Maximize2 size=\{13\} \/>/);
  assert.match(panelSrc, /rows=\{isExpanded \? 8 : 2\}/);
  assert.match(panelSrc, /wf-config-panel__prompt-input--expanded/);
  assert.match(panelSrc, /t\('panel\.collapse'\)/);
  assert.match(panelSrc, /t\('panel\.expand'\)/);
});

test('展开态仍保留底部参数栏与生成按钮，不拆成第二套编辑面', () => {
  assert.match(panelSrc, /wf-config-panel__bottom-bar/);
  assert.match(panelSrc, /<GenerateButton/);
  assert.match(panelSrc, /<CustomSelect/);
  // T03：旧 ref-slots-group 简易缩略图行已由 SlotWells 取代
  assert.match(panelSrc, /<SlotWells/);
  assert.doesNotMatch(panelSrc, /wf-config-panel__ref-slots-group/);
  assert.equal((panelSrc.match(/<textarea/g) || []).length, 1);
});

test('Issue #330: 移除通用字数统计；Issue #735/#746 仅音频（非 ASR）字数闸门', () => {
  // #735 T03：音频朗读正文字数闸门（超限红色高亮并阻断生成）；
  // #746：右下角唯一字符统计由 PromptTokenEditor 内置 meta-bar 承载，
  // 外部 wf-config-panel__char-counter 已移除，杜绝 0/0/10000 双层重叠。
  assert.doesNotMatch(panelSrc, /wf-config-panel__char-counter/);
  assert.match(panelSrc, /audioPromptGate \?/);
  assert.match(panelSrc, /materialType === 'audio' && !isAsrTool \? resolveAudioPromptGate/);
  assert.match(panelSrc, /maxLength=\{audioPromptGate \? AUDIO_PROMPT_MAX_CHARS : undefined\}/);
  assert.match(panelSrc, /countOverride=\{audioPromptGate \? audioPromptGate\.count : undefined\}/);
  // #330 语义保持：不再有通用 maxLimit 计算与按 .length 的计数
  assert.doesNotMatch(panelSrc, /maxLimit/);
  assert.doesNotMatch(panelSrc, /\(prompt \|\| ''\)\.length/);
  assert.doesNotMatch(cssSrc, /\.wf-config-panel__char-counter/);
  assert.doesNotMatch(cssSrc, /padding:\s*0\s+0\s+20px\s+0/);
});

test('prompt 输入框展开样式与 8pt 内外间距规范', () => {
  assert.match(cssSrc, /\.wf-config-panel__prompt-input--expanded \{[\s\S]*?min-height:\s*160px/);
  assert.match(cssSrc, /\.wf-config-panel__prompt-input \{[\s\S]*?min-height:\s*40px/);
  assert.match(cssSrc, /\.wf-config-panel__prompt-input \{[\s\S]*?transition:\s*min-height/);
  assert.match(cssSrc, /\.wf-config-panel__expand-btn \{[\s\S]*?width:\s*32px/);
  assert.match(cssSrc, /\.wf-config-panel__expand-btn \{[\s\S]*?height:\s*32px/);
  assert.match(cssSrc, /\.wf-panel-shell__card \{[\s\S]*?padding:\s*12px 14px/);
  assert.match(cssSrc, /\.wf-config-panel \{[\s\S]*?gap:\s*8px/);
  assert.match(cssSrc, /\.wf-config-panel__prompt-header \{[\s\S]*?margin-bottom:\s*8px/);
  assert.match(cssSrc, /\.wf-config-panel__prompt-input \{[\s\S]*?padding:\s*0;/);
  assert.match(cssSrc, /\.wf-config-panel__prompt-container \{[\s\S]*?padding:\s*0;/);
  assert.match(cssSrc, /\.wf-config-panel__bottom-bar \{[\s\S]*?padding:\s*0;/);
  // T03：卡槽 32px 基准（含 strip 末尾虚线 + 槽位）
  assert.match(cssSrc, /\.wf-slot-well \{[\s\S]*?width:\s*32px/);
  assert.match(cssSrc, /\.wf-slot-well \{[\s\S]*?height:\s*32px/);
  // 宿主对任意 class 含 add 的按钮注入 !important 规则（height/border/border-radius），
  // 提高特异性无效 → 画布按钮类名一律避开 add 子串。以下类名一旦回归，按钮会被压成 28×28。
  const tableCss = readFileSync(join(here, '../../../theme/table-node.css'), 'utf8');
  for (const banned of ['wf-slot-well--add', 'wf-grid-add-row-btn', 'wf-grid-attachment-add-btn']) {
    assert.ok(!cssSrc.includes(banned), `${banned} 会命中宿主 button[class*="add"] 的 !important 规则`);
    assert.ok(!tableCss.includes(banned), `${banned} 会命中宿主 button[class*="add"] 的 !important 规则`);
  }
  // 未激活态虚线框（改名后不再需要 !important 对抗宿主）。
  assert.match(cssSrc, /button\.wf-slot-well\.wf-slot-well--append \{[\s\S]*?border:\s*1\.5px dashed/);
  assert.match(cssSrc, /button\.wf-slot-well\.wf-slot-well--append:hover \{[\s\S]*?border-style:\s*solid/);
});

test('展开 / 收起文案入典', () => {
  assert.match(zhSrc, /'panel\.expand': '展开'/);
  assert.match(zhSrc, /'panel\.collapse': '收起'/);
  assert.match(enSrc, /'panel\.expand': 'Expand'/);
  assert.match(enSrc, /'panel\.collapse': 'Collapse'/);
});

test('Feed-Slot 卡槽：SlotWells 驱动 + 卸装填不断边 + 无节点内静态错误条（T03/T05）', () => {
  // W2: incompatible models are hidden; typed reason only lives on the
  // GenerateButton title / disabledReason, never as a static error bar.
  assert.match(panelSrc, /wf-slot-well__clear|handleClearOccupant/);
  assert.match(panelSrc, /patchSlotBindings/);
  assert.match(panelSrc, /wf-model-empty|blockGenerate/);
  assert.doesNotMatch(panelSrc, /wf-config-panel__compat-error/);
  assert.doesNotMatch(panelSrc, /wf-compat-error/);
  assert.doesNotMatch(panelSrc, /isModelDegraded/);
  assert.doesNotMatch(panelSrc, /evaluateModelCompatibility/);
  // T05：禁用点击与模式切换走画板级通知
  assert.match(panelSrc, /canvasNoticeService\.publish/);
  assert.match(panelSrc, /submit_blocked_click/);
  assert.match(panelSrc, /mode_consumption_changed/);
});
