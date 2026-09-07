/**
 * Issue #755: 优化图片节点素材卡槽交互、移除参考图文字、支持悬停上方替换素材按钮与自适应预览比例 专项验收测试
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import zhDict from '../../../../i18n/dict.zh.ts';
import enDict from '../../../../i18n/dict.en.ts';

const here = dirname(fileURLToPath(import.meta.url));
const configPanelSrc = readFileSync(join(here, 'index.tsx'), 'utf8');
const slotWellsSrc = readFileSync(join(here, 'SlotWells/SlotWells.tsx'), 'utf8');
const slotWellsTypesSrc = readFileSync(join(here, 'SlotWells/types.ts'), 'utf8');
const themeCss = readFileSync(join(here, '../../../../theme/components.css'), 'utf8');

describe('Issue #755 Acceptance: 素材卡槽交互优化与视觉规范验收', () => {
  it('TC-755-01: 中英双语字典正确包含替换素材文案', () => {
    assert.equal(zhDict['node.replaceMaterial'], '替换素材', '中文应为 替换素材');
    assert.equal(enDict['node.replaceMaterial'], 'Replace asset', '英文应为 Replace asset');
  });

  it('TC-755-02: SlotWells.tsx 彻底移除文字遮挡标签，媒体区纯净无盖字', () => {
    // 确保不再渲染任何遮盖在缩略图上的文字浮层
    assert.doesNotMatch(slotWellsSrc, /<span className="wf-slot-well__label">/);
    assert.doesNotMatch(slotWellsSrc, /wf-slot-well__label/);
  });

  it('TC-755-03: SlotWells.tsx 包含卡槽外侧正上方【替换素材】胶囊按钮并正确触发 onPickSlot', () => {
    assert.match(slotWellsSrc, /wf-slot-well__replace-pill nodrag/);
    assert.match(slotWellsSrc, /title=\{t\('node\.replaceMaterial'\)\}/);
    assert.match(slotWellsSrc, /aria-label=\{t\('node\.replaceMaterial'\)\}/);
    assert.match(slotWellsSrc, /onPickSlot\(pickRequest\(spec\)\)/);
  });

  it('TC-755-04: SlotWellsProps 支持 onInsertToken，且卡槽本体点击分流正确', () => {
    assert.match(slotWellsTypesSrc, /onInsertToken\?:\s*\(item:\s*\{[\s\S]*?sourceNodeId:\s*string;/);
    assert.match(slotWellsSrc, /onInsertToken\(/);
    assert.match(slotWellsSrc, /sourceNodeId:\s*model\.upstream\?\.nodeId\s*\?\?\s*occupant\.edgeId/);
  });

  it('TC-755-05: ConfigPanel/index.tsx 成功向 SlotWells 传递 onInsertToken 回调', () => {
    assert.match(configPanelSrc, /<SlotWells[\s\S]*?onInsertToken=\{handleInsertToken\}/);
  });

  it('TC-755-06: WellThumb 支持真实比例预览（监听 onLoad 获取比例并支持 aspectRatio）', () => {
    assert.match(slotWellsSrc, /aspectRatio/);
    assert.match(slotWellsSrc, /onLoad=\{/);
    assert.match(slotWellsSrc, /naturalWidth/);
    assert.match(slotWellsSrc, /naturalHeight/);
  });

  it('TC-755-07: components.css 视觉样式规范核查', () => {
    // 1. .wf-slot-well 设为 overflow: visible 确保上方胶囊不被裁切
    assert.match(themeCss, /\.wf-slot-well\s*\{[\s\S]*?overflow:\s*visible;/);
    // 2. 已填充卡槽自适应宽度与固定高度 44px
    assert.match(themeCss, /\.wf-slot-well--filled\s*\{[\s\S]*?height:\s*44px;/);
    assert.match(themeCss, /\.wf-slot-well--filled\s*\{[\s\S]*?width:\s*auto;/);
    assert.match(themeCss, /\.wf-slot-well--filled\s*\{[\s\S]*?min-width:\s*36px;/);
    assert.match(themeCss, /\.wf-slot-well--filled\s*\{[\s\S]*?max-width:\s*96px;/);
    assert.match(themeCss, /\.wf-slot-well--filled\s*\{[\s\S]*?border-radius:\s*10px;/);
    // 3. 媒体元素自适应宽高
    assert.match(themeCss, /\.wf-slot-well__media\s*\{[\s\S]*?height:\s*44px;/);
    assert.match(themeCss, /\.wf-slot-well__media\s*\{[\s\S]*?width:\s*auto;/);
    assert.match(themeCss, /\.wf-slot-well__media\s*\{[\s\S]*?min-width:\s*36px;/);
    assert.match(themeCss, /\.wf-slot-well__media\s*\{[\s\S]*?max-width:\s*96px;/);
    assert.match(themeCss, /\.wf-slot-well__media\s*\{[\s\S]*?object-fit:\s*cover;/);
    // 4. 外侧上方【替换素材】胶囊样式
    assert.match(themeCss, /\.wf-slot-well__replace-pill\s*\{[\s\S]*?position:\s*absolute;/);
    assert.match(themeCss, /\.wf-slot-well__replace-pill\s*\{[\s\S]*?bottom:\s*calc\(100%\s*\+\s*6px\);/);
    assert.match(themeCss, /\.wf-slot-well__replace-pill\s*\{[\s\S]*?border-radius:\s*9999px;/);
    assert.match(themeCss, /\.wf-slot-well:hover\s+\.wf-slot-well__replace-pill/);
    // 5. 彻底隐藏旧标签
    assert.match(themeCss, /\.wf-slot-well__label\s*\{[\s\S]*?display:\s*none\s*!important;/);
    // 6. 视频卡槽自适应宽高与圆角
    assert.match(themeCss, /\.wf-slot-well__video-box\s*\{[\s\S]*?height:\s*44px;/);
    assert.match(themeCss, /\.wf-slot-well__video-box\s*\{[\s\S]*?min-width:\s*36px;/);
    assert.match(themeCss, /\.wf-slot-well__video-box\s*\{[\s\S]*?max-width:\s*96px;/);
  });

  it('TC-755-08: 交互分流与冒泡阻断严格核查（清除、替换、插入 Token、空态唤起）', () => {
    // 1. 【替换素材】胶囊按钮必须包含 event.stopPropagation()
    assert.match(
      slotWellsSrc,
      /<button[^>]*className="wf-slot-well__replace-pill nodrag"[^>]*onClick=\{\(event\)\s*=>\s*\{[\s\S]*?event\.stopPropagation\(\);[\s\S]*?onPickSlot\(pickRequest\(spec\)\);/
    );

    // 2. 【清除槽位】✕ 按钮必须包含 event.stopPropagation() 并调用 onClearOccupant
    assert.match(
      slotWellsSrc,
      /<button[^>]*className="wf-slot-well__clear nodrag"[^>]*onClick=\{\(event\)\s*=>\s*\{[\s\S]*?event\.stopPropagation\(\);[\s\S]*?onClearOccupant\(spec\.slot,\s*occupant\.edgeId\);/
    );

    // 3. 卡槽本体 handleWellClick 分流：已装填走 onInsertToken（若无则降级 onPickSlot），空态走 onPickSlot
    assert.match(slotWellsSrc, /const handleWellClick = \(\) => \{[\s\S]*?if \(occupant\) \{[\s\S]*?if \(onInsertToken\) \{[\s\S]*?\} else \{[\s\S]*?onPickSlot\(pickRequest\(spec\)\);[\s\S]*?\}[\s\S]*?\} else \{[\s\S]*?onPickSlot\(pickRequest\(spec\)\);/);

    // 4. 键盘无障碍支持（Enter 与空格调用 handleWellClick）
    assert.match(slotWellsSrc, /onKeyDown=\{\(event\) => \{[\s\S]*?\(event\.key === 'Enter' \|\| event\.key === ' '\)[\s\S]*?handleWellClick\(\);/);
  });
});
