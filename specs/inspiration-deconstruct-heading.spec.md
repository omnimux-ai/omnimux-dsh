# 规格：灵感预览弹窗内容解构标题栏对齐

Issue #2521。用户截图确认：右栏「内容解构」标题栏比中栏「逐镜头分镜脚本」多出上下空白，标题下有分割线。要求上下间距与分镜脚本对齐，移除分割线。

## 目标（Objective）

打开已解构灵感的预览弹窗时，右栏「内容解构」标题与中栏「逐镜头分镜脚本」处于同一水平高度、同一上下留白；标题下不再画分割线。标题旁复制按钮仍在。既有行为不变：中栏人话标题、无单条复制、滚动条按需显示。

## 技术栈（Tech Stack）

现有 `omnimux-inspiration` 客户端：React JSX、`styles.js`、node:test。不新增依赖。

## 命令（Commands）

- `pnpm --filter omnimux-inspiration test`
- `git diff --check`

## 项目结构（Project Structure）

- `plugins/omnimux-inspiration/src/client/styles.js`：右栏面板内边距与标题栏
- `plugins/omnimux-inspiration/src/client/styles.test.js`：标题栏无底边、与中栏同一间距

## 代码风格（Code Style）

右栏标题复用中栏标题规则，不再单独加大内边距或画底边：

```css
.omnimux-inspiration-deconstruct-heading {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  padding: 0;
  border-bottom: none;
}
```

右栏面板不再把内边距清零，以便与中栏 `16px 18px` 对齐。

## 测试策略（Testing Strategy）

1. 源码门禁：`.omnimux-inspiration-deconstruct-heading` 无 `border-bottom` 实线，padding 不为 `14px 20px`。
2. 右栏面板不再 `padding: 0 !important`。
3. 跑 `pnpm --filter omnimux-inspiration test`。
4. 隔离工作区真实浏览器走查：两栏标题顶边对齐，右栏无分割线。

## 边界（Boundaries）

- 总是：只改右栏标题栏间距与分割线；相关测试先失败后通过。
- 先问：改中栏标题、改复制按钮、改滚动条。
- 绝不：提交密钥、改官方 DSH、动主仓、伪造浏览器证据。

## 成功标准（Success Criteria）

- 右栏标题与中栏标题同一水平高度、上下留白一致。
- 右栏标题下不再有分割线。
- 标题旁「复制」仍在。

## 文档影响

局部样式，不改公共接口，无需更新全局 docs。

## 产品基线

全新安装用户打开灵感预览即可看到对齐后的标题栏；不依赖开发机私有状态。
