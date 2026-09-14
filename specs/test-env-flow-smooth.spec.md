# test-env-flow-smooth — 工作树内独立跑完应用级 Web 验收

## 目标与已批准设计

用户于 2026-09-14 批准方案 A，原话：「关键是说明这个流程是不流畅、不丝滑的呀！…我创建了这个工作树以后，就希望他能够在这个工作树里面独立完成 web 的测试」。

根因不是两个机制各有道理，而是**一个漏改的衔接缺口**：

- `scripts/worktree.sh` 是现行标准，把树建在 `<repo>/.worktrees/<task>`，并在 `.gitignore` / `.git/info/exclude` 中登记；`.agents/skills/omnimux-repo-workflow/SKILL.md:14` 亦已写明「Keep the worktree inside `<repo>/.worktrees/`; do not use the legacy sibling-directory `git-wt.sh` entry」。
- 但 `scripts/guard-quality-loop.mjs:222` 的 `isDeliveryCommand` **只识别 `git-wt.sh finish`，不识别现行的 `worktree.sh ship`**。
- 且 `scripts/test-env-bootstrap.mjs` 的 CLI 只暴露 `preflight`（源码 183-190 行注释 "Deliberately no command execution … entrypoint on the CLI"），仓内除自身单测外**零调用方** → 应用级验收没有可用入口。

结果：Agent 在建好的工作树里无法一条命令完成应用级 Web 验收，只能自写驱动脚本，于是流程被卡住。

## 成功标准（可测）

以下每条均须有真实执行证据，不得以静态推断代替：

1. **一条命令跑完**：在工作树根目录执行 `node scripts/worktree-app-qa.mjs`（等价入口 `pnpm verify:app`），无需调用方自写驱动脚本，即可完成：启动完整应用 → 同源登录 → 驱动真实 Chrome 验收 → 出截图与结构化报告 → 自行清理。
2. **证据可核**：产物落 `<root>/.workbuddy/evidence/app-qa/<runId>/`（截图 PNG + 明细报告），摘要落 `<root>/docs/evidence/worktree-app-qa-report.json`；报告至少含 runId、mode、origin、端口、逐条断言、截图路径与尺寸、起止时间、清理结果。
3. **截图真实**：PNG 可解码且字节数 > 32（复用 `assertPng` 口径），尺寸为正且在报告中记录。
4. **断言真实**：至少断言应用首页真实挂载（目标元素存在、`width > 0` 且 `height > 0`），而非 HTTP 200 或标题。
5. **正向通过**：在合规工作树内运行退出码 0，报告 `pass: true`。
6. **反向对照必须失败**：同一命令在非 `.worktrees/` 路径下运行必须非 0 退出并给出可读原因，不得因"跑通了"而误报通过。
7. **自清理**：正常结束与失败路径均释放应用进程与 Chrome 进程、释放全部动态端口、删除私有临时目录（`.test-env-*`）；证据与报告保留。
8. **门禁统一**：`isDeliveryCommand('bash scripts/worktree.sh ship <task> --pr 1')` 为 `true`；`worktree.sh list|remove|prune|help` 等非交付命令为 `false`；`git-wt.sh finish` 继续为 `true`（向后兼容，不破坏既有调用方）。
9. **位置报错可读**：位置不合规时输出可操作的说明（区分"不在 `.worktrees/` 下""不是 Git 工作树""路径经符号链接""gitdir 注册不符"等），不再只给单一笼统错误码；不得泄露凭据或登录能力。

## 命令与项目结构

- 新增 `scripts/worktree-app-qa.mjs`（ESM、具名导出、可单测），**复用**而非重写：
  - `scripts/test-env-bootstrap.mjs` 的 `startTestEnvironment` / `cleanup` 负责完整应用与私有环境生命周期；
  - `scripts/worktree-web-qa.mjs` 的 `findChromePath` / `assertPng` / CDP 驱动与证据落点约定负责浏览器与取证。
- 不新增第二套部署系统，不修改官方源码或分发包，不改 `scripts/worktree.sh` 的建树行为。
- `scripts/guard-quality-loop.mjs` 仅扩展 `isDeliveryCommand` 的识别集合。
- `scripts/test-env-bootstrap.mjs` 的位置校验改为返回**可读原因**，仍保持拒绝语义不变（不得放宽任何一条约束）。
- 包脚本新增 `verify:app`；文档更新 owning contract `docs/contracts/plugin-qa.md` 的「工作树测试配置准备」小节，说明新的可用入口。

## 代码风格

沿用 `scripts/` 既有约定：Node ESM、具名导出、`node:test`；核心边界有准确 JSDoc 类型；错误经 `safeError` 脱敏后抛出，不打印 `loginUrl`；不引入额外依赖。

## 测试策略与执行计划

1. 先写失败单元测试：`scripts/worktree-app-qa.test.mjs` 覆盖报告结构、断言失败路径、清理调用、反向对照（非 `.worktrees` 路径必须拒绝）；`scripts/guard-quality-loop.test.mjs` 补 `worktree.sh ship` 与新反向用例。
2. 只写使测试通过的最小实现；位置校验保持拒绝语义不变。
3. 在**本工作树**真实执行一次完整流程，保留真实截图与结构化报告，确认端口与进程零残留。
4. 反向对照实跑一次不合规路径，确认失败且原因可读。
5. 跑 `pnpm test:gates`、`node --test scripts/guard-quality-loop.test.mjs scripts/worktree-app-qa.test.mjs`、`git diff --check`；独立评审后按仓库流程 PR / Merge Queue。纯脚本改动无需 Dev 物化。

## 边界

**始终**：先失败测试后实现；只修改本任务工作树；脱敏（不打印、不落盘 `loginUrl` 与任何密钥）；明确区分模拟与真实执行；证据落 `.workbuddy/evidence/**` 与 `docs/evidence/**`。

**先确认**：改动 `validateRoot` 的拒绝语义；扩张到其它提供商或生产配置；跨仓写入；额外付费请求；长期运行服务。

**绝不**：放宽任何一条位置约束以"让流程丝滑"；复制整个 Dev profile；写回 Dev；读取 Prod；提交或打印密钥；伪造登录 Cookie；用 HTTP 200 或页面标题冒充业务验收通过；让 Stage 夹具冒充完整应用验收。

## 非目标

- 不实现工作树位置自动迁移（用户选择方案 A，未选 B）。
- 不实现任务插件自动装入私有 profile（属另一条独立缺口，本次不扩范围）。
- 不改 Electron / CDP 原生验收路径（`pnpm verify:cdp` 保持独立）。
