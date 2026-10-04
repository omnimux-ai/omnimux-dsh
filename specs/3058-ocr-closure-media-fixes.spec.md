# #3058 OCR closure 复审 · 最后 4 medium 媒体生命周期修复规格

来源：`.agent-reports/shared-official-voice-preview/ocr-closure.md`（真实本机
OCR CLI，frontend complete 8/8 保留 4 条 medium）。只改 3 个播放源码 +
对应测试；不改 runner、不改 OCR 原报告、不 commit/push/merge、不 browser、
不 Dev/restart、不 TTS/R2。

## 用户操作旅程

- 素材弹窗打开音频预览后，用户切到下一条音频素材：播放控件必须装载新
  资源，绝不继续指向旧 item 的源。
- 官方音色预览全部候选失败：无论该素材有无描述文本，都显示一次核定失败
  文案 `cloud.preview.failed`，不吞成描述文本、不落格式不支持空态。
- 音色选择弹窗试听自然播完或穷尽失败：该请求全部媒体实例即释放，不留
  滞留的 Audio element/handlers/src。
- 普通云端素材（BGM/SFX）悬停试听失败：静默停止，无失败提示、不入悬停
  抑制；官方音色穷尽失败仍按既有契约一次提示 + 抑制。

## CLI 条目 → 整改映射

| 条目 | 位置 | 根因 | 整改 |
|---|---|---|---|
| F1 | AssetPreviewModal `<audio>` 无 key | item 切换但弹窗不卸载时，`<source>` src 更新不保证已挂载媒体重扫，控件可仍指向旧资源 | `audio` 加 `key={itemKey}` 使换 item 即重挂载；`useEffect([itemKey])` 捕获当次提交 element 做 stop（pause + currentTime=0） |
| F2 | AssetPreviewModal render 期改 `mediaRequestRef` 等令牌 refs | 并发渲染/StrictMode 下未 commit 的 render 也递增令牌，误作废当前可见 item 的回调 | 令牌重置/失效移入 commit 后执行的 effect（useLayoutEffect）；回调闭包绑定已提交的 token/item；`<source>` 按 `itemKey:候选下标` key 化，杜绝同一 element 换 src 后迟到旧 error 误读新候选 |
| F3 | VoicePickerDialog 终态只清当前 element | 早先失败 attempt element 及 handlers/src 留在 elementsRef，自然结束也滞留到 stop/close | 请求终态（ended、最后候选失败、NotAllowedError）释放该请求全部 attempt elements（pause/归零/摘监听/清 src/清集合），保留令牌守卫 |
| F4 | use-cloud-assets-feed `reportFailure` 对普通素材也出官方提示+抑制 | 普通素材单候选也走 reportFailure，改变旧静默行为 | 提示与 markSuppressed 仅 `isOfficialVoice === true` 分支执行（含 reportAutoplayDenied 的抑制）；普通素材维持静默停止 |
| F5（邻近同根） | AssetPreviewModal `officialPreviewFailed` 判定排在 `text !== ''` 之后 | 全部预览候选失败（broken）但 description 非空时吞掉核定失败文案，显示描述文本 | `officialPreviewFailed` 分支提到 text 分支前；失败条件仍要求 `broken === true`（全候选失败），未验证空描述旧语义保留 |

## 验收用例（红→绿证据）

- AssetPreviewModal：item A（音频）→ item B（音频）重渲染，`audio` 元素
  实例更换（`notEqual`）、`source.src` 指向 B 首候选；item A 迟到的
  source error 不推进 B 状态（B 不 broken、播放控件在）。
- AssetPreviewModal：官方预览音频全候选失败且 `text` 非空 →
  `container.textContent` 含核定 `cloud.preview.failed` 文案且不含描述
  文本、不含 unsupportedMedia。
- VoicePickerDialog：候选链 ended / 穷尽失败 / NotAllowedError 三条终态
  全部 attempt element `src === ''` 且 handlers 为空；新请求开始不受
  旧请求清理影响。
- use-cloud-assets-feed：普通素材唯一候选 error → `notice === ''`、
  `suppressedIds` 不含该 id（强断言）；官方试听穷尽 → 核定 notice +
  suppress（回归既有行为）。

## Non-Goals

- 不新增 UI 元素/文案/徽章；沿用原生 `audio controls`。
- 不 refactor 既有令牌/attempt 框架；最小 diff。
- 不改 `build-cloud-assets-catalog.mjs` / hub `preview.js` / runner。
