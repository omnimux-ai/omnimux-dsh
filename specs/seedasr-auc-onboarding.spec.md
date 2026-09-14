# Spec · seedasr-auc 作为独立语音识别模型接入产品契约（Issue #1789）

任务树：`.worktrees/catalog-register-seedasr-auc-issue-1789`，分支 `agent/catalog-register-seedasr-auc-issue-1789`，base `origin/main`。

## 1. 目标（Objective）

2026-09-14 的全模型契约校正（Issue #1751 / PR #1774，`1db67ba50`）解除了把 `seedasr-auc` 错挂为 `doubao-asr-bigmodel` 别名的张冠李戴。由于该 ID 在本仓从未以独立模型身份登记，解除别名后它完全退出契约宇宙（覆盖回退）。上游真源显示它是**独立在售型号**：

- `~/Desktop/Project/OmniMux/scripts/ops/config-baseline/models.json` 独立在册；
- `channels.json` 绑定渠道 43（type 45 VolcEngine，`[官方直连-火山] Seed Audio 豆包语音`，`upstream_id` 与公开 ID 相同）；
- `docs/ops/model-channel-catalog.json` 独立一行、独立 ModelRatio；
- `docs/model-governance/specs/seedasr-auc.json`：`status=documented`，`vendor_model_id=volc.seedasr.auc`（Seed ASR 2.0 录音文件识别标准模式）；
- 对照档案：`specs/bigasr-auc.json` notes 明写「不要与 `seedasr-auc` 混用」，`specs/doubao-asr-bigmodel.json` 自认「是否等价于 Seed ASR 资源 ID 未确认」——二者**不可互相归一**。

用户决策：正确接入（不是继续留在宇宙外）。

用户视角的成功：语音识别可选型号里同时出现「豆包语音识别大模型 (Doubao-ASR)」与「Seed ASR 2.0 语音识别」两项，互不覆盖、互不归一；契约门禁与下游消费方全绿。

## 2. 命令（Commands）

```sh
node scripts/verify-model-contracts.mjs --strict   # 契约门禁（退出码必须 0）
pnpm --filter omnimux test                         # 中枢套件
pnpm --filter omnimux-workflow test                # 工作流套件
pnpm typecheck                                     # 类型检查
node scripts/generate-hub-interfaces-html.mjs      # 重生成接口全景面板
git diff --check                                   # 空白/冲突标记
```

## 3. 项目结构（Project Structure）

| 路径 | 作用 |
| --- | --- |
| `plugins/omnimux/src/catalog/specs/audio-models.yaml` | 模型能力契约真源（新增独立模型行） |
| `plugins/omnimux/src/catalog/contract/dispositions.json` | 机器治理真源（新增 canonical 行） |
| `plugins/omnimux/src/catalog/contract/auto-serving-manifest.json` | 网关注册与自动调度期望态 |
| `plugins/omnimux/src/media/stt.js` | 运行期 URL-first 直传 |
| `plugins/omnimux/src/catalog/contract/*.test.js`、`plugins/omnimux/src/media/stt.test.js` | 契约与运行期断言 |
| `docs/tools/hub-interfaces.html` | 生成产物（面板） |

## 4. 代码风格（Code Style）

沿用现有契约行风格（YAML 2 空格缩进、行内 map 用于单值参数；JSON dispositions 行 `id/disposition/reason/evidence/notes` 顺序）：

```yaml
  - id: "seedasr-auc"
    label: "Seed ASR 2.0 语音识别"
    family: "bytedance"
    badge: "语音识别"
    operations:
      - id: "speech_to_text"
        label: "语音转文字"
        listed: true
        output: { type: "text" }
```

```json
{ "id": "seedasr-auc", "disposition": "canonical", "reason": "...", "evidence": ["..."] }
```

纪律：契约/治理注释用中文；代码标识符保留原文；不新增模型别名。

## 5. 测试策略（Testing Strategy）

- 契约层：`node:test`（`plugins/omnimux/src/catalog/contract/**/*.test.js`）——模型计数、dispositions 行数、listedOperations、覆盖审计、SubmitGuard 准入。
- 运行期层：`plugins/omnimux/src/media/stt.test.js`、`stt-fallback.test.js`、`plugins/omnimux-workflow/src/workflow/routes/speechToTextRoutes.test.mjs`——URL-first 直传与降级。
- 门禁层：`scripts/verify-model-contracts.mjs --strict`（含 auto-serving 与 cross-plugin 两个离线校验）。
- 本轮不发起真实模型 API 请求；不做浏览器验收（纯契约/后端改动，无界面行为变更）。

## 6. 边界（Boundaries）

- **总是做**：改任何契约后跑 `verify-model-contracts --strict` + 受影响插件套件；`seedasr-auc` 保持零别名；同期改动下游消费方并逐一给出结论。
- **先问**：改动默认型号（`catalog-defaults.json` / 画布白名单 / `DEFAULT_MEDIA`）、新增仓库文件（除本 spec 与 `.agent-reports/` 报告）、扩大重构范围。
- **绝不做**：改上游仓 `~/Desktop/Project/OmniMux`；发起真实模型调用；`git commit`/`git push`（提交由用户统一做）；把 `seedasr-auc` 写进任何 `aliases[]`。

## 7. 成功标准（Success Criteria，可测）

1. `node scripts/verify-model-contracts.mjs --strict` 退出码 0；报告 `contract` 数 38 → 39、`dispositions` 行数 75 → 76、`listedIds` 22 → 23。
2. `pnpm --filter omnimux test`、`pnpm --filter omnimux-workflow test` 全绿。
3. `pnpm typecheck`、`git diff --check` 通过。
4. 全仓 grep：`seedasr-auc` 不出现在任何模型的 `aliases[]` 中；`resolveDisposition('seedasr-auc').disposition === 'canonical'`；`resolveModelId` 双向均不归一（`seedasr-auc` ↛ `doubao-asr-bigmodel`，反之亦然）。
5. 运行期一致：`guardSubmit({model:'seedasr-auc', operation:'speech_to_text', ...})` 准入（不再 `UNKNOWN_MODEL`），且 URL-first 提交不下载音频字节。
6. 面板重生成后模型计数 38 → 39，且 `doubao-asr-bigmodel` 与 `seedasr-auc` 同时可见。

## 8. 假设与未决项（Assumptions / Open Questions）

- 假设：`seedasr-auc` 的契约证据采用仓内既有惯例——`research.docUrl` 允许指向官方文档 URL（已有 5 个视频型号如此），故用 BytePlus 官方页；本轮不新增仓内 dated 证据文档（任务书限制只允许在 `.agent-reports/` 新增文件）。
- 假设：`execution: live` 沿用 `doubao-asr-bigmodel` 的登记口径（seam 已挂载且 live），不声明独立真实执行结论。
- 未决：上游同样在册、同样绑渠道 43 的 `bigasr-auc` 在本仓仍无契约行（本轮不扩大范围，只在报告中记录）。
- 未决：`specs/model-truth-reconciliation.spec.md`（#1751 的历史规格）中「`seedasr-auc` 挂为别名 → 解除」一行属历史记录，不回改。
