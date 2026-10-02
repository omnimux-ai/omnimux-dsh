# Spec: 素材卡槽支持剪贴板粘贴图片/视频（media-paste-slot）

## 背景
生成输入面板素材卡槽目前只能点按钮从系统文件框或参考面板选素材；复制一张截图或录屏后无法直接 Ctrl+V 粘贴入槽。

## 验收标准
- AC-1：在生成输入框任意位置粘贴一张图片 → 图片进入卡槽并显示缩略图（不丢进提示词文本）。
- AC-2：粘贴图片时若当前操作没有可容纳卡槽（如文生图），自动切换到「编辑」操作并把图放进去；多张图片自动切换到「参考」。
- AC-3：粘贴视频时若当前操作有视频卡槽则进槽；否则提示素材类型不支持，不静默吞掉。
- AC-4：普通文本粘贴不受影响，仍进提示词输入框。
- AC-5：卡槽满时给出「卡槽已满」提示而非覆盖已有素材。

## 新用户基线
粘贴行为只对媒体文件（image/、video/、audio/ MIME）生效；纯文本与任意其他类型粘贴保持原样。不引入新默认或外部依赖。

## 改动范围
- `plugins/omnimux/src/client/media-viewer/MediaViewerComposer.jsx`：根容器捕获 onPaste 的 clipboardData.files，按 MIME 分流入槽；含 deriveAdaptiveOperation 换操作重试逻辑。
- 测试：`media-viewer-composer.test.js` 增补粘贴链路断言。
