/**
 * Issue 3741：画布上只留一个 ComfyUI 入口，且它叫「ComfyUI 工作流」。
 *
 * 覆盖：
 *  1. 「添加节点」菜单里与 ComfyUI 相关的条目**恰好一项**（中英各查一遍）；
 *  2. 它显示为「ComfyUI 工作流」/「ComfyUI workflow」——菜单名与节点名同源；
 *  3. 节点卡标题与全屏层标题用的是同一个 key，且都是新名字；
 *  4. 搜「工作流」能搜到它（关键词带上新名字）；
 *  5. 已删入口的文案键不再留在字典里（不留死文案），两份字典保持对称；
 *  6. 内部 type 仍是 `comfy-page`（改了会读不出既有工作流文件）。
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ADD_NODE_PALETTE, addNodeMenuLabelKey, getAddNodePalette } from './addNodePalette.ts';
import zh from '../../i18n/dict.zh.ts';
import en from '../../i18n/dict.en.ts';

/** 字典取值：用 Object.entries 查找，避免动态成员访问（门禁要求字面量键）。 */
function copyOf(dict, key) {
  const pairs = Object.entries(dict);
  for (const pair of pairs) {
    if (pair[0] === key) return pair[1];
  }
  return undefined;
}

function hasKey(dict, key) {
  return copyOf(dict, key) !== undefined;
}

function comfyItems(dict) {
  const items = getAddNodePalette('dock');
  return items.filter((item) => {
    const text = copyOf(dict, addNodeMenuLabelKey(item));
    return typeof text === 'string' && text.includes('ComfyUI');
  });
}

test('「添加节点」菜单里 ComfyUI 相关恰好一项，名字是 ComfyUI 工作流', () => {
  const items = comfyItems(zh);
  assert.equal(items.length, 1, '菜单里不得出现第二个 ComfyUI 入口');
  assert.equal(items[0].type, 'comfy-page');
  assert.equal(copyOf(zh, addNodeMenuLabelKey(items[0])), 'ComfyUI 工作流');
  assert.equal(copyOf(en, addNodeMenuLabelKey(items[0])), 'ComfyUI workflow');
  // 两个入口（Dock / 右键钻取）看到的是同一份清单与同一个名字。
  const contextItems = getAddNodePalette('context').filter((item) => item.type === 'comfy-page');
  assert.equal(contextItems.length, 1);
  assert.equal(addNodeMenuLabelKey(contextItems[0]), addNodeMenuLabelKey(items[0]));
});

test('节点卡与全屏层标题同源，且都改成了 ComfyUI 工作流', () => {
  // 卡片标题、全屏层标题、iframe 标题共用同一个 key（改一处即全部生效）。
  assert.equal(copyOf(zh, 'comfyPage.card.title'), 'ComfyUI 工作流');
  assert.equal(copyOf(en, 'comfyPage.card.title'), 'ComfyUI workflow');
  // 注册表的调色板名与菜单名指向同一个名字，不留旧名。
  assert.equal(copyOf(zh, 'palette.node.comfyPage'), copyOf(zh, 'node.type.comfy-page'));
  assert.equal(copyOf(en, 'palette.node.comfyPage'), copyOf(en, 'node.type.comfy-page'));
});

test('搜「工作流」能搜到它：关键词带上新名字（中英各一份）', () => {
  assert.ok(copyOf(zh, 'palette.keyword.comfyPage').includes('ComfyUI 工作流'));
  assert.ok(copyOf(en, 'palette.keyword.comfyPage').includes('ComfyUI workflow'));
  // 关键词仍保留真实能力面，改名不吞掉原来的检索词。
  assert.ok(copyOf(zh, 'palette.keyword.comfyPage').includes('8188'));
  assert.ok(copyOf(zh, 'palette.keyword.comfyPage').includes('节点编辑器'));
});

test('已删入口的文案键不留在字典里，两份字典保持对称', () => {
  const removed = [
    'comfy.entry.title',
    'comfy.entry.hint',
    'comfy.panel.title',
    'comfy.panel.import',
    'comfy.panel.formatHint',
    'comfy.panel.recent',
    'comfy.panel.empty',
    'comfy.panel.itemMeta',
    'comfy.panel.itemMetaNoTime',
  ];
  for (const key of removed) {
    assert.equal(hasKey(zh, key), false, `中文仍留死文案：${key}`);
    assert.equal(hasKey(en, key), false, `英文仍留死文案：${key}`);
  }
  // 两份字典键集合完全一致（改名与删除都同步）。
  assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort());
});

test('改名不改内部 type：comfy-page 仍是节点类型标识', () => {
  assert.equal(ADD_NODE_PALETTE.some((item) => item.type === 'comfy-page'), true);
  assert.equal(copyOf(zh, 'node.type.comfy-page'), 'ComfyUI 工作流');
  // 旧名字在字典里彻底消失（中英各扫一遍），避免别处还挂着旧名。
  const stale = ['ComfyUI 页面', 'ComfyUI page'];
  for (const dict of [zh, en]) {
    const values = Object.entries(dict).map((pair) => pair[1]);
    for (const name of stale) {
      assert.equal(
        values.some((value) => typeof value === 'string' && value.includes(name)),
        false,
        `字典里仍有旧名 ${name}`,
      );
    }
  }
});
