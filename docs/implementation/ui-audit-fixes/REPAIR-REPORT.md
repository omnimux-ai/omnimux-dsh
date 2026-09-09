# UI audit — QA 返修报告

## 判定与固定身份

- **IS_PASS: YES（本地工程返修与制品一致性）；IS_PASS: NO（完整产品/UI 验收）**。K1 已修复；正式 L2 仍受 viewer/settings 不兼容阻断，未宣称浏览器通过。
- 2026-09-09，Engineer Alex；未另委派、未 fetch/push/PR/merge/部署，未改 viewer、官方 DSH、主 kit README、profile 或全局配置。仅两个指定任务树修改。
- 产品受审起点 `7f0dee48eeba47393fd5ddd60caab79014c96bed`；产品 base `867b192ecf6aa35be4e1639db7351a89bea782c7`。本轮没有修改产品业务 src，五包重建消费新 kit。
- kit 起点 `eba33873f3ebaf89ba69e8bbe9d53cafd5402283`；base `9d52a0cd5b41211d4fd8a260330b89d50be99f64`；返修源码/build `9452897f86931376fdd18f6f628e5be8c6d2ac44`，最终固定 HEAD `0cff2942d1248bffb39176d05b1defa45ff1057a`（补齐 declaration map）。kit 工作树干净。
- 产品最终提交由 `repair/delivery.json` 固定，避免将提交自身 SHA 写入被该提交包含的文件造成循环。

## 修复与回归

1. `src/drawer/Drawer.tsx`：`Symbol.for("dsh-ui-kit.drawer.scroll-locks.v1")` 在同 realm globalThis 上安装不可枚举、不可替换的 WeakMap。每个实际 HTMLElement 对应 owner Set 和首个 overflow；独立插件 bundle 复用相同 registry，最后 owner 释放才恢复。释放保持幂等，WeakMap 不强持有容器。协议版本用于未来不兼容更改；不声称兼容未更新的旧 bundle 或不同 realm。
2. `src/stage/PageHeader.module.css`：只读核对主树原始 diff 后，补入已授权的 `border-bottom: none`。其余 CSS 和无关 kit README 未改。
3. `scripts/ui-audit.repair.test.mjs`：真正重复执行编译后 kit 模块，不走模块缓存；B 在 A 打开后才加载；两种顺序 × close/unmount × StrictMode，共 8 项，加自定义容器独立性、构建 CSS 实际挂载与无边框计算样式，共 10 项。
4. 既有 `ui-audit.independent.test.mjs` 与 QA-REPORT.md 原文未修改。K1 原失败测试现在通过，其他 F1/F2/F3/K2/K3/Hook/TypeCard/AssetGrid 修复保持。

首次新增 PageHeader 断言将 CSS shorthand 当作原字符串，JSDOM 实际将 `border-bottom:none` 规范化为 shorthand `medium`、style `none`。最小独立复现确认后改测 longhand 与 computed borderBottomStyle；未改源码迎合测试。这是 DOM/CSS 证据，不是视觉 PNG。

## 本轮实际检查

| 检查 | 结果 | 证据 |
|---|---|---|
| kit `npm run typecheck && npm run build` | exit 0 | 本轮工具回执 |
| kit `node --test src/**/*.test.js src/kit-export.test.js` | 56 pass | 本轮工具回执 |
| behavior + 原 independent + repair | 26 pass / 0 fail | repair-behavior.log |
| accounts 完整 test | 62 pass | repair-test-accounts.log |
| analytics 完整 test | 84 pass | repair-test-analytics.log |
| inspiration 完整 test | 189 pass / 2 skip | repair-test-inspiration.log |
| publish 完整 test | 254 pass | repair-test-publish.log |
| assets 完整 test | **347 pass / 5 fail** | repair-test-assets.log |
| 五包原始 `npm --prefix plugins/<name> run build` | 全部 exit 0 | repair-build-*.log |
| Stage | 10 Stage / 8 sidebar PASS | repair-stages.log |
| 新制品独立重建核对 | 5 bundle、73 tar 文件、31 source map 源文件一致 | repair-binding.log、repair/binding-result.json |
| 两仓 `git diff --check` | exit 0 | 本轮工具回执 |

上述 Node 测试合计 **1025 tests / 1018 pass / 5 fail / 2 skip**。5 fail 仍全部来自缺失历史 `omnimux-assets-0.2.0.tgz`，与 QA 首轮相同。首轮 QA 的 1015/1007/6/2 是历史事实，不覆盖；现在 K1 转绿并增加 10 项。原 README 完整 assets 的 348 已纠正为 347。

assets 基线结论引用未改动的 QA-REPORT.md 第 96–104 行：固定 base 测试相同、同环境同五项 before hook 失败。未造历史 SHA 包、未删/排除完整测试；真正供给历史归档或另行批准版本化归档验收策略仍属后续工作。本轮未重复全基线仓测试。

## 制品与可复现绑定

- 当前 `binding.json` 包含 kit commit/lib/tgz、dependencyRealpath、五包 SHA/字节数和产品业务源码提交；tar 路径明确为 `repair/dsh-ui-kit-0.1.0.tgz`。
- kit lib SHA256：`724912626ca72d49de0743bb578dad21943d4ae369176f4155f639ddf84ab85d`。
- kit tar SHA256：`8f7f7161294ecbbcf6f20e81f95d8e862941e71e567607599455b57658ac8b72`。
- `repair/kit-fix.bundle`、`repair/product-fix.bundle` 为新版；父目录旧 tar/bundle 与 qa-* 全保留。新 bundle 用固定 base 作 prerequisite，不是无基线全仓备份。
- `node scripts/ui-audit.repair-binding.mjs` 读取当前 clean kit、更新 binding，并仅在执行 QA 核对代码时重定向新 tar/输出路径。原 QA 脚本不改、不覆盖首轮输出。源码/lib/tar 与五包重建字节一致。
- 运行原 `ui-audit.binding-qa.mjs` 会读父目录旧 tar，不能作为新 binding 的入口；新版明确使用 repair-binding，防止混淆。原 QA 文件哈希另记于 `repair/protected-qa-sha256.json`。

## 正式 L2 环境依赖（不扩仓）

QA 已获准初始化的任务仍为 `/Users/x/.dsh-dev/tasks/ui-audit-qa-0909`，profile `profiles/omnimux-dev-ui-audit-qa-0909`。首轮启动错误：viewer 导入官方 settings 不存在的 `installSettingsSection`。本轮未重试相同 Host、未删插件、未改 viewer/官方/seed。

只读复核任务 snapshot kit index.js SHA256 仍为 `cb27fd9f29182777516098dcec703657810042029bb47c5bc662f9480f4c13fb`，不是上面的新 kit；本地 accounts 内联 bundle 更新不等于整个任务 profile kit 更新。

### 既有脚本支持范围与执行方案（只读核实，未执行）

- `dev-env.sh:684–690` 仅新任务克隆 seed，已有 node_modules 不重新绑定 kit。
- `sync-to-app.sh:323–335,398–419,474–478` 支持 `OMNIMUX_DSH_UI_KIT_DIR` 指定固定 kit，**无插件参数的完整同步**可以仅落指定任务根；命名插件只验 kit 一致性，不更新 kit。
- `managed-tarball.mjs:364–369` 拒绝 `conflicting managed source`，并要求既有 kit 与 authority 一致。它不是“覆盖旧 kit”的 task-only 更新入口，不能拿新 tgz 硬塞。
- 可用的是 **task-only full-profile sync**，不是 **kit-only sync**。会重建/物化该任务的全插件与 presets，保留合法单在研 link；当前用户只要求只读方案且禁止部署，所以未执行。

在环境 owner 提供兼容 viewer/Host 纳管证据，并获准该任务全 profile 更新后，从本产品任务树执行既有底层入口（不进入外部 shell 仓）：

```sh
TASK=/Users/x/.dsh-dev/tasks/ui-audit-qa-0909
KIT=/Users/x/Desktop/Project/dsh-plugin/personal/dsh-ui-kit/.worktrees/ui-audit-fixes
OMNIMUX_ALLOW_UNMERGED_TARGET="$TASK" \
OMNIMUX_DSH_UI_KIT_DIR="$KIT" \
OMNIMUX_SKIP_KIT_BUILD=1 \
COREPACK_ENABLE_NETWORK=0 \
npm_config_store_dir="$TASK/profiles/.pnpm-store/v10" \
bash scripts/sync-to-app.sh --target="$TASK"
```

前置：确认无同任务 Host/install/配置编辑并发、固定 kit HEAD/lib hash 与 binding 一致、任务受管 snapshot 完整。显式私有 store 与 dev-env.sh:368–370 一致；不设 --prod/--all，不手改 profile，不改全局配置。此命令会构建所有目标插件，当前仅五包构建证据不能预先保证 full sync 成功。若非目标 source/installed/lock 校验失败，保留现场，由 owner 通过受支持入口修复；不删 journal 或链接绕过。

完成后核验 snapshot 与 installed kit 全文件身份、新五包 bundle、单 link、SOURCE/COMMIT；恢复正式 Host 并用 git-wt 的成功启动路径生成 `.l2-dev.env`，禁止手写。然后通过 ego-browser + verify:live 执行 QA-REPORT.md 的全部专项。现有已失败任务的名字与工作树命名不匹配时，由环境 owner 选择正式 task/worktree 绑定，不伪造环境文件。

### pnpm verify:live 的 file 解析错误

本轮实际先试 `npm_config_verify_deps_before_run=false pnpm verify:live ...`，仍触发自动 install，exit 1（内层 254），同 file 路径错误；日志 repair-verify-live.log。未完成依赖安装，未手改 store。

改用 pnpm 明确 CLI 优先级后成功进入正式 script：

```sh
pnpm --config.verify-deps-before-run=false run verify:live accounts --target=l2 --url=http://127.0.0.1:44201/
```

`repair-verify-live-cli.log` 证明 file 解析问题不再拦截；实际 exit 1 为缺少 `.l2-dev.env`。正式 run `c948ec07-d4ae-4dcd-a75b-211bd810bea5`，未创建有效 probe/浏览器证据。此单次参数不修改全局配置、不改变 live QA 验收条件，仅跳过 pnpm 自动依赖安装；L2 身份未就绪仍失败，符合预期边界。

## 收口

本地返修可交 QA 第二轮复核，不可当作 UI 放行或已部署。剩余 owner：环境 owner 提供兼容依赖及获准的任务绑定；QA 完成新制品独立复核与正式 ego 专项。assets 历史制品验收单独保留。无仍在运行的本任务后台工作。
