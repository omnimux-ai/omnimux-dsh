# #3472 作品采集插件化：隔离工作树验收证据

- 任务：Issue #3472（worktree `cross-plugin-post-capture`，分支 `agent/cross-plugin-post-capture-issue-3472`）
- 时间：2026-10-21
- 环境：本任务隔离 worktree，headless Chrome（动态端口），不读写共享 Dev 业务状态

## 真实浏览器验收（worktree Web QA runner）

```
node scripts/worktree-web-qa.mjs inspiration
# ▶ 正在验收 inspiration ... ✅ PASS (1.87s, 端口: 50271, 截图: 1280x713)
```

- 截图：`inspiration.png`；结构化报告：`worktree-qa-report.json`（7 项断言全 pass）
- 证据边界：该 runner 是最小 Stage 夹具，证明本任务 `omnimux-inspiration` 客户端 bundle 在真实浏览器可构建/加载/渲染；不装载带登录态的抖音/小红书页面，也不覆盖扩展内容脚本的真实页面提取。提取器由 fixture 单测覆盖；抖音/小红书真实页面选择器需人工登录态在 Dev 45120 验收。

## 自动化检查（真实计数）

Host（`plugins/omnimux-inspiration`）：

```
node --import ./scripts/deny-network.mjs --test src/*.test.js src/rival/*.test.js src/radar/*.test.js src/client/*.test.js src/client/*.e2e.test.js
# tests 1713 / suites 346 / pass 1713 / fail 0 / deny-network 0 outbound
# 新增：capture-handler 12、downloader headers 3、douyin/xhs canonical 2
```

Extension（`plugins/omnimux-browser/extension`）：

```
npx vitest run
# Test Files 146 passed (146) / Tests 1554 passed | 1 expected fail (1555)
# 新增：capture-extractors 19、capture-message 3、capture-save-routing 12
node scripts/build.mjs
# ✓ built in 586ms（background/content/panel 均产出，dist/ 不入库）
```

UI/Stage 契约：

```
node scripts/verify-stage-contracts.mjs      # PASS: 14 Stage components; 8 sidebar targets
node --test scripts/verify-anti-slop.test.mjs # 3 pass / 0 fail
```

## 覆盖到的功能断言（非真实页面）

- host `/local/capture`：header 白名单（referer/user-agent/cookie，去控制字符、截断 4096、其余丢弃）、下载请求确实带 header 且库文件不含 cookie 值、媒体 ≤20、公开 URL 校验、canonical 去重 200 existing、degraded 原地升级、部分失败降级 201 + import_error、全失败 422 不写库、仅封面存活仍入库
- canonical key：抖音 `/video|/note|/share/video/<id>`、小红书 `/explore|/discovery/item|/item/<id>`，忽略 query/hash，伪装域名不误命中
- 扩展提取器：YouTube（playerResponse/adaptive 选择）、TikTok（universal data 视频/图集）、X（复用 twitter-capture）、Instagram（shortcode_media/sidecar）、抖音（_ROUTER_DATA + DOM 兜底）、小红书（__INITIAL_STATE__ + DOM 兜底）、通用兜底（og/JSON-LD/video/img 过滤）、media 上限截断、空页 null
- 扩展保存路由：整页保存才尝试 capture；capture 成功 `via:'capture'` 且不再走 import-url；capture 失败/无媒体回退 import-url；账号主页仍走账号监控

## 已知限制

- 抖音/小红书公网直取被风控，提取器只能基于登录态页面内联 JSON/DOM（best-effort）；解析失败返回 null → 回退 import-url/降级，不会假成功。
- 抖音/小红书直链带时效签名，host 需在 capture 后立即下载；失败按契约降级。
- 媒体下载采用页面可见的 `document.cookie`（HttpOnly 不可读）+ referer/UA；若 CDN 强制 HttpOnly cookie，会下载失败并回退。
- 未做真实扩展 + 真实 host 的端到端演练（Dev 45120 属人工验收）；两端分别由 host 路由测试与扩展 fixture/消息测试覆盖。
