# 规格：App 远程素材元数据透传与文本思考隔离（Issue #2722 / #2723）

## 一、背景

一次真实业务请求验收暴露两个互相独立的阻断缺陷：

1. **#2722 App 远程素材无法提交视频首帧槽位**
   画布上把 App 表单里从资产库挑选的商品图（`https://` 云端地址）接入 Hailuo H3 视频节点，提交稳定失败：
   `[omnimux:metadata_required] 来源 node-slot-product-image 缺少槽位 first_frame 校验所需的素材信息，请重新读取素材`

   根因三处叠加（已用确定性脚本复现，脚本 `/tmp/repro-remote-first-frame.mjs`）：
   - 合同侧：`video-models.yaml` 中 `minimax-h3` / `seedance-2-5` 的 `first_frame` 槽位声明 `maxSizeMb: 30` 与 `allowedMimes`；
   - 管线侧：`submissionInputs.ts` 的 `validateReference` 仅对本地文件（`statSync`）与 `data:` URI 补全 `sizeBytes`，`https:` 分支只按扩展名猜 `mimeType`，**永不产生 `sizeBytes`**；
   - 闸门侧：`submitGuard.ts:66` 在 `maxSizeMb` 有限且 `sizeBytes === undefined` 时必然抛 `metadata_required`；
   - App 侧：`executionBridge.ts` 注入虚拟 import 节点与 `feedAsset` 时只写 `{ type, url }`，丢弃了资产库挑选记录里已有的 `mimeType` / `sizeBytes`。

   结论：任何把云端地址素材接入带 `maxSizeMb` 约束槽位的 App 演示都永久不可提交。

2. **#2723 思考语句被当成正文业务结果**
   文本节点执行 `completed`、UI 显示「已完成」，但正文是 `I'm thinking through how to approach this.`，没有回答 Prompt。
   根因：`text/execute.js:347-356` 的流消费只累加 `text-delta` 与 `block.type === 'text'`，**没有 reasoning / thinking 通道分离**；`execute.js:369` 的空结果闸门只判 `!assembled.trim()`，非空的思考语句因此被当作成功产出。
   `chat.js:175-193` 的 `extractAssistantText` 同样只取 `message.content` 且只保留 `type === 'text'` 分片。

## 二、用户操作旅程与期望反馈

### 旅程 A：App 商品图 → H3 视频首帧
1. 用户打开一个带媒体表单字段的 App（如「手机与网页交互实机演示」）。
2. 用户在表单里从资产库挑选一张商品图，得到缩略图与已填 URL。
3. 用户把该表单映射到视频节点的 `first_frame` 槽位，点击生成。
4. **期望**：节点进入「生成中」，随后出片并显示「已完成」。
5. **当前**：节点直接红框报错，提示「请重新读取素材」，且用户无论怎么重新挑选素材都复现。

### 旅程 B：文本节点业务生成
1. 用户在画布文本节点输入业务 Prompt，选择推理模型（如 Gemini 3.8 标准版 / 推理等级 Max）。
2. 点击生成。
3. **期望**：节点正文是回答内容。
4. **当前**：节点显示「已完成」，正文是模型的思考语句，无业务信息量；下游节点会基于空内容继续。

## 三、本轮修复范围（已与用户确认）

- **只做 App 侧透传**（不含素材管线远程探测）：`executionBridge.ts` 注入媒体字段时，把挑选记录里已有的 `mimeType` / `sizeBytes` 透传进 `mediaAssets`、`feedAsset` 与虚拟 import 节点。零新增网络请求。
- **文本思考隔离**：分离 reasoning 与正文通道，并增加正文实质性闸门，使思考语句不再冒充业务结果。

明确不做：给 `https:` 素材新增 HEAD/Range 探测（避免在同步校验里引入网络 IO 与新的失败分支）。仍缺元数据的其它远程来源维持现状报错。

## 四、验收标准

1. `resolveCanvasSubmission` 场景：App 注入的远程图片（带 `mimeType` + `sizeBytes`）进入 `minimax-h3` 的 `first_frame` 槽位，提交成功。
2. 不带元数据的同款引用仍按原样抛 `metadata_required`（不得因本次修复被静默放行）。
3. 文本侧：`reasoning` / `thinking` 类事件不计入正文；正文为空或仅由思考语句构成时，不再作为业务结果返回。
4. 既有单测全绿；真实客户端复测两个旅程。

## 五、非目标

- 不改 `video-models.yaml` 的合同约束本身。
- 不改 `validateReference` 的三条补全路径。
- 不引入远程素材的网络探测。
