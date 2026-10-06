# 模型真机取证：google-vids-omni 四模式（2026-10-06）

- 模型：`google-vids-omni`（label「Google Vids Omni」，本机通道）
- 通道：本机 vids2api 服务（HTTP，`OMNIMUX_VIDS2API_BASE_URL` + `OMNIMUX_VIDS2API_API_KEY` 由进程环境注入；本文不记录凭据）
- 取证入口：中枢自身媒体入口 `plugins/omnimux/src/media/local-vids.js` 的 `generateLocalVids`（提交 → 轮询任务 → 取片落盘），**不是**直连服务的裸请求
- 环境：本机 vids2api 服务（端口 8931），账号池 3 个账号
- 结论：四个操作各完成一次真机最小生成，产物均为非空 MP4；三项新模式由此具备升格 `verified` 的证据

## 一、逐项取证记录

| 中枢操作 | 上游模式 | 提交要点 | 任务号 | 耗时 | 产物字节 |
| --- | --- | --- | --- | --- | --- |
| `text_to_video` 文生视频 | `create` | prompt + `seconds=4` + `720p` + `landscape` | `bec303b9fbb44a309794edb5` | 35 s | 1 575 436 |
| `text_to_video` 文生视频（复测） | `create` | 同上 | `639217bdb8e1424591d333c5` | 30 s | 1 864 109 |
| `first_frame` 图生视频 | `animate`（上游归一为 `image-to-video`） | 公网 HTTPS 图片直链作 `image_url` + `seconds=4` | `ea01913ceda64a86aa687c80` | 40 s | 2 048 833 |
| `video_extend` 视频延续 | `extend` | 源 `video_id` 取本通道已成功任务号 `639217bdb8e1424591d333c5` + `seconds=4` | `9cba470dea5d46aab33f9db4` | 30 s | 1 792 302 |
| `video_edit` 视频修改 | `modify` | 源 `video_id` 同上 + 公网 HTTPS 替换图 + `seconds=4` | `25df40dc747243d29d675cfb` | 30 s | 1 741 130 |

四项产物均为可播放 MP4（`video/mp4`），字节数 > 0，落盘路径 `.tmp/verify-3167/<operation>.mp4`（任务级临时目录，收尾清理）。

## 二、字段映射复核（与首轮一致）

- `seconds` 以 `seconds` 字段送达上游并被采纳（本服务对 4–12 之外的值做钳制而非拒绝）。
- 图生视频的参考图以**图片直链**形式嵌入上游提示词文本（服务侧 `build_image_to_video_body`），非文件上传；因此素材必须是免鉴权公网 HTTPS 直链。
- 视频延续/修改的源视频以**本通道任务号**表达，中枢侧接受裸任务号或本通道取片地址，拒绝外域地址（映射层 `resolveLocalVidsVideoId` 负责判定）。
- 三种新模式在缺图或缺源视频时于中枢侧即响亮失败，不会发出语义不完整的请求。

## 三、过程中观察到的服务侧行为（仅记录，本任务不改动该服务）

本机 vids2api 服务的选号规则为「用量最少且不在冷却中的活跃账号优先」。本轮验证期间：

- 1 号账号已触发上游月度配额上限（`USER_GENAI_QUOTA_EXHAUSTED`），但它的 `use_count` 最低，因此**每次都会先被选中**，产生一次 429 失败并把自身置入冷却；
- 只有在它处于冷却窗口内提交，才会轮到 2/3 号健康账号并成功出片；
- 实测两次连续提交中，第一次即成功（此时 1 号仍在冷却），第二次同样成功。

结论：账号池确实有可用账号，但**默认选号会优先撞上已耗尽的账号**，表现为「时好时坏」。这是服务侧（另一工作区）的行为，本任务只消费其接口，未做改动；如需稳定，应由服务侧把「已耗尽」状态纳入选号权重。

## 四、门禁核验

- `pnpm verify:model-contracts --strict`：通过；已上架操作数由 38 增至 41，草稿态操作数为 0。
- 画布视频白名单与自动投放清单：本模型保持包含（`requiredInAuto: true`），白名单项数不变。
- `pnpm --filter omnimux test`、`pnpm check:boundaries`、`pnpm verify:product-baseline`、资产库快照一致性检查：全部通过。

## 五、边界

- 未改动 `omnimux-video` 插件的 Google Vids 生成舞台（另开票）。
- 未改动本机 vids2api 服务源码。
- 未新增付费上游调用；全部取证走本机通道，且每条仅一次最小生成（`seconds=4`）。
