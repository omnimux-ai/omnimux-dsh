# OmniMux 全域技能检索与会话临时装配架构规格设计（Spec）

## 1. 架构目标与职责边界

本规格重构 OmniMux 技能检索与装载链条，打通用户级（全局）、项目级（工作区）、Agent 预设级（绑定）、会话临时级（Ad-hoc 药丸）的四层体系。

### 核心设计原则
1. **预设推荐与全域穿透并存**：
   - 技能面板无搜索词时，展示 Agent 预设绑定的分类与专属技能。
   - 技能面板有搜索词时，直接穿透预设沙盒，向全量技能聚合引擎（用户级安装 + 项目级 + 目录 + 远程）检索。
2. **本地安装技能全量入库聚合检索**：
   - 后端 `aggregateSkillSearch` 自动纳入 `listInstalled(cfg.skillsDir)` 本地扫描结果，确保磁盘已安装的技能 100% 能够被搜索命中。
3. **输入框 Slash 全量发现与智能识别**：
   - `enhanceSkillCandidates` 聚合已安装与全量技能列表，键入 `/` 或输入关键词能够精准模糊匹配。
   - 输入框若直接键入完整技能名（如 `/skill-creator`），在候选菜单选中或按回车确认时，触发 `requestSkillAttach` 生成临时药丸，并剥离斜杠文本。
4. **纯临时单轮装配（零预设污染）**：
   - 选中的临时技能只挂载到当前会话（`window.__omnimuxActiveSkill` / `api('tryAttach')`），绝不回写修改 Agent 预设配置。

---

## 2. 垂直薄片任务分解（Vertical Slices）

### 票 1（后端/聚合层）：本地已安装技能入库与聚合检索增强
- **范围**：
  - `plugins/omnimux-market/src/local-api.ts`
  - `plugins/omnimux-market/src/skill-aggregate.ts`
- **行为**：
  - `handleSearch` 读取 `listInstalled(cfg.skillsDir)`，将不在 `catalog` 中的本地已安装技能转换为 `SkillCard`。
  - `aggregateSkillSearch` 将本地已安装技能作为最高优先级的本地匹配源合并排序。
- **验收标准**：
  - 搜索已安装的 `skill-creator` 时，后端返回且 `installed: true`。

### 票 2（客户端/面板层）：技能选择器穿透检索与外部技能临时挂载
- **范围**：
  - `plugins/omnimux-market/src/client/skill-picker.js`
  - `plugins/omnimux-market/src/client/skill-picker-logic.js`
- **行为**：
  - 在存在 `presetBinding` 时，若 `query` 非空，允许发起 `loadPickerSearch` 并将全局匹配结果呈现给用户。
  - `filterPickerItems` 允许带有 `query` 的搜索返回全域匹配项（外部技能）。
  - 用户在面板点击任意外部技能，通过 `applyItem` 触发会话临时挂载，点亮底栏药丸，关闭面板。
- **验收标准**：
  - 在 `omni-agent` 预设下搜索 `skill-creator`，面板展示搜索结果；点击后底栏药丸点亮，无报错。

### 票 3（输入框层）：Composer `/` 候选全域扩展与自动吸附药丸
- **范围**：
  - `plugins/omnimux/src/client/composer-commands-i18n.js`
- **行为**：
  - `enhanceSkillCandidates` 合并本地已安装技能字典，确保 `/skill-creator` 在斜杠下拉候选列表中高亮首推。
  - 点击或 Enter 确认候选项后，清除输入框斜杠文本，底栏药丸点亮。
- **验收标准**：
  - 在输入框键入 `/skill-creator`，下拉菜单展示并能选中，底栏成功显示 `[= skill-creator ×]`。
