# 浏览器验收报告 · Issue #2997 组合锁定的卡槽直接不显示

- 工作树：`.worktrees/viewer-slot-hide-locked-issue-2998`，Branch `agent/viewer-slot-hide-locked-issue-2998`，Base `origin/main`（#2987 已合入）
- 方式：ego-browser 真实浏览器（TaskSpace #32，已释放）+ 工作树真实 `MediaViewerComposer`（esbuild 打包本工作树源码与 MEDIA_VIEWER_CSS），catalog 由 `buildModelCatalog()` 现场生成（minimax-h3 + seedance-2-0）

## 断言结果

| # | 场景 | 期望 | 结果 |
| --- | --- | --- | --- |
| 1 | H3「参考」空态 | 只显示 图+视频 两卡槽，无音频槽 | ✅ groups=2，按钮为「添加图片」「添加视频」（hidden-empty.png） |
| 2 | 图片入槽后 | 音频槽出现 | ✅ groups=3，出现「添加音频」（revealed-after-image.png） |
| 3 | is-locked 残留 | 无半透明锁槽 | ✅ 截图无灰色锁定卡槽 |

## 范围
后台校验（rejectionOf/groupLockOf）与 #2987 相同不变；仅渲染层把「锁中且空」的卡槽隐藏。
