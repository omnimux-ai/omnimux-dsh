# Spec — 全模型契约对上游网关真相校正

- Issue: #1751
- 日期: 2026-09-14
- 上游真源（五路交叉，全部只读）:
  - **SRC-1** 生产渠道目录 `OmniMux/docs/ops/model-channel-catalog.json`（2026-09-12，121 款，含逐渠道 `upstream_ids`，**在售判据**）
  - **SRC-2** 生产配置基线 `OmniMux/scripts/ops/config-baseline/{models,channels,options}.json`（2026-09-14 15:33）
  - **SRC-3** 上游幽灵清理提交 `c8d134c4f`（2026-09-14 16:29）对 SRC-2 的删除差分
  - **SRC-4** 公开接口文档 `OmniMux-docs/zh/api-reference/**/*.mdx` 与 `zh/updates.mdx`
  - **SRC-5** 网关源码白名单 `OmniMux/relay/**/constant.go`、`relaykit/types/*.go`

## 0. 真源口径校正（重要）

`OmniMux/docs/model-governance/CURRENT-STATE.html`（89 款）的入选条件是「生产配置行 **∩** 已落盘档案」，
其总数与 `docs/model-governance/specs/*.json` 的文件数逐字相等。**因此「不在 89 款里」只代表上游尚未为该 ID 落档案（文档覆盖信号），不能读作下架。**
本规格一律以 SRC-1（在售判据）与 SRC-3（当日摘除差分）为准，SRC-5 用于确认别名与兼容路由。

## 1. 判定规则

1. SRC-1 或 SRC-2 在册 ⇒ 上游在售，保留。
2. 生产清单命中 0、但 SRC-4 有该 ID 文档页或 SRC-5 白名单在册 ⇒ 上游「有契约未挂线路」，保留为**已登记**，不得为已就绪。
3. 生产清单与文档双向零命中，或上游明确宣布旧 ID 作废/被收敛 ⇒ **移除**。
4. 上游同一模型、仅 ID 写法不同 ⇒ **改名**；上游声明的兼容旧名 ⇒ 收敛为**别名**。
5. 上游在册且绑定渠道、我们却标记 `quarantine` ⇒ **解封为 canonical**。

## 2. 逐款裁定（50 款）

### 2.1 保留不动（32 款）

- 文本(11)：claude-opus-4-6、claude-opus-5、deepseek-v4-pro、gemini-3.1-pro-preview、gemini-3.7-flash、gemini-3.8-flash、glm-5.3、gpt-5.5、gpt-5.6-sol、grok-4.6、kimi-k3
- 图像(2)：gpt-image-2.5、seedream-5-0-pro
- 视频(11)：grok-imagine-video-1-5、kling-o3※、kling-v2-6、kling-v3、kling-v3-motion-control※、minimax-h3、seedance-2-0、seedance-2-0-fast、seedance-2-0-mini、seedance-2-5、wan-3.0
- 音频(4)：doubao-asr-bigmodel※、seed-audio-1.0、suno、whisper-1
- 「有契约未挂线路」保持已登记(4)：gpt-image-2.5-hd、grok-imagine-image-quality、gpt-4o-mini-tts、jina-reader-v1

※ = 附带别名修正（见 2.5）

### 2.2 改名（6 款）

| 现 ID | 改为 | 依据 |
| --- | --- | --- |
| `nano_banana_2` | `nano-banana-2` | SRC-1 在册；SRC-4 `nano-banana-2.mdx`；SRC-2 渠道 46/54/57。网关不做下划线归一闪查零命中，方向须反过来 |
| `nano_banana_pro` | `nano-banana-pro` | 同上（渠道 33/37/46/54） |
| `midjourney-7` | `mj-v7` | SRC-1 在册（另有 12 个 `mj-v7-*` 动作变体）；上游两 ID 收敛公告 |
| `midjourney-8.1` | `mj-v8-1` | SRC-1 在册（另有 6 个 `mj-v8-1-*` 动作变体） |
| `deepseek-v4-flash-vision-exp` | `deepseek-v4-flash`（收敛为别名） | SRC-5 `docs/model-governance/specs/deepseek-v4-flash.json` 官方引述：legacy 名 `deepseek-v4-flash` 与 `deepseek-v4-flash-vision-exp` 仍被接受，但对应模型已退役、请求由 DeepSeek-V4.1-Flash 承载并按 Flash 计费。两 ID ModelRatio 同为 0.07 |
| `grok-imagine-image-2` | `grok-imagine-image-2-0` | SRC-4 文档页公开 ID 为 `grok-imagine-image-2-0`；我们现用的名字在三方真源均零命中 |

### 2.3 移除（12 款）

| 现 ID | 移除依据 | 当前状态 |
| --- | --- | --- |
| `gpt-image-2` | SRC-4 明写「旧 model ID 不再接受；**这不是兼容别名**」；SRC-1 无此 `public_id`（仅作渠道内 upstream 名，见 SRC-2 `"gpt-image-2.5": "gpt-image-2"` 映射） | **已就绪** |
| `minimax-h3-max` | SRC-3 于 2026-09-14 16:29 收敛：`minimax/h3-max` 移出 models，改列为 `minimax-h3` 的 `model_mapping` 目标；SRC-1/2 无该 `public_id` | **已就绪** |
| `minimax-h3-max-turbo` | 同上（`minimax-h3-task` ← `minimax/h3-max`） | **已就绪** |
| `midjourney` | SRC-3 摘除 `midjourney-v8.2 → midjourney` 映射；SRC-4 变更日志（`type: breaking`）记「旧 `midjourney` ID 已不再接受、不是兼容别名」；SRC-5 `relaykit/types/midjourney.go` 白名单只剩两个键 | 已登记 |
| `midjourney-niji-7` | `niji` 在 SRC-1/2/4/5 全部零命中 | 已登记 |
| `seedream-4.5` | 三方零命中；上游仅 `seedream-5-0-pro` | 已登记 |
| `kling-o1` | 三方零命中；上游 Kling 在册为 `kling-o3`/`kling-v2-6`/`kling-v3`/`kling-v3-motion-control` | 隔离中 |
| `seedance2.5-stable-max-720p` | 三方零命中；`seedance2.5-stable-480p` 系上游线路名，本 ID 为线路名误作模型 ID（定价账本记 `public_id == upstream_id`、`status: reserve` 未启用） | 已登记 |
| `omni_flash` | SRC-1/2 零命中；上游 `56c67da2c`（2026-09-11）「full audit and hard purge of duplicate, legacy, and stale models」点名 `omni_flash*` 硬删除；命名规范判为 `LEGACY_UNDERSCORE` | 隔离中 |
| `kling-avatar` | 上游 `7fa7c9d04`（2026-09-11）「resolve Gemini Omni model split, fix phantom upstream mappings, and introduce catalog integrity linter」将其判为无效模型（`fix-catalog-integrity.js:28` 原文「无效模型 kling-avatar (118)」）并从 models/abilities 与渠道 32/34 删除；SRC-2 零命中。SRC-4 文档页为 L2 滞后 | 已登记 |
| `veo-3.1` | 上游 `8322e941f`（2026-09-12）从渠道 32/34 与基线 models 一并移除；定价账本自记「该模型未上架、无渠道绑定」；SRC-2 零命中 | canonical |
| `veo-3.1-fast` | 同 `8322e941f` 一次移除；SRC-2 零命中 | 已登记 |

### 2.4 从「已就绪」降级为「已登记」（1 款）

| ID | 裁定 | 依据 |
| --- | --- | --- |
| `grok-imagine-image-2`（改名后 `grok-imagine-image-2-0`） | 撤销 listed 操作 | SRC-1(121) 与 SRC-2(89) 两份**独立清单零命中**，45 个渠道无一绑定 grok 图像；其 live 证据 `docs/evidence/2026-08-16-omnimux-image.md` 早于 08-31 / 09-12 / 09-14 三次上游变动。SRC-4 文档页在，故保留登记、撤销在售声明 |

### 2.5 修正（4 项）

| 项目 | 裁定 | 依据 |
| --- | --- | --- |
| `kling-o3` 的 `quarantine` | 解封为 `canonical` | SRC-1 在册；SRC-2 渠道 34 绑定；SRC-4 有 `kling-o3.mdx` |
| `kling-v3-motion-control` 的 `quarantine` | 解封为 `canonical` | SRC-1 在册；SRC-2 渠道 32/34 双绑定；SRC-4 有文档页 |
| `gpt-image-2.5-hd` 的别名 `gpt-image-2-hd` / `gpt-image2-hd` | 撤销（上游声明旧 ID 不再接受） | SRC-4 `image-series/gpt-image/generate.mdx` |
| `seedasr-auc` 挂为 `doubao-asr-bigmodel` 的别名 | 解除（张冠李戴） | SRC-5 `specs/seedasr-auc.json` 为独立模型（`volc.seedasr.auc`，Seed ASR 2.0，512MB/5 小时），SRC-1/SRC-2 独立在册、ModelRatio 独立 1.5；`specs/bigasr-auc.json` notes 明确「不要与 seedasr-auc 混用」 |

## 3. 验收标准

1. `pnpm verify:model-contracts` 严格模式全绿；`dispositions` 行数与 spec 行数自洽；`listedIds` 由 **26 降至 22**：移除 `gpt-image-2`、`minimax-h3-max`、`minimax-h3-max-turbo` 三款（共 3 个 listed ID 随模型删除），另 `grok-imagine-image-2-0` 改名并撤销 listed（第 4 个）。模型总数 **50 → 38**。
2. 被移除的 12 款：`dispositions.json` 置 `unavailable`；`specs/*.yaml` 无对应 `model.id`；无任何 `listed` 操作。
3. 改名的 6 款：canonical 换为上游写法；旧写法按上游口径处理（`nano_banana_*` 旧下划线写法进入 `aliases[]`；`deepseek-v4-flash-vision-exp` 进入 `deepseek-v4-flash` 的 `aliases[]`；`midjourney` 系列按上游「不是兼容别名」处理，旧 ID 不保留）；全仓无残留旧 canonical 引用。
4. `kling-o3` / `kling-v3-motion-control` 的 `quarantine` 撤销。
5. `grok-imagine-image-2-0` 无 `listed` 操作；`execution.live` 降为诚实状态。
6. 下游消费方同步：`catalog-defaults.json`（`text_to_image` 默认 `gpt-image-2.5` 保持不变）、`auto-serving-manifest.json`、`generationPolicy.ts`、`channel-groups.js`、品牌清单、`omnimux-market` 模型选择器、workflow 画布预设、`scripts/generate-hub-interfaces-html.mjs` 中引用。
7. 全部受影响单测与门禁通过；相关工作区插件包测试全绿。
8. `pnpm hub:interfaces` 重新生成 `docs/tools/hub-interfaces.html`，模型区块 38 款（50−12），且「已就绪 / 已登记」计数与契约一致。
9. 真实浏览器验证：在本任务自己的工作树内加载面板，核对模型计数、状态筛选与改名/移除结果，保留截图与结构化报告。

## 4. 边界

- 不新增模型（上游在售但我们未登记的缺口只登记于审计报告，本次不落地）。
- 不修改上游仓 `OmniMux/` 与 `OmniMux-docs/`。
- 不发起任何真实模型请求。
- 不触碰 4 款受保护模型（pixverse-v6 / vidu-q3 / qwen-image-3-0 / grok-imagine-video）的既有守卫。
