---
title: "OmniMux 多模态语义分配与 Prompt 编译契约 (Semantic Judgment)"
id: "contract-omnimux-semantic-judgment"
type: "contract"
status: "living"
authority: "L1"
date: "2026-09-11"
updated: "2026-09-11"
authors: ["architecture-group"]
subsystem: "global"
tags: ["semantic-judgment", "prompt-compiler", "input-roles", "viral-replication", "camera-tags"]
supersedes: []
superseded_by: null
related:
  - "docs/contracts/omnimux-contracts-architecture.md"
  - "docs/contracts/multimodal-creative-agent-architecture.md"
---

# OmniMux 多模态语义分配与 Prompt 编译契约 (Semantic Judgment)

> **权威等级**：L1（工程契约） | **生命周期**：持续演进 (Living)
> **适用角色**：`[orchestrator, video-producer, executor]`

---

## 1. 意图四级优先级金字塔 (Intent Priority)

多模态生成质量来源于对输入要素的精准归位，而非将所有视觉观察全量塞入 Prompt：
1. **用户显式文本指令 (User Instruction)**：最高权威；
2. **活动参考素材有效信号 (Active Reference Signals)**：画面视觉基准；
3. **已确认的分镜与项目状态 (Approved Storyboard State)**：镜头与剧情连续性约束；
4. **模型或渠道默认值 (Vendor Defaults)**：兜底托底。

低优先级元素绝不可推翻高优先级事实。

---

## 2. 素材输入五维角色解耦 (Input Roles)

用户传入的任何图片或参考视频（如“爆款视频复刻”场景），必须强制指派角色：

| 输入角色 | 贡献要素 (Donates) | 严禁贡献 (Does NOT Donate) |
|---|---|---|
| `source/edit` | 时间线节奏、镜头切点、主体运动趋势、起止动作 | 外部主观色调、非目标环境、多余人物 |
| `layout` | 画面主体数量、九宫格构图、4 维正交机位槽位（景别/拍摄设备/视角/运镜） | 表面微观材质、UI 边框、文字图表水印 |
| `style/design` | 调色倾向（如“清新影棚”、“电影感奢华”）、光比层次、渲染质感 | 原片具体人物长相、姿态、意外画面杂质 |
| `character/scene` | 核心人物外貌特征、服饰风格、世界观场景锚点 | 无关平台图标、水印、边框装饰 |
| `mood` | 情感张力、气场氛围、配乐节拍节奏 | 具体画面构图、具体道具参数细节 |

---

## 3. 五维决策矩阵 (Decision Matrix: Take, Adapt, Ignore, Block, Ask)

- **`take` (继承)**：原片中的核心爆款骨架（如前 3 秒 Hook 运镜结构、核心矛盾推进切点）；
- **`adapt` (转译适配)**：将原素材中的演示产品或主角，替换为用户指定的品牌、产品或虚拟人物，并结合规范的 4 维正交机位标签进行重构；
- **`ignore` (静默剥离)**：**原素材中的水印、字幕、原作者个人长相、偶发反光、无关杂物，必须静默丢弃！严禁在生成的 Prompt 里写“不要原片的水印/不要原片文字”——在 Diffusion/视频大模型中，写负向词往往反而诱发噪点生成**；
- **`block` (安全拦截)**：涉及侵权、低俗擦边、夸大虚假宣传等内容，直接拦截并终止生成；
- **`ask` (结构化反问)**：当参考内容存在多个主体且用户未指定替换目标时，暂停并调起结构化卡片请用户选择。

---

## 4. Prompt 纯净化铁律 (Anti-AI-Slop for Prompts)

- 严禁在向模型发起的生图/生视频 Prompt 中加入大段艺术指导评述（如 *“画面充满张力，呈现极致商业大片质感，宛如大师级摄影作品”*）；
- **所有提示词必须收敛为：物理实体名词 + 光影物理参数 + 4 维正交机位标签（景别/设备/视角/运镜）**。
