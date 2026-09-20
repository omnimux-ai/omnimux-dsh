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

test('ProductPickerButton: 选中态契约（缩略图 + 名称省略 + 悬停移除 + 点击换选）', () => {
  // 1. 按钮宽度受限，商品名超长省略（Issue #2468 验收 3）
  assert.match(buttonSource, /max-width:\s*200px\s*!important/, '按钮必须限制最大宽度 200px');
  assert.match(
    buttonSource,
    /\.omnimux-composer-product-btn__name\s*\{[^}]*text-overflow:\s*ellipsis\s*!important/,
    '商品名必须以省略号截断',
  );

  // 2. 选中态缩略图 18px，取图规则与 ProductPickerCard 一致（验收 2）
  assert.match(
    buttonSource,
    /\.omnimux-composer-product-btn__thumb\s*\{[^}]*width:\s*18px\s*!important/,
    '选中态缩略图必须为 18px',
  );
  assert.ok(buttonSource.includes('resolveProductPreview'), '必须提供商品预览图解析函数');
  assert.ok(
    buttonSource.includes('?preview=${encodeURIComponent(cover.id)}'),
    '封面图必须走产品库预览通道',
  );
  assert.ok(
    buttonSource.includes("product.cover_url || product.image || ''"),
    '无封面时必须兜底直链字段',
  );

  // 3. 悬停出现移除按钮，点击阻止冒泡（验收 4）
  assert.match(
    buttonSource,
    /\.omnimux-composer-product-btn:hover \.omnimux-composer-product-btn__remove/,
    '悬停选中态必须显示移除按钮',
  );
  const removeHandler = buttonSource.slice(buttonSource.indexOf('const handleRemove'));
  assert.ok(removeHandler.includes('stopPropagation'), '移除按钮点击必须阻止冒泡（不得触发弹窗）');
  assert.ok(removeHandler.includes('removeChip(selectedProduct.id)'), '移除时必须同步移除输入框 Chip');
  assert.ok(removeHandler.includes('setSelectedProduct(null)'), '移除后按钮必须恢复默认态');

  // 4. 换选时先移除旧 Chip 再插入新 Chip（验收 5）
  assert.ok(
    buttonSource.includes('removeChip(selectedProduct.id)'),
    '换选时必须移除旧商品 Chip',
  );

  // 5. Chip 写入防注入：商品名用 textContent，严禁 innerHTML 拼接（验收 6）
  assert.ok(buttonSource.includes('nameSpan.textContent = shortName'), 'Chip 商品名必须用 textContent 写入');
  assert.ok(!buttonSource.includes('chip.innerHTML'), 'Chip 严禁 innerHTML 拼接商品名');
  assert.ok(!buttonSource.includes('onclick='), 'Chip 移除严禁内联 onclick 字符串');

  // 6. 图标合规：移除按钮使用纯矢量 SVG，禁止字符图标（UI04）
  assert.ok(buttonSource.includes('createCloseSvg'), 'Chip 移除图标必须使用纯矢量 SVG');
  assert.ok(!buttonSource.includes("textContent = '×'"), '严禁使用字符充当移除图标');
});
