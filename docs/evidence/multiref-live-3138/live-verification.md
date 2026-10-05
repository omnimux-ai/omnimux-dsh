# GPT Image 2.5 图生图（multi_reference）真机最小生成验证

任务：#3138（承接 #3128 / PR #3132）；验证日期：2026-10-05；授权：用户于 2026-10-05 明确「授权付费验证」。
真机通路取证报告：`.agent-reports/multiref-live-3138/01-live-path.md`（含 dry-run 零计费证明）。

## 1. 验证方法

走**本仓真实执行缝隙** `executeOmnimuxImage`（`plugins/omnimux/src/media/image.js` → `executeOmnimuxMedia('image', input)`），
不是裸 HTTP 探测。凭据经 `omnimux tokens exec 48 --yes` 进程内注入（`OMNIMUX_API_KEY=__OMNIMUX_TOKEN_48__`），
密钥未读取、未打印、未落盘；base URL `https://omnimux.ai/v1`。

- 参考图：本地 64×64 PNG（179 字节，sha256 前缀 `052621ab257fab72`）→ 由缝隙自行完成
  `POST /v1/files/upload/presign`（200）→ `POST /v1/files/upload/confirm`（200），换得免鉴权公网 HTTPS 直链
  `https://files.omnimux.ai/photos/file_1943441ad3004261_reference-64x64.png`，符合「素材必须公网直链」硬规则。
- 口径：`n=1`、标准线（`default` 分组，倍率 1）、不带 size/quality 之外的额外参数。
- 提交次数：**1 次**。失败即如实记录，不重投。

### 关于 `requireListed: false`

提交时 `multi_reference` 尚未上架（`research=draft`），`submit-guard`（`execute.js:682-689`）会在提交前以
`research_not_verified` 拒绝。harness 使用仓库既有机制 `input.requireListed=false`（同款用法见
`catalog/contract/submission/execution-plan.js:86`、`scripts/model-test-sample.mjs:298`、
`gpt-image-gateway-3071.test.js:33`）完成**上架前**的取证；本文件即升格所需的证据，升格后产品路径自然恢复 `true`。

## 2. 真实请求与响应

提交：`POST https://omnimux.ai/v1/images/generations`，HTTP **200**

```json
{"prompt":"a red cube on a white table, studio product photo",
 "image":"https://files.omnimux.ai/photos/file_1943441ad3004261_reference-64x64.png",
 "size":"1:1","resolution":"1K","n":1,"model":"gpt-image-2.5"}
```

```json
{"created_at":1791195778,"id":"task_NiRphXe3jeuzPnOWHpOxLpYASWSGgkQW",
 "model":"gpt-image-2.5","status":"queued","task_id":"task_NiRphXe3jeuzPnOWHpOxLpYASWSGgkQW"}
```

终态与产物（缝隙返回）：`mode: "live"`，taskRef `mtask_fdc51464a6274703`，
产物 URL `https://files.evolink.ai/004WHG72X3R4OM77IN/images/2026/10/05/file_b75cfd9512ff48868c988d986338aca8.png`，
落盘 `.agent-reports/multiref-live-3138/out/multiref-submit-1791195774576.png`，
**1349393 字节 / 1254×1254 / 耗时 74524 ms / 上传 2 次**。

原始日志：`.agent-reports/multiref-live-3138/real-submit.log`（`REAL_EXIT=0`）、`real-submit-result.json`。

## 3. 独立复核（非缝隙自述）

用 pngjs 独立解码同一文件：PNG 签名 `89504e470d0a1a0a`、CRC 通过、1254×1254、1572516 像素、
红通道均值 226.96（范围 86–255）、字节取值 256 种——为真实图像而非空白/退化产物。
人眼复检：产物为白台面上的红色方块棚拍图，与提示词一致。

## 4. 参考图确实进入请求的证据

- 请求体含 `image` 字段，值为本次上传换得的公网直链（见 §2），即参考图随请求送达上游。
- 上传链路两步均 200（§1），该直链随后出现在提交体中，构成「本地素材 → 公网直链 → 请求字段」的完整可复核链。
- 未把该次出图退化为纯文生图：若参考图未进入请求，`image` 字段不会存在（缝隙仅在 `references` 非空时写入）。

**边界**：本证据证明「请求携带了参考图且真实出图成功」，不证明模型对参考图的**视觉影响强度**（属模型行为，需更大样本才能评估）。

## 5. 与 #3128 目录注记的差异（本次实测更正）

| 项 | 本次实测 | 原注记 |
| --- | --- | --- |
| 参考图落点 | 单数字段 `image`（`map.js:184-185` OpenAI 家族分支只写首图；`vendors/omnimux.js:372-379` 在存在 `guardPlan.vendorPayload` 时直接返回，跳过 legacy `images` 构造） | 「参考图落在 images 字段」 |
| 尺寸 | 请求发 `size:"1:1"` + `resolution:"1K"`，产物 1254×1254 | 未记载 |

`implementation.notes` 已按本次实测更正。

## 6. 未验证 / 不在范围

- 上游公开的 `images` 数组（上限 16）未接通：当前实现只能单图参考，放开需改发包与画布多槽交互（另行开票）。
- `-hd` 与 `grok-imagine-*` 的同名 `multi_reference`：未核验其实现，未升格。
- 其余 8 个 `multi_reference` 操作：各自需独立真机证据。
- 实际扣费金额：token 48 为无限额度，余额增量不可测；按公开价目表 `default` 倍率 1 约 0.013072 USD/张。
- 上游未公布的 `GET /v1/images/generations/{task_id}` 轮询地址：本次经由缝隙的既有轮询路径完成收取，未独立核验该端点是否为上游公开契约（记录为风险）。
