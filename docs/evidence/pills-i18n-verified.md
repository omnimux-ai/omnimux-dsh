# 胶囊按钮与子提示词多语言国际化验证证据

## 1. 验证时间与环境
- **验证时间**：2026-09-22
- **验证对象**：会话输入框下方 4 大核心胶囊选项（⚡ 技能、▷ 视频广告、🖼️ 图片广告、🔍 竞争对手研究）与展开子菜单提示词
- **验证规范**：`specs/pills-i18n.spec.md`
- **运行环境**：独立隔离工作树（`agent/omnimux-pills-i18n`）

## 2. 自动化验证覆盖与结果

### 2.1 E2E 交互链路验证
- **测试文件**：`plugins/omnimux/tests/e2e/creatify-pills-composer.e2e.test.mjs`
- **验证结论**：通过（1/1 场景）
- **核心断言**：
  1. 中文环境下正确渲染 4 个中文胶囊按钮，点击视频广告弹出 7 项专属子提示词，点击子项注入中文提示词（“使用 AI 数字人为我的网站制作视频广告：”）；
  2. 英文环境下正确渲染 4 个英文胶囊按钮（Skills、Video ads、Image ads、Competitor research），点击子项注入英文提示词（“Create a video ad with an AI avatar for ”）；
  3. 技能弹窗面板两端对齐、不透明提升背景色、支持点击外部收起。

### 2.2 单元与边界测试用例
- **测试文件**：`plugins/omnimux/src/client/session-guide/creatify-pills-composer.test.js`
- **验证结论**：全量通过（10/10 用例）
- **涵盖维度**：
  1. 中英文胶囊按钮文案渲染
  2. 中英文提示词点击注入双向对齐
  3. DSH 宿主环境语言属性与广播事件自适应切换
  4. 纯函数 `resolveLocale` 语言判定优先级（a -> b -> c -> d）
  5. 语言代码合法性严格校验与异常字符串防御
  6. 单向只读守卫，绝不反向污染全局 `document.documentElement.lang`

## 3. 实机走查与演示产物
- **走查演示页面**：`docs/evidence/demo-pills-i18n.html`
- **走查结论**：切换语言后，选项展示与提示词输入即时自适应，体验顺滑无延迟。
