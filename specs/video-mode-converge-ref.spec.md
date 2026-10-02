# 视频生成模式页签收敛：文生视频并入参考

## 背景与动机

视频模型（Seedance 2.0 / 2.5、MiniMax H3 等）的所有生成操作打的是同一个上游接口（`/v1/videos/generations`），操作差异只在提交参数。当前消费端把「文生视频」和「参考」拆成两个页签，用户想贴图/贴视频做参考时必须理解「参考是独立模式」，贴图到文生视频卡槽会报「不支持」。产品方向：文生视频 = 空素材的参考生成，不再单列页签。

## 验收标准（可测）

### AC-1 页签收敛

- 当模型同时具备 `video_multi_ref` 与 `text_to_video` 契约（如 Seedance 2.0/2.5）：视频模式页签为 `参考` + `首帧/首尾帧` + `编辑`（编辑仅在 `video_edit` 存在时），**不出现「文生视频」页签**。
- 模型只有 `text_to_video`（无 `video_multi_ref`）：仍显示单一可用的文生视频入口（页签数 ≤1 时整行隐藏，行为与现状一致）。
- 模型有 `text_to_video` + 帧类操作但无 `video_multi_ref`（如 Kling）：页签为 `文生视频` + `首帧/首尾帧`，文生视频保留——此时参考页签不存在，文生仍是必选入口。

### AC-2 参考页签兼容文生

- 参考页签常驻展示契约声明的三类卡槽（参考图 / 参考视频 / 参考音频），三类槽都打开同一个素材选择面板。
- 参考页签零素材时可提交：提交操作推导为 `text_to_video`（模型声明该契约时），不再弹出「空卡槽前置提示」阻断。
- 参考页签贴 1 张图 → 推导 `video_multi_ref`；贴 1 段视频 → 推导 `video_multi_ref`（不是 `video_edit`）；贴图+视频+音频混装 → `video_multi_ref`。
- 参考页签贴视频文件：若模型 `video_multi_ref` 声明 `type:'video'` 卡槽，允许入槽，不报「不支持」。

### AC-3 编辑/帧页签不回归

- 编辑页签贴 1 段源视频 → 推导 `video_edit`；贴图 → 参考图随源视频一起提交。
- 首帧/首尾帧页签贴图 → `first_frame` / `first_last_frame`，孤立尾帧仍降级 `text_to_video`。
- 图像模式（文生图/参考/编辑三页签）不受本次改动影响。

### AC-4 回归检查点（防止再被改回去）

`plugins/omnimux-viewer/src/media-viewer/media-slot.test.js` 与 composer 相关测试必须新增并保住以下断言：

- 参考页签零素材推导 `text_to_video`（非 `video_multi_ref`）。
- 参考页签含视频素材推导 `video_multi_ref`（非 `video_edit`）。
- 编辑页签含视频素材推导 `video_edit`。
- opModeTabs 在 seedance 类模型下不出现 `text_to_video` 页签 id；在仅帧模型下保留 `text_to_video` 页签。

## 关键用户旅程

1. 用户在 Seedance 2.5 视频模式下直接输入提示词点生成 → 走文生视频（空素材的参考模式，用户无感知）。
2. 用户在参考页签贴 2 张图 + 1 段参考视频 → 以参考素材生视频（video_multi_ref）。
3. 用户在编辑页签贴 1 段成片视频 → 视频编辑（video_edit）。
4. 用户切到 Kling 模型 → 看到「文生视频 + 首帧/首尾帧」两个页签，贴首帧图 → first_frame。

## 不做的事

- 不改执行中枢契约（video-models.yaml）、submit-guard、vendor wire 映射；vendor `references` 目前仅透传图片引用，参考视频/音频经 adapter seam 的 `video_urls`/`audio_urls` 通道，本次不动。
- 不动图像模式页签与卡槽。
- 不引入「数字人/延长」等其它操作页签。

## 验证方式

- `node --test plugins/omnimux-viewer/src/media-viewer/media-slot.test.js` 全绿。
- 工作树 QA 环境（test-env-bootstrap ui 模式）对 Seedance 2.5 走 AC-1/AC-2 真实页面断言截图留证。
