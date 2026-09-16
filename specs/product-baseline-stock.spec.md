# Spec: 产品基线存量整改（第二步）

**Issue:** #2129（第一步已合入主干 3ea7718236）｜ **模块:** `omnimux-market` / `omnimux-browser` / `omnimux`（客户端预设）｜ **优先级:** P0

## 1. 问题与目标

第一步已把「产品路径不得依赖开发机私有状态」变成机械门禁，并把当前主干上 17 处存量登记进 `scripts/product-baseline-allowlist.json`（每条带整改去向）。本任务逐条整改，**改完后必须删除对应豁免条目**——否则门禁会报「僵尸豁免」红灯。

目标：新用户机器上，插件不再探测任何开发机专有的目录、路径或运行环境。

## 2. 范围

| # | 位置 | 现状 | 整改 |
|---|---|---|---|
| 1 | `plugins/omnimux-market/src/local-api.ts` `resolveExploreDirectory` | 候选目录含 `~/.omnimux-dev/skills` 与 4 条开发机绝对路径（OmniMux-skills / OPC 资产库 / workbuddyskills） | 删除开发版目录与开发机绝对路径候选，保留 `cfg.skillsDir`、`~/.dsh/skills` 与包内 catalog |
| 2 | 同文件 `handleExpertAvatar` 候选（约 :703） | 候选含开发机 workbuddyskills 绝对路径 | 删除该候选 |
| 3 | `plugins/omnimux-market/src/expert/catalog-provider.js` | 「本地 OPC / 资产库」分支整段为开发机绝对路径 | 删除该分支 |
| 4 | `plugins/omnimux-market/src/expert/install.js` | `LOCAL_WB` 与 `resolveLocalRepo()` 回落到开发机绝对路径 | 改为**只认环境变量** `WORKBUDDYSKILLS_ROOT`；未设置时不解析本地仓库，直接走 `fetchGitTree` |
| 5 | `plugins/omnimux-browser/src/index.ts` `getDshHostLocale` | 候选含 `~/.omnimux-dev/settings.yaml` | 删除该候选（开发版由 `DSH_HOME` 覆盖） |

**不在本任务**（属界面代码，按仓规须先演示后合入、并补端到端测试，另开 PR）：`DshInstanceSelector.tsx` / `WorkspaceSelector.tsx` 的开发版实例推荐位与开发机 `defaultPath`；`plugins/omnimux/src/client/presets/media-resolver.js` 的素材根解析。

## 3. 验收用例

| # | 场景 | 预期 |
|---|---|---|
| 1 | 运行 `node scripts/verify-product-baseline.mjs` | 绿灯；本任务涉及的豁免条目已被删除，且不出现僵尸豁免 |
| 2 | 新用户机器（无 `~/.omnimux-dev`、无开发机仓库）：技能工坊查看技能内容 | 命中包内 catalog 或 `cfg.skillsDir`；找不到时返回 `found:false`，不探测开发机路径 |
| 3 | 专家目录解析（`catalog-provider`） | 走 catalog / 安装链路；不再读取开发机 OPC 仓库 |
| 4 | `omnimux-market` 的 git 安装源 | 无 `WORKBUDDYSKILLS_ROOT` 时走 `fetchGitTree` 拉取；`local` 为空串时不产生「相对路径误命中」 |
| 5 | 浏览器插件语言偏好 | 读取 `DSH_HOME` / `~/.dsh` 的 settings.yaml；两者都不存在时默认 `zh` |

## 4. 验证命令

```bash
node scripts/verify-product-baseline.mjs
node --test scripts/verify-product-baseline.test.mjs
pnpm --config.verify-deps-before-run=false --filter omnimux-market test
```

## 5. 边界

- **总是**：只删除开发机专有来源，不改动产品自身的目录约定与错误语义；找不到时保持原有「找不到/走远端」的既有路径。
- **绝不**：把开发机路径改成另一个隐式默认；不得为了让门禁变绿而放宽规则或留下无理由豁免。
- 本任务不修改 `lib/`（构建产物，随构建重建）。
