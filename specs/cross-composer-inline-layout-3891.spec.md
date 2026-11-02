# Spec: composer inline 私有安装按实际宿主布局解析

- Issue: #3891
- 风险级别: R1（验收基础设施；可逆）
- Base: `origin/main` @ `b42529365`
- 依赖: 复用 #3871 引入的 `scripts/host-runtime-layout.mjs`

## 1. 目标

`scripts/composer-inline-bootstrap.mjs` 仍硬编码旧打包布局：

- `cli = '<Dev App>/Contents/Resources/app.asar/node_modules/@deepseek-ai/dsh/lib/bin.js'`
- 前置检查 `cli.split('/app.asar/')[0] + '/app.asar'`

本机 Dev App 2.0.21 是 `asar: false`，`Resources/app.asar` 不存在，两条路径实测 `ENOENT`，composer inline 通道在新版 App 上必然前置失败。

本改动让这条通道复用 `host-runtime-layout.mjs` 的布局探测：CLI 入口与宿主包根都按实际布局推导（`app` 优先、`app.asar` 回退），缺件时报可读错误。

## 2. 现状与真源

| 事实 | 位置 | 本次动作 |
|---|---|---|
| CLI 入口硬编码 `app.asar/node_modules/@deepseek-ai/dsh/lib/bin.js` | `scripts/composer-inline-bootstrap.mjs:11` | 改为按布局探测推导 |
| 前置检查把 `app.asar` 当目录 `accessSync` | 同文件 `:70` | 改为检查实际布局的宿主包根 |
| 布局探测已有单一实现 | `scripts/host-runtime-layout.mjs`（#3871 引入，含 `resolveHostRuntimeLayout` / `appPackageRootFor`） | 复用，不重复实现 |
| 旧 `app.asar` 布局需继续可用 | 同上 | 回退分支保留 |

## 3. 实现设计

1. `composer-inline-bootstrap.mjs` 引入 `resolveHostRuntimeLayout`、`appPackageRootFor`。
2. CLI 入口 = `<Resources>/<app|app.asar>/node_modules/@deepseek-ai/dsh/lib/bin.js`，由布局推导；前置检查改为：
   - 可执行文件 `X_OK`；
   - CLI 入口 `R_OK`（不再把归档当目录检查）。
3. 探测失败（布局不可用 / 入口缺失）时抛带候选路径的可读错误，不再是裸 ENOENT。
4. 若布局模块在该通道不可用（理论上不会），不静默降级，直接报错。

## 4. 范围 / 非目标

范围：`scripts/composer-inline-bootstrap.mjs` 的入口解析与前置检查、对应测试、本 spec。

非目标：不改产品插件源码；不改 composer inline 的业务断言；不改 `test-env-bootstrap.mjs`（已由 #3871 处理）；不新建第二套测试环境。

## 5. 验收标准（可观察）

- [ ] 在 asar:false 布局（本机 2.0.21）上，`startComposerInlineEnvironment` 的前置检查通过，能继续走 `dsh plugin add`。
- [ ] 旧 `app.asar` 布局仍能解析出 CLI 入口（单测覆盖两种布局）。
- [ ] 布局不可用 / CLI 入口缺失时报可读错误并含候选路径，不抛裸 ENOENT。
- [ ] 相关单测通过；`git diff --check` 通过。

## 6. 新用户基线

只影响仓库验收通道，不进入产品运行时；按实际安装布局探测，缺件显式失败。

## 假设

- 假设 A：新版 `Resources/app/node_modules/@deepseek-ai/dsh/lib/bin.js` 与旧 `app.asar` 内同名入口在 CLI 契约上等价，因此换路径即可继续 `dsh plugin add`。
- 假设 B：`host-runtime-layout.mjs` 的布局判据（`app` 按入口文件、`app.asar` 按能否列出归档内 preset）足以代表「该布局的宿主包可解析」，不需要为 composer 通道另设判据。

## 证伪方式

- 证伪 A：换路径后 `dsh plugin add` 报入口不兼容或参数不同 → 说明两代 CLI 契约不等价，需要按代际分流而不是只换路径。
- 证伪 B：布局判为可用但 `appPackageRootFor` 推导出的宿主包根里没有 `lib/bin.js` → 说明该通道需要比「布局可用」更细的判据（例如直接检查 `bin.js` 存在），应改为按目标文件探测。

## 9. 证据计划

- 单测：CLI 入口按布局推导（`app` / `app.asar` 两种）、缺件报可读错误。
- 真实运行：本机 asar:false Dev App 上前置检查通过（可只跑前置与 `--version`，不必跑完整 e2e）。
- `node --test scripts/composer-inline-bootstrap.test.mjs`；`git diff --check`；`node scripts/impact-matrix.mjs --git-diff --base origin/main`。

## 10. 文档影响

无合同改动：`docs/contracts/plugin-qa.md` 已描述「宿主入口按安装布局探测」，本条只是让另一条通道也遵守同一规则，不改契约语义。
