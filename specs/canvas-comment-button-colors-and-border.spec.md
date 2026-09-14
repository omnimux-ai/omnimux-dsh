# 画布评论按钮色彩对比度与输入框去边框规格（Canvas Comment Button Contrast & No Border Spec）

## 1. 业务痛点与用户指正
用户实测反馈并提供明确截图与红箭头指正：
1. **截图 1（顶部评论按钮）**：点击「+ 添加评论」按钮后，按钮背景和图标/文字全部变成白色，导致完全白成一片无法辨识。
2. **截图 2（打点徽标与输入框）**：
   - 气泡输入框左侧的数字徽标变成了纯白色（白色底色 + 白色数字），无法看清序号。
   - 输入框弹出层与内部带有生硬的边框线，用户明确要求：**「输入框不要显示输入框内的边框线」**。

## 2. 根因剖析
- 桌面端暗黑单色主题下，`var(--dsw-alias-brand-primary)` 默认映射为了 `var(--dsw-alias-label-primary)`（即纯白 `#ffffff`）。
- 原 CSS 中将按钮激活态和徽标背景设为 `var(--dsw-alias-brand-primary)`，同时文字设为 `#ffffff`，导致白底白字、彻底融化为白色色块。
- 输入框弹出层 `.omx-mv-annotation-popover` 带有 `border: 1px solid var(--dsw-alias-border-l2)`，内部输入框带浏览器轮廓线。

## 3. 修复方案
1. **顶部按钮与激活态色彩对齐**：
   - 未激活态：半透明深色微圆角胶囊底色，清晰纯白图标与文字 `+ 添加评论`。
   - 激活态：深色胶囊底色微亮并带有蓝色或高亮描边（`border-color: #2563eb; background: rgba(37, 99, 235, 0.2); color: #ffffff;`），杜绝大面积纯白底色导致的白底白字反噬。
2. **打点数字徽标与图钉底色加固**：
   - 图钉与徽标底色显式固定为经典明亮皇家蓝 `#2563eb !important`（配 1.5px 纯白外轮廓与纯白居中序号），无论系统主题变量如何变换，永远保持蓝底白字、清晰醒目。
3. **输入框彻底消除边框线（No Border Line）**：
   - `.omx-mv-annotation-popover`：`border: none !important; outline: none !important; box-shadow: 0 8px 24px rgba(0,0,0,0.5);`
   - `.omx-mv-annotation-popover__input`：`border: none !important; outline: none !important; box-shadow: none !important;`
   - 呈现如用户截图般的无缝深黑磨砂胶囊微浮雕质感。

## 4. 验收标准 (Acceptance Criteria)
- **AC-1 (顶部按钮对比度清晰)**：点击「+ 添加评论」后，按钮保持深色或蓝底白字，文字与图标清晰可见，杜绝纯白洗脱。
- **AC-2 (数字徽标清晰可辨)**：打点图钉与输入框左侧徽标均为蓝底白字，清晰显示数字 `1`、`2` 等序号。
- **AC-3 (输入框内外无边框线)**：输入框外部胶囊与内部文本框四周均无任何 1px 细线边框与外轮廓。
