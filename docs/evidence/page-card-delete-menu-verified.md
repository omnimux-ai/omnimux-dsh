# 创作页卡片「删除」操作与黑白主题菜单实机验证证据报告

- 验证时间：2026-09-21
- 任务分支：`agent/workflow-page-card-delete-menu`
- 验证环境：OmniMux 工作流（omnimux-workflow）本地项目详情页（ProjectPagesTab）

## 1. 验证目标

验证工作流项目详情页内创作页卡片更多操作菜单的两大核心改进：
1. **语义校正**：三点操作菜单中第二项明确为「删除」，绝非「解散项目」，点击弹出专属「删除创作页」二次确认弹窗；
2. **黑白纯净主题**：菜单浮层底色由原先的宿主高不透明度水泥灰（`#61666b`）重塑为曜石纯黑毛玻璃（`--dsw-specific-menu` / `--dsw-alias-bg-base`），与纯黑工作台底色自然融为一体。

## 2. 交互与视觉验证记录

### 验证点 1：创作页卡片三点更多按钮
- 状态：卡片常态下保持清爽极简，鼠标悬停（Hover）或获得焦点时，右下角平滑露出 32px 圆形三点更多操作按钮；
- 属性：声明 `aria-haspopup="menu"`，点击展开菜单，阻止事件冒泡（不触发卡片整体点击打开创作页）。

### 验证点 2：菜单浮层底色与黑白极简主义材质
- 材质：声明 `--dsw-alias-bg-elevated: var(--dsw-specific-menu, var(--dsw-alias-bg-base))`，在暗色模式下解析为纯黑曜石底色，彻底根除原宿主 `--dsw-alias-bg-overlay` 产生的水泥灰块；
- 毛玻璃：具备 `backdrop-filter: blur(16px)` 与 `-webkit-backdrop-filter: blur(16px)`，质感通透；
- 几何契约：外框 10px 标准圆角、4px 内边距，子项 6px 内切圆角与 32px 控件高基准。

### 验证点 3：操作项文案与二次确认
- 项一：`重命名`（IconEditOutline16），黑白中性文字与图标，悬停浅灰微光；
- 项二：`删除`（IconTrashOutline16，标记 `omnimux-folder-menu-item--danger` 与 `data-danger="true"`）；
- 弹窗：点击「删除」后关闭菜单，弹出专属 `ConfirmModal` 对话框：
  - 标题：`删除创作页`
  - 描述：`确定要删除创作页「{title}」吗？删除后不可恢复。`
  - 确认按钮：红色危险高亮「删除」
  - 取消按钮：中性取消
  - 隔离性：确认后仅调用 `deleteProjectPage(projectId, pageId)` 删除当前单张创作页，所属项目及其他创作页与资产完好保留。

## 3. 验证结论

各项表现均严格对标《OmniMux UI 设计规范》（`design.md` v2.0），视觉符合纯正黑白中性主题，操作语义清晰安全。
