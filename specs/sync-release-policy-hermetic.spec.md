# 同步策略检查不再依赖网络

## 背景

`pnpm test:gates` 里有一条检查（Alpha 发布物化策略，`scripts/sync-release-policy.test.mjs`）**偶发变红**：同一工作树跑三次，两次全绿一次红；单独重跑那条又全绿。

这种红比「检查太严」更危险——大家会开始说「它就是偶尔红」，然后习惯性忽略红灯，而假交付正是藏在这种缝隙里。

## 根因

这条检查为了隔离 git，会把子进程的 `HOME` 指到临时目录。而 **corepack 的包管理器缓存正好在 `$HOME/.cache` 下**——`HOME` 一改，缓存就找不到了，于是每次同步都要重新去 `registry.npmjs.org` 下载被 pin 的 `pnpm@11.7.0`。

网络当时的状态因此决定了这条检查是绿是红：连接正常就绿，被代理掐断就红。实测抓到的失败输出正是：

```
Error when performing the request to https://registry.npmjs.org/pnpm/-/pnpm-11.7.0.tgz
TypeError: terminated
  [cause]: SocketError: other side closed
```

旁证：修复前正常环境跑 239.7 秒，修复后 142.7 秒——省下的时间就是每次重新下载的耗时。

缓存位置本来与 `HOME` 无关，所以这是检查自身的缺陷，不是环境问题。

## 变更点

- `scripts/sync-release-policy.test.mjs`：在**进程级**固定 corepack 缓存位置。该文件里有几处子进程自己拼环境（不走统一的环境构造函数），进程级设定才能全覆盖。
- `scripts/sync-targets.test.mjs`、`scripts/sync-refresh-scope.test.mjs`：原有写法是 `COREPACK_HOME: process.env.COREPACK_HOME`——该变量通常**未设置**，等于没生效。改为回落到开发者缓存目录。

写法与仓库里已经正确的 `scripts/sync-repeat-install.test.mjs` 一致。

**刻意不设 `COREPACK_ENABLE_NETWORK=0`**：复核实测证明，关掉联网会把「网络抖动时偶发红」换成「缓存不在时**必然红**」——干净机器上第一次跑就是红的，比原来的偶发红更糟。只固定缓存位置就能在死代理下全绿，缺缓存时也还能靠联网自愈。仓库里 CI 的 managed-tarball 步骤用的是「先 `corepack prepare` 预热、再关网」范式，那是另一种可选路线，本改动不采用。

## 假设

- 假设 1：`COREPACK_HOME` 默认落在 `$HOME/.cache/node/corepack`。依据：本机实测缓存确实在该路径，且能看到 `11.7.0` 版本目录。
- 假设 2：固定缓存位置后，corepack 会命中本地缓存而不再碰网络。依据：见下方证伪实验——代理指向死端口时修复后全绿。
- 假设 3：固定缓存位置不影响检查要验证的东西（它验的是同步脚本对 Alpha 插件的物化策略，与包管理器从哪拿无关）。依据：修复前后正常环境都全绿，断言一条没动。

## 证伪方式

用**代理指向死端口**（`127.0.0.1:1`）把「网络不可用」变成确定性条件，而不是等它偶发：

- 修复前跑该检查 → **必红**，且失败输出直指 corepack 下载 pnpm。
- 修复后同一条件跑 → **12/12 通过**。

若修复后在该条件下仍红，说明还有别的联网依赖没堵住。

## 实测结果

| 检查 | 结果 |
| --- | --- |
| 死代理下 `sync-release-policy` | 修复前必红 → 修复后 **12/12** |
| 死代理下 `sync-targets` | **23/23** |
| 正常环境 `sync-release-policy` | **12/12**（修复前 239.7s → 修复后 142.7s） |
| `pnpm test:gates` | **485/485 全绿** |
| 冷缓存（`COREPACK_HOME` 指向空目录） | 联网保留 → 自动下载并自愈；若关掉联网则会必然红——这就是不采用关网方案的原因 |

## 已知边界

- **`scripts/sync-plugin-scope.test.mjs` 不需要修**，不是漏修：它把 corepack 也桩掉了（把假 corepack 写进 `bin` 并前置到 PATH），整个文件没有任何网络依赖，本来就不可能因此偶发红。仓库自己的防造假门禁确实拒绝改它（连纯新增两行环境变量也拒），但挡住的是一个**不必做**的改动。
  - 该门禁的确切触发条件（复核定位）：`scripts/test-authoring-inspection.mjs` 的 `contextOf(CallExpression)` 把调用的**实参 AST** 嵌进风险指纹，于是「改动的对象字面量是某个调用的实参、且内部含 `...spread`」就会被判成新风险。改函数体语句、或改 `return` 的对象都不触发——这与另外三个文件能改、它不能改完全自洽。
- `scripts/sync-source-identity.test.mjs` **不改**：它把 `sync-stable.sh` 换成桩脚本、且只拷不触发构建的脚本，全文件从不调用 pnpm/corepack。曾经加过的两行环境变量属死代码，已回退。
- `scripts/sync-refresh-scope.test.mjs` **不在 `pnpm test:gates` 的执行链里**（只被 `governance-manifest.json` 收录）。它那处属同类的正确性修补，与本次报的偶发红无关。
- 检查的断言、覆盖范围、执行时间预算均未改动——这次只改「它从哪里拿包管理器」，没有放宽任何判断。

## 新产品基线

无影响：只改测试的进程环境，不涉及产品默认值、模型、路径或本地状态。
