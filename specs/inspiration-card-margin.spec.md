# 规格：灵感预览弹窗卡片外边距统一收窄

Issue #2528。用户截图用红线标出：分镜脚本栏与内容解构栏的卡片离栏边空隙不一致，右边更宽。要求两栏卡片外边距用同一个更窄的数值，让卡片横向多露出内容。

## 目标（Objective）

打开已解构灵感的预览弹窗时，中栏分镜卡片与右栏解构卡片相对各自栏边的左右空隙同为 8px，且比改前更窄。分镜底部英文提示词完整换行，不再被省略号截断。标题齐平、无分割线、复制按钮保持不变。

## 技术栈（Tech Stack）

现有 `omnimux-inspiration` 客户端：React JSX、`styles.js`、node:test。不新增依赖。

## 命令（Commands）

- `pnpm --filter omnimux-inspiration test`
- `git diff --check`

## 项目结构（Project Structure）

- `plugins/omnimux-inspiration/src/client/styles.js`：两栏面板内边距、右栏内容区内边距、英文提示词换行
- `plugins/omnimux-inspiration/src/client/styles.test.js`：外边距断言
- `tests/e2e/inspiration-card-margin.e2e.test.mjs`：真实浏览器量两边卡片空隙

## 代码风格（Code Style）

两栏卡片外边距共用同一个 8px，右栏不再叠第二层内边距：

```css
.omnimux-inspiration-workbench-center,
.omnimux-inspiration-workbench-right {
  padding: 12px 8px !important;
}
.omnimux-inspiration-modal-deconstruction-body .omnimux-inspiration-modal-dimensions.is-doc-style {
  padding: 0;
}
.omnimux-inspiration-shot-prompt {
  white-space: normal;
  overflow-wrap: anywhere;
}
```

## 测试策略（Testing Strategy）

1. 源码门禁：中栏与右栏面板水平内边距同为 8px；右栏文档区不再 `padding: 16px`；英文提示词不再 `white-space: nowrap`。
2. 隔离工作区真实浏览器：量中栏卡片、右栏卡片相对栏边的左右空隙，两边相等且不超过 8px。
3. 跑 `pnpm --filter omnimux-inspiration test`。

## 边界（Boundaries）

- 总是：只改两栏卡片外边距与英文提示词换行；相关测试先写后通过。
- 先问：改标题文案、复制按钮、滚动条、卡片内部文字层级、左栏播放器。
- 绝不：提交密钥、改官方 DSH、动主仓、伪造浏览器证据。

## 成功标准（Success Criteria）

- 中栏分镜卡片与右栏解构卡片，左右外边距同为 8px。
- 该空隙小于改前（中栏原 18px，右栏原约 34px）。
- 分镜英文提示词完整换行，不再出现省略号截断。
- 两栏标题仍齐平，标题下无分割线，复制按钮仍在。

## 文档影响

局部样式，不改公共接口，无需更新全局 docs。

## 产品基线

全新安装用户打开灵感预览即可看到统一收窄的卡片外边距；不依赖开发机私有状态。缺少解构内容时仍显示原有空态，不报错。
