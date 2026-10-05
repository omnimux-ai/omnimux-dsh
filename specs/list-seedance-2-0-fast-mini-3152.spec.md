# 上架 Seedance 2.0 Fast / Mini（以当前映射契约重做真机验证并激活操作）

- Issue: #3152
- 任务工作树: `.worktrees/list-seedance-2-0-fast-mini-3152`
- 目标模型: `seedance-2-0-fast`「Seedance 2.0 Fast」、`seedance-2-0-mini`「Seedance 2.0 Mini」（依次上架）
- 上游渠道文档: `https://docs.apimart.ai/en/api-reference/videos/seedance-2-0/generation.md`

## 1. 用户问题

这两个模型在画布上没有入口。规格（能力定义）与实现（映射器）都已就绪——模型级 `implementation.status=ready`——但模型级
`research.status=draft`；而操作级状态会**继承**模型级，于是每个操作的 `listed=false`，画布整行不出现。

## 2. 为什么现在可以上架（旧结论已过期）

`docs/evidence/2026-09-05-model-seedance-2-0-fast-first_frame.md` §5 原文结论：

> **不接（documented non-admission）**：本模型 singular `image`（string）live 400；`images` 数组可 terminal success；
> Hub mapper 仍发 `image` → **不 listed**。

即当时「不上架」的理由是**映射器发错字段**，不是模型不可用。此后 #2848 把视频映射改为网关新契约：

| 操作 | 当前允许/必填的线上字段 |
| --- | --- |
| `first_frame` / `first_last_frame` | `require: [image_with_roles]` |
| `video_multi_ref` | `image_urls` / `video_urls` / `audio_urls` |
| `text_to_video` | 仅 prompt 与参数 |

所以「映射器发 `image`」这一前提**已不成立**，必须用当前映射器重新取证，不能沿用旧结论。

## 3. 不变量

- I1: 操作级状态继承模型级（`materializeOpStatus`）；模型级 draft 会让**所有**操作不上架。
- I2: `computeOperationListed` 判定为 `research.status === 'verified'` **且** `implementation.status === 'ready'` **且** 适配档相容 **且** 渠道门允许。
- I3: 证据纪律：**一操作一文件**，`research.docUrl` 只能指向本操作自己的证据；同族 SKU 禁止互相背书
  （`seedance-2-0-fast` ≠ `seedance-2-0` ≠ `seedance-2-0-mini` ≠ `seedance-2-5`）。
- I4: Seedance 家族**不映射** `first_last_frame`（家族铁律；历史证据明确记录「本批未测 flf」）。
- I5: 真机视频验证属**按任务授权**动作；本票已获用户指令「这两个依次上架」。

## 4. 功能点

### F1 真机取证（每个待上架操作一份证据）
用**当前**映射器（真实执行缝隙，`mode: live`）对待上架操作各做一次最小生成；终态 `success` 且产物字节 > 0 才算通过。

待上架操作：两模型各 3 个——`text_to_video`、`first_frame`、`video_multi_ref`。
`first_last_frame` 按 I4 保持不上架，不生成证据、不改状态。

### F2 状态升格（按操作绑定证据）
给每个通过验证的操作写**操作级** `research: { status: verified, docUrl: <本操作证据>, verifiedAt: <日期> }`。
**模型级保持 draft**——这样未被取证的操作（`first_last_frame`）不会被连带拉上架。

### F3 跨插件闭环
- 渠道组已在 `catalog/serving/channel-groups.js` 与 `contract/auto-serving-manifest.json` 就位，本票只核验不新增。
- 重生成 `docs/tools/hub-interfaces.html`；同步 `plugins/omnimux-assets/cloud-catalog/voice-preview-snapshot.json` 的 `catalog_fingerprint`。

## 5. 验收标准

- AC1: `buildModelCatalog` 投影中两模型的 `listedOperations` 各含已取证的操作，且与证据文件一一对应。
- AC2: 每个 listed 操作都有本操作自己的 dated 真机证据（文件内含本操作实测的 runtime ID 与 op 名）。
- AC3: `pnpm verify:model-contracts` exit 0、admission errors=0。
- AC4: `pnpm --filter omnimux test`、`--filter omnimux-assets test` 全绿；`check:boundaries` 通过；`git diff --check` 干净。
- AC5: PR → Merge Queue → ship。

## 6. 不在本票范围

- 其余 6 个未上架视频模型（Kling 系、Wan 3.0、Grok Imagine Video 1.5）。
- `first_last_frame`（I4 家族铁律）。
- 生产发布（须另行授权）。

## 7. 风险与回退

- 视频真机调用按次计费；每个操作一次。实际费用以网关返回为准并记录在证据里。
- 若某操作的当前映射字段被上游拒绝（非 200 或终态失败），则该操作**不上架**，只记录失败证据，不影响其它操作。
- 若全部失败，本票回退为「登记失败原因」，不产生任何 listed 变更。
