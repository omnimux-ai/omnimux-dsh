# Spec: 隔离验收布局修复的评审整改（asar 回退 / `!!js` 序列化 / 递归裁剪）

- Issue: #3871（整改轮；上一轮 PR #3888 已合入）
- 风险级别: R1（验收基础设施；可逆）
- Base: `origin/main` @ `398023b6d`
- 依赖: 无

## 1. 目标

上一轮合入的 `scripts/host-runtime-layout.mjs` 有 4 个真问题，会让「旧布局兼容」失效、让合成出的 preset 声明写坏平台条件、让部分预设被 rc.3 判为不可用：

1. **旧 `app.asar` 回退永不可达**：真实 asar 是单个归档文件，`statSync('<app.asar>/lib/desktop-cli.js')` 抛 `ENOENT`/`ENOTDIR`，两个候选都不 `isFile` → 直接 `RUNTIME_MISSING`。旧布局实际是**回归**（修复前旧 App 可用）。
2. **`!!js` 序列化写坏**：`stringify` 回调取错节点，yaml v2 传的是 `Scalar`，表达式在 `item.value.__jsExpr`。实测真实 App 的 38 条 preset 里 68 处 `!!js` 全变成 `!!js undefined` → 平台条件恒为假，macOS 会挂上 Windows 专用工具行。
3. **rc.3 拒绝字段裁剪不递归**：壳的实现会递归进 `config` 数组；当前只裁顶层，`marketing-agent` 仍留 10 条带 `persona` 的 `tool-subagent` 行 → rc.3 抛错，该预设不可用。
4. （已在本轮前修）单测 stub 场景探测真实文件系统，打红无 App 的 CI。

本整改把 1–3 修对，并补能挡住这三类错误的测试。

## 2. 现状与真源

| 事实 | 位置 | 本次动作 |
|---|---|---|
| asar 是归档文件，不是目录 | 实测 `statSync(.../app.asar/lib/desktop-cli.js)` → `ENOENT` | 候选探测改为「`app` 布局按文件探测；`app.asar` 布局按归档存在性探测（`app.asar` 自身 `isFile`）」，Electron 能读归档内部 |
| `!!js` 表达式节点形状 | `yaml` v2 `stringify` 回调收到 `Scalar` | 改为读 `item?.value?.__jsExpr` |
| 壳的裁剪是递归的 | 宿主 `profile-*.js` 的 `reduceSubagentRow` 会进 `config` 数组 | 递归遍历 `config` 数组内同构行 |
| 单测 fakeBundle 造的是名为 `app.asar` 的目录 | `scripts/host-runtime-layout.test.mjs` | 改为造真实语义：`app.asar` 是文件 |

## 3. 实现设计

1. `resolveHostRuntimeLayout`：
   - 先探测 `Contents/Resources/app/lib/desktop-cli.js` 是否 `isFile`；
   - 否则探测 `Contents/Resources/app.asar` 是否 `isFile`（归档本身），命中即返回该布局的 wrapper 路径（不 stat 归档内部）；
   - 都缺才 `RUNTIME_MISSING`。
2. `stringifyStructuredFile`：`stringify: (item) => item?.value?.__jsExpr ?? item?.__jsExpr`，并补 round-trip 测试（解析 → 序列化 → 再解析，断言 `!!js` 表达式仍在）。
3. `pruneRejectedFields`：递归处理 `config` 里的数组（壳同款），返回 `reduced` 标记；`pruneUnresolvable` 同步只对 `@` 作用域包名做解析判定（与壳一致），避免误删 `cordis:` 之外的本地别名。
4. 补测试：asar 归档布局、`!!js` round-trip、嵌套 `persona` 裁剪、无 App 机器的 CI 场景（已修，保留回归）。

## 4. 范围 / 非目标

范围：`scripts/host-runtime-layout.mjs`、`scripts/host-runtime-layout.test.mjs`、必要时 `scripts/test-env-bootstrap.mjs` 的调用点、本 spec。

非目标：不改产品插件源码；不改验收断言口径；不改共享 Dev profile；不引入第二种 Host。

## 5. 验收标准（可观察）

- [ ] 旧 `app.asar` 归档布局能探测到并返回该布局 wrapper（单测用真实语义：`app.asar` 为文件）。
- [ ] `!!js` 表达式 round-trip 后仍为表达式，不出现 `!!js undefined`。
- [ ] 嵌套在 `config` 数组里的 `persona`/`toolFilter` 被裁掉，`reduced` 标记正确。
- [ ] 真实 App（asar:false 2.0.21）上 smoke 仍通过；合成出的 patch 里 `!!js` 表达式完好。
- [ ] 相关单测全绿；`git diff --check` 通过。

## 6. 新用户基线

只影响仓库验收基础设施，不进入产品运行时；探测按实际安装布局，缺件显式失败，不静默降级。

## 假设

- 假设 A：Electron 的 `--expose-internals <app.asar>/lib/desktop-cli.js` 能读归档内部，因此「归档存在」即可作为旧布局可用判据，无需 stat 内部文件。
- 假设 B：壳的裁剪语义就是「递归进 config 数组裁掉 rc.3 拒绝字段」，因此隔离 profile 用同一套规则不会写出被拒的 preset。
- 假设 C：yaml v2 的 `stringify` 自定义 tag 回调收到的是 `Scalar`（`value` 为原始表达式字符串），因此取 `item.value.__jsExpr` 才能写回 `!!js`。

## 证伪方式

- 证伪 A：在旧 asar 布局机器上探测仍报 `RUNTIME_MISSING`，或 Electron 启动报找不到 `desktop-cli.js` → 说明判据不对，需要改成「归档 + 内部路径」双条件。
- 证伪 B：隔离环境启动后仍有预设被标 broken（`agent-preset/invalid`）→ 说明裁剪规则与壳不一致，需要抓壳实际写入的 patch 逐行对比。
- 证伪 C：round-trip 后 `!!js` 变成字符串或 `undefined` → 说明节点取错，应改为按 `Scalar` 实例判断并保留 `source`。

## 9. 证据计划

- 单测：`node --test scripts/host-runtime-layout.test.mjs`（含 asar 归档、`!!js` round-trip、嵌套裁剪）。
- 真实运行：asar:false Dev App 上 `node scripts/worktree-app-qa.mjs` smoke；并检查合成 patch 的 `!!js` 完好。
- 相关回归：`test-env-bootstrap*.test.mjs`、`worktree-app-qa-task.test.mjs`、`task-runtime-proof.test.mjs`。
- `git diff --check`；`node scripts/impact-matrix.mjs --git-diff --base origin/main`。

## 10. 文档影响

`docs/contracts/plugin-qa.md` 已描述布局规则，本轮不改契约语义，只在实现层修正探测判据；若契约里「app.asar 回退」表述需要补充归档语义，同步一行说明。

## 旧标准变更

- `scripts/host-runtime-layout.test.mjs` :: `注入的 fs 缺 statSync 时退回默认布局，不因本机没装 App 报错`

原断言：注入缺少 `statSync` 的 stub fs 时，探测返回默认 `app` 布局且不报错。

必须改的理由：这正是评审指出的「生产模块里的静默降级」——把「没有探测能力」当成「布局存在」，会让任何注入不完整 io 的调用方直接命中第一个候选，与 spec §6「缺件显式失败、不静默降级」冲突。

新期望证据：同一场景改为断言 `resolveHostRuntimeLayout({ io: stub })` 抛 `TypeError`（`io.statSync is required`），即探测能力缺失是调用方错误而不是布局可用证据；对应实现把该分支从「返回 true」改为 `throw`，并新增 `defaultHostLayout()` 承担「不探测文件系统」的显式路径（由 `defaultHostLayout 不探测文件系统` 用例覆盖）。

- `scripts/host-runtime-layout.test.mjs` :: `preset 合成丢弃宿主解析不到的包行，但放过 Loader 内建别名`

原断言：任何解析不到的 `name`（含裸本地别名 `not-installed-anywhere`）都被丢弃。

必须改的理由：评审实测壳只对 `@` 作用域包名做解析判定；对裸本地别名一律丢弃会误删合法行。实现已收敛到 `@`，断言必须同步。

新期望证据：同一用例改为断言只丢 `@deepseek-ai/dsh-missing`，`cordis:group` 与裸别名 `local-alias` 都保留；另加 `pruneUnresolvable 只对 @ 作用域包名做解析判定` 用例固定该语义。

- `scripts/host-runtime-layout.test.mjs` :: `没有预设目录的旧 App 返回空合成结果`

原断言：`app.asar` 布局下没有 preset 目录时返回空合成结果。

必须改的理由：归档布局的判据已改为「能列出归档内 `preset/agent-presets`」——不可读归档现在直接 `RUNTIME_MISSING`，不会再走到「返回空结果」。该用例的语义已由 `不可读的 app.asar 归档被判为不可用，响亮报 RUNTIME_MISSING` 覆盖，原用例改为在 `app` 布局上验证「无预设目录 → 空结果」，与新语义一致。

新期望证据：`没有预设目录时返回空合成结果（调用方据此响亮失败）` 在 `app` 布局断言空结果含诊断字段；归档不可用场景由独立用例断言抛 `TEST_ENV_RUNTIME_MISSING`。
