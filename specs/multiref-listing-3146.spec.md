# 垫图（multi_reference）剩余可上架模型闭环上架 · 规格

- Issue: #3148
- 风险等级: R2
- 上游基准: `GET https://omnimux.ai/api/model_contract/<model>` → `data.contract`，合同版本 `4b4e2aff3500ec80`
- 参照范式: PR #3141（`7533db258`，`gpt-image-2.5#multi_reference` 上架）与 PR #3144（`598cd2730`，参考素材限制对齐）

## 1. 问题

画布「垫图参考」卡槽是否出现，完全由中枢下发的 `op.listed` 驱动。目前图片「垫图」共 9 个操作，仅
`gpt-image-2.5#multi_reference` 已上架，其余 8 个 `research=draft`。用户用未上架模型提交时，
只能拿到 `operation <model>#multi_reference research is draft, not verified`。

8 个未上架操作并非同一原因，必须分开处置：

| 模型 | 上游合同 | 本仓现状 | 正确终态 |
| --- | --- | --- | --- |
| `gpt-image-2.5-hd` | **404 未公布** | research=draft, impl=ready | 保持未上架（补记取证） |
| `grok-imagine-image-2-0` | **404 未公布** | research=draft, impl=ready | 保持未上架（补记取证） |
| `grok-imagine-image-quality` | **404 未公布** | research=draft, impl=ready | 保持未上架（补记取证） |
| `mj-v7` | 200 | research=draft, impl=none | 闭环上架 |
| `mj-v8-1` | 200 | research=draft, impl=none | 闭环上架 |
| `nano-banana-2` | 200 | research=draft, impl=none | 闭环上架 |
| `nano-banana-pro` | 200 | research=draft, impl=none | 闭环上架 |
| `seedream-5-0-pro` | 200 | research=draft, impl=none | 闭环上架 |

**不得为凑数把上游 404 的模型翻成 listed**：那会直接违反仓内「模型真相」硬约束（支持性只能来自所选渠道的官方文档）。

## 2. 用户关键操作旅程

1. 用户在创作画布新建图片节点 → 选择上述 5 个模型之一 → 「垫图参考」卡槽应当出现（因 `op.listed=true`）。
2. 用户连入 N 张参考图（N 满足该模型上游 `reference_images.min`）并提交 → 提交体必须真的带上全部参考图，而不是只发首图。
3. 生成成功、产物落盘并可预览；失败时错误文案可行动（不得出现「声明可连 14 张、实际只发 1 张」的虚假声明）。
4. 上游未公布的 3 个模型在画布上**不应**出现垫图入口（保持未上架）。

## 3. 验收标准

- **A1 实现声明**：5 个模型的 `multi_reference` 均声明 `implementation.status=ready`，`profileId`/`seam` 与既有发送实现一致，`notes` 写明所属发送分支（Seedream 走 `image_urls`；通用家族走 `images`+`references`）。
- **A2 真机证据**：5 个模型各完成一次真机最小生成，参考图数量满足该模型上游 `reference_images.min`；证据落 `docs/evidence/multiref-listing-3146/`，含：确切提交体、上游 HTTP 码与 taskId、产物字节数与独立解码校验、耗时、参考图公网直链来源。
- **A3 状态升格**：5 个模型的 `research.status=verified` 且 `docUrl` 指向 A2 证据；`op.listed` 由既有判定链自然得出（不硬编码任何合取项）。
- **A4 未公布模型补记**：3 个 404 模型的 `research.notes` 补记「2026-10-05 上游合同 404」的取证结论与日期。
- **A5 门禁**：`verify:model-contracts` exit 0；`listedOperations` 计数断言与「未上架」断言按评估契约同步更新（改动已在主检出登记路径级豁免）；`check:boundaries` 通过。
- **A6 跨插件闭环**：catalog fingerprint 变更后，`docs/tools/hub-interfaces.html` 重新生成，assets 语音试听快照按官方离线导出同步且 `preview_fingerprint` 与 voices 逐字节不变。
- **A7 交付流程**：Issue → 工作树 → 验证 → PR → 合并 → Dev 物化；Dev 物化后 `~/.omnimux-dev` 目录中 5 个模型的 `multi_reference` 为 `listed`。

## 4. 产品基线

- 不引入任何开发机专属路径、端口或本地服务；证据中的参考图使用缝隙自行上传换得的公网 HTTPS 直链。
- 凭据经 `omnimux tokens exec` 进程内注入，不读取、不打印、不落盘。
- 只做图片类真机验证（仓内规则：图片/音频真机验证属代理可执行范畴）；不触碰视频类需任务级授权的验证。

## 5. 非目标

- 不改上游 404 模型的 `listed`。
- 不改视频/音频参考限制（#3144 已收口）。
- 不新增模型、不改定价、不改渠道组（画布可见性纯由 catalog 的 `listed` 派生）。
- 不重构发送链路：仅在各模型确实需要新字段且白名单缺失时才做最小改动。

## 6. 变更面

- `plugins/omnimux/src/catalog/specs/image-models.yaml`：5 个操作的 `implementation` / `research` / `execution` 声明；3 个 404 模型的 `research.notes`。
- `docs/evidence/multiref-listing-3146/`：真机证据（提交体、上游返回、产物、校验）。
- 按评估契约同步的既有断言（`listedOperations` 计数、「未上架」断言）。
- `docs/tools/hub-interfaces.html` 与 assets 语音试听快照（fingerprint 派生）。
- 可能的最小代码改动：若某模型的参考图字段不在 `imageGenerate` 的 `vendorFields` 白名单内，需在白名单补齐（待取证结论确定）。

## 7. 风险与缓解

- **R1 虚假声明**：只改声明不改发送 → 以 A2 真机提交体（含全部参考图）与 A1 分支核对双重把关。
- **R2 付费验证成本**：每个模型一次最小生成；`n` 取 1、参考图取该模型 `min` 与 2 的较大者，不做批量。
- **R3 上游未公布模型的误上架**：A4 明确写 404 取证结论，门禁断言同步「保持未上架」。
- **R4 计数断言漂移**：A5 要求按评估契约同步，不得为了变绿而放宽断言语义。

## 8. 证据计划

- `docs/evidence/multiref-listing-3146/live-verification.md`：逐模型一节（提交体 / 上游返回 / 产物 / 校验 / 耗时）。
- `docs/evidence/multiref-listing-3146/`：各模型产物图与参考图。
- 上游合同快照：逐模型 `GET /api/model_contract/<model>` 的原始响应（含 404 的 3 个）。
