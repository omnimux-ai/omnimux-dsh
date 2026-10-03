# Issue #2999 实测证据：「使用提示词生成」跨插件填入

## 环境
- 工作树 `.worktrees/omnimux-prompt-prefill-issue-2999`，真实 Chrome 无头内核（CDP 驱动真实点击）。
- 复刻线上结构：对话区入口与图像生成页消费端用 esbuild **各自独立打包**，各含一份 `composer-prefill.js`。
- 页面：一个 `prompt-video` 提示词块（280 字）+ 一个按 `MediaViewerComposer` 同款方式消费填入请求的输入框。

## 结果
| 场景 | 按钮 | 打开页 | 模式 | 输入框字数 | 与块内全文一致 |
|---|---|---|---|---|---|
| 修复前 | 已填入 | omnimux:media-viewer | 图像 | 0 | 否 |
| 修复后 | 已填入 | omnimux:media-viewer | 视频 | 280 | 是 |

修复前现象与 Dev 应用 CDP 复现一致：页面打开、按钮显示已填入，但输入框为空、模式不切换。

## 截图
- `prompt-prefill-2999-before-fix.png`
- `prompt-prefill-2999-after-fix.png`

## 构建产物核对
- 工作树构建 `plugins/omnimux/lib/client.js` 与 `plugins/omnimux-viewer/lib/client.js` 均含 `__omnimuxComposerPrefill`。
- 从两份真实产物抽出 prefill 段在同一 window 求值：viewer 侧读到 hub 侧写入的视频提示词，通知 2 次，取走后为空。
