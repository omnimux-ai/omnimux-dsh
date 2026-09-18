# 灵感弹窗组件 currentShotIndex 变量定义缺失修复规格说明 (Issue #2309)

## 1. 问题描述
用户进入灵感社区打开素材预览弹窗时，页面发生 React 渲染崩溃，控制台显示：
`dsh-better-sidebar: currentShotIndex is not defined`
页面白屏崩溃并提示“重试”。

## 2. 根本原因
在 `plugins/omnimux-inspiration/src/client/InspirationPreviewModal.jsx` 中，我们在分镜列表遍历逻辑中使用了：
`const isCurrent = currentShotIndex === sIdx && isPlaying`
并在分镜点击回调中使用了：
`onClick={() => handleSeekShot(shot)}`
但在组件顶层未完整定义 `currentShotIndex`（计算属性）与 `handleSeekShot`（跳转函数），导致 JS 引擎在运行时抛出未捕获的 `ReferenceError`。

## 3. 验收准则 (Acceptance Criteria)
1. **定义派生状态 `currentShotIndex`**：
   根据 `currentTime` 与当前视频所有分镜的 `start_seconds` / `end_seconds` 区间，使用 `useMemo` 正确推导当前正在播放的分镜下标（未命中则返回 `-1`）；
2. **定义 `handleSeekShot(shot)`**：
   点击分镜卡片时，将左侧播放器跳转至该分镜的 `start_seconds`，并触发播放；
3. **零引用错误**：
   组件加载与打开任意历史/存量/新视频素材，均不得抛出 `currentShotIndex is not defined` 或任何未定义异常，页面正常渲染。
