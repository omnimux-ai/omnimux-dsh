# 规格 · 首尾帧双卡槽常驻 + 仅提交时降级（Issue #3045）

## 1. 目标（Objective）

修复「首帧/首尾帧」页签下，填入首帧素材后尾帧卡槽消失的缺陷。生成方式（operation）与卡槽布局错误耦合：填入首帧后 `deriveAdaptiveOperation` 把模式降级为 `first_frame`（单首帧），`slotPlan` 重算只剩一个槽，用户无法再补尾帧，违反「首尾帧允许逐步连接、先待尾帧」的已有旅程（IN-13）。

## 2. 用户操作旅程

1. 用户在视频模式选「首帧/首尾帧」页签 → 出现首帧、尾帧两个空卡槽（±5° 倾斜 + 中间换向图标，沿用 #2994 视觉）。
2. 用户先填首帧 → 首帧卡显示缩略图，尾帧空槽仍然可见可点；中间换向图标按既有规则（两槽均空才显示）消失。
3. 用户再填尾帧 → 两卡都显示缩略图；此时提交即 `first_last_frame`。
4. 只填首帧提交 → 操作降级为 `first_frame` 合法发出；只填尾帧提交 → 按既有契约降级 `text_to_video`（尾帧不可孤立提交），不得静默发送不完整 `first_last_frame`。
5. 删除首帧素材 → 两槽仍常驻；两槽均空时恢复成对倾斜 + 换向图标。

## 3. 验收标准

| # | 验收点 |
|---|---|
| AC1 | 「首帧/首尾帧」页签下，仅填首帧后 `slotPlan` 仍返回首帧+尾帧两个槽（不再被降级为单槽） |
| AC2 | 换向分隔图标仅在两槽均空时显示（#2994 既有规则不回退） |
| AC3 | `deriveAdaptiveOperation(model,'video',buckets,hintOpId)` 在 hint 为 `first_last_frame` 且仅首帧时返回 `first_last_frame`；hint 为空/其他时行为与现状一致（仅首帧→`first_frame`） |
| AC4 | 提交路径：当前操作为 `first_last_frame` 且尾帧为空时，提交按首帧降级（`first_frame`）；仅尾帧时降级 `text_to_video`；双帧齐时保持 `first_last_frame` |
| AC5 | 参考、编辑、文生视频等其他页签/模式零差异 |
| AC6 | `node --test plugins/omnimux-viewer/src/media-viewer/*.test.js` 全部通过 |

## 4. 边界

- 只改 `media-slot.js` 的 `deriveAdaptiveOperation`（hint 保真分支）与 `MediaViewerComposer.jsx` 提交时的操作再确认；不改素材上传、选材、绑定逻辑。
- 不新增任何可见文案/元素。
- 样式不变（沿用 #2994）。
