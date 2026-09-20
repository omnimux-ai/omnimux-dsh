import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const buttonSource = readFileSync(join(here, 'ProductPickerButton.jsx'), 'utf8');

test('ProductPickerButton: 对齐右侧模型切换按钮交互规范与样式契约', () => {
  // 1. 样式 ID 与导出检查
  assert.ok(buttonSource.includes('PRODUCT_BTN_STYLE_ID'), '必须定义专属样式 ID 常量');
  assert.ok(buttonSource.includes('PRODUCT_BTN_CSS'), '必须导出专属 CSS 规则字串');
  assert.ok(buttonSource.includes('ensureProductButtonStyles'), '必须提供并挂载样式注入函数');

  // 2. 默认视觉几何与对齐规范（透明底色、胶囊微圆角、28px 控件高、13px 字体）
  assert.ok(buttonSource.includes('background: transparent'), '默认态必须为透明底色');
  assert.ok(buttonSource.includes('height: 28px'), '高度对齐 28px 规范基准');
  assert.ok(buttonSource.includes('border-radius: 24px'), '必须采用 24px 胶囊圆角');
  assert.ok(buttonSource.includes('font-size: 13px'), '字阶对齐 13px 标准');
  assert.ok(buttonSource.includes('gap: 4px'), '图标与文字间距对齐 4px');

  // 3. 鼠标悬停交互（Hover）规范
  assert.ok(
    buttonSource.includes('.omnimux-composer-product-btn:hover:not(:disabled)'),
    '必须包含鼠标悬浮 Hover 伪类',
  );
  assert.ok(
    buttonSource.includes('background: var(--dsw-alias-interactive-bg-hover)'),
    'Hover 状态必须使用交互高亮变量 --dsw-alias-interactive-bg-hover',
  );
  assert.ok(
    buttonSource.includes('color: var(--dsw-alias-label-primary'),
    'Hover 状态文字与图标必须高亮至 primary 级',
  );

  // 4. 鼠标按压交互（Active）与展开状态保持（is-active / open）
  assert.ok(
    buttonSource.includes('.omnimux-composer-product-btn:active:not(:disabled)'),
    '必须包含鼠标按压 Active 反馈',
  );
  assert.ok(
    buttonSource.includes('.omnimux-composer-product-btn.is-active') ||
    buttonSource.includes('[data-state="open"]'),
    '必须包含弹窗展开时的激活高亮保持规则',
  );

  // 5. 键盘交互与无障碍（Focus-visible / aria-expanded）
  assert.ok(
    buttonSource.includes('.omnimux-composer-product-btn:focus-visible'),
    '必须支持键盘 Focus-visible 高亮聚焦轮廓',
  );
  assert.ok(
    buttonSource.includes('aria-expanded={isOpen}'),
    '必须具备 aria-expanded 展开无障碍语义',
  );

  // 6. 硬编码内联样式清理（符合设计门禁）
  assert.ok(
    !buttonSource.includes('style={{'),
    '按钮本身严禁硬编码内联样式，确保 Hover/Active 样式全量由 CSS 控制',
  );
});
