/**
 * Issue #3109 — `effectiveInputDisplay().unused`: ready inbound media that this generation
 * will not consume must be reported instead of silently disappearing.
 *
 * Boundaries pinned here:
 * - only ready media (image/video/audio) is reported; text has its own composition path;
 * - the standby pool is the user's explicit exclusion and is never reported;
 * - a consumable slot keeps the asset out of the list.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { effectiveInputDisplay } from './effectiveInputDisplay.ts';

const spec = (over = {}) => ({
  slot: 'prompt', role: 'prompt', type: 'text', min: 1, max: 1, labelKey: 'panel.slot.prompt', ...over,
});
const layout = (slots) => ({
  operationId: 'gate', preset: 'strip', slots, swap: false, addButton: true, implementationGaps: [], acceptsText: true,
});
const image = (edgeId, over = {}) => ({
  edgeId, sourceNodeId: `src-${edgeId}`, outputId: `out-${edgeId}`, type: 'image',
  availability: 'ready', ordinal: 0, url: `https://fixture.test/${edgeId}.png`, ...over,
});
const reasons = (feed, l, saved, standby = [], version) =>
  effectiveInputDisplay(l, feed, saved, [], [], standby, version).unused.map((item) => [item.occupant.edgeId, item.reasonCode]);

test('#3109 已就绪图片遇到没有任何图片槽位的生成方式 → 报 no_matching_slot', () => {
  assert.deepEqual(reasons([image('e1')], layout([spec({})]), {}, [], 1), [['e1', 'no_matching_slot']]);
});

test('#3109 同一份图片在 operation 声明图片槽位时被装填，不再出现在未使用列表', () => {
  const l = layout([spec({}), spec({ slot: 'reference_image', role: 'reference', type: 'image', min: 0, max: 1 })]);
  const display = effectiveInputDisplay(l, [image('e1')], undefined, [], [], [], 1);
  assert.equal(display.bindings.reference_image?.length, 1, '可消费素材必须自动装填');
  assert.deepEqual(display.unused, []);
});

test('#3109 槽位已满的第二个素材 → 报 slot_capacity，已装填的那个不进列表', () => {
  const l = layout([spec({}), spec({ slot: 'reference_image', role: 'reference', type: 'image', min: 0, max: 1 })]);
  const saved = { reference_image: [{ edgeId: 'e1', sourceNodeId: 'src-e1', outputId: 'out-e1', pinned: true }] };
  assert.deepEqual(reasons([image('e1'), image('e2')], l, saved, [], 1), [['e2', 'slot_capacity']]);
});

test('#3109 待命池是用户主动排除，不得再报未使用', () => {
  assert.deepEqual(reasons([image('e1')], layout([spec({})]), {}, ['e1'], 1), []);
});

test('#3109 未就绪来源与文本供给不属于未使用列表（各自有独立呈现路径）', () => {
  const waiting = image('e1', { availability: 'waiting', url: undefined });
  const text = { edgeId: 'e2', sourceNodeId: 'src-e2', type: 'text', availability: 'ready', ordinal: 1, textContent: 'A' };
  assert.deepEqual(reasons([waiting, text], layout([spec({})]), {}, [], 1), []);
});

test('#3109 legacy 节点同样上报未使用供给（不因新旧绑定版本而静默）', () => {
  assert.deepEqual(reasons([image('e1')], layout([spec({})])), [['e1', 'no_matching_slot']]);
});
