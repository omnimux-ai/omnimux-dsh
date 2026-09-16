# 灵感社区预览弹窗分享按钮激活态视觉规范优化规格 (Fix Inspiration Share Button Active Visual Spec)

## 1. 业务背景与问题现象
- **现象**：在灵感社区的详情弹窗（`InspirationPreviewModal`）中，顶栏的「分享」按钮（`.omnimux-inspiration-share-trigger-btn`）在点击展开「分享灵感」浮层后，按钮被赋予了 `.is-active` 激活态。
- **根因**：原 CSS 样式中将 `.is-active` 的背景设为 `var(--dsw-alias-brand-primary, #4c8dff)`，文字色为 `var(--dsw-alias-label-primary, #ffffff)`。在桌面端单色（Monochrome）暗黑主题下，`--dsw-alias-brand-primary` 被规范映射为纯白色 `#ffffff`，导致按钮呈现为白底白字、彻底融化为一块发光的白色矩形方块，文字与图标完全不可见，严重破坏暗色界面的视觉协调性。

## 2. 优化方案与设计规范对齐
按照 `design.md` §3.4（交互与按钮层 Token）与 §5.3（按钮体系）：
1. **背景底色**：由 `var(--dsw-alias-brand-primary, #4c8dff)` 调整为次级激活背景 `var(--dsw-alias-interactive-bg-active, rgba(255, 255, 255, 0.14))`，微透深色暗底，沉稳内敛，不喧宾夺主。
2. **边框样式**：由 `border-color: transparent` 调整为 `border-color: var(--dsw-alias-border-l3, #383838)`，与展开的分享浮层边框自然呼应。
3. **文字与图标**：保持 `color: var(--dsw-alias-label-primary, #ffffff)`，纯白图标与文字在深色背景上对比鲜明、清晰可读。
4. **语义与无障碍补充**：在触发按钮上补充 `aria-expanded={showSharePopover}`，规范无障碍状态标记。

## 3. 验收标准 (Acceptance Criteria)
- [ ] **AC-1 (激活态背景沉稳)**：当分享浮层打开（`.omnimux-inspiration-share-trigger-btn.is-active`）时，按钮背景为微透暗色 `var(--dsw-alias-interactive-bg-active, rgba(255, 255, 255, 0.14))`，严禁使用纯白 `#ffffff` 或未加防护的品牌主色。
- [ ] **AC-2 (文字与图标清晰可读)**：在激活状态下，按钮内部的“分享”文字与分享图标清晰可见，对比度符合 WCAG 标准。
- [ ] **AC-3 (交互与功能零回归)**：点击分享按钮依然能正常打开与关闭分享浮层，创建链接、复制等核心功能完好无损。
- [ ] **AC-4 (自动化测试与构建全绿)**：单元测试、端到端测试以及真实浏览器截图验证全部通过。
