---
title: "生成节点模型选择与偏好"
id: "contract-generation-node-policy"
type: "contract"
status: "living"
authority: "L1"
date: "2026-09-06"
updated: "2026-09-06"
subsystem: "omnimux-workflow"
---

# 生成节点模型选择与偏好

Workflow 在 [generationPolicy.ts](../../plugins/omnimux-workflow/src/shared/generationPolicy.ts) 维护产品模型范围、类型默认项和模式展示策略；Hub 继续独占渠道、输入能力和执行合同。此策略取代旧兼容性规格中的同系列优先、禁止产品模型筛选及所有节点一律按 operation 数量展示模式的规则。

| 类型 | 产品范围 | 默认项 | 模式展示 |
| --- | --- | --- | --- |
| 文本 | Claude Opus 4.6、Gemini 3.8 Flash、DeepSeek V4 Flash、GPT 5.5 | Gemini 3.8 Flash | 始终隐藏，按输入解析 |
| 图片 | GPT Image 2、Grok Imagine Image | GPT Image 2 | 所选模型具有多种可用创作方式时显示 |
| 视频 | 当前七款，顺序见策略源码 | Seedance 2.0 Fast | 保留生成方式选择 |
| 音频 | Suno、GPT 4o mini TTS | Suno | 仅多任务模型显示，不固定语音／音乐页签 |

范围不代表已经接通。可用模型取产品范围与 Hub 已就绪目录的交集，再由共享兼容性内核按当前输入筛选。策略投影同时覆盖目录的模型列表、operation 和默认项；UI、Agent、连线和提交使用该投影。无 Hub 的测试桩目录仅用于离线测试，不证明实际模型能力。

## 选择与历史数据

- 新节点：兼容的上次手动选择 → 类型默认项 → 策略顺序中首个兼容模型。目录尚未加载时延后选择；默认项未就绪时使用允许范围中的兼容候选。
- 输入变化：保留仍兼容的当前模型，可自动调整内部 operation；必须换模型时优先类型默认项，再按策略顺序选择。不把视频编辑或续写改成生成任务。
- 手动换模只影响当前节点及之后新建的同类节点；自动适配不保存偏好、不触发生成。复制节点保留显式模型；加载旧图不批量改写其他节点。
- 历史非允许模型保留配置和结果，再次生成前须选择可用模型。无兼容候选时保留素材并解释缺失能力。

偏好保存在当前应用 profile 的 Workflow 根目录 `generation-preferences.json`，通过 `GET/PATCH /omnimux-workflow/api/generation-preferences` 读写。PATCH 接受 `{kind, modelId}` 并沿用本地写保护；保存 canonical ID。偏好独立于项目历史、撤销和浏览器 localStorage，写入按点击顺序提交，失败可见并恢复已保存值。

## 输入与提示

有效输入的来源、组合和提交语义遵循 [节点有效输入与提交合同](node-input-submission.md)。图校验、UI 与执行须使用一致的有效输入；图片或视频的描述元数据不充当上游文本。空节点禁用生成并给出输入提示，不显示错误横幅；真实格式、数量、时长等问题需给出具体原因。

文本提交携带 operation 和完整有序 references。Hub 在入口归一化旧 image/video/audioTrack 字段，避免重复附加同一素材，并按所选渠道合同检查全部素材和角色。未实现的音频、混合输入或多视频必须明确拒绝，不能截断素材后执行。模型能力只依据 [模型 API 权威](model-api-authority.md)，禁止真实请求探测。

## 接入与验收条件

Gemini 3.8 使用精确 ID `gemini-3.8-flash`，依据用户在本任务确认的 3.7 兼容性复用输入合同与 mapper，详见 [接入依据](../references/omnimux-gemini-3.8-contract-gap.md)。不得以 3.7 的 wire ID 或 CPA 路由代替 3.8，也不继承其历史真实执行记录。音频正式目录为空也不因产品范围配置而变为就绪。

离线测试须覆盖选择顺序、跨项目与重启恢复、偏好读写竞态、目录延迟、零候选、其他节点不变、输入完整性及各提交入口。合入前完成相关静态检查与独立评审，通过 required CI/MQ 后才按授权物化 Dev，在 45120 使用真实 ego-browser 与共享探针验收 UI；没有合入前独立运行环境。单测或 HTTP 探活不能代替交互证据。
