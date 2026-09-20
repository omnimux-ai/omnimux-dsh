# 剪辑工作台主按钮白底白字修复 · 任务规格

## 背景与问题
`plugins/omnimux-clip` 的「新建剪辑项目」表单中，主行动按钮「创建并进入编辑器」背景与文字均为白色，文本完全不可见（用户截图证实）。
根因：按钮使用 `--dsw-alias-accent-primary` 作为背景、硬编码 `#ffffff` 作为文字色；而宿主 token `--dsw-alias-accent-primary` 定义为 `var(--dsw-alias-label-primary)`（深色主题=纯白），形成白底白字。

## 影响面
1. `plugins/omnimux-clip/src/client/OpenReelStudioTab.jsx` — StudioCreateForm 的 `btnPrimary`（用户截图所示问题）。
2. `plugins/omnimux-clip/src/client/ClipStage.jsx` — 错误边界「重试加载」按钮使用同一错误 token 组合，存在相同白底白字隐患。

## 修复方案（遵循 design.md Ink CTA 规范）
- 背景：`var(--dsw-alias-button-primary-fill)`（深色主题=纯白，浅色主题=纯黑）。
- 文字：`var(--dsw-alias-label-primary-foreground)`（深色主题=近黑，浅色主题=近白），随主题自动翻转。
- 不新增 hover 交互、不改几何尺寸，保持最小 diff。

## 新用户基线
纯样式 token 修正，不依赖任何本机状态、密钥或开发机路径；新用户安装后即获得正确对比度。

## 验收标准
| 编号 | 标准 | 验证方式 |
| --- | --- | --- |
| AC-1 | 创建表单主按钮背景解析为 `--dsw-alias-button-primary-fill`，文字解析为 `--dsw-alias-label-primary-foreground`，不再引用 `--dsw-alias-accent-primary` | 静态源码断言 |
| AC-2 | 错误边界「重试加载」按钮同步修正 | 静态源码断言 |
| AC-3 | 深色主题下按钮文字与背景对比度可见（白底黑字） | 浏览器计算样式核验，背景 luminance 与文字 luminance 差 ≥ 4.5:1 |
| AC-4 | 既有插件测试与静态检查不回归 | `pnpm --filter` 相关测试 + `git diff --check` |

## 不做的事
不改 OpenReel 官方 vendored 代码；不调整按钮文案、布局、尺寸；不引入新组件。
