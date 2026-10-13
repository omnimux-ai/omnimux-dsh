# 虚拟形象来源切换栏调整（Issue #3282）

## 目标与验收
移除虚拟形象页品牌、模型、渠道选择区，将灵感库/历史记录置于右侧面板页眉左上原选择区位置。历史视图切换保留在右侧。复用现有图标、字体、颜色和尺寸。桌面与窄视口不溢出，来源切换正常，默认生成参数保持不变。

## 新用户基线
依赖现有中枢目录及账号配置，不新增本地服务或开发路径。无可用模型时保留现有不可生成状态与目录错误提示。

## 实现与结构
修改 plugins/omnimux-avatar/src/client/AvatarStage.jsx 的页眉结构：移除 ModelPicker 引用与挂载；SourceTabs 成为页眉首项，ViewModeToggle 为第二项。现有 space-between 样式无需改动。保留 ModelPicker 模块，避免无关清理。

## 风格与边界
复用既有组件及主题样式。只调整展示，不改目录、路由、价格、存储或生成行为。不写官方源码、生产配置或其它工作区。用户明确批准同步本次过时的界面验证规则，保留核心渠道、提交与历史保护检查，并持久化已实测的页面旅程。

## 验证
插件目录执行 node --test src/*.test.mjs src/client/*.test.mjs src/client/*.test.js src/client/components/*.test.mjs。
仓库执行 node scripts/verify-stage-contracts.mjs、node --test scripts/verify-anti-slop.test.mjs、node scripts/impact-matrix.mjs --git-diff --base origin/main、git diff --check。
通过 node scripts/worktree-app-qa.mjs --journey plugins/omnimux-avatar/tests/e2e/avatar-source-tabs.e2e.test.mjs 获取隔离应用页面与切换断言。

## 文档影响
仅局部展示布局，无公共合同变更；任务规格记录范围和证据，不改产品说明。
