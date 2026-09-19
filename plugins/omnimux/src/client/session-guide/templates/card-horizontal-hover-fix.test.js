import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('卡片样式验证：横版 16:10 比例与滚动轨道上下防截断留白', () => {
  const stylesPath = path.resolve('plugins/omnimux/src/client/session-guide/styles.js');
  assert.ok(fs.existsSync(stylesPath));
  const code = fs.readFileSync(stylesPath, 'utf8');

  // 1. 验证技能卡片保持 16:10 横版与 240px 宽度，普通卡片升级为 9:16 竖版与 170px 宽度
  assert.ok(code.includes('aspect-ratio:16 / 10'), '技能卡片必须保持 16:10 横版比例');
  assert.ok(code.includes('flex:0 0 240px'), '技能卡片基准宽度必须为 240px');
  assert.ok(code.includes('aspect-ratio:9 / 16'), '普通短视频与应用卡片必须为 9:16 竖版比例');
  assert.ok(code.includes('flex:0 0 170px'), '普通卡片基准宽度必须为 170px');

  // 2. 验证滑动轨道包含 padding-top 缓冲，彻底防止顶部截断
  assert.ok(code.includes('padding-top:10px'), '滑动轨道必须具备 padding-top 缓冲');
  assert.ok(code.includes('margin-top:-10px'), '滑动轨道必须具备 margin-top 抵消');

  // 3. 验证悬停按钮具备专属深灰半透明毛玻璃底色与纯白文字
  assert.ok(
    code.includes('.omnimux-tpl-hover-action .omnimux-trending-recreate-btn'),
    '必须为悬停操作按钮单独定义高对比度规则'
  );
  assert.ok(
    code.includes('background:var(--dsw-alias-bg-mask-2)'),
    '按钮必须具备高级深色半透明毛玻璃背景'
  );

  // 4. 验证平铺网格视图最小列宽同步升级为 240px
  assert.ok(code.includes('minmax(240px, 1fr)'), '网格视图列宽必须对齐 240px');
});
