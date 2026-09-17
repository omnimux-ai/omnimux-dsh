# 规格说明：技能页面全局移除「MiniMax 官方」署名元素

**Issue：** #2153 ｜ **优先级：** P1（品牌一致性） ｜ **风险：** 低（仅删除展示元素与其数据字段，无逻辑分支、无接口契约变更）

## 1. 需求与现状

用户要求：**在全部 skill（技能）页面里，全局移除带「MiniMax 官方」字样的元素。**

现状取证（基线 `origin/main` = `79ee206df`）：

| 位置 | 现状 | 是否渲染到技能页面 |
| --- | --- | --- |
| `plugins/omnimux/src/client/session-guide/skills/SkillCard.jsx:47,100-103` | 卡片底部渲染署名行：`<span>@MiniMax Design官方</span>` + 蓝色认证勾 | **是**（截图所指） |
| `plugins/omnimux/src/client/session-guide/skills/featured-skills.json` | 69 条技能全部带 `attribution: "@MiniMax Design官方"` | 是（数据源） |
| `scripts/generate-featured-skills.mjs:89` | 生成该 JSON 时把 `@MiniMax Design官方` 写成默认值 | 间接 |
| `plugins/omnimux/src/client/session-guide/styles.js:2504-2514` | `.omnimux-skill-card-attribution` / `-author` / `.omnimux-skill-verified-icon` 三条规则 | 是（样式） |
| `plugins/omnimux-market/catalog/skills/{ad-creative,character-scene-storyboard,cinematic-motion-language,clip-export,content-strategy,dynamic-poster,ecommerce-image,social-caption}/meta.yaml` | `author-cn` / `author-en: "MiniMax Design"`，共 8 个技能 | **是**（技能工坊 YAML 阅读器 `ws-code-pre` 原样展示） |
| `plugins/omnimux/src/client/session-guide/skills/skills-tab.test.js:269-270` | 断言「底部署名必须为 @MiniMax Design官方」+「必须渲染认证勾」 | 测试 |

**明确不在范围内**（是模型名，不是署名；删掉会破坏模型目录与技能描述）：

- `plugins/omnimux-market/src/client/model-picker-catalog.js` 的 `MiniMax H3`（模型名）。
- `plugins/omnimux-market/catalog/index.json` 技能描述里的 `MiniMax H3` 字样。
- 技能卡片左上角的 `H3` 角标（`badge` 字段）。

## 2. 验收标准（可测）

1. **AC1 卡片无署名行**：技能面板任一分类（含「精选」）下，卡片底部不再出现 `MiniMax`、`MiniMax Design`、`@MiniMax Design官方` 文本，也不再渲染认证勾图标（`.omnimux-skill-verified-icon`）。
2. **AC2 布局不塌陷**：删除署名行后，卡片高度自适应；封面 16:9、左上角 `H3` 角标、标题、两行描述、hover「使用 Skill」按钮的 DOM 结构与交互行为保持不变；点击卡片与点击按钮的 `onSelect` 回调仍各自触发一次。
3. **AC3 数据层清空**：`featured-skills.json` 中不再存在 `attribution` 字段；`generate-featured-skills.mjs` 不再产出该字段。
4. **AC4 工坊元数据清空**：8 个 `meta.yaml` 中不再出现 `MiniMax Design`；技能工坊 YAML 阅读器打开这些技能时看不到该字样。
5. **AC5 全仓可验证**：对技能页面源码与随包技能数据执行 `rg "MiniMax Design"` 返回 0 命中（`docs/`、`research/` 等历史文档不算）。
6. **AC6 门禁全绿**：相关单测、`pnpm verify:gates`、`pnpm verify:product-baseline` 通过。

## 3. 关键用户旅程

1. 用户打开新会话欢迎页 → 切到「技能」标签 → 卡片网格渲染。
2. 期望：卡片底部直接是描述文字结尾，**没有**任何 `@MiniMax Design官方` 署名与认证勾。
3. 用户点击分类胶囊（电商变现 / 营销增长 / 协作办公 / 视觉与视频 / 内容创作）→ 过滤后的卡片同样无署名行。
4. 用户进入技能工坊 → 打开 `meta.yaml` → YAML 文本里没有 `author-cn: "MiniMax Design"` / `author-en: "MiniMax Design"`。

## 4. 新用户基线

本改动只做减法：不引入任何新依赖、新配置、新环境要求。全新用户安装后即生效；缺失任何开发机私有状态时行为与改动前完全一致（无新增失败路径）。

## 5. 文档影响

一句话结论：无需改动合同文档。`docs/contracts/first-level-page-layout.md` 与 `docs/specs/2026-09-08-skill-workshop/prd.md` 中出现的 `MiniMax Design` 属于历史设计与取证记录，非产品运行时文案，按仓库惯例不改写历史。

## 6. 交付证据要求

- 界面改动 → 必须在**本任务工作树内**用真实浏览器预演并落盘截图证据到 `docs/evidence/`。
- 端到端测试：`plugins/omnimux/tests/e2e/skill-card-attribution-removal.spec.js`。
