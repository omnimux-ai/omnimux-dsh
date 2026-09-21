# 规格：核心胶囊按钮与子提示词多语言国际化与自适应联动

## 1. 业务背景与问题分析
在会话输入框下方有 4 个核心胶囊按钮选项（⚡ 技能、▷ 视频广告、🖼️ 图片广告、🔍 竞争对手研究）以及展开的子提示词菜单，目前存在以下问题：
1. `SUBPROMPTS_DATA` 中只有英文的 `prompt`，即使在中文环境下，用户点击中文的子项（例如“为您的 Shopify 店铺制作商品图片:”），输入框中输入的却是英文 `"Create product images and banner ads for my Shopify store: "`。现在必须让中文环境下点击输入对应的中文提示词（例如“为我的 Shopify 店铺制作商品图片与横幅广告：”），英文环境下输入英文提示词。
2. `SessionGuide.jsx` 硬编码了 `locale="zh"`，未根据 `isEn` 传递对应的语言环境。
3. `CreatifyPillsBar.jsx` 需要自适应探测 DSH 宿主语言（结合 `props.locale`、`props.t`、`document.documentElement.lang`，并通过 MutationObserver 监听 html 的 lang 属性变化以及 window 自定义事件），确保在用户切换 DSH 语言时组件能即时响应。
4. 4 个胶囊按钮文本、子菜单标题、各子项 label 与 prompt、技能弹窗中的搜索占位符、无匹配提示、浏览全部技能按钮均需完整支持中英文双语。

## 2. 改进方案与设计

### 2.1 数据源扩展与兼容
- 在 `SUBPROMPTS_DATA` 中为 `video-ads`、`image-ads`、`competitor` 的每个项目补齐 `promptZh` 与 `promptEn`，并保留 `prompt` 字段以保证向后兼容。
- 中文提示词贴合中文使用习惯与第一人称提问诉求，英文提示词准确专业。

### 2.2 宿主多语言自适应探测与响应机制
- 支持从 `props.locale`、`props.t('locale')`、`props.t('guide.locale')`、`document.documentElement.lang` 等综合判定初始与受控语言。
- 在 `useEffect` 中设置监听：
  - 通过 `MutationObserver` 监听 `document.documentElement` 的 `attributes` 变化（过滤 `lang` 属性）。
  - 监听 `window` 的 `omnimux:locale-change` 与 `localechange` 自定义事件。
- 当宿主环境语言切换时，组件即时触发更新，动态切换界面与提示词。

### 2.3 提示词注入逻辑对齐
- `handleSelectPrompt(item)`：根据当前语言环境动态提取 `isZh ? (item.promptZh || item.prompt) : (item.promptEn || item.prompt)`，注入到输入框或通过 `onApplyPrompt` 回调。
- 保证无论是传入对象还是传入兼容字符串均能正常处理。

### 2.4 上层组件 SessionGuide 联动
- 在 `SessionGuide.jsx` 中，将传递给 `CreatifyPillsBar` 的 `locale` 从硬编码 `"zh"` 修正为 `isEn ? 'en' : 'zh'`，并保持 `t={t}` 透传。

## 3. 验收标准
1. 中文环境下（`locale="zh"` 或 `<html lang="zh">`）：
   - 渲染 4 个中文胶囊按钮（技能、视频广告、图片广告、竞争对手研究）；
   - 点击子菜单项时，注入的是中文提示词 `promptZh`。
2. 英文环境下（`locale="en"` 或 `<html lang="en">`）：
   - 渲染 4 个英文胶囊按钮（Skills、Video ads、Image ads、Competitor research）；
   - 点击子菜单项时，注入的是英文提示词 `promptEn`。
3. 多语言自适应切换：
   - 当 `document.documentElement.lang` 由 `zh` 切换为 `en` 时，组件能够自动感知并刷新为英文模式；
   - 当触发 `omnimux:locale-change` 事件时，组件能即时自适应切换；
   - 传入新的 `props.locale` 能够受控更新。
4. 单元测试 `node --test plugins/omnimux/src/client/session-guide/creatify-pills-composer.test.js` 100% 绿灯通过。
