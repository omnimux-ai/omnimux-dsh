# 创作页卡片「删除」操作语义校正与黑白主题菜单设计规格说明

- 工作区：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh-wt-page-card-delete-menu`
- 分支：`agent/workflow-page-card-delete-menu`
- 日期：2026-09-21
- 目标：工作流「项目」详情中的创作页卡片菜单操作语义校正为「删除」，并全面重塑菜单浮层样式以契合纯正黑白中性主题（遵循 `design.md` v2.0）

## 1. 业务背景与问题定义

1. **操作语义混淆与误导（高危）**：
   - 当前项目内的单张创作页（ProjectPageCard），其更多操作菜单中破坏性操作误显示为「解散项目」（`projects.delete`），容易导致用户误以为会摧毁整个项目；
   - 实际业务行为应为「删除该创作页」，并弹出对应的「删除创作页」二次确认弹窗。
2. **菜单底色泛灰不符黑白主题（视觉失真）**：
   - 现有菜单使用 `var(--dsw-alias-bg-elevated, var(--dsw-alias-bg-overlay))`，因 `--dsw-alias-bg-elevated` 在宿主未定义，降级至宿主 `--dsw-alias-bg-overlay`（为中灰色 `#61666b`）；
   - 在原生纯黑（#111113 / #18181b）工作台下，菜单浮层呈现出厚重、浑浊的水泥灰塑料感，破坏黑白极简主义纯净质感。
3. **破坏性交互表达缺乏克制**：
   - 危险操作常态下过于抢眼，应遵循黑白极简主义规范，常态保持中性黑白纯净质感，悬停时点亮优雅内敛的警示微光。

## 2. 详细设计与规范对标

### 2.1 语义与文案校正
- 在国际化字典（`locales.js`）中引入创作页专属文案：
  - 中文：`'projects.deletePage': '删除'`, `'projects.deletePageConfirm': '确定要删除创作页「{title}」吗？删除后不可恢复。'`
  - 英文：`'projects.deletePage': 'Delete'`, `'projects.deletePageConfirm': 'Are you sure you want to delete creation page “{title}”? This action cannot be undone.'`
- 创作页卡片（`ProjectPagesTab.jsx`）中，破坏性菜单项文本采用 `t?.('projects.deletePage') || '删除'`。
- 点击触发单页删除流程与专属二次确认弹窗，确认后仅删除指定创作页，不波及项目与其它资产。

### 2.2 黑白主题材质与样式升级（`folderStyles.js`）
- **深邃纯黑毛玻璃底色**：
  - 弃用灰水泥色降级链，统一采用深邃曜石纯黑半透明底色：
    `background: var(--dsw-specific-menu, var(--dsw-alias-bg-elevated, var(--dsw-alias-bg-base, #141416)))` 或带 95% 不透明度的纯黑微透底色，兼顾有无宿主变量环境；
  - 声明 `backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);`，形成视网膜级纯黑毛玻璃悬浮质感。
- **极细中性描边与景深阴影**：
  - 边框采用细微中性光感描边：`border: 1px solid var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.08));`
  - 景深阴影：`box-shadow: 0 12px 32px -4px rgba(0, 0, 0, 0.6), 0 2px 8px rgba(0, 0, 0, 0.3);`
- **内切几何与 32px 控件高**：
  - 外框圆角 `10px`，内边距 `4px`，菜单子项圆角 `6px`（满足 10px - 4px = 6px 内切几何），高度 `32px`。
- **菜单项视觉与交互（黑白极简主义）**：
  - 常态下：所有菜单项文字与图标保持黑白中性白（`var(--dsw-alias-label-primary)`）；
  - 悬停态（Hover/Focus）：
    - 常规项：浅灰微透悬停底色 `var(--dsw-alias-interactive-bg-hover)`；
    - 危险项（删除）：柔和危险微光 `color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent)`，文字和图标转为警示红 `var(--dsw-alias-state-error-primary)`。

## 3. 验收标准（Acceptance Criteria）

- **AC-1（语义准确）**：创作页卡片三点更多菜单第二项明确展示为「删除」，杜绝出现「解散项目」。
- **AC-2（交互安全）**：点击「删除」呼出「删除创作页」二次确认弹窗，确认后仅删除当前创作页。
- **AC-3（黑白纯净主题）**：菜单浮层底色为深邃纯黑毛玻璃，彻底摆脱水泥灰色，与深色界面一体化。
- **AC-4（极简微交互）**：常态黑白中性、悬停柔和警示红微光，过渡自然丝滑。
- **AC-5（全量门禁）**：单测与端到端测试 100% 绿灯，静态代码审查与 UI01~UI10 门禁零违规。
