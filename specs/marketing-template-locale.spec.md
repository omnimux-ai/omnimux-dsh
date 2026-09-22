# 规格：营销模板名称与提示词跟随系统语言

## 目标（Objective）

探索模板中的营销模板（创意模板库，不含技能卡片）的**名称**与**提示词**跟随 DeepSeek Harness 系统语言，在中文与英文之间自适应。

用户故事：系统语言为中文时，卡片名、悬停提示词、详情提示词、点卡片后写入会话输入框的提示词都是中文；切到英文后，同一位置变成英文，无需刷新页面。

## 新用户基线（Product baseline）

- 依赖：宿主已注入的语言（翻译函数返回的语言、页面语言标记，或语言切换事件）。不依赖开发机私有目录、本地模型或本机绝对路径。
- 缺失时：语言无法识别则按中文展示与填入。不报错、不回退到开发机路径。

## 命令（Commands）

```bash
node --test plugins/omnimux/src/client/session-guide/templates/templates-data.test.js \
  plugins/omnimux/src/client/session-guide/templates/template-locale.test.js \
  plugins/omnimux/src/client/session-guide/templates/explore-templates-ui.test.js \
  plugins/omnimux/src/client/session-guide/templates/explore-templates-full-pipeline.test.js
```

## 项目结构（Project Structure）

- 数据：`plugins/omnimux/src/client/session-guide/templates/creative-templates.json`
  - 保留 `title`（中文名）、`titleEn`（英文名）、`prompt`（英文提示词）
  - 新增 `promptZh`（中文提示词）
- 取值：`plugins/omnimux/src/client/session-guide/templates/template-locale.js`
- 展示：卡片、货架、网格、详情抽屉、探索模板区
- 规格：`specs/marketing-template-locale.spec.md`

## 代码风格（Code Style）

语言判定复用胶囊按钮已有的优先级：翻译函数给出的语言 → 页面语言标记 → 显式传入 → 默认中文。只读宿主语言，不改写页面语言标记。

```js
export function resolveTemplateCopy(item, locale) {
  const en = String(locale || '').toLowerCase().startsWith('en')
  const title = en
    ? (item.titleEn || item.title || '')
    : (item.title || item.titleZh || item.titleEn || '')
  const prompt = en
    ? (item.prompt || item.promptZh || '')
    : (item.promptZh || item.prompt || '')
  return { title, prompt }
}
```

## 测试策略（Testing Strategy）

- 数据完整性：每条营销模板都有非空中文名、英文名、中文提示词、英文提示词；中文名含汉字；英文名不含汉字。
- 取值：中文环境取中文名与中文提示词；英文环境取英文名与英文提示词；缺字段时回退到另一语言，不返回空。
- 界面静态渲染：中文环境下卡片标题为中文，悬停层带中文提示词；英文环境下为英文。
- 行为：点卡片传给输入框的提示词与当前语言一致。

## 边界（Boundaries）

- 总是：中英两套文案都保留；切换语言只改展示与填入，不改模板编号、封面、分类。
- 先问：增加中英以外的语言；改生成模型或工作流结构。
- 绝不：把中文提示词写进英文生成字段去替换模型侧英文提示词；改技能卡片文案；提交密钥。

## 成功标准（Success Criteria）

1. 中文系统：卡片名称是中文；悬停看到的提示词是中文。
2. 英文系统：卡片名称是英文；悬停看到的提示词是英文。
3. 点击模板后，写入会话输入框的提示词与当前语言一致。
4. 详情里的名称与提示词同样跟随语言。
5. 切换系统语言后，已打开的模板区随之更新，无需刷新。
6. 395 条模板全部具备中文名、英文名、中文提示词、英文提示词。

## 文档影响

无独立合同变更。行为由本规格与现有界面文案规范约束，不新增用户可见的设置项。

## 开放问题（Open Questions）

无。范围以用户截图中的营销模板货架为准，技能卡片不在本次范围。
