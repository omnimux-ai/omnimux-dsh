# 视频理解模型改为从中枢目录解析

## Objective

`videoDeconstruct` 与 `videoStoryboard` 调用 `video_analyze` 时把模型写死成 `gemini-3.8-flash`。网关一旦改名、下线或换默认模型，视频拆解与视频分镜会直接失败，用户在界面上无从修改。

目标：两处都改为从执行中枢的 `modelCatalog` 接缝解析当前可用的视频理解模型；目录里确实没有可用模型时，返回明确、可操作的中文错误，而不是回退到硬编码 ID。

## New-user baseline

新用户安装后未改动任何配置。只要网关目录里有支持视频输入的文本模型，视频拆解与分镜就能直接跑通；目录尚未同步或没有任何视频输入模型时，用户看到的是「没有可用的视频理解模型，请同步模型目录 / 启用支持视频的模型」，而不是一个上游 `unknown-model` 报错。

## Structure and contracts

- `plugins/omnimux-workflow/src/workflow/analyzeModel.ts`（新增）：纯函数 `selectVideoAnalyzeModel(catalog)` 从目录 DTO 选出模型 ID；`resolveVideoAnalyzeModel(deps)` 通过 `deps.getSeam('modelCatalog')` 读取目录并调用纯函数。
- `plugins/omnimux-workflow/src/workflow/videoDeconstruct/service.ts`：用解析结果替代 `model: 'gemini-3.8-flash'`；解析失败抛 `VideoDeconstructError('analyze-model-unavailable', ...)`。
- `plugins/omnimux-workflow/src/workflow/videoStoryboard/service.ts`：同上，抛 `VideoStoryboardError('analyze-model-unavailable', ...)`。
- 两个 `errors.ts` 的 `FAILURES` 表登记 `analyze-model-unavailable`（502 + 中文说明）。
- 模型来源只读中枢 `/omnimux/model-catalog` 的既有 DTO（`text[]` 行的 `executionStatus` 与 `inputCapability.modalities`，以及顶层 `defaults.analysis`）；不新增字段，不猜能力。

## 假设

- 中枢 `modelCatalog.list()` 返回的 `text` 行带有 `executionStatus` 与 `inputCapability.modalities`，足以判断「是否支持视频输入」；`gemini-3.8-flash`、`gemini-4-argon`、`seed-evolving` 都会声明 `video`。
- 网关推荐的分析默认 `defaults.analysis` 是可用的第二优先候选：当没有任何行显式声明 `video` 但网关仍给出分析默认时，采用它比直接报错更符合「跟随网关」。
- `video_analyze` 的 `model` 参数是可选覆盖项，传入目录解析出的 ID 不会破坏它自身的配置默认值逻辑。

## 证伪方式

- 用三个目录夹具运行 `selectVideoAnalyzeModel`：有 video 行时必须选它；没有任何 video 行但有 `defaults.analysis` 时必须选默认；两者都没有时必须返回失败而不是任何 ID。
- 用 `getSeam` 返回 `undefined` / `list()` 抛错 / `list()` 返回空目录的夹具跑两个服务，必须抛 `analyze-model-unavailable`，且错误码出现在 `FAILURES` 表里（否则响应会退化成 500 内部错误）。
- 全量 `omnimux-workflow` 测试必须通过；此前任何断言 `model === 'gemini-3.8-flash'` 的用例必须随本次口径更新并在 spec 里声明。

## Acceptance

- 两个服务不再出现写死的模型 ID。
- 目录有视频模型时正常调用；目录不可用或没有视频模型时返回 `analyze-model-unavailable` 与可操作中文提示。
- `omnimux-workflow` 测试通过；不修改网关源码。