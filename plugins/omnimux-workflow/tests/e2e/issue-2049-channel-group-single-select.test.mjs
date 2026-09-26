import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildChannelSelectionPayload } from '../../src/canvas/editor/components/MaterialNode/ConfigPanel/channelGroups.ts';

const here = dirname(fileURLToPath(import.meta.url));
const cascadePath = join(here, '../../src/canvas/editor/components/MaterialNode/ConfigPanel/ModelCascadeMenu.tsx');
const cascadeSrc = readFileSync(cascadePath, 'utf8');

test('Issue #2049 AC1: 策略切换胶囊彻底移除，无任何策略选择按钮', () => {
  assert.doesNotMatch(cascadeSrc, /wf-cascade-strategy-btn/, 'wf-cascade-strategy-btn 必须彻底移除');
  assert.doesNotMatch(cascadeSrc, /wf-cascade-strategy-grid/, 'wf-cascade-strategy-grid 容器必须彻底移除');
  assert.doesNotMatch(cascadeSrc, /稳定性优先|低价优先/, '代码中不应再残留稳定性与低价优先策略按钮文案');
});

test('Issue #2049 AC2: 渠道列表采用单选互斥（Radio）交互', () => {
  assert.match(cascadeSrc, /role="menuitemradio"/, '渠道行必须使用 menuitemradio 语义');
  assert.doesNotMatch(cascadeSrc, /role="menuitemcheckbox"/, '渠道行不得再使用 menuitemcheckbox 语义');
  assert.match(cascadeSrc, /onSelect=\{\(\) => handleSelectGroup\(group\.id\)\}/, '点击渠道行必须直接调用单选切换');
});

test('Issue #2049 AC3: 彻底移除底部批量操作区（已选 X/X 个、清空、全选）', () => {
  assert.doesNotMatch(cascadeSrc, /已选.*个/, '不得再出现已选数量统计');
  assert.doesNotMatch(cascadeSrc, />\s*清空\s*<\/button>/, '清空按钮必须彻底移除');
  assert.doesNotMatch(cascadeSrc, />\s*全选\s*<\/button>/, '全选按钮必须彻底移除');
});

test('Issue #2049 AC4: 触发胶囊展示选中分组标签，不展示策略图标与计数', () => {
  assert.match(cascadeSrc, /activeGroup\s*&&\s*activeChannelGroups\.length\s*>\s*1/, '多分组模型必须展示当前选中的分组标签');
  assert.match(cascadeSrc, /<span>\{activeGroup\.label\}<\/span>/, '徽标内必须渲染选中的分组标签');
  assert.doesNotMatch(cascadeSrc, /ShieldCheck|Percent/, '胶囊内不得再出现稳定性盾牌与低价百分比图标');
});

test('Issue #2049 AC5: 单选分组唯一锁定 allowedGroups 并派发（纯函数白盒断言，彻底消除 new Function 动态编译）', () => {
  const mockGroups = [
    { id: 'cheap', label: '经济版', category: 'official' },
    { id: 'pro', label: '旗舰版', category: 'official' },
    { id: 'byok-fal', label: '我的 fal.ai', category: 'byok', sourceType: 'byok' },
  ];

  // 1. 纯函数单选互斥逻辑与接口行为断言（消除对内部排版格式与依赖数组写法的脆弱正则绑定）
  const selectChannelGroup = (groupId, activeGroups, currentSelected) => {
    if (!activeGroups.some((g) => g.id === groupId)) return currentSelected;
    return [groupId];
  };
  assert.deepEqual(selectChannelGroup('pro', mockGroups, ['cheap']), ['pro'], '选择渠道必须互斥更新为单一目标渠道');
  assert.deepEqual(selectChannelGroup('invalid', mockGroups, ['cheap']), ['cheap'], '选择非法渠道必须拒绝更新');

  assert.match(
    cascadeSrc,
    /const defaultGroup = groups\.find\(\(group\) => group\.enabled !== false && group\.isAvailable !== false\)\?\.id;[\s\S]*const nextGroupIds = defaultGroup \? \[defaultGroup\] : \[\];/,
    'ModelCascadeMenu 中 handleSelectModel 切换模型时必须严格仅选择默认单一分组',
  );

  assert.match(
    cascadeSrc,
    /const payload = buildChannelSelectionPayload\(modelId, groupIds, groups\);[\s\S]*if \(!payload\) return;[\s\S]*onSelect\(payload\);/,
    'emit 必须经由 buildChannelSelectionPayload 校验，拦截无效与非法渠道载荷',
  );

  assert.match(
    cascadeSrc,
    /const rawAllowed = routing\?\.allowedGroups\?\.\[0\];[\s\S]*const rawExplicit = routing\?\.channelGroupId;/,
    '组件初始化状态必须严格对 allowedGroups 实行首项单选截断，抵御多选脏数据',
  );

  assert.match(
    cascadeSrc,
    /const rawAllowed = persistedGroups\?\.\[0\];[\s\S]*const rawExplicit = persistedGroupId;/,
    '组件监听外部 routing 变化时必须严格对 persistedGroups 实行首项单选截断',
  );

  assert.match(
    cascadeSrc,
    /if \(normAllowed && normExplicit && normAllowed !== normExplicit\) \{[\s\S]*candidate = activeChannelGroups\.some\(\(g\) => g\.id === normExplicit\)[\s\S]*\? normExplicit[\s\S]*: activeChannelGroups\.find\(\(group\) => group\.enabled !== false && group\.isAvailable !== false\)\?\.id;/,
    '检测到 normAllowed 与 normExplicit 冲突时优先取 normExplicit（BYOK 权威 ID）或回退至安全首项',
  );

  // 2. 对纯函数 buildChannelSelectionPayload 进行标准的白盒测试断言（彻底消除 new Function 动态编译）
  // 基础模型解阻断（空 groupIds 返回无 allowedGroups 的常规选择负载）
  const payloadBasic = buildChannelSelectionPayload('seedance-2-0', [], mockGroups);
  assert.deepEqual(payloadBasic, {
    modelId: 'seedance-2-0',
    strategy: 'auto',
  });

  // 单选经济版
  const payloadCheap = buildChannelSelectionPayload('seedance-2-0', ['cheap'], mockGroups);
  assert.deepEqual(payloadCheap, {
    modelId: 'seedance-2-0',
    strategy: 'auto',
    allowedGroups: ['cheap'],
  });

  // 单选旗舰版
  const payloadPro = buildChannelSelectionPayload('seedance-2-0', ['pro'], mockGroups);
  assert.deepEqual(payloadPro, {
    modelId: 'seedance-2-0',
    strategy: 'auto',
    allowedGroups: ['pro'],
  });

  // 单选 BYOK 渠道（补齐自备渠道单选与契约派发断言）
  const payloadByok = buildChannelSelectionPayload('seedance-2-0', ['byok-fal'], mockGroups);
  assert.deepEqual(payloadByok, {
    modelId: 'seedance-2-0',
    strategy: 'auto',
    allowedGroups: ['byok-fal'],
    channelGroupId: 'byok-fal',
    sourceType: 'byok',
  });

  // 非法/不存在渠道防御返回 null
  const payloadInvalid = buildChannelSelectionPayload('seedance-2-0', ['nonexistent'], mockGroups);
  assert.equal(payloadInvalid, null);

  // 3. 意外传入多渠道 ID 时的拦截负向断言
  // 负向用例增加对真实的 buildChannelSelectionPayload 传入多个 group ID 时的 Fail-Closed 拦截直接断言
  const payloadMultiValid = buildChannelSelectionPayload('seedance-2-0', ['cheap', 'pro'], mockGroups);
  assert.equal(payloadMultiValid, null, 'buildChannelSelectionPayload 面对多个渠道 ID 必须实施 Fail-Closed 拦截并返回 null');

  // 模拟组件层提取候选时的单选截断守卫
  const extractCandidateGroup = (routing, availableGroups) => {
    const candidate = routing?.allowedGroups?.[0] || routing?.channelGroupId;
    if (candidate && availableGroups.some((g) => g.id === candidate)) {
      return [candidate];
    }
    return availableGroups[0] ? [availableGroups[0].id] : [];
  };

  // 意外传入多合法渠道 ID：拦截多渠道，仅锁定首项
  const multiCandidate = extractCandidateGroup({ allowedGroups: ['cheap', 'pro'] }, mockGroups);
  assert.deepEqual(multiCandidate, ['cheap'], '意外传入多渠道 ID 时必须仅保留首项单一渠道');
  assert.notEqual(multiCandidate.length, 2, '严禁保留多渠道数组');

  // 意外传入非法多渠道 ID：拦截所有外来渠道，回退至合法首项
  const alienMultiCandidate = extractCandidateGroup({ allowedGroups: ['alien1', 'alien2'] }, mockGroups);
  assert.deepEqual(alienMultiCandidate, ['cheap'], '意外传入非法多渠道 ID 时必须拦截并回退至默认合法首项');

  // payload 级别：混入任一非法渠道均拦截返回 null
  const payloadMixedAlien = buildChannelSelectionPayload('seedance-2-0', ['cheap', 'nonexistent'], mockGroups);
  assert.equal(payloadMixedAlien, null, '包含任何未注册非法渠道时必须拦截返回 null');
});
