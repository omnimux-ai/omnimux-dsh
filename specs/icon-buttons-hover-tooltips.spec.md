# 规格：移除音频卡片冗余波形重试按钮并补齐悬停提示 (Issue #3083)

## 1. 目标（Objective）
1. 移除音频预览卡片底部控制栏中冗余的「重试解析波形」旋转图标按钮，避免与右侧「替换素材」旋转按钮并排造成视觉重复与功能混淆。
2. 为音频控制栏所有保留的纯图标按钮（核心播放/暂停按钮等）全量补齐鼠标悬停提示 (`title`)，并保证中/英文多语言国际化完全对齐。

## 2. 变更范围（Scope）
- `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/AudioPreview.tsx`:
  - 移除波形重试按钮 (`.wf-audio__retry`) 及其多余的 JSX 节点。
  - 为播放/暂停按钮 (`.wf-audio__play`) 补齐 `title={t(playing ? 'audio.pause' : 'audio.play')}`。
  - 保证保存、打开、定位、替换按钮已有的 `title` 提示正常生效。

## 3. 验收标准（Acceptance Criteria）
1. 控制栏右侧仅保留一个清晰明确的「替换素材」旋转图标，不再出现两个并排旋转图标。
2. 鼠标悬停在控制栏任何纯图标按钮上时，均呈现准确的本地化悬停提示。
3. 单元测试与端到端测试全绿通过，实机验收无异常。
