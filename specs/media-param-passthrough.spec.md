# Spec: 媒体生成输入面板参数透传断点修复（media-param-passthrough）

## 背景与现状

Dev（端口 45120）CDP 实测 + 源码核实，图像/视频生成输入面板存在 4 处断点：

1. `/omnimux/model-catalog` 返回的 `image[]`/`video[]` 行缺 `operations`（顶层 `models[]` 有）→ `operationsOf(model,'video')` 空 → 视频模式下生成方式页签全空；图像靠 `media-slot.js` 的图像兜底撑着。
2. `MediaViewerComposer.jsx` 自适应 effect（~L497、~L515）依赖数组含 `config.imageOpMode`/`videoGenMode` → 手动点「参考/编辑」后被空卡槽推导立即覆盖回文生图。
3. `MediaViewerTab.jsx` `handleDirectSubmit` 不读 `params.batch` → 只建 1 条任务、只发 1 次请求；服务端一次也只产 1 张；张数选项形同虚设。左上角缩略图栏（≥2 条记录才显示）连带不出现。
4. 视频 `params.hasSound` 不进请求体；`direct-http.js` 的 `executePayload` 也未转发 `body.sound`（下游 `map.js` 的 `sound→generate_audio` 链路本就就绪）。

## 新用户基线

本修复全部作用在「已选模型 → 提交生成」的既有链路上，不引入新默认、新渠道或新环境要求；新用户开箱行为不变（默认 1 张、默认有声、默认首个模型）。缺操作契约的模型行为不变（由守卫拒绝），不静默吞错。

## 验收标准（可测）

- AC-1：图像模式选「张数=2」提交后，store 出现 2 条 `generating` 任务记录（同 `groupId`），请求体各发一次 `/omnimux/api/media/generate`；全部完成后左上角缩略图栏出现。
- AC-2：空卡槽下点「参考」「编辑」，页签高亮切换并保持（不被回弹为文生图）；放了素材后自适应依旧按 0/1/N 图推导。
- AC-3：视频模式切换「无声」后提交，请求体含 `sound:false`，服务端透传到 `executePayload.sound`。
- AC-4：切到视频模式（MiniMax H3 或 Seedance），生成方式页签出现该模型契约声明的操作（文生视频/首帧/首尾帧/全能参考），不再空白。
- AC-5：参考/编辑模式空卡槽直接提交时给出明确提示，不发空载荷请求。

## 改动范围

- `plugins/omnimux/src/catalog/project.js`：`projectRow` 携带 `operations` 精简行（id/label/output/inputs）。
- `plugins/omnimux/src/client/media-viewer/MediaViewerComposer.jsx`：两处自适应 effect 移除模式状态依赖，改素材签名驱动；handleSend 增加空素材参考/编辑模式提示。
- `plugins/omnimux/src/client/media-viewer/MediaViewerTab.jsx`：`handleDirectSubmit` 按 `params.batch`（clamp 1–4）循环建任务 + 循环发请求，共享 `groupId`，`Promise.allSettled` 独立成败；body 增 `sound`。
- `plugins/omnimux/src/media/direct-http.js`：`executePayload` 增 `sound` 透传。
- 测试：`media-viewer-composer.test.js` / `direct-http.test.js` 增补对应断言。

## 风险与边界

- 不动 `genMode` 字段；不动模型契约 YAML、渠道分组、定价。
- 批量走客户端扇出（N 次请求），不改上游接口形态。
- 不涉及费用类操作；测试用 synthetic 模式，不做真实计费生成。
