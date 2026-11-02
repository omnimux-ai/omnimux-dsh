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
- [x] 相关单测 121/121 通过；`git diff --check` 通过。

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
