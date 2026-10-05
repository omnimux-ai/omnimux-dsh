# 规格：GPT Image 2.5 图生图（multi_reference）真机验证与上架激活（Issue #3138）

## 1. 用户问题

用户在画布上把素材连到图片生成节点后，节点不出现「垫图参考」卡槽，也就无法用参考图生成。

## 2. 锁定根源（承接 #3128，本票只处理上架层）

上架判定（`plugins/omnimux/src/catalog/contract/status.js`）：

```
listed ⇔ contractComplete ∧ research.status==='verified'
       ∧ implementation.status==='ready' ∧ adapterProfileCompatible.ok ∧ gateAllows
```

`gpt-image-2.5#multi_reference` 实测五项中**仅 `research.status: draft` 为假**。契约定义（①）、画布提交链（#3128 已修）都已就绪，缺的是铁律第②步「授权真机最小生成验证 + 留存证据」，因此第③步无法升格，`listed=false`，画布不派生卡槽。

## 3. 本票不变量

- I1：`research.status` 只能由**真实出图证据**支撑升格；未出图不得升格。
- I2：升格后 `listed` 必须由既有判定链自然得出，不得硬编码或短路任何合取项。
- I3：真机验证必须走本仓真实执行缝隙且 `mode: 'live'`；裸 HTTP 探测或桩件不构成验证。
- I4：凭据只经 `omnimux tokens exec` 进程内注入；不读取、不打印、不落盘。
- I5：一次提交、`n=1`、不带 size/quality、标准线（倍率 1，约 0.013072 USD/张）；失败如实记录，不重投、不推断退款。
- I6：模型行变更按跨插件闭环收口（目录指纹变化 → assets 语音试听快照同步 + 全量回归）。
- I7：未核验实现的同名操作（`-hd`、`grok-imagine-*`）不在本票范围。

## 4. 待验证的契约风险（本票必须给出真实结论）

`plugins/omnimux/src/media/vendors/omnimux.js` 的 image 分支（455–473 行）在 `references` 非空时同时写入：

- `input.images = imageRefs`（URL 数组）——上游**已公布**字段；
- `input.references = request.references`（完整对象数组）——上游**未公布**字段；
- 且 `input.image = imageRefs[0]`（上游公布的别名）。

**结论（2026-10-05 真机实测，风险不成立）**：官方线路实际走 `map.js:184-185` 的 OpenAI 家族分支，只写单数字段
`image = urls[0]`；`vendors/omnimux.js:372-379` 在存在 `guardPlan.vendorPayload` 时直接返回，**跳过**上面那段 legacy
`images`/`references` 构造。实测提交体为
`{prompt, image, size:"1:1", resolution:"1K", n:1, model:"gpt-image-2.5"}`，无未公布字段，无 400。
故 F4（发包修正）不触发；`implementation.notes` 已按实测更正（原文写「落在 images 字段」与实现不符）。

## 4.1 验证结果（2026-10-05）

- 提交 `POST /v1/images/generations` 200，task `task_NiRphXe3jeuzPnOWHpOxLpYASWSGgkQW`；
- 产物 `mode: live`、1349393 字节、1254×1254、耗时 74524 ms，PNG 经 pngjs 独立解码 CRC 通过；
- 参考图经缝隙上传换公网直链后进入请求 `image` 字段；
- 升格后 `op.listed === true`，`verify:model-contracts` exit 0（admission errors=0，`listedOperations=29`）。

## 5. 功能点

- F1（验证）：走 `executeOmnimuxImage` 以 `mode: 'live'` 用 1 张参考图完成一次真实出图，落盘证据（请求体脱敏、原任务号、终态、PNG 完整解码、宽高、字节数、耗时、配额消耗）。
- F2（声明）：按证据把 `gpt-image-2.5#multi_reference` 的 `research` 由 `draft` 升为 `verified`，绑定 `docUrl` 与 `verifiedAt`；必要时同步修正 `implementation.notes` 与 `limitSource`。
- F3（跨插件闭环）：目录指纹变化后按官方离线导出同步 `plugins/omnimux-assets/cloud-catalog/voice-preview-snapshot.json`，仅允许 `catalog_fingerprint` 变化。
- F4（发包修正，条件触发）：若 F1 暴露未公布字段导致 400，则修 `vendors/omnimux.js` 的 image 分支，使其只注入上游公布字段，并补断言。

## 6. 验收标准

- AC1：`mode: 'live'` 下 1 张参考图成功出图，PNG 可完整解码（CRC 通过）。
- AC2：证据可复核该请求确实携带参考图，而非退化为文生图。
- AC3：`research.status === 'verified'`，`docUrl` 指向本票证据，`verifiedAt` 为真实验证日期；`op.listed === true` 由判定链自然得出。
- AC4：`corepack pnpm verify:model-contracts` exit 0，admission errors=0。
- AC5：`omnimux-assets` 全量绿（快照已同步）。
- AC6：消费端可见性有明确结论（画布是否派生该能力），且第二道门逐项排查留证。
- AC7：`listedOperations` 计数变化如实记录。

## 7. 验证方法

- 真机：`.agent-reports/multiref-live-3138/harness.mjs`（真实缝隙 + 进程内注入凭据）。
- 契约：`pnpm verify:model-contracts`。
- 回归：`pnpm --filter omnimux test`、`pnpm --filter omnimux-assets test`、`pnpm check:boundaries`。
- 消费端：只读推演 + 真实重算逻辑。

## 8. 不在范围

- 参考图上限由 1 提升到上游公布的 16（需同时改发包与画布多槽交互）。
- 其余 8 个未列出的 `multi_reference` 操作（各自需独立真机证据）。
- 上游未公布的 `GET /v1/images/generations/{task_id}` 轮询地址（记录为风险）。
- 生产发布（须另行授权）。
