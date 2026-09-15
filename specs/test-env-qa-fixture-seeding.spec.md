# 隔离测试环境标准业务夹具（Fixture）自动预置与引导感知工程化规格

- 任务分支：`feat/test-env-qa-fixture-seeding`
- 涉及文件：
  - `tests/fixtures/qa-workspace-media/`（标准测试项目夹具，内含非空视频节点）
  - `scripts/test-env-bootstrap.mjs`（启动时自动预置夹具工程）
  - `scripts/worktree-app-qa.mjs`（验收脚本输出预置工程指引）
  - `scripts/guard-quality-loop.mjs`（门禁报错时输出测试工程使用提示）
  - 单测：`scripts/test-env-bootstrap.test.mjs`、`scripts/guard-quality-loop.test.mjs`

## 一、背景与治理目标

### 1.1 业务卡点痛点
在严格落地物理门禁后，Agent AI 必须在真实浏览器中操作被测功能并截取专属图片。
然而，在复杂前端任务（如创作画布素材节点「添加到会话」）中：
- 界面控件存在**严格的业务前置依赖**（例如：MaterialNode 只有在已有视频/音频素材的非空节点上，悬浮工具栏才会露出「添加到会话」按钮；空节点只显示「导入视频」）；
- 隔离测试环境默认启动的是一个崭新的空工作区；
- Agent 缺乏测试数据，试图在运行态临时写磁盘文件造节点（因无热重载无效）或模拟点选添加节点（定位选择器超时），导致点不出核心按钮、截不到专属实操图片，最终死锁在门禁阶段。

### 1.2 解决方案
1. **构建标准化测试工程资产包（Standard QA Workspace Fixture）**：
   - 在 `tests/fixtures/qa-workspace-media/` 下预置合法的工程作品包；
   - 内置一个已完成状态（`status: 'completed'`）的视频素材节点（带有合法视频资源 `fixture-video.mp4`），打开画布直接可见非空素材节点悬浮工具栏；
2. **测试环境自动注入（Automatic Seeding）**：
   - `scripts/test-env-bootstrap.mjs` 启动隔离环境时，自动将该预置工程复制到工作区目录中；
3. **全局主动感知与重定向（Active Awareness & Steering）**：
   - `scripts/worktree-app-qa.mjs` 运行日志输出预置工程直达路径；
   - `scripts/guard-quality-loop.mjs` 拦截提示中直接告知 Agent：*“若改动依赖素材节点等前置数据，直接使用预置工程，无需从零手动造数据”*。
