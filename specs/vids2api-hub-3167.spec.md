# 本机 vids2api 服务接入中枢规格

- Issue: #3167
- 日期: 2026-10-06
- 分支: `agent/omnimux-vids2api-channel-issue-3167`
- 上游依赖: 独立仓 `/Users/x/Desktop/Project/Github/vids2api`（flow2api fork）本机服务，`http://127.0.0.1:8931`，OpenAI 风格视频接口（`POST /v1/videos` → `GET /v1/videos/{id}` → `GET /v1/videos/{id}/content`），Bearer 鉴权（`VIDS_API_KEYS`）。
- 关联先例: `specs/flow-opencli-provider.spec.md`（#2435，本机能力**不进**中枢官方目录）；`plugins/omnimux/src/media/cli-speech.js`（`gemini-3.8-flash-tts`，本机能力**进**中枢目录并走中枢统一链路）。

## 1. 目标与定位

把 Google Vids（`docs.google.com/videos`）的无头视频生成，从「只存在于 `omnimux-video` 插件内部的私有通道（插件私有路由 + 内存任务台账 + opencli 浏览器驱动）」提升为**中枢的一条显式可选生成通道**：

- 消费端（画布 / 工作流 / 智能体）经中枢统一视频生成接口提交一次文生视频，产物落盘为本地 MP4。
- 执行链路：中枢 `videoGenerate` → 本机 vids2api 服务（HTTP）→ Google Vids 无头协议 → 下载成片。
- 不改动 `omnimux-video` 插件的 Google Vids 生成舞台与内部驱动（另开票退役）。

## 2. 范围

### 2.1 本次做

1. **模型契约**：中枢 catalog 新增 Google Vids 文生视频模型条目（可被消费端显式选择），含 `routing` / `operations` / `research` / `implementation` / `execution` 块。
2. **本机通道实现**：中枢新增本机 vids2api 执行模块——提交、轮询、下载、超时、响亮失败（服务未启动 / 未配置 / 账号不可用 / 任务失败，各自结构化错误）。
3. **真机最小生成验证**：一次真实文生视频，留存原始证据（请求/响应/产物字节数/时长）。
4. **上架**：`research.status` 由 draft 升为 verified 并绑定证据；操作 `listed: true`。
5. **渠道组与画布白名单**：使画布 / 工作流 / 智能体可选到该模型。
6. **门禁核验 → PR → 合入主干 → 物化 Dev**。

### 2.2 本次不做

- 不修改 `Github/vids2api` 仓库（跨工作区只读依赖；如需改动另开票并单独授权）。
- 不改动 `plugins/omnimux-video` 插件代码与其 Google Vids 生成舞台。
- 不做生产发布（`--prod` / `--all` 未授权）。
- 不新增第二个视频模型操作（先只做文生视频这一条最小可用链路；图生视频/整片导出留待后续票）。

## 3. 产品基线（新用户基线）

新用户机器上**不存在**该本机服务，也不存在 `VIDS2API_*` 环境变量。因此：

- 该模型**不是**默认模型、**不是**首选路径、**不参与**任何静默回退（`media.defaultProvider` 保持 `omnimux` 不变）。
- 只有用户显式选择该模型（画布节点 / 工具调用显式给出模型 id）才会进入本机通道。
- 服务不可达或凭据缺失时**响亮失败**：抛结构化错误（含"本机服务未启动/未配置"的可操作指引），绝不回退到其他模型，也绝不返回空产物或伪造成功。
- 产物落盘后校验文件真实存在且字节数 > 0，否则视为失败。

## 4. 验收标准（可测）

| # | 标准 | 判据 |
| --- | --- | --- |
| AC-01 | 模型可被中枢识别 | 中枢 catalog 加载后，该模型出现在视频模型清单中，且 `operations[].listed === true` |
| AC-02 | 消费端可显式调用 | 以中枢统一视频生成接口提交 `{ model: <新模型 id>, operation: 'text_to_video', prompt, dest }` 能进入本机通道（不走云端网关） |
| AC-03 | 真机最小生成成功 | 一次真实生成返回 `mode: 'live'`，`dest` 文件存在且字节数 > 0，可被 ffprobe 识别为视频 |
| AC-04 | 服务缺失时响亮失败 | 服务未启动时调用抛出结构化错误（含 `VIDS2API` 相关指引），不产生文件、不静默回退 |
| AC-05 | 上游任务失败可读 | vids2api 返回终态 failed 时，错误信息携带上游原因，不吞错 |
| AC-06 | 超时有界 | 轮询有明确截止（不无限轮询），超时抛结构化超时错误 |
| AC-07 | 证据留存 | 真机证据写入受控持久化目录（`docs/evidence/` 或 `.agent-reports/`），文件名不含通配冒烟图 |
| AC-08 | 产品基线门禁 | `pnpm verify:product-baseline` 零新增豁免通过 |
| AC-09 | 契约门禁 | 模型契约相关 verify/test 全绿；`pnpm hub:interfaces` 若涉及接口面板则已刷新 |

## 5. 实现落点（设计）

按仓库既有先例（`cli-speech.js` 的"模型 id 直通本机能力"），本机通道**不新增 provider、不改协议层**，避免触碰多 provider 选路这一未建模区域：

- 新增 `plugins/omnimux/src/media/local-vids.js`：本机 vids2api 的提交 / 轮询 / 下载 / 失败语义。
- 在 `plugins/omnimux/src/media/execute.js` 的既有本机分支旁，按 `capability === 'video' && operationId === 'text_to_video' && modelId === <新模型 id>` 直通该模块（与 `cli-speech` 同构）。
- 新增 `plugins/omnimux/src/media/local-vids.test.js`：提交体形状、轮询状态机（queued/processing → completed/failed）、成片地址合成、服务不可达响亮失败、超时。
- catalog 契约：`plugins/omnimux/src/catalog/specs/video-models.yaml` 新增条目；按 `03-catalog-listing-gates.md` 的结论补齐 listed / dispositions / 画布白名单所需配置。

### 5.1 与 vids2api 的字段映射

| 中枢逻辑字段 | vids2api 线上字段 | 说明 |
| --- | --- | --- |
| `prompt` | `prompt` | 一致 |
| `duration` | `seconds`（clamp 4–12） | 字段名不同，需映射；中枢侧 `duration` 不得直传 |
| 参考图（后续票） | `image_url` / `image` | 本次不做 |
| 任务 id | `id` | 轮询 `GET /v1/videos/{id}` |
| 终态 | `status`: `completed` / `failed` | 与中枢判定集合兼容 |
| 成片地址 | **无字段**，需合成为 `{baseUrl}/v1/videos/{id}/content` | 本次实现的关键差异点 |

## 6. 边界

- **总是做**：改动前确认规格存在；真机验证留存原始证据；产物字节数校验；失败响亮。
- **先问**：需要修改 `Github/vids2api` 或 `omnimux-video` 插件；需要第二个操作（图生视频/整片导出）；需要生产发布。
- **绝不做**：把本机服务写成默认 provider 或静默回退；提交任何密钥；把证据写成首页冒烟图；绕过 PR 做本地合并。

## 7. 验证命令（最小充分集）

- `pnpm --filter omnimux test`（或中枢包内 `node --test 'src/media/*.test.js'` 的等价最小集）
- `pnpm verify:model-contracts`（模型契约）
- `pnpm verify:product-baseline`（产品基线）
- `pnpm test:gates`（若改动 workflow/门禁脚本）
- 真机证据：一次端到端生成 + ffprobe 元数据 + 原始 JSON

## 8. 开放问题

- 画布可选模型清单的来源（中枢 catalog 直读 vs 另有白名单文件）——待 `03-catalog-listing-gates.md` 确认后回填。
- 本机服务的密钥引用方式（环境变量名 vs 中枢凭据存储）——待 `02-hub-extension-points.md` 确认后回填。
