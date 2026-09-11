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
  assert.equal(slots[0].protocol, 'text');
  assert.equal(slots[0].raw, '[评论来源或导出的评论数据]');
  assert.equal(slots[1].placeholder, '目标市场');
  assert.equal(slots[1].protocol, 'text');
  assert.equal(slots[2].placeholder, '产品/商品页面');
  assert.equal(slots[2].protocol, 'text');

  // 测试 [] 空占位符
  const emptySlotText = '测试 [] 空括号';
  const emptySlots = extractPromptSlots(emptySlotText);
  assert.equal(emptySlots.length, 1);
  assert.equal(emptySlots[0].placeholder, '');
  assert.equal(emptySlots[0].raw, '[]');
});

test('extractPromptSlots: parses file://, assets://, product://, url:// and {} protocol slots', () => {
  const text = '参考[file://商品图]与[assets://主角色]，绑定[product://主推耳机]、[products://数码相机]、{product:运动手环}和[url://参考视频]与{}';
  const slots = extractPromptSlots(text);

  assert.equal(slots.length, 7);
  // [file://商品图]
  assert.equal(slots[0].protocol, 'file');
  assert.equal(slots[0].placeholder, '商品图');
  assert.equal(slots[0].raw, '[file://商品图]');

  // [assets://主角色]
  assert.equal(slots[1].protocol, 'assets');
  assert.equal(slots[1].placeholder, '主角色');
  assert.equal(slots[1].raw, '[assets://主角色]');

  // [product://主推耳机]
  assert.equal(slots[2].protocol, 'product');
  assert.equal(slots[2].placeholder, '主推耳机');
  assert.equal(slots[2].raw, '[product://主推耳机]');

  // [products://数码相机]
  assert.equal(slots[3].protocol, 'product');
  assert.equal(slots[3].placeholder, '数码相机');
  assert.equal(slots[3].raw, '[products://数码相机]');

  // {product:运动手环}
  assert.equal(slots[4].protocol, 'product');
  assert.equal(slots[4].placeholder, '运动手环');
  assert.equal(slots[4].raw, '{product:运动手环}');

  // [url://参考视频]
  assert.equal(slots[5].protocol, 'url');
  assert.equal(slots[5].placeholder, '参考视频');
  assert.equal(slots[5].raw, '[url://参考视频]');

  // {} 默认文件上传
  assert.equal(slots[6].protocol, 'file');
  assert.equal(slots[6].placeholder, '选择文件');
  assert.equal(slots[6].raw, '{}');
});

test('extractPromptSlots: recognizes filled slot values and retains protocol', () => {
  const text = '参考[商品图: 主图.png]和[角色: 角色A]与[product://商品名称: 智能降噪耳机 X1]';
  const slots = extractPromptSlots(text);

  assert.equal(slots.length, 3);
  assert.equal(slots[0].placeholder, '商品图');
  assert.equal(slots[0].selectedValue, '主图.png');
  assert.equal(slots[0].protocol, 'file');

  assert.equal(slots[1].placeholder, '角色');
  assert.equal(slots[1].selectedValue, '角色A');

  assert.equal(slots[2].placeholder, '商品名称');
  assert.equal(slots[2].selectedValue, '智能降噪耳机 X1');
  assert.equal(slots[2].protocol, 'product');
});

test('hasPromptSlots: identifies whether string has slot brackets or braces', () => {
  assert.equal(hasPromptSlots('普通文字无括号'), false);
  assert.equal(hasPromptSlots('包含 [槽位] 文本'), true);
  assert.equal(hasPromptSlots('输入 [] 立即强化'), true);
  assert.equal(hasPromptSlots('输入 {} 文件槽位'), true);
  assert.equal(hasPromptSlots('输入 [file://图]'), true);
});

test('replacePromptSlot: replaces target slot accurately while preserving brackets', () => {
  const text = '分析[商品名称]的卖点';
  const updated = replacePromptSlot(text, 0, '苹果 iPhone16');
  assert.equal(updated, '分析[苹果 iPhone16]的卖点');

  const alreadyWithBrackets = replacePromptSlot(text, 0, '[苹果 iPhone16]');
  assert.equal(alreadyWithBrackets, '分析[苹果 iPhone16]的卖点');
});
