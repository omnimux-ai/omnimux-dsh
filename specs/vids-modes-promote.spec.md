# 本机 Google Vids 通道：三新模式真机取证后上架（Issue #3167 后续）

## 背景

中枢已接入本机 vids2api 服务作为一条显式可选的本机视频生成通道（模型 `google-vids-omni`，模型契约见 `plugins/omnimux/src/catalog/specs/video-models.yaml`）。首轮只把 `text_to_video` 升格为已验证并上架；`first_frame`（图生视频）、`video_extend`（视频延续）、`video_edit`（视频修改）三项因上游账号配额耗尽，只能以 `research.status: draft` 落地——契约与执行映射已就绪，但缺真机证据，故不上架。

现在上游账号已恢复可用，三项各自完成一次真机最小生成。本任务把这三项由草稿升格为已验证并绑定证据，使其正式进入画布与消费端可见范围。

## 用户操作旅程

1. 用户在创作画布添加视频生成节点，选择「Google Vids Omni（本机）」通道。
2. 用户选择「图生视频」：接一张首帧图 + 可选提示词 → 提交 → 任务进入生成中 → 完成后节点拿到可播放的本机视频。
3. 用户选择「视频延续」：接一段已有视频 → 提交 → 得到在该视频尾部继续生成的成片。
4. 用户选择「视频修改」：接一段已有视频 + 一张替换图 → 提交 → 得到按替换图改写主体的成片。
5. 三种模式下，未配置本机服务时都必须明确报错，绝不静默回退到其他（可能计费的）通道。

## 期望界面反馈

- 三个操作在通道下与「文生视频」并列可选，不再因为草稿态被隐藏。
- 每个操作提交后呈现生成中状态；成功后节点展示可播放视频；失败时展示上游真实原因（如配额耗尽），不显示空成功。

## 验收标准（可测）

- AC1：`first_frame` / `video_extend` / `video_edit` 三项的 `research.status` 为 `verified`，且各自带 `docUrl` 与 `verifiedAt`；加载期由此派生 `op.listed = true`。
- AC2：三份证据写入 `docs/evidence/2026-10-06-model-google-vids-omni-modes.md`，逐项记录提交参数、任务号、耗时与产物字节数；每项产物字节 > 0。
- AC3：真机证据必须经中枢自身媒体入口取得（`plugins/omnimux/src/media/local-vids.js` 的 `generateLocalVids`），不得以直连服务的裸请求替代。
- AC4：`pnpm verify:model-contracts --strict` 通过，且已上架操作数从 38 增至 41；草稿态操作数为 0。
- AC5：画布视频白名单与自动投放清单对该模型保持包含（`requiredInAuto: true`，白名单项数不变）。
- AC6：`pnpm --filter omnimux test`、`pnpm check:boundaries`、`pnpm verify:product-baseline`、资产库快照一致性检查全部通过。
- AC7：合入主干并物化开发版；工作树清理。

## 边界

- 不改动 `omnimux-video` 插件的 Google Vids 生成舞台（另开票）。
- 不改动本机 vids2api 服务源码（属另一工作区）；本任务只消费其接口。
- 不新增付费上游调用；全部取证走本机通道。
