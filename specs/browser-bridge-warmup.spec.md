# 规范：海报生成观点前确保 bridge 冷启动连接（Issue #3569）

## 1. 问题

用户设置页显示 OmniMux Dev:45120 已连接、token 已填，但 X 页面点海报生成观点报「未连接 dsh（请检查设置中的地址与 token）」。受控复现：扩展冷启动后仅从 storage 写入设置、未发送 `SETTINGS_UPDATED` 时，`DSH_TWITTER_COPILOT_GENERATE` 直接调用 gatewayRpc，`settingsReady` 未完成、`bridge` 为 null，于是失败。

## 2. 方案

- 新增 `ensureBridgeForGeneration()`：await `settingsReady` + `bridgeClaimReady`；已连接直接返回；否则按已存 `bridgeUrl/token` arm keepalive + `startBridge`，等待 connected ≤5s；`bridge.evicted` 时重建客户端。
- `DSH_TWITTER_COPILOT_GENERATE` 在会话生成前调用；仍失败才返回可读错误（未配置 token / 连接超时）。
- 不改变 bridge 协议、token 存储与常驻策略。

## 假设

根因假设：失败不是 Dev 未运行，而是扩展 background 冷启动时桥尚未建立完成，gatewayRpc 在 settingsReady/startBridge 之前执行。只要生成前主动等待设置并拉起桥，已配置的 Dev 能自愈连接。

## 证伪方式

受控扩展 e2e 中仅写入 `dshSettings`、不发送 `SETTINGS_UPDATED`，直接发 `DSH_TWITTER_COPILOT_GENERATE`：若仍返回「未连接/没有配对令牌」而不是 `ok:true`，即证伪。

## 验收

- 冷启动 e2e 返回 `ok:true` 正文；扩展构建/测试通过；证据留存 `docs/evidence/issue-3569/`。

## 边界

R1；不改 bridge 协议、token 存储、Dev 配置；不常驻强制连接。
