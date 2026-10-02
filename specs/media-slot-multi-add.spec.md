# Spec: 素材卡槽支持连续添加多图（media-slot-multi-add）

## 背景
图像模式的引导素材卡槽（文生图态常驻虚线槽）上限 max:1，用户贴一张图后无法再贴第二张，
与「按素材数量自动决定方式（1图→编辑/多图→参考）」的设计意图冲突：
- gpt-image-2.5 契约 multi_reference inputs.reference_image max:1（保守），但 media-slot.js
  标准契约兜底 image_edit max:1 / multi_reference max:4，且 Dev 兜底模型也按参考上限支持。
- 用户预期是贴 N 张自动切参考，目前第二张贴不进。

## 验收标准
- AC-1：文生图态连续粘贴 2 张图 → 卡槽出现 2 项，自适应推导进入参考模式（若模型声明）。
- AC-2：文本/视频引导槽上限语义不变（首帧/尾帧仍各 1）。
- AC-3：契约兜底模型兜底值对齐 multi_reference 上限（参考 max:4）。
- AC-4：粘贴第 5 张超出参考上限时给「最多添加 N 个」提示，不静默丢弃。

## 改动范围
- `plugins/omnimux/src/client/media-viewer/media-slot.js`：图像引导槽 max 由 1 提升为参考上限 4（与 multi_reference 兜底对齐）；仅图像槽，视频槽不动。
- 测试：`media-slot.test.js` 增补连续添加断言。

## 边界
- 不改提交校验/操作推导语义；引导槽 guidedOnly 仍受「模型不支持参考图时提交被拦」语义保护。
- 多模型只有 text_to_image 且 multi_reference 未核验时，贴图后仍受提交期提示约束（已知契约边界）。
