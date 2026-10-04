# #3058 OCR 集成复审 · 前端整改规格（7 medium）

来源：`.agent-reports/shared-official-voice-preview/ocr-integrated.md` 的真实 CLI
审查（v1.12.11，24 selected = 24 completed）。本规格只覆盖前端路由的 7 条
medium；hub preview.js / assets builder 的 3 条（OCR #5/#6/#7）由后端 lane 整改。
范围：播放业务源码 + 相关测试；不改 runner、不改 OCR 原报告、不 commit/push/merge。

## CLI 条目 → 整改映射

| OCR # | 位置 | 根因 | 整改 |
|---|---|---|---|
| #1 | VoicePickerDialog 重试 `play().catch` 读可变 `candidateIndex` | 旧候选 error 先推进到新候选后，迟到的旧 `play()` rejection 把新候选误结算 | 每次 `play()` 前捕获 attemptIndex，rejection 只结算自身候选 |
| #3 | VoicePickerDialog 首次 `play().catch` 同上 | 同上（首次尝试） | 同上；onerror 同样按已武装下标结算，不重读游标 |
| #2 | use-cloud-assets-feed 首次 `play().catch` 读 `candidateIndex` | 同上 | `attemptPlay(attemptIndex)` 捕获下标；`armedIndex` 绑定 element.src |
| #4 | use-cloud-assets-feed 重试 `play().catch` 读 `candidateIndex` | 同上 + onerror 重读游标会误归因旧 src | `element.src` 与 `armedIndex` 先绑定再发起 play；error 事件结算 `armedIndex`；每 attempt 一次结算保 requestToken |
| #8 | use-cloud-assets-feed 按 purpose 直接取候选 | 卡片藏播放键只是 UI 层；hook 是真实播放 seam，其他调用方/陈旧路径仍可探测未验证 URL | hook 在构造 Audio 前要求 `isOfficialVoicePreviewPlayable(asset)`，否则候选为空直接返回（零构造、零 fetch） |
| #11 | CloudAssetsView `canPlay` 被 `hasMedia` 前置 | 只有 `preview.primary_url` 的已验证 DTO 行不显示播放键 | 官方行资格 = `isOfficialVoicePreviewPlayable`；`hasMedia` 仅用于普通资产；`cloudCardKind`/`cloud-preview` 配合让 DTO-only 行合法（音频卡 + 详情走 primary 直链） |
| #12 | NotAllowedError 后 hover 循环 | `reportFailure` 清 `playingId`，hover 副作用见 `hovering && !playing` 又调 `toggle` → 重复自动播放 + 重复提示 | 权限拒绝静默回空闲（不出文件不可用文案）并抑制同一悬停的自动重启；穷尽失败同样一次提示后抑制；`toggle(asset, explicit)` 标记显式动作解除抑制；卡片增加 `autoplaySuppressed` 门 |

## 验收用例（红→绿证据）

- deferred `play()` 受控 Audio：`error` 推进 candidate1 后，candidate0 的迟到
  `play()` rejection 不得结算 candidate1（assert.equal src/playingId/notice）。
- unverified 官方行调 `toggle`：不构造 Audio、不进入播放态、不提示。
- 真实 CloudAssetCard + 真实 hook：悬停自动播放被拒后同一悬停
  `toggle` 次数不再增长；显式点击重试一次；再次被拒后抑制重新武装；
  全程 `notice === ''`。
- DTO-only verified 行（`media_url` 为空）：`canPlay` 真、`cloudCardKind==='audio'`、
  详情 `previewUrl === preview.primary_url`；未验证行保持文本卡/文本详情。
- 失败文案仍为核定双语 `cloud.preview.failed`（中：试听暂不可用，请稍后重试。/ 英：Preview is temporarily unavailable. Try again later.），画布沿用
  `toast.info('试听暂不可用，请稍后重试。')`；preview-only 语义不变。

## Non-Goals

- 不改 `build-cloud-assets-catalog.mjs` / hub `preview.js`（后端 lane）。
- 不新增 UI 元素/文案/徽章；不改 design.md 已有 token。
- 不跑 runner（worker 61 在写）、不 browser、不 Dev/restart、不 TTS/R2。
