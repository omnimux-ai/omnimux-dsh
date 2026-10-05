# #3142 参考素材限制对齐上游公布值 · 验证记录

- 日期: 2026-10-05
- 上游基准: `GET https://omnimux.ai/api/model_contract/<model>` → `data.contract`，合同版本 `4b4e2aff3500ec80`，44 个模型
- 本地取证快照: `/tmp/omx-inv/3138-upstream-contracts.json`（其 `local` 数组是**消费端投影**，只含 `op.listed === true`，不可当作 spec 全量）
- 对照报告: `.agent-reports/ref-align-3142/01-image-llm.md`、`02-video.md`、`03-audio.md`；落地报告 `10-image-text-applied.md`、`11-video-audio-applied.md`

## 1. 为什么必须做多图真机验证

`gpt-image-2.5#multi_reference` 的数量上限由 1 提到上游公布的 16，但本仓的图片多参考发送路径原先只落单数字段
`image = urls[0]`（`submit-guard/map.js` 的 OpenAI 家族分支），且 `media/vendors/omnimux.js` 在存在
`guardPlan.vendorPayload` 时早退，legacy 的 `input.images` 构造不可达。

若只改声明不改发送，就会得到「画布可连 16 张、实际只发首图」的虚假声明，直接违反仓内「模型真相」硬约束。
因此本票把发送链路改动与声明改动放在同一提交，并以真机出图证明。

## 2. 改动

`plugins/omnimux/src/catalog/contract/submit-guard/map.js`（OpenAI 家族图片分支）：

```js
if (isOpenAi) {
  vendor.image = urls[0]
  if (urls.length > 1) {
    vendor.images = urls
  }
}
```

`images` 已在 `imageGenerate` 的 `vendorFields` 白名单内（`adapter-profiles.json:22` 与
`map-contract.js` 的 `DEFAULT_PROFILE_PAYLOADS.imageGenerate.vendorFields`），因此无需改白名单；
与 Grok / 通用家族的字段写法一致。

## 3. 真机验证（2026-10-05）

方法：走本仓真实执行缝隙 `executeOmnimuxImage`（`mode: live`），提交 **2 张**本地参考图
（96×96 纯色 PNG，一红一蓝），`requireListed: false`（该操作本票不涉及 listed 变更；
同款用法见 `catalog/contract/submission/execution-plan.js`、`scripts/model-test-sample.mjs`、
`gpt-image-gateway-3071.test.js`）。凭据经 `omnimux tokens exec 48 --yes -- env OMNIMUX_API_KEY=…`
进程内注入，未读取、未打印、未落盘。

### 3.1 提交体（实测，两张参考图都在）

```json
{
  "prompt": "two reference swatches, red on the left and blue on the right, flat studio product photo",
  "image": "https://files.omnimux.ai/photos/file_3208606ac58044a2_ref-a-red.png",
  "images": [
    "https://files.omnimux.ai/photos/file_3208606ac58044a2_ref-a-red.png",
    "https://files.omnimux.ai/photos/file_acb816ad431f4c8e_ref-b-blue.png"
  ],
  "size": "16:9",
  "resolution": "1K",
  "n": 1,
  "model": "gpt-image-2.5"
}
```

两张参考图由缝隙自行 `presign` + `confirm` 上传换得公网 HTTPS 直链，随后出现在 `images` 数组内。

### 3.2 上游响应与产物

| 项 | 实测值 |
| --- | --- |
| `POST /v1/images/generations` | HTTP **200** |
| task id | `task_kyvYJ11mt3EY4dZdkSzjZt4VNfUarS7h` |
| 终态 | `SUCCESS`（progress 100%） |
| 产物 | `https://files.evolink.ai/004WHG72X3R4OM77IN/images/2026/10/05/file_9cd4ab7297414af7b1ebfb0f96bb86b5.png` |
| 字节 | **2 173 028** |
| 耗时 | 提交至终态约 36 s（脚本端 49 008 ms） |
| 计费 | **¥0.079 / $0.012 / 0.783 credits**（`group: default`） |
| 轮询端点 | `GET /v1/images/generations/{task_id}` 返回 200（该端点此前被记为「上游未公布」，实测可用） |

**结论：上游接受了 `images` 数组并正常出图。** 多图声明与发送链路一致，不存在虚假声明。

### 3.3 产物文件

- `docs/evidence/ref-limit-align-3142/multiref-2-images-output.png`（2 173 028 字节，真机产物）
- `docs/evidence/ref-limit-align-3142/reference-a-red.png`、`reference-b-blue.png`（本次提交的 2 张参考图）

## 4. 本票声明的对齐结果

| 能力 | 对象 | 变更 |
| --- | --- | --- |
| 图片 | `gpt-image-2.5#multi_reference` | `max` 1 → 16（上游公布值），发送链路同步打通 |
| 图片 | `nano-banana-2` / `nano-banana-pro` | `max` 4 → 14、补 `image/heic`/`image/heif`、`maxSizeMb` 15 → 7 |
| 图片 | `seedream-5-0-pro` | `min` 0 → 2、`max` 8 → 10 |
| 图片 | `mj-v7` / `mj-v8-1` | 补 `image/gif` |
| 图片 | `grok-4.6` | 移除 `image/webp`（上游只公布 `[jpeg,png]`） |
| 视觉输入 | `claude-sonnet-4-6` 等 8 个模型 | 补 `image/gif` / `bmp` / `heic` / `heif` |
| 视频 | `minimax-h3` | 9 处 `limitSource.note` 更正为「取自渠道文档，非模型合同」 |
| 视频 | `seedance-2-5` / `minimax-h3` / `wan-3.0` | 参考音频补 `audio/mpeg`（本仓 mp3 在两条通路上分别产 `audio/mpeg` 与 `audio/mp3`，必须双写） |
| 音频 | `indextts-2#voice_clone` | 补 `allowedMimes`；`max` 保持 1（vendor 单值），差异写入 `research.notes` |
| 音频 | `seed-audio-1.0#text_to_speech` | 补 `allowedMimes` + `maxSizeMb: 10` + `limitSource`；`max` 保持 1 |

上游未公布而本地保留的保守值，一律在 `limitSource.note` 写明「上游未公布，本仓保守值」；
上游合同目录返回 HTTP 404 的模型（`gpt-image-2.5-hd`、`grok-imagine-image-2-0`、
`grok-imagine-image-quality`、`gemini-3.8-flash-tts`）按「上游未公布」处理。

## 5. 明确不在本票范围

- `gpt-image-2.5-flare` / `-sunburst` 新增 `multi_reference`：属模型上架变更，须走上架五步，另票。
- 8 个未上架视频模型与上游的缺口/差异：只登记不改。
- `limitSource.kind` 新增「渠道文档」档：属 schema 与门禁变更，波及全仓，另票。
- `whisper-1` 只写 `audio/mp3` 的跨票一致性：只登记。
- `seed-audio-1.0` 参考音通路仍缺真机证据（本次只改声明）。

## 6. 边界与诚实说明

- 本次真机验证使用 `requireListed: false`（仓库既有机制），因为本票不改变任何操作的 listed 状态。
- 证据证明的是「两张参考图确实随请求送达且上游 200 出图」，**不**证明模型对第二张参考图的视觉利用强度。
- 本次为**一次**提交，未重试；实际计费以网关返回为准（¥0.079 / $0.012）。
