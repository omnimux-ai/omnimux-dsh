# #3485 真实页面注入测试驱动的提取修正：证据

- 任务：Issue #3485（worktree `cross-capture-realpage`，分支 `agent/cross-capture-realpage-issue-3485`）
- 时间：2026-10-21
- 方法：把本仓库真实构建的提取器（esbuild IIFE）注入 ego-browser 的真实作品页执行，再按实测结构改代码；抖音另用 CDP `Page.addScriptToEvaluateOnNewDocument` 在 document_start 注入 MAIN-world 桥接，模拟扩展真实注入时机。

## 验收标准与实测结果

| # | 验收项 | 结果 | 证据 |
| --- | --- | --- | --- |
| AC1 | Instagram reel 真实页提取 title/author/media | ✅ | `ig-v3.png`；`real-page-extraction.json` |
| AC2 | 小红书带 `xsec_token` 页面：token 保留、cover 为笔记图、author 正确 | ✅ | `xhs-v2.png`；同上 |
| AC3 | X 直播回放缩略图不标 video | ✅ | 单元测试 + 真实页（pscp `.jpg` → image） |
| AC4 | 抖音 MAIN-world 桥接拿到 aweme_detail（author + play_addr） | ✅ 桥接节点 105KB，含 `aweme_detail`/`play_addr` | `douyin-v3.png`；单元测试 fixture |
| AC5 | 真实结构脱敏 fixture 单测 + 全量测试绿 | ✅ `capture-extractors` 24 pass；扩展全量 147 files / 1563 pass + 1 expected fail；构建通过 | 命令见下 |
| AC6 | host 对真实直链下载 | ⚠️ XHS/X/抖音 `ready`（抖音 236MB 视频落盘）；**IG 视频 25.9MB、CDN ≈119KB/s，60s 超时 → degraded** | `host-e2e.log` |
| AC7 | TikTok/抖音字节回传协议 | 已写入 spec §5（下一单） | spec |
| AC8 | 大媒体不能因扩展 30s 超时回退 | ❌ 新发现：host 同步下载 >30s 与扩展保存超时冲突；下一单改 202 受理 + 后台下载 | spec AC8 |

## 复现命令

```bash
# 真实页面注入（ego-browser，动态 TaskSpace）
ego-browser nodejs < round-17.mjs   # IG v3 + 抖音 document_start 桥接
ego-browser nodejs < round-18.mjs   # 保存 4 个平台的脱敏 capture JSON

# 提取器单测
cd plugins/omnimux-browser/extension && npx vitest run tests/capture-extractors.spec.ts   # 24 passed
npx vitest run                                                                             # 147 files / 1563 pass
node scripts/build.mjs                                                                     # ✓（含 capture-main.js）

# host 端到端（隔离 DSH_HOME，真实 CDN 下载）
node /tmp/omnimux-capture-host-test/verify.mjs   # XHS/X/抖音 ready；IG 超时
```

## 实测发现（驱动本次改动）

1. Instagram 详情数据在 `{"require":[[...]]}` Relay 包装里，`items` 深度 15（旧 `findDeepObject` 上限 14 → media/author 为空）；Reel 同时带 `video_versions` 与 `image_versions2`，视频应优先于封面/轮播图片。
2. 小红书详情页必须带 `xsec_token` 才可回放；旧提取器把它剥掉，回放 404；cover 曾落到平台静态 logo。
3. X 直播回放的媒体地址是 `*.pscp.tv/...thumbnail/*.jpg`，旧逻辑按推文 shape=video 误标成 video。
4. 抖音详情经 XHR `/aweme/v1/web/aweme/detail/` 加载，页面仅有 `SSR_RENDER_DATA` 配置；isolated world 读不到 → 新增 MAIN-world 桥接（document_start 包装 XHR/fetch，把 aweme JSON 写入 DOM script 节点）。
5. TikTok 页面内 fetch 200/3MB，但 host 带 cookie/UA 仍 403（Akamai 拒非浏览器）→ 字节回传（下一单）。
6. YouTube 27/27 流为 signatureCipher/无 url → 页面内拿不到直链，保留云端媒体下载（用户已确认）。
7. IG 视频 CDN 实测约 119KB/s（25.9MB 需 ~215s），host 60s 超时；扩展保存请求 30s 超时 → 需要「202 受理 + 后台下载」与进度（下一单，spec AC8）。

## 证据边界

- 真实页面来自 ego-browser 自己的浏览器空间与登录态；提交的证据只保留截图与脱敏字段（platform/title/author/media host），不包含 cookie、签名直链或 token。
- Dev 45120 真机验收属人工职责；本次未以其作为卡点。
