# Issue #4024 — 资产库风格预览弹窗「加入对话」自动关闭

真实无头 Chromium（ego-browser TaskSpace）加载一个挂载**真实** `AssetPreviewModal` 的测试页，
用真实点击点「加入对话」按钮，验证弹窗自动关闭。

- `before-click-modal-open.png`：点击前，弹窗可见，标题「科技感电影风格」，底部「加入对话」「保存到本地」。
- `after-click-modal-closed.png`：点击后，弹窗消失，回到素材列表。
- `report.json`：结构化断言 —— 点击前 backdrop=1；点击后 backdrop=0；`add` 投递 1 次；`onClose` 调用 1 次。

行为回归由 `plugins/omnimux-assets/src/client/AssetPreviewModal-media-lifecycle.e2e.test.js`
中 Issue #4024 两个用例覆盖（加入对话→onClose 一次；保存到本地→不关闭）。
