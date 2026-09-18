# 规格说明：可灵出海广告本地化专家内置入库 (kling-ad-localizer)

## 1. 业务目标与背景
将来自 WorkBuddy 官方已发布的快手可灵 AI 跨境电商出海营销专家插件（`kling-global-ad-localizer`），完整内置到 OmniMux 产品内置市场与技能货架，使出海创作者、跨境卖家能够直接在桌面客户端一键启用并使用针对 TikTok、亚马逊等海外平台的多语言广告视频本地化矩阵生成能力。

## 2. 核心架构与收录范围
- **内置专家包目录**：`plugins/omnimux-market/catalog/experts/kling-global-ad-localizer/`
  - 智能体定义：`agents/kling-global-ad-localizer.md`（导演级本地化矩阵编排）
  - 运行时技能契约：`skills/kling-generation-runtime/SKILL.md`（可灵 AI 运行契约，涵盖门禁、素材角色、任务恢复等）
  - 专家头像：`avatars/expert.png`
  - 插件清单：`.codebuddy-plugin/plugin.json`
  - 说明文档：`README.md`
- **市场索引条目 (`plugins/omnimux-market/catalog/index.json`)**：
  1. `exp-kling-global-ad-localizer`：专家卡片，tab: "experts", kind: "expert", category: "exp-growth", source: { type: "bundled", path: "catalog/experts/kling-global-ad-localizer" }
  2. `suite-kling-global-ad-localizer`：套件卡片，tab: "skills", kind: "suite", category: "sk-suite", 包含智能体与运行技能
  3. `sk-omx-kling-generation-runtime`：专属技能卡片，tab: "skills", kind: "skill", category: "sk-visual", 支持双语字段规范（titleZh/titleEn, summaryZh/summaryEn）
- **全局环境同步**：
  - 按照 OPC 技能标准，在用户全局 `~/.agents/skills/kling-generation-runtime` 挂载软链，支持 AI 跨会话随时调用。

## 3. 验收标准
1. 文件完整性：专家包内所有核心文件均已规范放置在 `catalog/experts/kling-global-ad-localizer/`，无路径缺失。
2. 目录合法性：`index.json` 能够通过 JSON 校验与内置加载解析。
3. 双语门禁：通过 `scripts/verify-skill-bilingual.test.mjs`，无未填报字段。
4. 安装测试：通过 `installBundledPack` 与 `installItem` 测试验证，能够正确释放解压出运行技能与智能体。
