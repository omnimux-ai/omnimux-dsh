# 任务沙箱侧边栏 support 包的精确版本豁免（Issue #3766 后续）

- 任务：`.worktrees/sidebar-peer-exemption`（分支 `agent/sidebar-peer-exemption`，基线 `origin/main` @ `f8249e3c4`）
- 日期：2026-10-25
- 上游阻断：`specs/cross-sidebar-support-identity.spec.md`「残留与证据」第 3 条

## 1. 问题

画布浏览器验收（`pnpm verify:app` 的任务沙箱安装阶段）现在硬阻断，宿主原文：

```
Plugin dsh-better-sidebar@0.19.1 is incompatible with dsh 0.2.1-rc.3:
requirements { 14 个非可选 @deepseek-ai/dsh-* peer 全为 ^0.1.5-rc.1 }.
Exact-version exemption: not active.
dsh: nothing was installed.
```

`dsh-better-sidebar@0.19.1` 把 14 个宿主 peer 从 `^0.1.2-rc.1` 抬到 `^0.1.5-rc.1`，而该区间语义是 `>=0.1.5-rc.1 <0.2.0-0`；当前宿主代际 `0.2.1-rc.3` **结构性**落在区间外，不是"忘了升级"。宿主提供的唯一正规出口是**精确版本豁免**（exact-version exemption），本仓从未启用，所以任务沙箱永远装不进这个包。

## 2. 宿主机制（实测确认，非推断）

从 `/Applications/DeepSeek Harness.app/Contents/Resources/app.asar`（文档串）与 `/Applications/OmniMux Dev.app/Contents/Resources/app.asar`（实际执行的任务宿主，同一份 `lib/types/profile-compatibility.js`）按字节偏移抽取，确认如下：

- **位置**：豁免写在 **profile 自己的** `<profileDir>/compatibility.json`（`PROFILE_COMPATIBILITY_FILENAME`），**不写进 `package.json`**。原文档串：「Exact-version exemptions live in the profile's own `compatibility.json`, not in its `package.json`」。
- **schema**：顶层是**对象**，键为精确 `package-name@version`，值为**精确 DSH 运行时版本数组**：

  ```json
  { "dsh-better-sidebar@0.19.1": ["0.2.1-rc.3"] }
  ```

  - 键：`lastIndexOf('@')` 拆分；包名须匹配 `/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/`；版本须是**规范化精确 semver**（`parse(v)` 且 `v === version(+build)`，不接受范围/前缀/空白）。
  - 值：精确 semver 字符串数组（`isVersionList`）。
  - 读不到文件 = 无豁免；文件损坏 = 该文件按只读处理，被拒记录打到 stderr，其余合法记录仍生效。
  - 写方格式：`JSON.stringify(exemptions, undefined, 2) + "\n"`，权限 `0o600`。
- **判定**：`evaluatePluginCompatibility(manifest, exemptions, runtimeVersion)` 里 `exempted = exemptions[`${name}@${version}`]?.includes(runtimeVersion) === true`。运行时版本 = `getDshRuntimeVersion()`（读 `@deepseek-ai/dsh-app-boot/package.json` 的 version）= `dsh --version` 的输出 = `0.2.1-rc.3`。
- **消费点**：`dsh plugin add` 预检先 `readProfileVersionExemptions(dir)`，对每个待装 spec 求 `evaluatePluginCompatibility`；`issue !== undefined && !issue.exempted` 即拒绝并 `nothing was installed`。同一份豁免在 profile 启动时也被 `loadProfileDirectory` 用于判断 bundle 是否跳过。
- **不继承**：插件升级或宿主升级都不继承授权（键与值都是精确版本）。

## 3. 设计

1. **声明是唯一真源**：`scripts/sidebar-support-identity.json` 新增 `peerExemptions: [{ package, version, hostSpec, reason, reviewedAt }]`。代码里不得再出现豁免名单或宿主版本字面量。
2. **宿主版本从宿主读**：`readHostRuntimeVersion()` 用安装器本来就持有的 `executable + wrapper` 调 `dsh --version`（宿主文档明说这就是运行时版本），并在存在 `<App>/Contents/Resources/build-info.json` 时用 `dsh.packageSpec` 交叉核对；两者不一致或读不到即 coded failure，绝不猜。
3. **只放行声明的精确对**：`applySupportPeerExemptions()` 先对每个 support manifest 重跑 `assertSidebarSupportIdentity`（豁免路径根本不可能为非 support 包签发），再要求"声明的 `package`+`version` 与真实 manifest 逐字相等"且"`hostSpec` 与运行时版本逐字相等"且"`reviewedAt` 在复核窗口内"，才写 `compatibility.json`。
4. **不静默**：
   - 未声明 → 不写文件，记 `support_exemption_undeclared` 警告并打到 stderr，随后由宿主自己响亮拒绝（保留可观测的原始拒绝原文）。
   - 已声明但 `hostSpec` 不符或 `reviewedAt` 过期 → **硬失败** `INSTALL_SUPPORT_EXEMPTION_STALE`。存在却无效果的决定比没有决定更危险。
   - 声明本身畸形（缺字段、非精确 semver、非法日期）→ 硬失败 `INSTALL_SUPPORT_EXEMPTION_INVALID`。
5. **只放宽 peer 兼容判定**：`assertSidebarSupportIdentity`（包名+版本）、`taskPackagePayload`/`INSTALL_BYTES_MISMATCH`（字节）、`INSTALL_ARCHIVE_CHANGED`（归档）全部不动；豁免文件本身在 `assertInstalledIntegrity` 里按 sha256 复核，安装后被改写即红。
6. **可回收**：`reviewedAt` 窗口 `SUPPORT_EXEMPTION_REVIEW_WINDOW_DAYS = 90` 天；宿主代际一变，`hostSpec` 立刻不符而硬失败，逼出一次显式复核。

## 产品基线

新用户基线不受影响：豁免只写进**任务私有 profile**（系统临时目录下的 `omnimux-task-*`，随任务销毁），不写 Dev/Prod profile，不依赖任何开发机专属状态。缺声明、缺宿主版本、缺 support 包一律 coded failure，不降级。

## 假设

假设"阻断的根因是宿主 peer 区间与本代际结构性不相容，而不是 support 包本身坏了"，因此正确解法是走宿主提供的精确版本豁免，而不是改 peer 区间或 fork 侧边栏。若根因其实是包坏了，那么即使豁免生效，后续 profile 启动与画布验收仍会失败（而不是恢复）。第二个假设：`dsh --version` 的输出就是 `getDshRuntimeVersion()` 的返回值——宿主文档明说"the same runtime version shown by `dsh --version`"，且实测为 `0.2.1-rc.3`，与 asar 内 `@deepseek-ai/dsh-app-boot/package.json`、`@deepseek-ai/dsh/package.json` 以及 `build-info.json` 的 `dsh.packageSpec` 四处一致。

## 证伪方式

任一成立即推翻本设计：

1. **豁免不是声明驱动的**：把 `peerExemptions` 从身份文件里去掉（内存注入或 /tmp 副本），同一份 support manifest 的 `dsh plugin add` 仍然成功——说明生效的不是声明。
2. **豁免键不精确**：`hostSpec` 或 `version` 改一个字符后安装仍成功——说明宿主没有按键精确匹配，或我们的写入绕过了核对。
3. **豁免放宽了别的东西**：加豁免后 `assertSidebarSupportIdentity` 对错包名/错版本不再抛 `INSTALL_SUPPORT_REQUIRED`，或 `taskPackagePayload` 字节比对不再生效。
4. **静默降级**：`hostSpec` 过期或 `reviewedAt` 超窗时安装"成功"且没有任何 coded failure/警告。
5. **宿主版本写死**：把 `readHostRuntimeVersion` 换成字面量后测试仍全绿（说明测试没有真的读宿主）。

复现命令（本工作树）：

```bash
node --test scripts/task-runtime-install.test.mjs
node /tmp/omnimux-exemption-proof.mjs declared        # 正向：exit=0
node /tmp/omnimux-exemption-proof.mjs no-declaration  # 反例：exit=1 + "Exact-version exemption: not active"
```

## 验收

- [x] 宿主机制与 schema 有可复现的抽取证据（app.asar 字节偏移 + 官方文档串）。
- [x] `peerExemptions` 是唯一豁免真源；安装器无豁免名单、无宿主版本字面量。
- [x] **当前无声明**：支撑包 0.28.0 的 peer 已由宿主 0.2.1-rc.3 直接满足，`peerExemptions` 已从身份文件移除；机制保留但未启用（`supportPeerExemptionDecision` 返回 `not-needed`）。
- [x] 反例：声明缺失 → `dsh plugin add` 仍被拒（原始 peer 拒绝原文可见）。
- [x] 正向：声明齐全 → 同一命令 `dsh plugin add` 成功（exit 0）。
- [x] 门禁：未声明不签发、过期/代际不符硬失败、身份与字节校验不被放宽（32 条用例）。
- [ ] `pnpm check:boundaries` 通过（4508）；`pnpm test:gates` 485/486，唯一失败为环境性既有用例（见「实测结果」）。
- [x] `specs/cross-sidebar-support-identity.spec.md` 残留第 3 条与相关合同措辞同步。

## 非目标

- 不改 support 包自身的 `peerDependencies`，不 fork/vendor 侧边栏，不动壳仓 patch 与 preset 构建。
- 不动官方 App（只读抽取），不解包 app.asar 到仓库。
- 不改 `.worktrees/canvas-catalog-truth`，不跑它的请求与旅程。
- 不引入 `git commit`/`push`。
- 不扩豁免到 support 包以外的任何包（本设计在代码层就不可能）。

## 实测结果（2026-10-25，本工作树）

| 项 | 命令 / 输入 | 结果 |
| --- | --- | --- |
| 宿主机制抽取 | `DeepSeek Harness.app` 与 `OmniMux Dev.app` 的 `app.asar`（字节偏移 + `grep -a -o -F`） | 两处 `lib/types/profile-compatibility.js` 逐字一致；`PROFILE_COMPATIBILITY_FILENAME="compatibility.json"`、`isVersionList`、`validatePluginVersionExemption`、`setProfileVersionExemption`（`JSON.stringify(exemptions, undefined, 2) + "\n"`、`mode: 384`）核对通过 |
| 反例（宿主层） | 真实 `dsh plugin add`，声明在内存中清空 | `exit=1`、`installation rejected`、`Exact-version exemption: not active`；拒绝原文与阻断记录逐字一致 |
| 反例（安装器代码路径） | `readHostRuntimeVersion` + `applySupportPeerExemptions(peerExemptions: [])` + 真实 `dsh plugin add` | `exit=1`、`refused=true`、`applied=[]`、`compatibility.json` 不存在 |
| 正向 | 同上，声明完整 | `hostVersion=0.2.1-rc.3`（宿主读出）、写入 `{"dsh-better-sidebar@0.19.1":["0.2.1-rc.3"]}`、`exit=0`、`refused=false`、`dsh.profile.bundles` 含 `dsh-better-sidebar` |
| 键精度 | 只改 `hostSpec` 或只改插件版本 | 两者都回到 `exit=1` + `not active`（不继承授权） |
| 单元/门禁用例 | `node --test scripts/task-runtime-install.test.mjs` | 32/32 通过（原有 19 条全部保留，新增 13 条） |
| 边界 | `pnpm check:boundaries` | 通过（4508 个源文件） |
| 门禁套件 | `pnpm test:gates` | 486 用例，485 通过、1 失败；失败项为 `scripts/public-plugin-apply.test.mjs` 的既有用例，属环境性（见下） |
| 空白检查 | `git diff --check` | 通过 |

环境性失败的证据（与本次改动无关）：该用例断言「向主检出 `scripts/` 写新测试文件应放行」，而 `guard-anti-cheat.mjs` 的 `readSource()` 要求读到的字节等于 `git ls-tree <treeRoot HEAD>` 的 blob。主检出（HEAD `870715aff`）当前有他人未提交改动（含 `plugins/omnimux/src/host/apply.js`），故 `readConfirmedSource` 抛「Source is not confirmed at fixed repository HEAD」→ 判定 deny。同一候选内容：干净树（本工作树）`allow`、主检出树 `deny`；且主检出自身（不含本 diff）跑同一文件也失败（14/19）。本工作树不修改主检出，无法消除该外部条件。
