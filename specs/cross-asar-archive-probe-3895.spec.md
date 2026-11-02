# Spec: 旧 app.asar 布局用归档目录表判定可用性

- Issue: #3895
- 风险级别: R1（验收基础设施；可逆）
- Base: `origin/main` @ `1e46010bd`
- 依赖: 复用 `scripts/lib/asar-integrity-engine.mjs` 的 `readAsarHeader`

## 1. 目标

`scripts/host-runtime-layout.mjs` 用 `readdirSync('<app.asar>/preset/agent-presets')` 判断归档布局可用。但 `app.asar` 是单个归档文件（本机 Prod 老包实测 171MB、`isFile: true`），普通 Node 对它 `readdirSync` 必 `ENOTDIR`，于是旧布局分支在真实归档上永远不可达，只会报 `TEST_ENV_RUNTIME_MISSING`。

本改动改为读归档目录表（asar header 里的 JSON 文件树）判断：归档内是否有 `preset/agent-presets` 且非空。这样旧布局在普通 Node 下也能正确判定，不依赖 Electron 上下文。

## 2. 现状与真源

| 事实 | 位置 | 本次动作 |
|---|---|---|
| 归档布局判据是 `readdirSync(archive/preset/agent-presets)` | `scripts/host-runtime-layout.mjs` → `probeArchive` | 改为解析归档目录表 |
| asar 头部解析已存在 | `scripts/lib/asar-integrity-engine.mjs` → `readAsarHeader(path)` 返回 UTF-8 JSON 头 | 复用，不重写 |
| 归档头部结构：前 16 字节为 pickle 头（offset 12 = JSON 字节数），其后是 JSON 文件树 | 同文件注释与实现 | 用现成函数读 |
| 真实归档实测 | Prod 老包：`strLen=18447809`，`preset/agent-presets` 有 14 条目，`node_modules/@deepseek-ai/dsh/lib/bin.js` 存在 | 作为验收样本 |
| 前置检查对归档内路径 `accessSync` 会 `ENOTDIR` | `scripts/composer-inline-bootstrap.mjs` → `assertComposerRuntimeReadable` | 归档布局下改用目录表判断文件存在 |

## 3. 实现设计

1. `host-runtime-layout.mjs` 新增 `readAsarTree(archivePath)`：调 `readAsarHeader`，`JSON.parse` 后返回文件树；头部损坏/非 JSON 时抛可读错误。
2. `asarEntry(tree, 'preset/agent-presets')`：按路径逐段查 `files`，返回目录节点或 `null`。
3. `probeArchive(io, archive)` 改为：
   - 若 `io` 提供真实 `readAsarHeader`（默认路径），读目录表判断 `preset/agent-presets` 是否是非空目录；
   - 归档不可读（损坏/不是 asar）→ 返回 false，由上层报 `RUNTIME_MISSING`，并在 detail 里带上原因。
4. `assertComposerRuntimeReadable` 在归档布局下改用目录表判断 `lib/bin.js` 是否存在，不再 `accessSync` 归档内路径。
5. 单测：用临时目录造一个**真实语义的 asar 文件**（写 pickle 头 + JSON 文件树），覆盖「有 preset」「无 preset」「头部损坏」三种情况。

## 4. 范围 / 非目标

范围：`scripts/host-runtime-layout.mjs` 的归档判据、`scripts/composer-inline-bootstrap.mjs` 的前置检查、对应测试、本 spec。

非目标：不改产品插件源码；不改 Electron 壳；不引入第二种 Host；不降低证据口径；不改 asar:false 布局的行为。

## 5. 验收标准（可观察）

- [x] 真实 asar 归档（本机 Prod 老包）上，`resolveHostRuntimeLayout` 判定为 `app.asar` 布局且可用；预设根解析到 `app.asar.unpacked`，合成 14 条 preset。
- [x] 归档里没有 `preset/agent-presets` 时判为不可用并报 `TEST_ENV_RUNTIME_MISSING`。
- [x] 归档头部损坏时判为不可用并报可读错误，不抛裸异常。
- [x] asar:false 布局行为不变（现有测试全绿）。
- [x] 归档布局下前置检查用目录表判断 `lib/bin.js`，不再 `accessSync` 归档内路径。
- [x] 相关单测 130/130 通过（8 个测试文件）；`git diff --check` 通过。

## 6. 新用户基线

只影响仓库验收通道，不进入产品运行时；判据基于归档目录表，缺件显式失败。

## 假设

- 假设 A：asar 头部 JSON 文件树的结构稳定（`files` 嵌套、目录节点带 `files`、文件节点带 `size`/`offset`），因此按路径查表即可等价于「目录里有没有这个东西」。
- 假设 B：归档内 `preset/agent-presets` 非空就等价于「该布局可声明预设」，与 `asar:false` 布局下 `hasShippedPresetRoot` 的语义一致。

## 证伪方式

- 证伪 A：在本机真实 asar 归档上按目录表查 `preset/agent-presets` 得到的结果与 Electron 里 `readdirSync` 的结果不一致 → 说明头部结构假设错（例如 unpacked 条目单独存放），需要同时查 `app.asar.unpacked`。
- 证伪 B：目录表判定可用、但隔离环境启动后仍报 `agent-preset/not-found` → 说明「归档里有 preset」不等于「能读到 preset 内容」，需要改为在 Electron 上下文里读取。

## 9. 证据计划

- 单测：真实语义 asar 文件（自造 pickle 头 + JSON 树）覆盖三种情况；asar:false 布局回归。
- 真实运行：本机 Prod 老包 `/Applications/OmniMux.app.old-20260915` 上跑布局探测，确认判定为 `app.asar` 可用；并对照 Electron 里 `readdirSync` 的结果。
- `node --test scripts/host-runtime-layout.test.mjs scripts/composer-inline-bootstrap.test.mjs`；`git diff --check`；`node scripts/impact-matrix.mjs --git-diff --base origin/main`。

## 10. 文档影响

`docs/contracts/plugin-qa.md` 的布局判据表述需从「能列出归档内 preset」改为「归档目录表里有 preset」，语义等价但实现路径不同，同步一句。

## 旧标准变更

- `scripts/host-runtime-layout.test.mjs` :: `probeArchive 在 io 缺 readdirSync 时显式报错，不悄悄读真实 fs`

原断言：注入 io 缺 `readdirSync` 时 `resolveHostRuntimeLayout` 抛 `TypeError`（`io.readdirSync is required`）。

必须改的理由：归档布局判据已从 `readdirSync` 改为读归档目录表（`readAsarTree`），探测不再需要 `readdirSync`；新的必需能力是 `existsSync`（判断归档是否存在）。原用例的守卫对象已不存在，继续保留会固化为错误契约。

新期望证据：同一场景改为断言缺 `existsSync` 时抛 `TypeError`（`io.existsSync is required`）；`probeArchive` 实现里对该能力做了显式检查。归档目录表判据本身由新增三例（真实语义 asar 有 preset / 无 preset / 头部损坏）覆盖。

## 评审阻断整改（head 80ce7b3f2 之后）

评审实测：探测层修好后，下游 `hasShippedPresetRoot` / `composeAgentPresetRows` 仍用 `readdirSync` 读归档内路径，普通 Node 必 `ENOTDIR`，于是 `agentPresetPatchText` 直接抛 `TEST_ENV_PRESET_ROOT_MISSING`——旧布局只是换了错误码，仍不可用（正是本 spec「证伪 B」命中的情形）。

修法：新增 `resolvePresetRoot(appRoot)` / `resolveUnpackedPath(appRoot, rel)`。归档布局下预设内容通常以 unpacked 形式落在 `<Resources>/app.asar.unpacked/`（本机老包实测可直接读），因此预设根与上游 preset 目录都按「目录优先、unpacked 兜底」解析。实测老包：`resolvePresetRoot` 指向 unpacked、`composeAgentPresetRows` 合成 14 条、`agentPresetPatchText` 产出 8415 字节且含 `@deepseek-ai/dsh-agent-preset`。

## 评审建议整改（head eb2920bab 之后）

| 评审项 | 处置 |
|---|---|
| 建议 2：composer 归档分支零覆盖 | ✅ 补 2 例（归档走目录表 / 非归档走 accessSync），并做变异验证：把 `archiveLayout` 改回 `false` 该用例立即红 |
| 建议 3：归档损坏/缺 preset 的 detail 不带原因 | ✅ `probeArchive` 返回 `{available, reason, message}`，错误 hint 与 `detail.archiveProbe` 都带原因（`archive-missing` / `asar-unreadable` / `preset-root-missing` / `wrapper-missing-in-archive`） |
| 建议 4：注入 io 缺 `readAsarTree` 时静默回落真实 fs | ✅ 注入 io 时不再回落；缺失显式 `TypeError`，并补用例 |
| 细节 5：`assertComposerRuntimeReadable` 的 JSDoc 未写 `layout` 依赖 | ✅ 补进 JSDoc，并写明不传会退回 accessSync 误报 |
| 细节 6：fixture pickle 头几何与真实 asar 不一致 | ✅ 改为老包实测几何（`headerSize-strLen=11`、`strSize-strLen=7`） |
| 细节 7：只看 preset 不看 wrapper 是否在归档里 | ✅ 新增 `wrapper-missing-in-archive` 判定并补用例 |
| 细节 8：import 链把 `ELECTRON_NO_ASAR=1` 带进每个进程 | ✅ 删除 `asar-integrity-engine.mjs` 顶层副作用，改为显式 `disableElectronAsarInterception()`；import 后 `process.env` 不再被改写 |
| 细节 9：spec 验收项未勾选 | ✅ 已勾选并记录证据 |

## 第二轮评审整改（head 649867fbc 之后）

| 评审项 | 处置 |
|---|---|
| **阻断 1**：归档布局下 `createRequire('<app.asar>/…')` 读不到归档内包，25 个 `@deepseek-ai/*` 行被 `pruneUnresolvable` 全丢，插件行 167 → 30、4 个 preset 变空数组 | ✅ 新增 `archiveResolvable(tree, fallback)`：归档布局下按归档目录表判定包是否存在（归档内 `node_modules/@deepseek-ai` 有 245 项）；`agentPresetPatchText` 在 `app.asar` 布局改用它。实测老包：插件名 25 个全保留、空 preset 0、patch 9407 → 127347 字节 |
| **阻断 2**：`probeArchive` 判「可用」不看 `app.asar.unpacked`，与下游 `resolvePresetRoot` 口径不一致 | ✅ `probeArchive` 增加 `preset-content-not-unpacked` 判据；自造「有 preset 无 unpacked」布局实测在探测期即报 `TEST_ENV_RUNTIME_MISSING` |
| 建议 1：composer `deps` 注入时仍回落真实 fs | ✅ 改为仅当 `io === fs` 才用模块内实现，否则必须显式传入 |
| 建议 2：三个 probe reason 零断言 | ✅ 新增用例逐条断言五种 reason（`archive-missing` / `asar-unreadable` / `preset-root-missing` / `wrapper-missing-in-archive` / `preset-content-not-unpacked`） |
| 建议 3：`upstreamPresetIds` 的 unpacked 回退零覆盖 | ✅ 新增用例：上游 preset 只在 unpacked 里时仍能读到并跳过 |
| 细节 1：证据数字口径不一致 | ✅ 证据写明完整命令与文件集 |
| 细节 2：「8415 bytes」实为字符数 | ✅ 改为同时报 chars 与 `Buffer.byteLength` |

## 第三轮评审整改（head 234bf70ff 之后）

| 评审项 | 处置 |
|---|---|
| **阻断**：`agentPresetPatchText` 里 `catch { resolvable = nodeResolvable }` 是静默降级，`readAsarTree` 失败时原样复现「插件行被剪空」（9407 字节 / 1 个插件名 / 4 个空 preset） | ✅ 删除回落：归档布局读不到目录表时直接抛 `TEST_ENV_PRESET_COMPOSE_FAILED`；补用例（注入抛错的 `readAsarTree` 必须抛错，且断言正常路径下 `resolvable` 用目录表判定 `@` 包） |
| 建议 1：`archiveResolvable` 按字面 `node_modules/<name>/package.json` 判定，误丢 exports 子路径行（`dsh-tool-subagent-control/list-agents`） | ✅ 增加「包 + 子路径」解析：按 `@scope/pkg` 前缀回查包目录。实测老包插件名 25 → 26（找回 `list-agents`），patch 127347 → 128557 字节 |
| 建议 2：三项覆盖不存在（`archiveResolvable` 零命中、`upstreamPresetIds` unpacked 回退、五种 reason 只断言两种） | ✅ 全部补齐，并逐一做变异验证：改坏 reason → 红；`upstreamPresetIds` 改回归档内路径 → 红；删除目录表判定 → 红 |
| 细节 1：证据里含不存在的测试文件 | ✅ 证据命令改为实际存在的 8 个文件 |
| 细节 2：`disableElectronAsarInterception` 零调用 | ✅ 保留为显式 API（不再有顶层副作用），并在证据里说明「import 后 env 不被改写」已实测 |
| 细节 3：`probeArchive` 注释重复 | ✅ 合并为一行 |

## 第四轮评审整改（head 8e9d4fa7b 之后，评审已判通过）

| 评审项 | 处置 |
|---|---|
| 建议 1：`probeArchive` 的 unpacked 判据绕过注入 io、直接读真实 fs | ✅ 改为 `io.isDirectory ?? isDirectory`，与「注入即不回落」一致 |
| 建议 2：内层 `throw` 被外层 catch 覆盖，原因丢失 | ✅ 本模块分类错误原样上抛；其它错误包一层但保留 `cause` 与 `detail.reason`（实测 `ASAR_HEADER_INVALID` 可见） |
| 建议 3：目录表可解析但缺 `node_modules` 时仍产出空壳 patch | ✅ 新增 `TEST_ENV_PRESET_PLUGINS_EMPTY`：声明行存在但插件行合计为 0 即拒绝写 patch |
| 建议 4：`archiveResolvable` 对任意 exports 子路径一律放行 | ✅ 改为「包目录存在 + 子路径或 `lib/<leaf>.js` / `lib/types/<leaf>.js` 命中」；实测 `list-agents` 仍通过、`dsh/nope` 与 `dsh-tool-bash/nonexistent` 被拒 |
| 细节 5：composer「归档读不了」用例断言空转 | ✅ 补 `via=asar-index` 断言，并覆盖「返回空树不抛错」的情形 |
| 细节 6：spec 写 121/121 与证据 130 不符 | ✅ 改为 130/130 并写明 8 个测试文件 |
| 细节 7：`probeArchive` 注释重复 | ✅ 合并为一行 |
