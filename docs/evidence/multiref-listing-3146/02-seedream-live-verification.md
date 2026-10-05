# #3148 真机探针 ②：seedream-5-0-pro 垫图真机验证通过（含一处必要修复）

- 日期: 2026-10-05
- 模型/操作: `seedream-5-0-pro#multi_reference`
- 凭据: `omnimux tokens exec 48` 进程内注入，未读取/打印/落盘
- 探针: `.worktrees/multiref-listing-3146/.tmp/probe-multiref.mjs`（走本仓真实缝隙 `executeOmnimuxImage`，`mode: live`，`requireListed: false`）
- 参考图: 2 张（96×96 纯色 PNG，一红一蓝），由缝隙自行 presign + confirm 换公网 HTTPS 直链（两张参考图均 200）

## 1. 结论

**真机生成成功**，上游返回可读任务并取回产物：

| 项 | 实测值 |
| --- | --- |
| 上游提交 | `POST /v1/images/generations` → **HTTP 200** |
| taskId | `task_zkVJMEU1RhYdd8acx6ldcJG0A4jEOeHU`（`task_` 下划线命名空间，可读） |
| 模式 | `mode: "live"` |
| 耗时 | 117,287 ms |
| 产物 | `docs/evidence/multiref-listing-3146/seedream-5-0-pro-multiref.jpg`，**116,972 字节** |
| 产物格式 | **JPEG**（魔数 `ff d8 ff e0`，与上游合同 `output_formats:["jpeg"]` 一致），1424×800 |
| 独立校验 | `file(1)` 判为 `JPEG image data, JFIF standard 1.01, 1424x800, components 3`；`sips` 复核 1424×800；采样像素 17 种颜色（非空白退化产物） |
| 产物直链 | `https://ark-acg-cn-beijing.tos-cn-beijing.volces.com/doubao-seedream-5-0-pro/...jpeg?...`（火山 TOS 签名直链，24h 有效） |

## 2. 本次探针发现并修复的必要缺陷

**第一次探针失败**（提交前即被上游拒收，零产物）：

```
POST /v1/images/generations → 400
{"error":{"code":"invalid_parameter","message":"unsupported parameter for doubao-seedream-5.0-pro: resolution"}}
```

根因：`submit-guard/map.js` 的非 OpenAI 参数分支对**所有**家族统一写 `vendor.aspect_ratio` + `vendor.resolution`，而 doubao-seedream 家族既不接受 `resolution`，比例也不走 `aspect_ratio`（走 `size`）。

修复（`plugins/omnimux/src/catalog/contract/submit-guard/map.js`，仅该分支内）：

- `isSeedreamFamily`（`family === 'seedream'` 或 modelId 以 `seedream` 开头）时：比例写 `vendor.size`，**不下发** `resolution`（仅保留 `logical.resolution`）。
- 其余家族行为不变。

修复后第二次探针即通过（上表）。

## 3. 提交体（实测，两张参考图都在）

```json
{
  "prompt": "flat studio product photo: a red square on the left and a blue square on the right, even soft light",
  "image": "https://files.omnimux.ai/photos/file_..._ref-a-red.png",
  "image_urls": [
    "https://files.omnimux.ai/photos/file_..._ref-a-red.png",
    "https://files.omnimux.ai/photos/file_..._ref-b-blue.png"
  ],
  "size": "16:9",
  "n": 1,
  "model": "seedream-5-0-pro"
}
```

⇒ 修复后 `resolution` 已不在提交体内；`image_urls` 确实带上了 2 张参考图（满足上游 `reference_images.min: 2`）。

## 4. 成本

本线真机探针共 3 次提交尝试：①无 implementation 声明（本地拦，0 计费）②`resolution` 被上游 400 拒（计费口径未产生任务）③成功 1 次。失败不重投。

## 5. 与 MJ/nanobanana 的差异（同一探针脚本）

| 模型 | 提交 | 任务可读性 | 结论 |
| --- | --- | --- | --- |
| `gpt-image-2.5#text_to_image`（对照，已上架） | 200 | `task_LbqaOzMyDTKUBnQ5B9dWWDzpBulca3F5` 可读，产物 1,151,778 字节 PNG 1672×941 | 通路正常 |
| `seedream-5-0-pro#multi_reference` | 200 | `task_zkVJMEU1RhYdd8acx6ldcJG0A4jEOeHU` 可读，产物 116,972 字节 JPEG 1424×800 | **可上架** |
| `mj-v8-1#multi_reference` | 200 | `task-unified-1791201739-cr1kn0el` 全路径不可读 | 上游 unified 命名空间阻塞（见 `01-unified-task-blocker.md`） |

## 6. 同批验证：文生图路径（text_to_image）

同一次修复后，用同一探针以 `PROBE_OPERATION=text_to_image`（不发参考图）复验，同样 **mode: live**：

| 项 | 实测值 |
| --- | --- |
| 上游提交 | `POST /v1/images/generations` → **HTTP 200** |
| taskId | `task_j6VmecroAIwPKfNl6H7OzIw8vqIWSPMf` |
| 耗时 | 33,970 ms |
| 产物 | `docs/evidence/multiref-listing-3146/seedream-5-0-pro-text2image.jpg`，**94,869 字节** |
| 产物格式 | **JPEG**（魔数 `ff d8 ff e0`），1424×800（`file`/`sips` 复核） |
| 提交体 | `prompt` / `size: "16:9"` / `n` / `model`（无 `resolution`、无参考图字段） |

⇒ `seedream-5-0-pro` 的两个操作（文生图、垫图）均有真机证据；模型级 `research`/`implementation` 对两个操作同时生效（`materializeOpStatus`：操作未自带 status 时继承模型级），因此本次把模型级 `research` 从 draft 升为 verified 会同时上架两个操作，二者各自都有本次证据。

## 7. 下一步

1. 把 `seedream-5-0-pro#multi_reference` 的 `research` 升 `verified`（`docUrl` 指向本文件、`verifiedAt: 2026-10-05`），`implementation` 保持 `ready`，`execution` 保持 `stub`。
2. 同步断言（`coverage.test.js:110/160` 的 `listedOperations` 计数）与跨插件产物（`docs/tools/hub-interfaces.html`、assets 语音试听快照）。
3. 第④步非空操作：把 `seedream-5-0-pro` 加入画布图片白名单（`plugins/omnimux-workflow/src/shared/generationPolicy.ts` 的 `allowedModelIds`）并在 `auto-serving-manifest.json` 设 `requiredInAuto: true`；两条门禁互相咬合（`whitelist_unlisted` / `not_listed`），必须同一次改动落地。
4. 模型级 `research.notes`（「渠道官方文档 URL 未取证，故不上架」）与 `dispositions.json:440` 的同类表述需一并更正。
