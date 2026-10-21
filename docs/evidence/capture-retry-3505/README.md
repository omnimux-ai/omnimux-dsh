# #3505 捕获重试 + 回退原因 + 通用提取收敛：真实浏览器证据

- 任务：Issue #3505（worktree `cross-capture-retry`，分支 `agent/cross-capture-retry-issue-3505`）
- 时间：2026-10-21
- 方式：Chrome for Testing 151 独立临时 profile + `--load-extension=<worktree>/extension/dist`，CDP 驱动真实面板页面 `panel/index.html` 点击「保存到灵感库」，与 Dev host（127.0.0.1:45120）真实交互；测试行验收后 DELETE 清理。

## 场景与结果

| 场景 | 页面 | toast | host 行 | 判定 |
| --- | --- | --- | --- | --- |
| A 页面内采集成功 | Wikipedia Cat 文章页 | 「已保存到 OmniMux 灵感素材库！」 | `ready`，type=image，media 2 条，本地文件 3 个 | ✅ |
| B 采集不到作品 → 回退云端 | YouTube 视频页（页面内无直链） | 「已保存到灵感库（页面未提取到作品，已转云端解析）」 | `degraded`（云端解析完成，无直链视频） | ✅ |

`E2E_RESULT PASS`（连续两次运行一致）。

截图：`panel-wikipedia.png`（成功 toast + 页面卡片）、`panel-youtube.png`（回退原因 toast）。
原始日志：`real-browser-e2e.log`（含 active tab、toast、行状态、清理状态）。

## 真实浏览器暴露并修掉的 bug

1. **iframe 竞速**：`chrome.tabs.sendMessage` 默认发给所有 frame，页面里的 iframe 内容脚本先回答 `{ok:false}`，导致本来能采集的页面被判「无作品」并回退云端。
   修复：`sendCaptureRequest` 显式 `{ frameId: 0 }`，只问顶层 frame；`content/index.ts` 保留 iframe 自我保护。
2. **内容脚本时序**：一次失败即回退；改为 3 次 × 400ms 重试（`CAPTURE_ATTEMPT_COUNT=3`、`CAPTURE_RETRY_DELAY_MS=400`），并区分 `capture-unavailable` / `capture-empty` / `capture-rejected` / `no-tab`。
3. **回退不可见**：回退成功时响应携带 `fallback`，面板 toast 明确显示「已转云端解析」及原因；不再用「已保存」掩盖采集中断。
4. **通用提取过宽**：Wikipedia 曾存成 20 张正文图；现在只收 og/twitter/JSON-LD 图片 + 首个主视频（含 `<source>`）；无 og 时才退到文章主图 1 张。真实验收保存为 2 张主图（og 缩略图 + 原图）。

## 测试

```bash
cd plugins/omnimux-browser/extension
npx vitest run tests/capture-retry-fallback.spec.ts tests/capture-extractors.spec.ts
# 31 passed（含 4 种回退文案 zh/en、og/主图/视频收敛、重试常量与 fallback 接线）
npx vitest run
# 149 files / 1575 passed + 1 expected fail（无回归）
node scripts/build.mjs   # 通过（dist/content.js 含 frameId 修复）
```

## 证据边界

- 未使用用户登录态/用户 Chrome profile；临时 profile 与测试行均已清理。
- YouTube 场景走的是云端解析（页面内无直链），行状态 `degraded` 属预期；TikTok/抖音字节回传仍是后续单。
- Dev 45120 真机验收仍属人工职责；本证据是 agent 在独立 Chrome 上的真实点击验收。
