# Spec: dsh-ui-kit 的 prepublishOnly 路径修正

- Issue: #3872
- 风险级别: R1（改 `packages/` 发布脚本声明 + 影响全新工作树安装；可逆）
- Base: `origin/main` @ `6ff9d15ac`
- 依赖: 无

## 1. 目标

`packages/dsh-ui-kit/package.json` 的 `prepublishOnly` 写成 `node ../scripts/verify-publish-source.mjs .`，相对 `packages/dsh-ui-kit/` 解析为 `packages/scripts/verify-publish-source.mjs`（不存在），正确目标是仓库根 `scripts/verify-publish-source.mjs`，应为 `../../scripts/...`。本改动把该路径改对，并补一条能挡住同类深度错误的守卫测试。

## 2. 现状与真源

| 事实 | 位置 | 本次动作 |
|---|---|---|
| 该行由 PR #3858（`79506edc3`，2026-10-30）引入，同一提交里 20 个插件包都写成正确的 `../../scripts/...`，只有 `packages/dsh-ui-kit` 少一级 | `packages/dsh-ui-kit/package.json:33` | 改为 `../../scripts/verify-publish-source.mjs` |
| 目标脚本真实存在 | `scripts/verify-publish-source.mjs` | 不改 |
| 全新工作树 `pnpm install` 会执行 `prepublishOnly`（npm/pnpm 生命周期），路径不存在即失败；CI 用 `--ignore-scripts` 安装，因此 CI 从未暴露 | `.github/workflows/*.yml` 的 `corepack pnpm install --frozen-lockfile --ignore-scripts` | 不改 CI；修正声明面 |
| 同类声明可被一条静态断言全覆盖 | `scripts/verify-publish-source.test.mjs`（既有脚本测试） | 新增用例：遍历 `packages/*` 与 `plugins/*` 的 `prepublishOnly`，解析出的脚本路径必须存在 |

## 3. 实现设计

1. `packages/dsh-ui-kit/package.json`：`prepublishOnly` 路径 `../scripts/` → `../../scripts/`。
2. 守卫测试（新文件 `scripts/prepublish-path-depth.test.mjs`）：读取 `packages/*/package.json` 与 `plugins/*/package.json`，对声明了 `prepublishOnly` 的包解析脚本相对路径，断言 `existsSync` 为真；失败信息带上包名与解析后的路径，防止未来再少写一级。

## 4. 范围 / 非目标

范围：`packages/dsh-ui-kit/package.json` 一行声明、一条守卫测试、本 spec。

非目标：不改 `scripts/verify-publish-source.mjs` 的校验逻辑；不改 CI 安装参数；不改其它包已正确的声明；不触发真实发布。

## 5. 验收标准（可观察）

- [ ] `packages/dsh-ui-kit/package.json` 的 `prepublishOnly` 解析目标存在。
- [ ] 新守卫测试在修复前红（当前路径不存在）、修复后绿。
- [ ] 全仓所有 `prepublishOnly` 声明解析目标均存在（遍历断言）。
- [ ] `git diff --check` 通过；`node --test scripts/prepublish-path-depth.test.mjs` 通过。

## 6. 新用户基线

本改动只修仓库内的发布脚本声明，不进入产品运行时：全新用户安装 App 后不会执行该脚本。影响面仅限「开发者/Agent 在全新工作树执行 `pnpm install`」。若路径再次写错，安装会在生命周期脚本处显式失败并打印缺失路径，不会静默跳过。

## 假设

- 假设 A：npm/pnpm 在 `pnpm install` 时确实会跑依赖包的 `prepublishOnly`（本次故障即由此产生），因此该声明错位是真实安装阻塞，而不是仅在 `npm publish` 时才有影响。
- 假设 B：仓库内所有同类声明的正确形态就是「相对包目录解析到仓库根 `scripts/`」，不存在指向包内私有脚本的合法变体。

## 证伪方式

- 证伪 A：在全新工作树执行 `pnpm install`（不带 `--ignore-scripts`）却不触发该脚本、安装照常成功 → 说明故障另有原因，需要重新定位真实阻塞点而不是改这一行。
- 证伪 B：若某个包的 `prepublishOnly` 合法地指向包内脚本（而非仓库根 `scripts/`）→ 守卫测试会误报，此时应改为白名单/存在性双条件，并在 spec 记录例外。

## 9. 证据计划

- `node --test scripts/prepublish-path-depth.test.mjs`（新增守卫；修复前红、修复后绿）。
- `node --test scripts/verify-publish-source.test.mjs`（既有目标脚本测试不回归）。
- `node scripts/impact-matrix.mjs --git-diff --base origin/main`（确认是否需要浏览器证据；预期不需要）。
- `git diff --check`。
- 真实安装验证：在隔离工作树跑 `corepack pnpm install --frozen-lockfile`（不带 `--ignore-scripts`）确认不再在该脚本处失败。

## 10. 文档影响

无合同改动：该路径属于包声明面，`docs/contracts/` 未描述 `prepublishOnly` 的具体相对深度；修正不改变任何契约语义。
