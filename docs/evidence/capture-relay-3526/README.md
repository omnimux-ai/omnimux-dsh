# #3526 TikTok 页面内取字节 → 分块 → host 落盘：证据

- 任务：Issue #3526（worktree `cross-capture-relay`，分支 `agent/cross-capture-relay-issue-3526`）
- 时间：2026-10-21
- 背景：#3485 实测 TikTok CDN（Akamai）拒绝 host 下载（带 cookie/UA 仍 403），页面会话内可读。

## 验收数据（真实测量）

| 项 | 结果 | 证据 |
| --- | --- | --- |
| TikTok 字节可读性 | 内容脚本隔离世界 `XHR(credentials)` → **200 / 3,288,875B** | `tiktok-byte-probe.log` |
| 页面主世界 `fetch` | 被 TikTok 的 patched fetch（privacy/webmssdk）拦截 → `Failed to fetch`，故不使用 | 试验记录 |
| 抖音页面内读取 | 抖音 CDN 不返回 CORS 头 → 页面 XHR 不可读 | 试验记录 |
| 抖音 host 直连下载 | **200 / 236,377,548B**，行 `ready` | `douyin-capture-e2e.log` |
| TikTok 真实浏览器点击保存（relay） | toast「已保存到 OmniMux 灵感素材库！」**1.41s**；host 行 `ready` `type=video`；文件 **3,288,875B**；媒体 Range **206** | `tiktok-relay-e2e.log` |
| 抖音真实浏览器点击保存（host 下载） | toast 成功 **0.71s**；行 `ready` `type=video`；文件 **236,377,548B** | `douyin-capture-e2e.log` |

E2E 服务端使用 worktree 内真实插件 HTTP handler 起隔离 host（临时 `DSH_HOME`），扩展为 worktree `dist` 构建产物，Chrome for Testing 独立临时 profile；验收后删除测试行、关闭 Chrome、清理临时目录。

## 传输决策（实测驱动）

1. **TikTok**：页面主世界 `fetch` 被 SDK 包装拦截；改用内容脚本隔离世界 `XMLHttpRequest`（`credentials=true`）——**200 / 3,288,875B**，走分块回传。
2. **抖音**：页面 XHR 读不到（CDN 无 CORS 头），但 host 直连下载成功（236MB ready）。因此抖音**不启用回传**，保留 host capture；`RELAY_PLATFORMS = {'tiktok'}`。
3. 回传协议：1MB 原始字节 → base64 → 内容脚本逐块 `CAPTURE_MEDIA_CHUNK` → background 逐块 POST host `/capture-media-chunk`（host ack 后才发下一块）→ 全部完成后 `/capture-commit` 生成 ready 行。

## 测试

```bash
# host（真实 tmp store，deny-network 0 outbound）
cd plugins/omnimux-inspiration
node --import ./scripts/deny-network.mjs --test src/capture-relay.test.js   # 29/29 pass
node --import ./scripts/deny-network.mjs --test src/*.test.js                # 481/481 pass

# extension
cd plugins/omnimux-browser/extension
npx vitest run tests/capture-media-relay.spec.ts                             # 8/8 pass
npx vitest run                                                               # 150 files / 1583 pass + 1 expected fail
node scripts/build.mjs                                                       # 通过
```

## 实现要点

- Host：`capture-media-session` / `capture-media-chunk` / `capture-commit`；会话目录 `media/relay/<sid>/`；1MB 块、单文件 512MB、会话 1GB、TTL 30 分钟；提交时 magic 校验（mp4/webm、jpeg/png）、移动落盘、复用 `buildCaptureRecord`、canonical 去重、失败整目录清理。
- Extension：内容脚本隔离世界 XHR 读字节（`planRelayChunks` 1MB 分块、base64 32KB 拼接避免栈溢出）；background 创建会话、逐块转发、提交；失败回退现有 capture/import-url，toast 文案「页面媒体字节读取失败，已转云端解析」。

## 证据边界

- 单测使用真实临时目录 store 与真实 dispatcher，不联网；E2E 用真实 Chrome + 真实 CDN，但 host 是 worktree 代码起的隔离实例，不是 Dev/Prod。
- 抖音未做字节回传（CDN CORS 限制 + host 下载已验证可用）；YouTube 仍走云端。
- Dev 45120 真机验收属人工职责；本证据为 agent 在独立 Chrome 上的真实点击验收。
