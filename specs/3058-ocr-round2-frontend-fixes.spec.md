# #3058 OCR round2 前端整改规格（F1–F4）

来源：`.agent-reports/shared-official-voice-preview/ocr-final-accepted.md`
（CLI medium 意见第 1/3/4/7 条）。scope 仅
`plugins/omnimux-assets/src/client/` 下 modal / hook / card 三源与行为测试；
不动 dialog（SHA 复用）、不动 runner、不引入新 UI 与文案。

## 用户操作旅程与期望反馈

- 旅程 A（官方音色详情播放）：用户在云资产详情弹窗打开官方音色试听行，
  `<audio>` 选定 `<source>` 后出现**解码失败或播放期网络失败**。
  期望：发生在 `<audio>` 元素上的 error 同样按 DTO 候选顺序回退；穷尽后
  仅显示一次核定文案 `cloud.preview.failed`，绝不落 unsupportedMedia 空态；
  source error 与 element error 任意到达顺序同候选只推进一次（不 double-advance）。
  普通音频 element error 恢复原 `broken` 行为（撤播放器、不出官方文案）。
  `NotAllowedError` 静默——自动播放被拦不等于文件失败。

- 旅程 B（详情 A→B 切换）：A 候选穷尽 broken 后切到 B，B 的 audio 在
  broken reset 后的那次提交才挂载。期望：关闭弹窗或再次切换时 B 的原生
  实例照常 pause + currentTime=0——清理绑定实际挂载的媒体实例
  （稳定 callback ref 于 mount/unmount 捕获），不依赖 itemKey effect 捕获；
  render 期零 ref 变更，未提交渲染不作废旧回调。

- 旅程 C（卡片试听终态）：官方试听自然 ended 或候选穷尽后无后续操作。
  期望：该请求的全部 attempt element 释放（pause、归零、摘除 ended/error
  监听、src 清空），请求级 cleanup ref 失效，迟到 callback 被 request
  token 短路；notice/suppression 语义不变（仅官方分支），普通素材静默停止不变。

- 旅程 D（悬停试听中打开详情）：卡片 hover 自动试听后点击标题/卡体或键盘
  （Enter/Space）打开详情，指针仍悬停。期望：打开详情前卡片被标记
  user-controlled，`audition.stop()` 之后 hover 副作用不再自动重启试听，
  卡片与详情音频不并播；普通点击播放/暂停/移出语义不受影响。

## 实现约束

- F1：保留 source 级 handler，补 attempt-scoped `<audio>` onError 走同一
  去重结算（`settledAttemptsRef`）；每个 attempt 的 `<audio>` 以
  `key={itemKey:candidateIndex}` 建独立节点。
- F2：移除按 itemKey effect 捕获 videoRef 的清理；改稳定 callback ref：
  mount 登记实例、unmount/换 key 直接 pause+归零旧实例；未提交 render
  不触碰任何 ref。
- F3：请求级 `releaseRequest`：ended 与穷尽路径先校验 request ownership，
  再 token+1 短路迟到回调、释放全部 attempt、复位 stopAttemptsRef。
- F4：卡片所有详情入口（click / 键盘）先置 `userControlledRef=true` 再走
  既有 openPreview；`CloudAssetsView.handleOpenPreview` 与文本锁断言不变。

## 验收用例（行为级，esbuild + JSDOM + 受控媒体桩，强断言）

1. `<audio>` 元素 error → 官方按候选序回退、穷尽一次文案；普通音频 broken。
2. source error 与 element error 反向到达不 double-advance。
3. broken A→B 挂载后关闭/切换：B 实例被 pause 归零。
4. ended 与穷尽后所有 attempt element：paused、src=''、listeners 摘除。
5. 终态释放后再发起新请求：旧 cleanup 不误伤新 attempt。
6. 悬停中键盘/点击打开详情：stop 生效后无自动重启 toggle。

## 回归保持

voice-preview-audition / media-lifecycle / official-audio-fallback /
ordinary-failure / audio-hover-toggle / audio-hover-autoplay-suppression /
CloudAssetsView.test.js / AssetPreviewModal.test.js 全部保持绿；
CloudAssetsView.jsx 文本锁断言（openPreview 形状、handleOpenPreview、
suppression 效果条件）不破坏。
