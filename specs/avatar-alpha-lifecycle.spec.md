# 规格：将 AI 网红工作室（omnimux-avatar）列入 Alpha 内测

- 状态：实现中
- 归属包：`plugins/omnimux`（生命周期单一真源）+ 发布脚本策略
- 关联 Issue：#3979

## 目标

`plugin-lifecycle.json` 是 Alpha 内测插件的唯一名单。当前 4 项（账号、发布、数据分析、任务表单）。用户要求把「AI 网红工作室」(omnimux-avatar) 也算作内测版：开发版保留并视为内测，正式版发布策略自动剔除该插件。

## 用户操作旅程

1. 用户查看开发版：左侧「更多」菜单仍有「AI 网红工作室」，功能照常可用；名单中标记为 Alpha 后，正式版打包不再包含它。
2. 正式版（`release-channel.json` = production）：`sync-stable.sh --prod` / `stage:preset` 依据同一名单剔除 `omnimux-avatar`，不进入依赖与随包产物。
3. 其余 Alpha 四项行为不变。

## 验收用例

| 编号 | 场景 | 期望 |
| --- | --- | --- |
| A1 | 读取 `plugin-lifecycle.json` | 含 `omnimux-avatar` 且 `stage: alpha`、`toolPrefixes: ["avatar_"]` |
| A2 | `node --test scripts/sync-release-policy.test.mjs` | `alphaPluginIds` 为 5 项（accounts, publish, analytics, forms, avatar）；`alphaToolPrefixes` 含 `avatar_`；全部用例通过 |
| A3 | `sync-stable.sh --prod` 的既有 fixture 测试 | `omnimux-avatar` 不在正式 profile 依赖与 bundles 中；开发目标保留 |
| A4 | 文档 | `docs/contracts/alpha-release.md` 的 Alpha 名单含 AI 网红工作室 |

## 假设

1. `plugin-lifecycle.json` 是 Alpha 名单唯一真源；`scripts/plugin-lifecycle.mjs`、`sync-stable.sh`、中枢侧栏 `isAlphaEntry()` 全部消费它，不另存第二份。
2. omximux-avatar 的 agent 工具名以 `avatar_` 开头（见 `plugins/omnimux-avatar/dsh.manifest.json`），因此 `toolPrefixes: ["avatar_"]` 能在正式版关闭其工具暴露。
3. 正式版排除插件后，其在官方「更多」菜单的自注册项也随之消失，无死条目。

## 证伪方式

1. 运行 `node scripts/plugin-lifecycle.mjs list-alpha-plugins`，若输出不含 `omnimux-avatar`，则假设 1/改动未生效。
2. 运行 `node --test scripts/sync-release-policy.test.mjs`，任一失败即证伪；重点看 `omnimux-avatar` 是否出现在 prod manifest 依赖中（出现即失败）。
3. `rg -n "AI 网红工作室|omnimux-avatar" docs/contracts/alpha-release.md`，无命中即文档未更新。

## 非目标

- 不把任何 Alpha 插件转正；不改发布脚本逻辑；不写生产 profile；不重启共享 Dev App；不改 avatar 的菜单/功能实现。

## 旧标准变更

- `scripts/sync-release-policy.test.mjs` :: `uses the lifecycle registry as the exact Alpha plugin and tool-prefix source`
  - 原断言：`alphaPluginIds` 恰为 4 项、`alphaToolPrefixes` 恰为 3 个（不含 avatar）。
  - 必须改的理由：用户要求把 AI 网红工作室（omnimux-avatar）列入 Alpha，单一真源新增一项后，原「恰为 4 项」的断言与目标冲突。
  - 新期望证据：`alphaPluginIds` 为 5 项（accounts/publish/analytics/forms/avatar），`alphaToolPrefixes` 含 `avatar_`；测试通过。
