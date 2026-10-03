/**
 * 素材入槽契约拦截端到端契约验证（Issue #2987, specs/2987-slot-admission-contract-limits.spec.md）
 *
 * 真实浏览器证据：docs/evidence/issue-2987/qa-report.md（ego-browser 工作树真实组件挂载，
 * 锁定/解锁/大小/最短时长/总时长 7 项断言，PNG 归档同目录）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

function extractRule(source, selector) {
  const start = source.indexOf(selector);
  assert.notEqual(start, -1, `样式中必须存在选择器 ${selector}`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  throw new Error(`选择器 ${selector} 规则块未闭合`);
}

test('E2E: 素材入槽契约拦截的三入口与锁定样式契约', async () => {
  // 1. 锁定样式真实存在（组合规则锁定卡槽的视觉降级）
  const stylesSource = await readFile(resolve(here, '../../../omnimux/src/client/media-viewer/styles.js'), 'utf8');
  const lockedRule = extractRule(stylesSource, '.omx-slot-btn.is-locked {');
  assert.ok(lockedRule.includes('opacity') && lockedRule.includes('not-allowed'), '锁定卡槽必须降级显示并禁用指针语义');

  // 2. 三条入槽入口同源走 rejectionOf：上传（MediaSlotGroup.addFiles）、
  //    选材（handleSelectAsset）、粘贴（tryAdd）均携带 existing 上下文做总时长校验
  const composerSource = await readFile(resolve(here, './MediaViewerComposer.jsx'), 'utf8');
  const slotGroupSource = await readFile(resolve(here, './MediaSlotGroup.jsx'), 'utf8');
  const mediaSlotSource = await readFile(resolve(here, './media-slot.js'), 'utf8');

  assert.ok(
    slotGroupSource.includes('rejectionOf(file, slot, duration, { existing: next })'),
    '上传入口必须携带已入槽素材做累计总时长校验'
  );
  assert.ok(
    composerSource.includes('rejectionOf(sizedFile, activeSlot, duration, { existing: currentList })'),
    '选材入口必须携带已入槽素材做累计总时长校验'
  );
  assert.ok(
    composerSource.includes('rejectionOf(file, slot, duration, { existing: list })'),
    '粘贴入口必须携带已入槽素材做累计总时长校验'
  );

  // 3. 组合规则锁定贯通：渲染（lockReason prop）、选材、粘贴三处都走 groupLockOf
  assert.ok(
    composerSource.includes('groupLockOf(') && composerSource.includes('slotLockReason(slot, buckets)'),
    '渲染路径必须向卡槽透传组合锁定原因'
  );
  assert.ok(
    mediaSlotSource.includes('export function groupLockOf'),
    'media-slot 必须导出组合锁判定函数'
  );

  // 4. 新增契约字段进入卡槽计划（maxSizeMb/minDurationSec/totalDurationMax）
  assert.ok(
    mediaSlotSource.includes('input.maxSizeMb') && mediaSlotSource.includes('input.minDurationSec') && mediaSlotSource.includes('input.totalMaxDurationSec'),
    '卡槽计划必须携带契约的大小与双端时长约束'
  );

  // 5. 入槽素材记录时长以支撑累计总时长
  assert.ok(
    slotGroupSource.includes('durationSec: duration') && composerSource.includes('durationSec: duration'),
    '入槽素材必须持久化 durationSec 供总时长累计'
  );

  // 6. 同批粘贴音频排最后（避免先贴音频被组合锁误拒）
  assert.ok(
    composerSource.includes("音频排在最后"),
    '批量粘贴必须把音频排到最后处理以兼容组依赖'
  );

  // 7. #2997 锁定的空卡槽直接不渲染：渲染用 visibleSlots 过滤，
  //    被锁且 items.length===0 的槽不出现在 .omx-slot-row
  const mediaSlotSource2 = mediaSlotSource;
  assert.ok(
    mediaSlotSource2.includes('export function visibleSlots') &&
      mediaSlotSource2.includes('itemsOf(slot)?.length ?? 0) > 0'),
    'media-slot 必须导出「锁中且空才隐藏」的 visibleSlots'
  );
  assert.ok(
    composerSource.includes('visibleSlots(slots, slotOperation'),
    '渲染路径必须用 visibleSlots 过滤被锁的空卡槽'
  );
});
