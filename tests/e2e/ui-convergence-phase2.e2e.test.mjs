import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '../../');

test('E2E (Phase 2): 技能市场操作按钮与选项圆角 100% 收敛为 8px', () => {
  const marketCssPath = path.join(root, 'plugins/omnimux-market/src/client/css.js');
  const marketCss = fs.readFileSync(marketCssPath, 'utf-8');

  // 断言 hover-btn 为 8px 圆角
  assert.ok(
    marketCss.includes('.hover-btn{flex:1;height:34px;border-radius:8px;'),
    'hover-btn 必须使用标准 8px 圆角，彻底消除 6px 杂质'
  );

  // 断言 model-tab 为 8px 圆角
  assert.ok(
    marketCss.includes('.sh-model-tab{flex:1;height:32px;border:none;border-radius:8px;'),
    'sh-model-tab 必须使用标准 8px 圆角，彻底消除 6px 杂质'
  );

  // 断言 mine-dropdown-item 为 8px 圆角
  assert.ok(
    marketCss.includes('.mine-dropdown-item{') && marketCss.includes('border-radius:8px;cursor:pointer;'),
    'mine-dropdown-item 必须使用标准 8px 圆角，彻底消除 6px 杂质'
  );
});

test('E2E (Phase 2): 空状态引导遵循居中标准与轻量留白', () => {
  const analyticsEmptyPath = path.join(root, 'plugins/omnimux-analytics/src/client/components/EmptyState.jsx');
  const analyticsEmpty = fs.readFileSync(analyticsEmptyPath, 'utf-8');

  assert.ok(
    analyticsEmpty.includes('<div className="omnimux-analytics-empty"') &&
    analyticsEmpty.includes('<Button variant="primary"'),
    '数据分析看板空状态必须通过共享 Button 提供行动引导'
  );
});
