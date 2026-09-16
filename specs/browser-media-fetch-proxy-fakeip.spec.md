---
issue: 2055
status: approved-for-implementation
date: 2026-09-16
---

# 宿主机抓图在透明代理 fake-IP 环境下的可用性修复

## 1. 问题

| # | 现状 | 证据 |
| --- | --- | --- |
| 1 | 网页悬浮栏「点亮」图片素材后，**一律**提示「图像 下载失败，未加入待发区。」 | 用户实机截图（Issue #2055）；`strings.ts:745` 该文案由宿主抓图结果映射而来 |
| 2 | 宿主的公网地址守卫把「DNS 解析答案落在 `198.18.0.0/15`」判为非公网地址，拨号前即返回 `bad-request` | `public-media-transport.ts:11`（`a === 198 && (b === 18 \|\| b === 19 …)`）、`:46`（`publicLookup` 任一答案命中即 `NonPublicAddressError`） |
| 3 | 本机 DNS 被透明代理接管（fake-IP），所有公网域名都解析为 `198.18.x.x`；因此该守卫拦下**每一个**公网图片 | `www.instagram.com → 198.18.39.41`、`pbs.twimg.com → 198.18.35.226`（`dns.lookup` 实测）；`/etc/resolver` 指向 `198.18.0.2` |
| 4 | 网络与代理链路本身健康，唯一阻塞点就是该判定 | 同地址 `fetch` 200 / `image/png` / 6617 B；把该地址钉给 socket（保留 Host 与 SNI）同样 200 / 6617 B |

自动化测试全绿而真机必挂，原因是测试注入的解析答案都是真实公网地址，不会出现代理假地址。

## 2. 范围

**范围内**

- 宿主机抓图模块 `plugins/omnimux-browser/src/public-media-transport.ts`：把「**URL 层目标判定**」与「**解析答案判定**」分开。
  - URL 层（`isFetchableMediaUrl` → `isNonPublicAddress`）：语义与取值**不变**，字面地址 URL、私网／链路本地／CGNAT／保留段、`localhost`、`.local`、`.internal` 继续拒绝。
  - 解析答案层（`publicLookup`）：改为只拒绝「**本机或局域网目标**」（回环、私网、链路本地、CGNAT、IPv6 ULA 及一切非全局单播、组播、未指定、无法解析）。落在保留段（如 `198.18.0.0/15` 的代理假地址）的解析答案放行——它只是代理的地址句柄，真实目的地由代理按其映射回源。
- 单测补充：`plugins/omnimux-browser/tests/public-media-transport.spec.ts`、`tests/media-fetch.spec.ts`。

**范围外**

- 不改动扩展端（面板／内容脚本／后台）：面板侧无联网出口，抓图结果的分支与文案保持不变。
- 不改动 URL 校验、重定向逐跳校验、字节上限、超时预算。
- 不新增任何配置项、开关或可注入的生产行为。
- 不覆盖 IPv6 ULA 形式的代理假地址（如 sing-box 默认 `fdfe:dcba:9876::/96`）：现网无实测证据，不做投机放行。

## 3. 设计

### 3.1 两个判定，两种语义

当前只有一个谓词 `isNonPublicAddress`，同时承担「这个 URL 主机能不能拨」与「这个解析答案能不能拨」两件事。两者的真实语义并不相同：

- **URL 主机**：必须限定为公网单播；指向保留段（含 `198.18/15`）的字面地址一律拒绝——面板不能指名让宿主去拨一个非目的地。
- **解析答案**：SSRF 真正要防的是「被诱导去拨**本机或局域网**」；保留段地址不落在本机/局域网，作为 DNS 答案出现时是透明代理的假地址句柄，不是目的地。

因此拆为：

```ts
/** 是否指向本机或局域网（SSRF 真正要防的那一类）。 */
export function isLocalAddress(value: string): boolean

/** 是否不属于公网单播：本机/局域网 + 保留段。用于 URL 主机与字面地址。 */
export function isNonPublicAddress(value: string): boolean
```

`isNonPublicAddress` 保持既有取值集合不变（既有测试 `refuses %s` 一行不改仍应通过），实现改为「`isLocalAddress` 或保留段」。

### 3.2 判定表

| 地址 | `isNonPublicAddress`（URL 层） | `isLocalAddress`（解析答案层） |
| --- | --- | --- |
| `127.0.0.1` / `0.0.0.0` / `10.x` / `192.168.x` / `172.16-31.x` | 拒绝 | 拒绝 |
| `169.254.x` / `100.64-127.x`（CGNAT、Tailscale） | 拒绝 | 拒绝 |
| `224.0.0.0/4` 组播、`240/4` 保留、`255.255.255.255` | 拒绝 | 拒绝 |
| `198.18.0.0/15`（代理 fake-IP） | 拒绝 | **放行** |
| `192.88.99.0/24`、`198.51.100.0/24`、`203.0.113.0/24`（保留/文档用） | 拒绝 | **放行** |
| `192.0.2.0/24`（文档用，落在既有 `192.0.0.0/16` 规则内） | 拒绝 | 拒绝（维持既有归类，不新增放行） |
| `::1` / `::ffff:8.8.8.8` / ULA `fc00::/7` / `fe80::/10` / 非 `2000::/3` | 拒绝 | 拒绝 |
| `2001:db8::/32` / `2002::/16` / `3fff::/20` | 拒绝 | **放行** |
| `8.8.8.8` / `2606:4700:4700::1111` / `media.example.com` | 放行 | 放行 |
| `localhost` / `*.localhost` / `*.local` / `*.internal` | 拒绝 | 拒绝 |
| 空串、无法解析为 IP 的答案 | 拒绝 | 拒绝 |

### 3.3 不变式

1. 解析答案集合为空、或含无法解析为 IP 的条目、或含任何一个本机/局域网地址 → 整体拒绝（`NonPublicAddressError`，回调 `[]`），不降级、不回退。
2. URL 主机判定仍是拨号前的第一道门；重定向逐跳仍走同一判定。
3. 校验过的地址只交给 socket 一次，不做二次解析（DNS rebinding 防护不变）。
4. 生产行为零新增开关；面板侧代码零改动。

## 4. 验证与取证

| 层级 | 手段 | 期望 |
| --- | --- | --- |
| 判定表 | `publicLookup` 注入解析器单测（纯确定性，不依赖网络） | §3.2 全表逐行成立 |
| 抓图结果映射 | `fetchMediaBytes` 单测 | 假地址解析答案 → `ok`；本机/局域网 → `bad-request` |
| 真机端到端 | 在 fake-IP 环境直接调用宿主 `fetchMediaBytes` 抓公网图片 | 修复前 `bad-request`（已复现），修复后 `status: ok` 且字节数与真图一致 |
| 回归 | `pnpm --filter omnimux-browser test` | 全绿 |

真机取证落 `docs/evidence/`；判定表与映射证据由单测承载。
