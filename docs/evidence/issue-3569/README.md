# Issue #3569 · bridge 冷启动连接：证据

- 2026-10-21 16:xx（Asia/Taipei），真实 Chrome（`scripts/lib/extension-e2e.mjs`，单进程自清理）加载本工作树扩展 + 真实 Dev bridge。
- 结果：`DSH_TWITTER_COPILOT_GENERATE` → `{"ok":true,"text":"正常"}`（report.json）。
- 本任务修复 background 冷启动时 gatewayRpc 早于 settingsReady/startBridge 的问题；`ensureBridgeForGeneration()` 会在生成前等待设置、主动拉起桥并等待 connected。
- 限制：e2e 无法在 worker 启动前写入 storage，因此“token 已存但桥未连接”分支由代码路径与构建/全量测试覆盖；连接态真实链路已证。
