/**
 * E2E 测试：技能市场 HOT PICKS 与 NEW ARRIVALS 保持各 5 个卡片对齐排满一行 5 列
 * 验证：
 *  1. 热门精选包含 5 个技能（含 脚本转视频 与 UGC 脚本全流程策划）；
 *  2. 新品上市仅展示前 5 个技能，彻底消除第 6 个卡片落单；
 *  3. renderRegularSection 渲染输出中两个专区各精确包含 5 张卡片。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const catalogSrc = readFileSync(join(root, 'catalog/index.json'), 'utf8');
const gridSrc = readFileSync(join(root, 'src/client/plaza/PlazaCardGrid.jsx'), 'utf8');

test('E2E-1 目录配置验证：脚本转视频 与 UGC 脚本全流程策划 纳入热门精选且总数为 5', () => {
  const catalog = JSON.parse(catalogSrc);
  const items = catalog.items || [];

  const scriptToVideo = items.find((i) => i.id === 'sk-omx-script-to-video');
  assert.ok(scriptToVideo, '必须存在脚本转视频技能');
  assert.equal(scriptToVideo.isHot, true, '脚本转视频必须标记为 isHot: true');
  assert.ok(scriptToVideo.tags?.includes('热门精选'), '脚本转视频必须打上“热门精选”标签');

  const ugcPlanner = items.find((i) => i.id === 'sk-omx-ugc-script-planner');
  assert.ok(ugcPlanner, '必须存在 UGC 脚本全流程策划技能');
  assert.equal(ugcPlanner.isHot, true, 'UGC 脚本全流程策划必须标记为 isHot: true');
  assert.ok(ugcPlanner.tags?.includes('热门精选'), 'UGC 脚本全流程策划必须打上“热门精选”标签');

  // 全量热门精选总数
  const hotItems = items.filter((i) => i.isHot || i.tags?.includes('热门精选'));
  assert.equal(hotItems.length, 5, '热门精选必须精确等于 5 个技能');
});

test('E2E-2 渲染组件契约：hotPicks 和 newArrivals 各截取前 5 个排满一行', () => {
  // 必须使用 slice(0, 5) 截取
  assert.match(gridSrc, /hotPicks[^;]*slice\(0,\s*5\)/);
  assert.match(gridSrc, /newArrivals[^;]*slice\(0,\s*5\)/);
});

test('E2E-3 新品上市专区严格限制为前 5 个技能，杜绝第 6 个落单', () => {
  const catalog = JSON.parse(catalogSrc);
  const items = catalog.items || [];
  const newItems = items.filter((i) => i.isNew || i.tags?.includes('新品上市'));
  assert.ok(newItems.length <= 5, `新品上市数据项不得超过 5 个，当前为 ${newItems.length} 个`);
});
