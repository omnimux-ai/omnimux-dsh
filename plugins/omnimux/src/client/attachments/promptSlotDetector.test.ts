import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractPromptSlots,
  hasPromptSlots,
  replacePromptSlot,
  PROMPT_SLOT_REGEX,
} from './promptSlotDetector.ts';

test('extractPromptSlots: detects brackets with text and empty brackets []', () => {
  const text = '使用[评论来源或导出的评论数据]，分析[目标市场]中[产品/商品页面]的客户评论。';
  const slots = extractPromptSlots(text);

  assert.equal(slots.length, 3);
  assert.equal(slots[0].placeholder, '评论来源或导出的评论数据');
  assert.equal(slots[0].raw, '[评论来源或导出的评论数据]');
  assert.equal(slots[1].placeholder, '目标市场');
  assert.equal(slots[2].placeholder, '产品/商品页面');

  // 测试 [] 空占位符
  const emptySlotText = '测试 [] 空括号';
  const emptySlots = extractPromptSlots(emptySlotText);
  assert.equal(emptySlots.length, 1);
  assert.equal(emptySlots[0].placeholder, '');
  assert.equal(emptySlots[0].raw, '[]');
});

test('hasPromptSlots: identifies whether string has slot brackets', () => {
  assert.equal(hasPromptSlots('普通文字无括号'), false);
  assert.equal(hasPromptSlots('包含 [槽位] 文本'), true);
  assert.equal(hasPromptSlots('输入 [] 立即强化'), true);
});

test('replacePromptSlot: replaces target slot accurately while preserving brackets', () => {
  const text = '分析[商品名称]的卖点';
  const updated = replacePromptSlot(text, 0, '苹果 iPhone16');
  assert.equal(updated, '分析[苹果 iPhone16]的卖点');

  const alreadyWithBrackets = replacePromptSlot(text, 0, '[苹果 iPhone16]');
  assert.equal(alreadyWithBrackets, '分析[苹果 iPhone16]的卖点');
});
