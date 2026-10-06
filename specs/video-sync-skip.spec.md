# 物化脚本对「无客户端面插件」的容错（Issue #3209 后续修复）

## 背景与授权

Issue #3209 下线了 Google Vids，`omnimux-video` 因此失去整个客户端面（面板/舞台/侧栏入口）与
`scripts/build-client.mjs`，退化为纯服务端插件。用户已就「下线 Google Vids」一次授权到底；
本文件是该交付收尾时暴露的**同范围缺陷**的规格：开发环境物化因此失败，交付无法闭环。

## 问题（实测）

`scripts/sync-to-app.sh` 的插件分派表把 `omnimux-video` 归入「必建客户端」一类，无条件执行
`node scripts/build-client.mjs`。脚本已被删除，于是：

```
Error: Cannot find module '.../plugins/omnimux-video/scripts/build-client.mjs'
SYNC_EXIT=1
```

`worktree.sh ship` 的自动物化随之失败，并提示手工重跑同一命令——手工重跑同样失败。

## 期望行为

1. 插件没有 `scripts/build-client.mjs` 时，物化流程**跳过该插件的客户端构建**并打印一行说明，
   整体退出码为 0；判定口径与 `scripts/build-all.mjs` 的 `resolvePluginBuildTask` 一致
   （无构建脚本即不构建）。
2. 有客户端面的插件构建行为**完全不变**（`omnimux`、`omnimux-assets`、`omnimux-clip` 等仍照常构建）。
3. 纯服务端插件仍要被正常物化（`package.json`、`src/**` 照常同步到开发环境）。

## 验收用例

- AC1：`bash -n scripts/sync-to-app.sh` 语法通过。
- AC2：把 `omnimux-video` 放进请求列表时，输出含「无客户端构建脚本，跳过 build」，且不再出现
  `Cannot find module`。
- AC3：`./scripts/sync-to-app.sh omnimux omnimux-assets omnimux-clip omnimux-video omnimux-workflow`
  退出码 0，开发环境完成物化（本轮交付的收尾条件）。
- AC4：`pnpm build:all` 行为不变（该插件本来就被跳过）。

## 不在范围

- 不改 `build-all.mjs`（它已正确）。
- 不为该插件保留任何客户端构建脚本（下线后的诚实终态就是没有客户端产物）。
- 不触碰 Google Vids 归档内容。
