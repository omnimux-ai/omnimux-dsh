# Spec: 隔离工作树验收适配 asar:false 的新版 Dev App 布局

- Issue: #3871
- 风险级别: R1（改 `scripts/` 验收基础设施 + 影响所有 UI 任务的 Agent 验收通道；可逆）
- Base: `origin/main` @ `6ff9d15ac`
- 依赖: 无

## 1. 目标

本机 2026-11-01 装的 OmniMux Dev App 2.0.21 改成 `asar: false` 打包：脚本入口在 `Contents/Resources/app/lib/desktop-cli.js`，`Contents/Resources/app.asar` 已不存在。仓库 `scripts/test-env-bootstrap.mjs` 仍硬编码 `Resources/app.asar/lib/desktop-cli.js`，导致 `pnpm verify:app` / `node scripts/worktree-app-qa.mjs` 在本机完全不可用（`TEST_ENV_RUNTIME_EXIT`，App stderr：`Cannot find module .../app.asar/lib/desktop-cli.js`）。所有需要「隔离工作树真实浏览器」的 Client/Stage 任务都被卡住。

本改动让验收链路按实际布局解析宿主入口：优先 `Resources/app/lib/desktop-cli.js`，回退 `Resources/app.asar/lib/desktop-cli.js`；两者都不存在时报明确的 `RUNTIME_MISSING`，不静默降级。

## 2. 现状与真源

| 事实 | 位置 | 本次动作 |
|---|---|---|
| 宿主入口硬编码 `Resources/app.asar/lib/desktop-cli.js` | `scripts/test-env-bootstrap.mjs:17` | 改为布局解析函数（asar 优先回退） |
| 隔离安装把 `appAnchor` 固定推导成 `Resources/app.asar/node_modules/@deepseek-ai/dsh/package.json` | `scripts/task-runtime-install.mjs:488` | 改为按 wrapper 实际所在布局推导（`app/` 或 `app.asar/`） |
| 契约校验把 `appAnchor` 与 `runtimeExecutable + ../Resources/app.asar/...` 做字符串相等断言 | `scripts/worktree-app-qa.mjs:1032` | 改为布局无关的推导比较 |
| 服务端 peer 证明把 `appAnchor` 固定匹配 `/app.asar/node_modules/...` 并据此切 `appRoot` | `scripts/task-runtime-proof.mjs:205-206,457` | 改为按 anchor 实际布局解析根目录 |
| 新版 App 把 agent preset 改为壳启动时注入 Loader 行；隔离启动走 `desktop-cli.js` 绕过壳，新建会话报 `agent-preset/not-found: Unknown agent preset: omni-agent` | `scripts/test-env-bootstrap.mjs`（隔离 profile 的 `cordis.patch.yml` 由 Dev 复制，Dev 里只有 registry 行 `selectedDefault: omni-agent`，没有 preset 声明行）；壳侧真源 `Contents/Resources/app/lib/profile-*.js` 的 `composeShippedAgentPresetRows` | 隔离 profile 追加与壳等价的 `@deepseek-ai/dsh-agent-preset` 声明行（读 `<App>/Contents/Resources/app/preset/agent-presets/*`），跳过上游已声明的 id、丢弃无法解析的包行、按 rc.3 拒绝字段裁剪 |

## 3. 实现设计

1. `resolveHostRuntimeLayout()`（`scripts/test-env-bootstrap.mjs`）：
   - 候选顺序 `Contents/Resources/app/lib/desktop-cli.js` → `Contents/Resources/app.asar/lib/desktop-cli.js`；
   - 返回 `{ executable, wrapper, appRoot }`；都不存在时抛 `RUNTIME_MISSING` 并附候选路径；
   - `appRoot` = wrapper 上溯到 `Resources` 下的 `app` 或 `app.asar` 目录。
2. `appAnchor` 推导统一走 `appAnchorFor(wrapper)`：`<Resources>/<app|app.asar>/node_modules/@deepseek-ai/dsh/package.json`。`task-runtime-install`、`worktree-app-qa` 校验、`task-runtime-proof` 全部改用该推导，不再写死 `app.asar`。
3. 隔离 profile 的 preset 声明：在写 `cordis.patch.yml` 时，若 `<App>/Contents/Resources/app/preset/agent-presets` 存在，则按壳同样的三条规则合成 `insert` 行追加；`preset` 根目录不存在时跳过（旧 App 行为不变）。
4. 保留旧布局兼容：旧 `app.asar` App 走回退分支，行为与今天一致。

## 4. 范围 / 非目标

范围：`scripts/test-env-bootstrap.mjs`、`scripts/task-runtime-install.mjs`、`scripts/task-runtime-proof.mjs`、`scripts/worktree-app-qa.mjs` 的布局解析与 preset 行合成，及对应测试。

非目标：不改产品插件源码；不改验收断言口径；不新建第二套 App/Host 测试环境；不修改官方 DSH 或壳层源码；不动 `~/.omnimux-dev` 共享 profile；不引入 Dev 专用默认路径（布局按实际安装探测，缺文件即显式失败）。

## 5. 验收标准（可观察）

- [ ] 在本机 asar:false 的 Dev App 2.0.21 上，`node scripts/worktree-app-qa.mjs --journey <任务内 journey>` 能启动隔离环境并跑完检查（不再 `TEST_ENV_RUNTIME_EXIT`）。
- [ ] 新建会话不再报 `agent-preset/not-found`：隔离 profile 的 patch 里有与壳等价的 preset 声明行，且 `selectedDefault` 指向的预设可解析。
- [ ] 旧 `app.asar` 布局不回归：布局解析函数在两种布局下都返回可用的 wrapper/appRoot，缺文件时报 `RUNTIME_MISSING`。
- [ ] 单测覆盖：布局解析（两种布局 + 缺失）、`appAnchor` 推导、preset 行合成（跳过上游 id / 丢弃不可解析包 / 裁剪 rc.3 拒绝字段）。
- [ ] `git diff --check` 通过；相关脚本测试通过。

## 6. 新用户基线

本改动只影响仓库的 Agent 验收基础设施，不进入产品运行时、不改变用户安装后的任何行为。验收链路按实际安装布局探测入口，找不到时显式失败并打印候选路径，不会静默降级到别的 Host 或伪造证据。

## 假设

- 假设 A：新版 Dev App 的 `Contents/Resources/app/lib/desktop-cli.js` 与旧 `app.asar` 版入口在 CLI 契约上等价（同样的 `--profile/--port/--host/--no-open` 与 `--expose-internals` 用法），因此换入口即可启动隔离环境。
- 假设 B：隔离启动绕过壳导致 `agent-preset/not-found`，根因是壳在启动时向 profile 注入 `@deepseek-ai/dsh-agent-preset` 声明行；只要隔离 profile 自己声明同样的行，预设即可解析。
- 假设 C：`appAnchor` 只用于「宿主包解析锚点」，其语义不依赖 `app.asar` 这一具体布局，因此按实际布局推导不降低证明强度。

## 证伪方式

- 证伪 A：换入口后仍 `TEST_ENV_RUNTIME_EXIT`，或 App stderr 出现与入口无关的新失败 → 说明两代入口契约不等价，需要按代际分别构造启动参数，而不是只换路径。
- 证伪 B：隔离 profile 已声明 preset 行，新建会话仍报 `agent-preset/not-found` → 说明壳还注入了别的东西（例如 registry 的 `selectedDefault` 之外的映射），需要抓壳启动后的真实 patch 对比，而不是继续猜。
- 证伪 C：在 asar:false 布局下 `appAnchor` 推导出的路径无法被 Node 解析（例如宿主包实际在 `app/node_modules` 但 anchor 指到别处）→ 说明锚点语义确实绑定旧布局，应改为由 `require.resolve` 动态定位。

## 9. 证据计划

- 单测：布局解析、`appAnchor` 推导、preset 行合成（新增/既有 `scripts/test-env-bootstrap*.test.mjs`、`scripts/task-runtime-*.test.mjs`）。
- 真实运行：在本机 asar:false Dev App 上跑一次 `node scripts/worktree-app-qa.mjs`（不带 journey，smoke 级）证明环境可启动；再跑一次带 journey 的任务验收证明功能路径可达。
- `node scripts/impact-matrix.mjs --git-diff --base origin/main`；`git diff --check`。
- 独立评审：净室评审包（spec + diff + 证据）。

## 10. 文档影响

需要同步 `docs/contracts/plugin-qa.md` 的「工作树测试配置准备」一节：说明验收链路按安装布局解析宿主入口（`app` 优先、`app.asar` 回退）以及隔离 profile 自行声明 agent preset 行；否则后来者仍会按 `app.asar` 写死。
