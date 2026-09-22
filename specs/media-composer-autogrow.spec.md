# 规格：图像生成输入框随文字行数变高

Issue #2575

## 目标（Objective）

图像生成页底部提示词框，按已经输入的文字行数自动变高，最多同时露出 10 行。

用户是在图像生成页写画面提示词的人。现在框写到大约两行就停住，长提示词要在很小的区域里翻找。改完后：字少时框仍矮，字多时逐行长高，到第 10 行停住，再多的字在框里滚动，不被裁掉。

用户故事：我在图像生成页粘贴一段长提示词，能一次看见前 10 行；第 11 行起我在框里往下翻，不用把整页撑开。

## 技术栈（Tech Stack）

- 既有图像生成输入面板：React 函数组件 + 同目录样式字符串。
- 不新增依赖，不改构建链。

## 命令（Commands）

```bash
node --test plugins/omnimux/src/client/media-viewer/media-composer-autogrow.e2e.test.js
node --test plugins/omnimux/src/client/media-viewer/media-composer-clean-border.e2e.test.js plugins/omnimux/src/client/media-viewer/media-viewer-composer-fit.e2e.test.js
```

在任务工作树根目录执行。浏览器几何证据另用隔离页面测量，不依赖开发版。

## 项目结构（Project Structure）

- `plugins/omnimux/src/client/media-viewer/MediaViewerComposer.jsx`：提示词框，补高度跟随。
- `plugins/omnimux/src/client/media-viewer/prompt-textarea-height.js`：纯函数，把内容高度夹在「现在的矮高度」和「10 行」之间。
- `plugins/omnimux/src/client/media-viewer/styles.js`：上限改为 10 行，超出后框内滚动。
- `plugins/omnimux/src/client/media-viewer/media-composer-autogrow.e2e.test.js`：契约测试。
- `specs/media-composer-autogrow.spec.md`：本规格。

## 代码风格（Code Style）

高度数字只写在一处，组件只负责测量和套用：

```js
export const PROMPT_TEXTAREA_MIN_HEIGHT_PX = 52
export const PROMPT_TEXTAREA_LINE_HEIGHT = 1.6
export const PROMPT_TEXTAREA_FONT_SIZE_PX = 14
export const PROMPT_TEXTAREA_MAX_VISIBLE_LINES = 10

export function clampPromptTextareaHeight(contentHeightPx) {
  const line = PROMPT_TEXTAREA_FONT_SIZE_PX * PROMPT_TEXTAREA_LINE_HEIGHT
  const max = Math.round(PROMPT_TEXTAREA_MAX_VISIBLE_LINES * line)
  const raw = Number.isFinite(contentHeightPx) ? contentHeightPx : 0
  return Math.min(max, Math.max(PROMPT_TEXTAREA_MIN_HEIGHT_PX, Math.ceil(raw)))
}
```

## 测试策略（Testing Strategy）

- 纯函数：1 行及以下夹到现有矮高度；第 10 行等于上限；第 11 行不再增高。
- 样式契约：上限是 10 行，不再是 120px；超出后 `overflow-y: auto`。
- 组件契约：输入、粘贴、清空都会重算高度。
- 浏览器：空、1 行、10 行、11 行以上各量一次真实高度与是否出现滚动。

## 边界（Boundaries）

- 总是：只动图像生成页底部这一个提示词框；回车发送、换行、发送后清空保持原样。
- 先问：若要连聊天主输入框、视频浮层输入框一起改。
- 绝不：改提交内容、模型、参数按钮；不新增依赖；不把规格写进主检出。

## 成功标准（Success Criteria）

- 空框或一行时高度仍是 52px。
- 2 到 10 行逐行变高，10 行时高度等于 `ceil(10 × 14 × 1.6 + 4)` = 228px，且没有内部滚动。
- 第 11 行起高度停在 228px，`scrollHeight` 大于可视高度，文字可滚动且不被裁切。
- 删除回到 10 行以内后高度下降；发送清空后回到 52px。
- 新用户不依赖任何本机私有服务；打不开页面时只是看不到框，不报错、不回退到别的输入框。

## 开放问题（Open Questions）

- 无。10 行按「字号 14px × 行高 1.6」计算，不按用户浏览器的缩放另行改写。
