# composer-sync 最终修复：独立 configEditor 注入

## Objective

前两次修复依赖 `settings`/`ownerContext`，实际桌面进程启动时 `settings` 服务并未在插件激活阶段可用，`syncComposerList` 根本没有执行，导致 `~/.omnimux-dev/profiles/omnimux/cordis.patch.yml` 的 `providers.omnimux.models` 一直只有 Gemini。改为独立注入官方 `configEditor`，在编辑器就绪后直接运行 composer 同步，并作为手动 catalog refresh 的同步入口。

## 假设

- `configEditor` 是 profile 级官方服务，独立于 `settings`，在 OmniMux 插件上下文中可通过 `ctx.inject(['configEditor'])` 获取。
- 该服务能编辑 `llm-pi-ai` 活动条目；`providers` 配置字段保留，仅替换 `providers.omnimux.models`。
- 目录文本桶包含 `seed-evolving` 时，写入后的 provider models 应同时含 `gemini-3.8-flash`、`gemini-4-argon`、`seed-evolving`，输入框立即重读。

## 证伪方式

- 在真实 Dev 进程中重启后检查 `cordis.patch.yml`：若仍只有 Gemini，或 CDP 打开模型面板仍看不到 Seed Evolving，则失败。
- 用测试 `composer-sync`/`apply` 和全量包测试检查无回归。
- 若 `ctx.inject(['configEditor'])` 不触发，说明服务名或生命周期判断错误，需继续查宿主服务注册。

## Acceptance

- 真实 Dev 进程的输入框模型面板显示 OmniMux 下 `Gemini 3.8 Flash`、`Gemini 4 Argon`、`Seed Evolving`。
- 手动同步和目录变化后仍同步。
- 全量测试通过；不修改网关源码。
