# 定时任务左侧记录栏 1:1 风格复刻规格

## 1. 目标（Objective）
响应用户明确指令：“图1 是参考的 UI 布局和样式，1:1 复刻在打开定时任务详情的情况下，中间定时任务记录栏的 UI 样式。”
在工作台（打开定时任务详情时，中间/左侧任务列表栏）1:1 对标参考图的极简深色卡片布局：
1. 顶栏重构：隐藏冗余的大标题与副标题，第一行左侧展示纯文本状态胶囊（全部、已开启、已暂停、已完成），右侧展示浅色药丸下拉创建按钮；
2. 搜索框胶囊化：全宽半圆胶囊设计（`border-radius: 999px`，高度 36px），背景微深微透，放大镜图标与文字沉浸居左；
3. 列表项卡片流（Card Stream）：
   - 彻底移除行与行之间的底部横向分割线（`border-bottom: 0`）；
   - 列表项之间具有舒适的纵向间隙（`gap: 8px`）；
   - 选中行（`.is-selected`）呈现为深色独立圆角卡片（`background: rgba(255, 255, 255, 0.08)`，`border-radius: 10px`），彻底移除左侧蓝色竖条；
   - 未选中行背景透明，hover 时微弱高亮，内边距与选中态统一；
   - 文本层次清晰：上行任务名粗体 14px 白色，下行周期弱灰色 12px。

## 2. 核心验收标准（Acceptance Criteria）
- **AC-1（顶栏结构与胶囊 1:1）**：
  - 顶栏第一行并排展示：左侧筛选胶囊组、右侧创建按钮。隐藏胶囊数字计数（纯文字），选中胶囊具备高亮微背景；
  - 隐藏冗余大标题与副标题。
- **AC-2（全圆角胶囊搜索栏）**：
  - 搜索框 `.dsh-st-md-search` 采用 `border-radius: 999px` 全圆角，微弱深色背景与边框。
- **AC-3（任务列表卡片流与选中卡片）**：
  - 移除 `.dsh-st-md-row` 底边线与选中态的 `::before` 蓝条；
  - 选中行 `.dsh-st-md-row.is-selected` 呈现独立深色圆角矩形卡片；
  - 行间距松弛有序。
- **AC-4（全量功能与兼容性 100% 绿灯）**：
  - 现有 132 项自动化测试 100% 通过，列表点击、筛选、创建、键盘交互等契约完好无损。

## 3. 影响文件
- `specs/automation-master-list-ui-polish.spec.md`
- `plugins/omnimux-automation/src/client/TaskMasterList.jsx`
- `plugins/omnimux-automation/src/client/styles.js`
- 产物 `plugins/omnimux-automation/lib/client.js`
- 验证证据 `docs/evidence/automation-master-list-ui-polish-verified.md`
- 端到端测试 `tests/e2e/automation-master-list-ui-polish.e2e.test.mjs`
