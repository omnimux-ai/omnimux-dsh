# omnimux-accounts

当前产品方向见[角色生成与视频复刻](../../docs/contracts/product-positioning.md)。本页保留该组件的技术职责与既有实现记录，不证明全部功能当前可用，也不扩展默认产品范围；模型/渠道信息属于内部执行，普通用户的简化入口仍需对应实现证据。


Pinned first-level plugin for listing OmniMux-connected social accounts. It renders its own sidebar row under 新会话 and opens a standalone product page over the conversation column — it does not go through the Apps catalog, the `omnimux-app-open` event, or a Settings seat. The browser only calls Host `/omnimux/accounts`. It does not import the hub and does not read `OMNIMUX_*` secrets.

Install:

```sh
dsh plugin --profile omnimux add ./plugins/omnimux-accounts
```

After install, restart the Host. The **账号** row appears under 新会话 (placed by the shared sidebar coordinator, rank 3) and opens the accounts stage directly. Filter by platform or group, connect a platform, or disconnect an id. Unsigned users see a sign-in hint; login stays on the hub Profile page. Placement: repo `docs/contracts/settings-ui.md`.
