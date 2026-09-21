# 规格：灵感预览弹窗分镜标题漏译与单条复制按钮

Issue #2514。用户截图确认：中栏标题露出 `modal.deconstruction.shotsTitle (4)`；每条分镜下露出 `modal.deconstruction.copyPrompt`。明确要求：移除单条记录复制按钮，修复标题。

## 目标（Objective）

打开已解构灵感的预览弹窗时，中栏标题显示人话「逐镜头分镜脚本 (N)」，不再露出内部文案键；每条分镜卡片不再提供复制按钮。整段脚本复制（中栏标题旁）与内容解构复制（右栏）保持可用。中栏分镜列表与右栏内容解构的上下滑块默认不绘制；只有正在上下滚动时才显示并可拖动，停滚后收回。

新用户基线：不依赖开发机私有状态；标题来自插件内置中英文词典。缺键时 `t` 会回退成键名本身，因此必须登记文案，不能只靠 `||` 后备字符串。

## 技术栈（Tech Stack）

现有 `omnimux-inspiration` 客户端：React JSX、`locales.js` 中英文词典、`dsh-ui-kit` 的 `CopyButton`、node:test + jsdom 渲染门禁。不新增依赖。

## 命令（Commands）

- `pnpm --filter omnimux-inspiration test`
- `pnpm --filter omnimux-inspiration build`
- `git diff --check`

## 项目结构（Project Structure）

- `plugins/omnimux-inspiration/src/client/InspirationPreviewModal.jsx`：中栏标题与分镜卡片
- `plugins/omnimux-inspiration/src/client/locales.js`：补齐 `modal.deconstruction.shotsTitle`
- `plugins/omnimux-inspiration/src/client/styles.js`：删除单条复制按钮样式
- `plugins/omnimux-inspiration/src/client/styles.test.js`：标题文案与按钮缺席门禁
- `plugins/omnimux-inspiration/src/client/inspiration-shot-copy-render.test.js`：渲染门禁

## 代码风格（Code Style）

沿用现有两空格、具名导出、`t('key')` 查词典。缺键不得依赖 `|| '后备'`，因为 `t` 缺键返回键名（真值），后备永远不生效。标题写法：

```jsx
<h3>{t('modal.deconstruction.shotsTitle')} ({data.shots.length || data.segments.length})</h3>
```

分镜卡片只保留时间、阶段、描述、口播与 prompt 文本，不再渲染 `CopyButton`。

## 测试策略（Testing Strategy）

1. 词典断言：中文 `逐镜头分镜脚本`、英文 `Shot-by-shot script`；不再登记 `copyPrompt`。
2. 源码门禁：`InspirationPreviewModal.jsx` 不含 `copyPrompt`、`omnimux-inspiration-shot-copy-btn`。
3. jsdom 渲染：带 4 条分镜的弹窗标题为人话且含 `(4)`；分镜卡片内无复制按钮；中栏标题旁与右栏仍可复制。
4. 跑 `pnpm --filter omnimux-inspiration test`。隔离 worktree 浏览器走查固化 DOM 观察后再写 e2e（若走查确认静态渲染已足够，以 jsdom 门禁为 Agent 侧证据）。

## 边界（Boundaries）

- 总是：只改灵感预览弹窗中栏标题与单条复制按钮；相关测试必须先失败后通过。
- 先问：改右栏解构、改立即复刻、改分析/翻译逻辑、新增依赖。
- 绝不：提交密钥、改官方 DSH、动主仓、伪造浏览器证据。

## 成功标准（Success Criteria）

- 中栏标题为「逐镜头分镜脚本 (N)」，单行显示，页面任意处不再出现 `modal.deconstruction.shotsTitle` 或 `modal.deconstruction.copyPrompt`。
- 每条分镜卡片上没有复制按钮；prompt 文本（若有）仍只读展示。
- 中栏标题旁「复制」与右栏「复制」仍存在。
- 英文界面标题为 `Shot-by-shot script (N)`。
- 中栏与右栏滚动滑块默认透明；滚动中显示，静置后收回；不因滑块显隐造成内容左右跳动。

## 文档影响

局部文案与按钮缺席，不改公共接口与产品操作合同，无需更新全局 docs。

## 产品基线

全新安装用户打开灵感预览即可看到中文标题；不依赖开发机词典覆盖。缺键时会露出键名，本修复通过登记词典消除该失败路径。
