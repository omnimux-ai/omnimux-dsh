# 媒体字节回传：页面内取字节 → 分块 → host 落盘（Issue #3526）

## 1. 背景（#3485 实测）

- TikTok CDN（Akamai）拒绝非浏览器请求：host 带 cookie/UA 仍 403；页面内 fetch 200 / 3MB 可读。
- 抖音 `play_addr` 同理，只在该页面会话内可读。
- 用户已确认方案：**页面内取字节 → 本机 host 分块回传**；协议见 `specs/capture-realpage-verification.spec.md` §5。

## 2. 用户旅程

| # | 场景 | 期望 |
| --- | --- | --- |
| J1 | 在 TikTok/抖音作品页点「保存到灵感库」 | 页面内取视频字节（含 cookie/UA），进度可见；完成后灵感库出现可播放的 ready 卡片 |
| J2 | 大视频（如 50MB） | 1MB 原始字节分块、顺序回传；单文件与总会话上限内成功；超限明确失败 |
| J3 | 取字节失败（CORS/会话失效/超时） | 回退现有 capture → import-url 链路，toast 如实说明；不假成功 |
| J4 | host 中途重启/提交缺失 | 会话超时后清理临时文件；不产生半条 ready 记录 |
| J5 | 重复保存同一作品 | 提交阶段按 canonical source_url 去重：已 ready 返回 existing |

## 3. 协议

### 3.1 扩展

1. 捕获到作品后，对 `platform = tiktok` 且 `type=video` 的媒体走字节回传（其余媒体仍由 host 下载）。
   - 实测偏差（2026-10-21）：抖音 CDN 不返回 CORS 头，页面内 XHR 读不到字节；但 host 直连下载成功（236MB ready）。因此抖音保留 host 直连 capture，不再尝试注定失败的回传。
2. **页面内取字节**：content script 通过注入脚本在页面主世界 `fetch(url, { credentials:'include', headers:{ referer: page } })` → `arrayBuffer()`；主世界通过 `window.postMessage` 把字节以 base64 交回 isolated world（CORS 由页面会话满足，避免扩展 origin 被 CDN 拒绝）。取不到则本作品回退现有链路。
3. 分块：1MB 原始字节 → base64（≈1.37MB，低于 host 2MB JSON 上限）；`chrome.runtime.sendMessage({ type:'CAPTURE_MEDIA_CHUNK', sessionId, index, seq, data, final })`。
4. background 逐块 POST `/omnimux/inspiration/local/capture-media-chunk`；全部块后 POST `/omnimux/inspiration/local/capture-commit`。

### 3.2 Host 端点

- `POST /local/capture-media-session`
  body：`{ source_url, platform, title, content, content_shape, author, stats, posted_at, cover_url, media:[{ index, type, url, size_hint? }] }`
  响应：`{ data: { session_id, media: [{ index, max_chunk }] } }`
  规则：公开 URL 校验；会话目录 `mediaDir/relay/<sessionId>/`；单文件上限 512MB、会话上限 1GB、媒体 ≤20；会话 TTL 30 分钟。
- `POST /local/capture-media-chunk`
  body：`{ session_id, index, seq, data(base64), final }`
  规则：会话/序号校验、base64 解码、追加写临时文件、大小上限校验；`final=true` 后该 index 完成；重复 seq 幂等拒绝。
- `POST /local/capture-commit`
  body：`{ session_id }`
  规则：所有 media 完成才允许；文件按类型移动/重命名到 videos/images（对齐扩展名、media sniff 校验）；记录写入复用 capture 的 `buildCaptureRecord` 语义（ready/degraded、去重、封面）；失败清理整个会话目录并返回可读错误。
- 所有端点走现有 Local HTTP 路由（CORS/PNA 头、body 上限），不新增鉴权面。

### 3.3 失败与回退

- 页面内取字节失败 → 扩展回退现有 capture/import-url，toast 复用 #3505 的 fallback 文案（原因码 `capture-media-unavailable`）。
- host 拒绝/超限 → 扩展同样回退并记录原因。
- 会话未提交 → 后台定时清理（TTL）；进程重启后残留会话目录由启动清理或 TTL 读取时清理。

## 4. 测试

- host：三端点单测（会话创建/公开 URL/分块追加/幂等/超限/提交 ready/失败清理/去重）。
- extension：分块计划单测（1MB 边界、最后块 final、base64 大小）、回退原因文案、消息路由文本契约。
- 真实页面（ego）：TikTok/抖音页面内取字节大小与耗时证据。
- 真实浏览器：Chrome + 构建 dist 点击 TikTok/抖音作品 → 行 ready + 视频 Range 播放；TikTok 的 host 403 场景不再 degraded。

## 5. 非目标

- YouTube 直链（保持云端）；其它平台；账号监控；流式边下边播（一次性取完再分块）。

## 假设

- 页面主世界 fetch（带页面 cookie/UA）能拿到 TikTok/抖音媒体字节；#3485 ego 实测 TikTok 200/3MB、抖音 200 且可写盘，故主世界注入可行。
- 1MB 原始字节 → base64 ≈1.37MB，低于 host JSON 2MB 上限；顺序逐块 POST 足够（不并发）。
- 视频原始字节不需要转码，仅按扩展名对齐与 sniff 校验即可播放；封面仍走 host 下载或已有链路。
- 会话临时文件在失败路径可安全整目录删除；提交后仅移动文件，不复制。

## 证伪方式

- 若 ego 页面主世界 fetch 返回 403/0 字节，或真实扩展点击后行仍 degraded/failed，则「主世界取字节可行」被证伪，需要改用其他会话通道（如 CDP/外部工具）或放弃该平台。
- 若 1MB 块在 host 侧出现 base64 解码失败/顺序错乱/大小超限误判，则分块协议假设被证伪。
- 可执行验证：
  - `cd plugins/omnimux-inspiration && node --import ./scripts/deny-network.mjs --test src/capture-relay.test.js`
  - `cd plugins/omnimux-browser/extension && npx vitest run tests/capture-media-relay.spec.ts`
  - ego：TikTok/抖音真实页面注入脚本取字节，输出 byteLength/耗时
  - 真实浏览器：Chrome for Testing + `--load-extension=<dist>`，点击 TikTok/抖音作品，检查 toast、行 `import_status` 与 `GET media Range 206`
