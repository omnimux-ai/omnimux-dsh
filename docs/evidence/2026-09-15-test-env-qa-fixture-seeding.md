# 隔离测试环境标准业务夹具（Fixture）自动预装与感知引导工程化验证证据（Issue #1886 / PR）

- 任务分支：`feat/test-env-qa-fixture-seeding`
- 涉及文件：
  - `tests/fixtures/qa-workspace-media/`
  - `scripts/test-env-bootstrap.mjs`
  - `scripts/worktree-app-qa.mjs`
  - `scripts/guard-quality-loop.mjs`
- 规格文档：`specs/test-env-qa-fixture-seeding.spec.md`
- 真实报告：`docs/evidence/worktree-app-qa-report.json`

## 一、方案 1 工程化实施要点

1. **落盘标准测试工作区夹具资产**：
   - 建立 `tests/fixtures/qa-workspace-media/`；
   - 包含预置好非空视频节点的画布数据（`.omnimux/canvases/default.json`）、资产目录（`.omnimux/assets.json`）与轻量测试视频样本（`assets/imported/fixture-video.mp4`）；
   - 彻底解决 MaterialNode 节点在空项目下无法露出「添加到会话」悬浮按钮的业务依赖。
2. **测试环境启动自动注入（Automatic Seeding）**：
   - 改造 `scripts/test-env-bootstrap.mjs`，启动私有环境时自动将上述夹具工程复制到 `dsh/workspaces/ws_qa_media`；
   - 注入 `summary.seededWorkspace: 'ws_qa_media'`。
3. **主动感知与直达引导（Active Awareness）**：
   - `scripts/worktree-app-qa.mjs` 运行成功后输出高亮指引与直达链接（`/#/workspace/ws_qa_media`）；
   - `scripts/guard-quality-loop.mjs` 门禁拦截时直接给出该夹具使用说明，指引 Agent 快速完成真实场景操作。

---

## 二、实机验证与测试结果

| 测试项 | 执行命令 | 结果 | 关键事实数据 |
| :--- | :--- | :--- | :--- |
| test-env-bootstrap 单测 | `node --test scripts/test-env-bootstrap.test.mjs` | **20 / 20 全部通过** | 保证多模式与生命周期正常 |
| guard-quality-loop 单测 | `node --test scripts/guard-quality-loop.test.mjs` | **23 / 23 全部通过** | 门禁拦截与引导逻辑全绿 |
| worktree-app-qa 单测 | `node --test scripts/worktree-app-qa.test.mjs` | **4 / 4 全部通过** | 验收运行器无破坏性变更 |
| 隔离工作树实测运行 | `node scripts/worktree-app-qa.mjs` | **7 / 7 断言通过** | 端口 50064，CDP 50076，成功打印预装夹具指引 |
| 格式与空白核验 | `git diff --check` | **通过** | 零格式错误与无用空白 |

---

## 三、现场实跑输出取证

```
✅ 应用级 Web 验收通过（7 项断言，端口 50064，CDP 50076）
   截图: .../.workbuddy/evidence/app-qa/fdcd30a8-8b59-4573-ba62-1ffc786b9734/app-home.png (1280x713, 81368 字节)
   证据: docs/evidence/worktree-app-qa-report.json
💡【测试工程夹具】：已自动预装带媒体素材的标准测试工程（ID: ws_qa_media）
   前置测试直达：http://127.0.0.1:50064/#/workspace/ws_qa_media
   说明：内置非空视频素材节点，悬浮工具栏「添加到会话」等按钮均已就绪，无需手动造数据。
```
