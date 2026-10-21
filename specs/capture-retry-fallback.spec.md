# 捕获等待重试 + 回退原因可见 + 通用提取收敛（Issue #3505）

## 1. 背景（真实浏览器操作暴露）

在真实 Chrome（Chrome for Testing 151）+ 本仓 `extension/dist` 点击保存时发现：

1. 页面较大、内容脚本尚未就绪时 `CAPTURE_POST` 失败，后台直接回退 `import-url`；不支持的站点于是「toast 已保存、库里 failed」——用户看不到回退原因。
2. Wikipedia 文章页被通用提取器收成 20 张正文图（噪音），应只取 og/twitter/JSON-LD 主图与主视频。

## 2. 目标与用户旅程

| # | 场景 | 期望 |
| --- | --- | --- |
| J1 | 内容脚本慢 0.4–1.2s 的页面点保存 | 后台在 ~1.5s 内重试 `CAPTURE_POST`（3 次 × 400ms），成功则走 capture 直传，toast 维持「已保存到 OmniMux 灵感素材库！」 |
| J2 | 重试后仍无内容脚本 | 回退 `import-url`，成功时 toast「已保存到灵感库（页面内容脚本未就绪，已转云端解析）」 |
| J3 | 内容脚本在但提取不到作品 | 回退，toast「已保存到灵感库（页面未提取到作品，已转云端解析）」 |
| J4 | 提取到了但 host capture 拒绝（4xx/网络） | 回退，toast「已保存到灵感库（内页采集未入库，已转云端解析）」 |
| J5 | 通用文章页（非社交站）保存 | 只收 og/twitter/JSON-LD 图片与主视频；无 og 时取文章主图 1 张；不再收正文全部图片 |
| J6 | 回退后云端也失败 | 保持现有失败 toast；行状态如实（failed + 原因） |

## 3. 实现

### 3.1 扩展后台（`background/index.ts`）

- `capturePostFromActiveTab()` 改为带重试的结构化结果：
  ```ts
  type CaptureAttempt =
    | { kind: 'captured', post: CapturedPost }
    | { kind: 'no-tab' }
    | { kind: 'capture-unavailable' }   // 内容脚本无响应（tabs.sendMessage 报错/超时）
    | { kind: 'capture-empty' }         // 内容脚本响应 ok:false / post 结构不合法
  ```
  - `CAPTURE_ATTEMPT_COUNT = 3`，`CAPTURE_RETRY_DELAY_MS = 400`；`no-tab` 不重试；其余最多 3 次。
- 保存分支：`captured` → `saveCapturedPostOnHost`；成功 `{ok:true,target:'inspiration',via:'capture'}`。
  - 未 captured、或 host 拒绝 → 记录 `fallback: 'capture-unavailable' | 'capture-empty' | 'capture-rejected'`，继续原 import-url 兜底。
  - 兜底成功响应加 `fallback` 字段；兜底失败响应也带 `fallback`（不改变既有失败语义）。

### 3.2 面板（`panel/save-target-copy.ts` + `App.tsx`）

- 新增 `saveFallbackToast(fallback, locale)`：
  - `capture-unavailable` →「已保存到灵感库（页面内容脚本未就绪，已转云端解析）」/ en 对应
  - `capture-empty` →「已保存到灵感库（页面未提取到作品，已转云端解析）」
  - `capture-rejected` →「已保存到灵感库（内页采集未入库，已转云端解析）」
  - 其它 →「已保存到灵感库（内页采集失败，已转云端解析）」
- `handleSaveToInspiration` 读取后台 `fallback`，命中时用 fallback toast；未命中维持原文案。

### 3.3 通用提取（`content/capture/generic.ts`）

- media 组成改为：`domVideos(root)`（含 `<video><source>`）+ JSON-LD video + og/twitter 图片 + JSON-LD image；仅当以上没有任何图片时，追加 `article/main/[role=main] img` 的**第一张**作为主图。
- 移除 `domImages(root, href)` 全量收集；cover 逻辑保持（og → JSON-LD → poster → 首张 image）。
- 上限仍由 `uniqueMedia`/契约 20 条保护。

## 4. 测试

- 新增 `tests/capture-retry-fallback.spec.ts`：
  - copy：4 种 fallback 文案 zh/en 均包含「已保存到灵感库」与具体原因；未知值有默认。
  - generic：文章页（og:image + 20 张正文图）只出 og 图；无 og 时只出文章主图 1 张；`<video><source>` 出视频；og 图 + 视频同页两类都保留。
  - 文本契约：background 含重试常量与 fallback 标记；panel 传 fallback；toast 选择逻辑在 copy 模块。
- 更新既有 `capture-extractors.spec.ts` 中依赖「全页图片」的断言。
- 全量测试 + build。

## 5. 真实浏览器验收（用户点名）

用 Chrome for Testing + `--load-extension=<dist>`、独立临时 profile，CDP 驱动真实面板：

1. Wikipedia 文章页点保存 → toast 原文案；Dev 行 ready 且媒体数 ≤3（og/主图）。
2. 无媒体文本页点保存 → toast 含「页面未提取到作品」回退原因；行状态如实。
3. 截图 + host 行信息入库证据；测试行 DELETE 清理。

## 假设

- 根因假设：真实浏览器里 CAPTURE_POST 失败的主因是内容脚本注入/加载时序，而不是消息协议本身——一次失败就回退放大了这个问题；短暂重试应能覆盖绝大多数页面。
- 内容脚本应答 `ok:false` 表示「页面没有作品结构」（如纯文本页），与「脚本不在」是两类问题，toast 必须区分，不能笼统说失败。
- 通用提取器把正文所有图片当作品素材是过宽假设；og/twitter/JSON-LD 与主视频才代表「作品本身」，其余图片属于页面 chrome/正文噪音。
- 真实浏览器验收使用独立临时 profile + 本仓构建 dist，不依赖用户登录态；测试产生的 Dev 行会在验收后删除。

## 证伪方式

- 若真实页面验收中，内容脚本已就绪（直接 `chrome.tabs.sendMessage({action:'CAPTURE_POST'})` 能返回 post）而保存仍回退云端，则「时序假设」被证伪，需要查后台分支/端口而非重试。
- 若通用文章页在只有 og:image 时仍返回多张正文图，或 `<video><source>` 未产出视频，则「收敛假设」被证伪。
- 可执行验证：
  - `cd plugins/omnimux-browser/extension && npx vitest run tests/capture-retry-fallback.spec.ts tests/capture-extractors.spec.ts`
  - `node scripts/build.mjs`
  - 真实浏览器：Chrome for Testing + `--load-extension=<worktree dist>`，CDP 驱动面板点击，检查 toast 文案与 Dev 行 `media_urls` 数量/`import_status`；无媒体页检查 toast 含回退原因。
  - 观测点：toast 文本、响应 `fallback` 字段、host 行 `import_status/media_urls/local_paths`。
