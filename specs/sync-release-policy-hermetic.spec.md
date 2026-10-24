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

缓存位置本来与 `HOME` 无关，所以这是检查自身的缺陷，不是环境问题。

## 变更点

- `scripts/sync-release-policy.test.mjs`：在**进程级**固定 corepack 缓存位置并关掉 corepack 联网。该文件里有几处子进程自己拼环境（不走统一的环境构造函数），进程级设定才能全覆盖。
- `scripts/sync-targets.test.mjs`、`scripts/sync-refresh-scope.test.mjs`：原有写法是 `COREPACK_HOME: process.env.COREPACK_HOME`——该变量通常**未设置**，等于没生效。改为回落到开发者缓存目录，并加上关联网。
- `scripts/sync-source-identity.test.mjs`：原本完全没设，补上。

写法与仓库里已经正确的 `scripts/sync-repeat-install.test.mjs` 一致。

**为什么三个文件在环境构造函数里修、一个在进程级修**：前三个所有子进程都走同一个环境构造函数，在那里修是它天然的家；出问题那个有几处内联 spawn，只能在进程级兜住。

## 假设

- 假设 1：`COREPACK_HOME` 默认落在 `$HOME/.cache/node/corepack`。依据：本机实测缓存确实在该路径，且 `ls` 到 `11.7.0` 版本目录。
- 假设 2：关掉 corepack 联网后，本地缓存足以解析被 pin 的版本。依据：见下方证伪实验——在**代理指向死端口**的情况下，修复后 12/12 通过。
- 假设 3：固定缓存位置不影响检查要验证的东西（它验的是同步脚本对 Alpha 插件的物化策略，与包管理器从哪拿无关）。依据：修复前后正常环境下都是 12/12 通过，断言一条没动。

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
| 死代理下 `sync-refresh-scope` | **1/1** |
| 死代理下 `sync-source-identity` | **15/15** |
| 正常环境 `sync-release-policy` | **12/12** |
| `pnpm test:gates` | **485/485 全绿** |

## 已知边界

- `scripts/sync-plugin-scope.test.mjs` 有同一缺口，但**改不动**：仓库自己的防造假门禁把它判为「改写既有测试用例」，纯新增两行环境变量也被拒。该文件确实会走真实的 `sync-to-app.sh`，理论上同样暴露。未修，在此记录。
- 检查的断言、覆盖范围、执行时间预算均未改动——这次只改「它从哪里拿包管理器」，没有放宽任何判断。

## 新产品基线

无影响：只改测试的进程环境，不涉及产品默认值、模型、路径或本地状态。
