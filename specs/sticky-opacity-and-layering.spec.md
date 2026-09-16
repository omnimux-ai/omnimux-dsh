# 一级页吸附栏实心背景与层级防穿透规格（Issue #1977 穿模深度根治）

- 任务单：Issue #1977（穿模细节优化）
- 分支：`fix/sticky-transparent-leak-issue-1977`
- 关联契约：`docs/contracts/first-level-page-layout.md` §二·补

## 1. 目标（Objective）

**建什么**：
1. 解决灵感社区及全站一级页向上滚动时，吸附栏（`.omx-stage-sticky`）背景变透明、导致下层卡片内容与绿色角标穿透吸附栏（穿模）的严重视觉缺陷。
2. 灵感社区对齐资产库与技能/专家规范：改为整页滚动，页头大标题随页面正常滚走，一级/二级 Tab 栏整体吸附到顶部（`top: 0`），与窗口顶部标签栏无缝衔接。
3. 全站吸附栏 `.omx-stage-sticky` 背景增加实体背景色兜底（`#111215`），层级统一提升至 `z-index: 20`（高于卡片内部角标/多选框的 4~6，低于弹窗/下拉浮层的 30/100/1000）。
4. 灵感社区将一级 Tab 工具栏与二级筛选栏合并包裹在同一个 `.omx-stage-sticky` 吸附容器中，消除两者之间由 flex gap (12px) 带来的透明漏光缝隙。
5. 卡片网格容器添加 `isolation: isolate`，建立局部独立层叠上下文，杜绝卡片内定位元素溢出穿透。

## 2. 验收标准（可测）

| ID | 场景 | 期望 |
|---|---|---|
| AC-1 | 灵感社区向上滚动卡片 | 页头标题随页面滚走，Tab 栏一路滚至顶部（`top: 0`）吸附，与窗口顶栏无缝衔接 |
| AC-2 | 灵感社区卡片滚经 Tab 吸附栏 | 吸附栏具有 100% 不透明深色实底，下方的卡片图片/文字完全被遮挡，绝不透出 |
| AC-3 | 灵感社区卡片右上角角标（`Badge`，z-index: 4）滚经吸附栏 | 角标完全位于吸附栏之下，绝不漂浮或穿模显示在 Tab 栏上方 |
| AC-4 | 一级 Tab 与二级筛选行之间 | 两者紧密衔接，不存在 12px 的透明缝隙露底 |
| AC-5 | 全站一级页吸附契约一致性 | 资产库、技能/专家、灵感、账号、发布、数据分析、商品库 7 页 `.omx-stage-sticky` 声明保持逐字一致（通过 `pnpm verify:stage-scroll`） |
| AC-6 | 真实浏览器实测断言 | 滚动后吸附栏背景色计算值不为 transparent，卡片角标与吸附栏发生几何重叠时吸附栏居于顶层 |

## 3. 命令（Commands）

```bash
# 在任务工作树根目录执行
cd .worktrees/sticky-transparent-leak

# 契约与静态门禁
node scripts/verify-stage-scroll-contract.mjs
pnpm test:ui

# 单元测试与 E2E 测试
pnpm --filter omnimux-inspiration test
node --test tests/e2e/stage-scroll-contract.e2e.test.mjs
node --test tests/e2e/sticky-rail-flush.e2e.test.mjs

# 构建验证
node scripts/omnimux.mjs sync
```

## 4. 边界（Boundaries）

- **总是**：吸附栏必须有不透明实体底色兜底；保持 7 个一级页样式类声明逐字一致；卡片网格设置 `isolation: isolate`。
- **绝不**：使用原生控件；在吸附栏上使用有缝隙的多段独立 sticky 容器；破坏现有 FilterBar 的过滤与搜索交互逻辑。
