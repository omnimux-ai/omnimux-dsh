# 规格 · 技能市场全量 Skill 名称与描述 DSH 系统原生中英文多语言适配 (Issue #2402)

## 1. 业务背景与用户目标
在技能/专家市场中，用户反馈并明确要求：
> “所有的 skill 名称和描述 做 dsh 系统原生的中英文多语言适配支持”

经系统排查，技能市场现存 112 款技能存在严重的单语言失衡与本地化缺失问题：
1. **中文环境下的英文残留**：多达 50 款技能的中文标题（`titleZh`）未翻译、直接沿用英文标题；多达 111 款技能的中文描述（`summaryZh`）直接照搬了英文 `Use when producing...` 说明，导致中文用户看到的悬停描述一片大段英文；
2. **多语言动态切换**：DSH 系统支持通过全局语言切换（中文 `zh` / 英文 `en`），技能卡片的名称和描述必须精准联动 DSH 系统原生的多语言解析契约（`skillTitle` 与 `skillDesc`）。

本期目标：
- 为技能市场**全量 112 款技能**补齐专业、地道、高转化的原生**中文标题（`titleZh`）**与**中文描述（`summaryZh`）**；
- 完整保留原生**英文标题（`titleEn`）**与**英文描述（`summaryEn`）**；
- 在 `plugins/omnimux-market/src/client/i18n.js` 中将全量技能的 `skill.name.<slug>` 与 `skill.desc.<slug>` 完整注册至 DSH 宿主语言字典；
- 确保在中文环境下 100% 呈现原生中文，英文环境下 100% 呈现原生英文，彻底消除跨语言混合与英文漏译。

## 2. 核心架构与数据规格

### 2.1 全量 112 款技能多语言数据规范
每个技能在 `catalog/index.json` 中必须具备完整的四元多语言字段：
```json
{
  "id": "sk-omx-xxx",
  "titleZh": "地道原生中文名称",
  "titleEn": "Authentic English Title",
  "summaryZh": "精准明确的中文功能描述与适用场景",
  "summaryEn": "Concise English description and trigger context",
  "title": "默认随语言环境解析",
  "summary": "默认随语言环境解析"
}
```

### 2.2 DSH 系统原生国际化词典注册 (`i18n.js`)
在 `plugins/omnimux-market/src/client/i18n.js` 中：
- `ZH` 字典完整注册每个技能的 `skill.name.<slug>` 与 `skill.desc.<slug>`；
- `EN` 字典完整注册每个技能的 `skill.name.<slug>` 与 `skill.desc.<slug>`；
- 配合 `locale.register("omnimux-market", { zh: ZH, en: EN })` 统一由宿主调度。

### 2.3 解析层安全契约 (`skillTitle` / `skillDesc`)
`skill-picker-logic.js` 与 `plazaUtils.js` 中的双语选择器按以下优先级顺序解析：
1. 宿主字典优先：`tr("skill.name." + slug)` / `tr("skill.desc." + slug)`
2. 本地化元数据：
   - 英文环境（`tr('locale') === 'en'` 或 `lang === 'en'`）：优先取 `titleEn` / `summaryEn`，兜底 `name` / `summary`；
   - 中文环境（其他）：优先取 `titleZh` / `summaryZh`，兜底 `name` / `summary`。

## 3. 验收标准与测试矩阵
- **AC-1 全量技能双语覆盖率 100%**：
  - 全部 112 款技能的 `titleZh` 均包含有效中文（纯英文技能名覆盖率 0%）；
  - 全部 112 款技能的 `summaryZh` 均包含有效中文解释（英文占位覆盖率 0%）；
  - 全部 112 款技能保留合法的 `titleEn` 与 `summaryEn`；
- **AC-2 中文环境真测全景**：
  - 在 `zh` 语言环境下，技能市场卡片标题与悬停描述 100% 为流畅中文；
- **AC-3 英文环境真测全景**：
  - 在 `en` 语言环境下，技能市场卡片标题与悬停描述 100% 为地道英文；
- **AC-4 自动化测试全绿**：
  - 编写专属 E2E 测试断言 112 款技能在双语环境下的解析输出，全套测试 100% PASS；
- **AC-5 实机 CDP 截图验证**：
  - 直连实机客户端截取中文界面下的技能标题与描述，确认完全中文化。
