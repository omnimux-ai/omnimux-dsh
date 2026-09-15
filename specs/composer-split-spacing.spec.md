# 规格说明：会话栏非全屏模式下输入框两侧与底部间距统一为 25px

## 1. 业务背景与问题现象
- **问题现象**：在非全屏（分栏/并排，右侧打开画布或辅助面板）模式下，会话栏整体可用宽度被挤压变窄，但输入框卡片（`[data-composer-card]`）两侧与底部留白过大（受最大宽度 `max-width: 780px` 居中、多层边距及 32px 底部内边距限制），导致空间浪费严重，输入与阅读体验受限。
- **用户诉求**：在会话栏非全屏模式下，最大化利用空间，输入框卡片两侧（左侧与右侧）均只保留 25px 间距，底部也只保留 25px 间距，且不改动任何底层业务逻辑，纯粹进行几何留白统一。
- **对照全屏态**：在全屏无右侧面板展开时，会话栏保持既有优雅居中（最大宽度舒适打字）规则不变。

## 2. 解决方案设计
在 `plugins/omnimux/src/client/composer-compact.js` 与 `plugins/omnimux/src/client/session-guide/styles.js` 中，针对非全屏分栏模式（`html[data-omnimux-split-compact]` 以及带右栏展开标记的选择器）统一声明间距收敛规则：
1. **输入框挂载座位（`[data-composer-seat]`）**：
   - 设定 `padding-left: 25px !important;`、`padding-right: 25px !important;`、`padding-bottom: 25px !important;`、`padding-top: 0 !important;`。
   - 宽度自适应占满会话列宽度（`width: 100% !important; max-width: 100% !important; box-sizing: border-box !important;`）。
2. **中间包装容器与卡片总栈（`[class*="composerStack"]`、`[class*="composerHero"]`、`InputBar root`）**：
   - 消除额外左右 margin 与 padding（`margin: 0 !important; padding: 0 !important;`），宽度 100% 紧贴座席内容区。
3. **输入框主体卡片（`[data-composer-card]`）**：
   - `width: 100% !important; max-width: 100% !important; margin: 0 !important; margin-bottom: 0 !important;`，精准实现距左边 25px、距右边 25px、距底边 25px。
4. **工作区/智能体选择行（`[class*="heroWorkspaceRow"]`）**：
   - 与下方输入框严格等宽两端对齐，消除左右内缩。
5. **顶部迎宾区（`omnimux-welcome-header`）**：
   - 左右定位从 24px 微调对齐为 25px（`left: 25px !important; right: 25px !important; max-width: calc(100% - 50px) !important;`），与底部的 25px 间距视觉垂直对齐。

## 3. 验收标准
1. **自动化测试**：
   - 单元测试覆盖非全屏模式下 `[data-composer-seat]` 的 `padding: 0 25px 25px 25px`（或各分量）及 `[data-composer-card]`、`[class*="composerStack"]` 100% 占满宽度且无多余外边距的断言。
   - 全部单元与回归测试 100% 绿灯通过。
2. **界面几何验收**：
   - 当右侧打开画布或侧栏处于非全屏模式时，输入框左边界距会话栏左侧刚好 25px，输入框右边界距会话栏右侧刚好 25px，输入框底边距视口底部刚好 25px。
