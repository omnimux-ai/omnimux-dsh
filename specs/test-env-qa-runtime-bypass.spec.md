# 隔离测试环境 Runtime 首次引导拦截消除与自动化验收加固规格

- 任务分支：`fix/issue-infra-qa-runtime-bypass`
- 涉及文件：
  - `scripts/test-env-bootstrap.mjs`（启动时自动预置合成测试运行模式配置）
  - `scripts/worktree-app-qa.mjs`（验收脚本自动直达测试工作区并消除阻塞）
  - `scripts/test-env-bootstrap.test.mjs`（更新配套单元测试断言）

## 一、背景与治理目标

### 1.1 业务卡点痛点
在独立 Git 工作树（Worktree）中进行界面验收时：
- `scripts/test-env-bootstrap.mjs` 为隔离沙箱创建全新 `settings.yaml`，但未配置 `omnimux.runtimeMode` 与 `ui-onboarding.welcomeNoticeVersion`；
- 前端 `RuntimeGuideGate.jsx` 检测到 `runtimeMode` 为空，判定为全新首次安装，强制弹出全屏全局模态遮罩（Runtime 模式选择弹窗）；
- 该遮罩无跳过或关闭按钮，且弹窗内的三条路径（云端登录、本地 CLI 探测、自定义 Key）在测试沙箱中均不通或违规；
- 测试自动化助手遇到登录弹窗误判为需人类处理，调用 `handOff()` 挂起，造成验收全链路死锁。

### 1.2 解决方案
1. **合成测试配置预置（Default Synthetic Configuration）**：
   - 在 `mode !== 'onboarding'`（即默认的 `ui` 模式及 `live` 模式）下，生成 `settings.yaml` 时不仅写入 `llm-deepseek`，同时自动写入：
     - `ui-onboarding`: `{ welcomeNoticeVersion: '2026-08-13.1' }`，跳过官方开箱公告；
     - `omnimux`: 注入合法的合成运行模式配置（`runtimeMode: 'agent'`、`runtimeAgentId: 'qa-test-agent'`、`runtimeAgentVerified: true`、`runtimeKeyVerified: true` 等），确保 `describeRuntimeGuide` 判定 `visible: false`，彻底消除全屏拦截弹窗；
   - 在 `mode === 'onboarding'` 模式下，保持原样（不写上述配置），保留原生首次配置流程，满足反向回归测试要求。
2. **测试验收直达工作区（Direct Workspace Navigation）**：
   - `scripts/worktree-app-qa.mjs` 在建立同源会话后，直接导航到预置的标准测试工程 `/#/workspace/${seededWorkspace}`，避开空白首页选择菜单，保障真实功能界面正向渲染。
3. **单元测试与回归防护（Automated Regressions）**：
   - 更新 `scripts/test-env-bootstrap.test.mjs`，严密校验默认 `ui` 模式生成完整的免拦截配置，而 `onboarding` 模式保持纯净未配置状态。
