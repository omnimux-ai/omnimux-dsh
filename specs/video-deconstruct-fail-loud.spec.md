# 规格说明：视频内容拆解与分镜表移除静默保底回退（失败直接报错）

Issue: #1826 · 插件: omnimux-workflow · 风险: R2

## 一、背景与问题

画布视频节点的两个下游操作「内容拆解」与「分镜表」，在真实视频理解不可用时不会报错，而是静默落盘**内置保底模板**（假数据）：

- `videoDeconstruct/service.ts`：`video_analyze` 工具缺失、调用抛错、返回空内容三种情况都会走到 `generateFallbackDeconstructionMarkdown(input.title)`，生成一份写死的「痛点反差 + 沉浸实测」五维报告，并当作成功结果写表、建节点、弹成功提示。
- `videoStoryboard/service.ts`：同构地走到 `getFallbackStoryboardShots(input.title)`，生成写死的 3 条分镜脚本；抽帧全部失败时还会写入 `PLACEHOLDER_FRAME_BASE64` 伪造占位图。
- `extractFiveDimensions`：单个维度未匹配到时，用写死的中文句子（如「短视频爆款内容拆解」「强化品牌认知与爆款种草转化」）填充单元格，同样是伪造分析结论。

后果：失败被完全掩盖。用户看到的是「成功生成了表格」，实际内容与视频毫无关系，既无法发现故障，也无法据此复刻视频。

## 二、验收标准与核心行为

### A. 内容拆解（video_deconstruct）

1. `video_analyze` 工具/接缝不可用（未注册、无 `execute`）→ 返回 `ok:false`、HTTP 502、错误码 `analyze-unavailable`，中文提示说明「视频理解能力不可用」。**不得**落盘 `.htable`、**不得**新建/更新表格节点。
2. `video_analyze` 调用抛错 → 返回 502、错误码 `analyze-failed`，提示「视频理解调用失败，请检查模型渠道配置后重试」；服务端日志保留真实上游报错（不外发堆栈与内部主机信息）。
3. 调用成功但返回空文本 → 返回 502、错误码 `analyze-empty`。
3.1 上游错误码映射为可读原因（只按码映射固定文案，不外发上游消息与堆栈）：
   `needs-provider`/`needs-omnimux` → `analyze-unavailable`（未接入渠道/中枢未就绪）；
   `video-understand-unsupported` → `analyze-unsupported`（当前渠道不支持视频输入）；
   `video-invalid-input` → `analyze-invalid-input`（格式/大小/路径不满足）；其余 → `analyze-failed`。
4. 返回文本中解析不出任何维度 → 返回 502、错误码 `analyze-empty`（不再用写死句子兜底）。
5. 解析成功时：表格行只来自真实分析文本中命中的维度；未命中的维度**不生成该行**，不再填充写死文案。

### B. 分镜表（video_storyboard）

6. 分析工具不可用 / 抛错 / 返回空文本 → 与 A 同样的 502 与错误码，不落盘、不建节点。
7. 分析文本里解析不出任何分镜镜头 → 502、错误码 `analyze-empty`；不再生成保底 3 镜。
8. 表格行由真实分析镜头驱动（`rowCount = 解析到的镜头数`），不再用 `max(抽帧数, 镜头数)` 补出没有脚本的假行。
9. 抽帧失败（无 ffmpeg、视频不可解码等）→ 该行「分镜画面」单元格留空，**不得**写入占位图文件。
10. 未在分析结果中出现的镜头属性（景别/运镜）与画面描述留空，不再填充「标准镜头」「分镜镜头画面」「镜头 N 画面与动作展开」等伪造文案；`（无对白/环境音）` 作为「确实无台词」的真实标记保留。

### C. 端到端可见性

11. 画布视频节点在执行失败后进入错误态（`executionStatus: 'error'`），气泡提示直接展示服务端返回的中文失败原因，节点上不出现任何新的表格节点。

## 三、测试与验证计划

1. 单元/路由测试（`plugins/omnimux-workflow/src/workflow/routes/*.test.mjs`）：
   - 工具缺失、调用抛错、返回空文本、解析不出内容四类场景 → 断言 502 + `ok:false` + 错误码，且磁盘上不存在该 `tableId` 的 `.htable`。
   - 成功路径回归：真实分析文本照常落盘，列结构（分析维度/分析内容；镜头/分镜画面/时间码/景别运镜/画面脚本描述/台词声音）与行数等于解析结果。
   - 分镜表抽帧失败场景 → 断言「分镜画面」单元格为空数组且目录内无占位文件。
2. 定向验证：`pnpm --filter omnimux-workflow test`（含路由测试与画布相关契约测试）。
3. 隔离工作树内真实浏览器 Web 验证：视频节点触发失败路径时，节点显示错误态、无保底表格生成；成功路径正常生成表格节点。

## 四、非目标

- 不改动官方宿主前端发行包（KaTeX 相关控制台告警属于宿主渲染层，另行上报，不在本任务改动范围）。
- 不改动视频理解模型契约、渠道配置与 `video_analyze` 的能力实现本身。
- 不新增产品能力，不改变表格列结构契约（除分镜表行数来源由「抽帧数」改为「真实镜头数」）。

## 五、根因记录（2026-09-15 调查结论）

- `deps.getTool('video_analyze')` 在运行时**能拿到可执行工具**，不是 undefined（宿主下发给模型的工具清单里含 `video_analyze`；`getTool` 直查宿主注册表，无前缀转换）。「工具未注册/命名不匹配」被排除。
- 失败点在 `video_analyze` 内部：`textComplete.execute({video,…})` → 宿主视频直连分支 → 本地渠道调用抛错；旧代码只 `logger.warn` 后静默降级为保底模板。
- 保底分支确实执行过：Dev 工作区真实表格里存在保底模板逐字文案（`ws_7235087a667d/tables/tbl_8a6c6543.htable` 含「开场黄金3秒」），同一工作区另有真实分析产物，说明该链路历史上跑通过。
- 已逐条排除：视频文件缺失 / 超 20MB / 格式不符、模型不在白名单、契约门禁拒绝视频输入、gate 关闸、alpha 限制、提示词文件缺失。
- 可观测性缺口：`createWorkflowLogger` 走裸 `console.warn`、无文件 sink，Dev 结构化日志只收录宿主框架模块，因此该 warn 原文在本机任何日志中都取不到；本任务把失败码与上游原文一并写入 `logger.error`，并让失败码直达客户端。
- 浏览器控制台里的 KaTeX 告警与 SVG path 报错经独立调查判定为**渲染侧噪声**，与本失败无因果（详见 `.agent-reports/video-deconstruct-fallback/B-console-errors-origin.md`）。
- 上游报错原文（渠道侧拒绝原因）需一次真实渠道调用才能取得，超出本任务授权，未发起。
