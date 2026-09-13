# 质量五步闭环（Spec → Code → Verify → Test → Green）物理硬门禁规范

**文件：** `specs/quality-loop-hard-gate.spec.md` ｜ **优先级：** P0

## 1. 目标与价值
解决 AI 编码过程中“无规格直接改代码、盲猜选择器写脆弱测试、口头宣称通过”等失控问题。
在 `dsh-hooks-plugin` 框架下，实现物理级硬门禁脚本 `scripts/guard-quality-loop.mjs`，通过拦截器对工具调用进行硬性前置条件检查。

## 2. 门禁规则定义

### 门禁一：规格先行门禁 (Spec Gate)
- **拦截目标**：工具 `edit` / `write` 试图修改或创建核心业务源码（`plugins/*/src/**`, `packages/*/src/**`, `extension/src/**`）。
- **判定逻辑**：
  - 检查当前工作区或仓库根目录下是否存在有效的规格文档（`specs/*.spec.md`, `specs/*.md`, `tests/specs/*.spec.md`）。
  - 有效标准：文件存在且内容长度 > 50 字符。
  - 若不存在有效规格：直接返回 `permissionDecision: "deny"`，输出标准化引导文案。
- **豁免范围**：
  - 编写规格文档本身（`specs/**`）
  - 纯文档（`*.md`）、配置（`package.json`, `tsconfig*.json`）
  - 测试目录（`*.test.*`, `tests/**`）、脚本目录（`scripts/**`）
  - 临时目录与日志（`.workbuddy/**`, `dist/**`, `tmp/**`）

### 门禁二：实机预演门禁 (Verify Gate)
- **拦截目标**：工具 `edit` / `write` 试图创建或修改端到端/UI自动化测试脚本（`tests/e2e/**`, `*.spec.ts`, `*.e2e.test.*`）。
- **判定逻辑**：
  - 检查工作区是否存在实机运行或浏览器预演留存的真实证据（`.workbuddy/evidence/**`, `scripts/worktree-web-qa` 产物，或 ego-browser 会话日志）。
  - 若无有效实机证据：直接返回 `permissionDecision: "deny"`，拒绝盲目猜测选择器。
- **豁免范围**：普通单元测试（`*.unit.test.*` 或非 UI 测试）。

### 门禁三：合入前全绿与环境自毁门禁 (Green Gate)
- **拦截目标**：命令行执行 `git commit` 或合并交付命令。
- **判定逻辑**：
  - 必须确认全量测试无失败用例，且无遗留后台测试守护进程。

## 3. 验收用例表

| # | 场景 | 操作 | 预期结果 |
|---|---|---|---|
| 1 | 无规格修改源码 | 在无 `specs/` 文件的分支下 `edit` 业务源码 `plugins/omnimux/src/client.js` | 🚫 物理拦截，返回 deny 并提示先交付 Spec |
| 2 | 有规格修改源码 | 工作区存在有效 `specs/*.spec.md` 后 `edit` 业务源码 | ✅ 允许放行 (allow) |
| 3 | 编写规格文件本身 | `write` 新建 `specs/my-feature.spec.md` | ✅ 允许放行 (豁免) |
| 4 | 无实机验证写 E2E | 在无实机截图证据下 `write` 自动化测试 `tests/e2e/login.spec.ts` | 🚫 物理拦截，返回 deny 并提示先在真实浏览器预演 |
| 5 | 有实机证据写 E2E | 存在 `.workbuddy/evidence/` 截图记录后 `write` 自动化测试 | ✅ 允许放行 (allow) |
| 6 | 修改非核心辅助文件 | `write` 修改 `README.md` 或 `package.json` | ✅ 允许放行 (豁免) |
