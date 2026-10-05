# Issue #3123 验收证据 — 悬停预览卡只保留图像

## 用户诉求（附截图）

创作画布「资产」抽屉里，鼠标悬停素材条目弹出的预览卡，底部深色信息区（素材名、导入/生成徽标、更新时间、分辨率、文件大小、本地路径 / Prompt、标签）都不需要，只保留图像本身。

## 修复内容

- `HoverInspector.tsx`：移除整个信息区（标题 + 类型徽标 + 属性网格 + 标签），以及仅服务于该区域的 4 个图标引用与日期格式化逻辑；卡片高度兜底值从 290 收敛到 142（140px 图像 + 上下各 1px 边框）。
- `theme/components.css`：删除信息区相关的 10 条失效规则；容器只剩单一子节点，去掉 `display:flex; flex-direction:column`；区块注释由「悬停元数据卡片」更正为「悬停预览卡片」。
- `assets.test.mjs`：把「悬停卡内展示本地路径 / 按类型隐藏 Prompt」两条断言按用户新契约反转为「卡内不得出现本地路径 / Prompt」——用户明确要求的契约变更，已在主检出登记豁免；该用例其余断言原样保留。
- 新增 `hoverPreviewImageOnly.e2e.test.mjs`：信息区任一节点或文案回归即变红。

保留不变：缩略图容器、图像 / 视频首帧 / 音频占位图标渲染、覆盖在图像上的时长角标、卡片定位与视口边界保护。

## 修复后（隔离工作树真实浏览器验证）

- 运行器：`.workbuddy/qa/hover-preview/run.mjs` + `entry.tsx`（任务内临时验收脚本，位于 git-ignored 的 `.workbuddy/`，随工作树清理）
- 被测对象：真实 `HoverInspector` + 真实 `MediaThumb` + 真实主题样式 + 真实媒体字节（真实 `local-file` 路由，含 Range 206）
- 结果：**10/10 断言 PASS**（`report.json` 的 `verdict` 为 `PASS`，`checks` 10 条全部 `pass: true`）

| 断言 | 结果 |
| --- | --- |
| 三张悬停卡均已渲染 | PASS |
| 渲染与挂载过程无控制台错误（`consoleErrors: []`） | PASS |
| 图片素材：只渲染图像，信息区节点 0，`naturalWidth 320` | PASS |
| 视频素材：渲染首帧，信息区节点 0，`videoWidth 320 / readyState 4` | PASS |
| 音频素材：回退占位图标，信息区节点 0 | PASS |
| 三张卡片文本只剩时长角标（无素材名 / 更新时间等） | PASS |
| 视频时长角标仍保留在图像区域内 | PASS |
| 卡片定位仍为侧边栏外侧左侧（left = 抽屉左边缘 − 260 − 8） | PASS |
| 卡片高度收敛为图像区域高度（142px，预览区 140px） | PASS |
| 真实 PNG 截图已留存且可解码 | PASS |

- 截图：`hover-preview-image-only.png`（1500×926，三张卡依次为图片 / 视频首帧 / 音频占位图标）
- 结构化报告：`report.json`

### 本次验证的边界（如实声明）

- 上述浏览器验证是**组件级合成页**：直接给 `HoverInspector` 传入合成锚点，未经过真实 `AssetsDrawer` 的悬停触发链路，因此规格中的「打开画布 → 资产页签 → 悬停 → 移开」操作旅程本身没有留存证据。
- 「修复前」不以渲染对照呈现：早期版本曾在同一页面合成旧标记卡片用于对比，但它在旧样式已被删除之后渲染，观感并非修复前真实效果，故已移除；修复前证据改由下节的反向验证给出。
- 验收脚本是任务内临时产物，不可从仓库重放；仓库内可重放的门禁是 `hoverPreviewImageOnly.e2e.test.mjs` 与 `assets.test.mjs`。

## 自动化检查

| 检查 | 结果 |
| --- | --- |
| `node --test "src/**/*.test.mjs" "src/**/*.test.js" "tests/*.test.mjs"`（omnimux-workflow） | 2403 tests / 2403 pass / 0 fail，exit 0 |
| 同套件 rebase 到最新主干后复跑（独立审查者执行） | 2410 tests / 2410 pass / 0 fail，exit 0 |
| `node --test src/canvas/editor/components/assets/hoverPreviewImageOnly.e2e.test.mjs` | 7 tests / 7 pass |
| `pnpm verify:stages` | PASS（14 Stage 组件、8 个侧栏注册目标） |
| `node --test scripts/verify-anti-slop.test.mjs` | 3 tests / 3 pass |
| `git diff --check` | clean |

## E2E 回归门禁的反向验证（修复前证据）

以 `git show origin/main:<文件>` 取修复前源码，用同一判定式复跑：8 个信息区类名在组件与样式表中**全部命中**，被移除文案 5/5 命中，四个仅信息区使用的图标各命中 2 次，卡片高度兜底仍是 290 → 门禁在修复前必然变红。

独立审查者把修复前的组件与样式表镜像到临时目录、放入本 PR 的测试文件后运行，实测得到 `exit 1，7 tests / 1 pass / 6 fail`（唯一通过的是「图像区域与时长角标保留」，修复前本就成立），与上述判定一致。

跳过项与原因：`pnpm verify:product-baseline` 未跑——本改动不触及产品路径、模型路由或本地状态；`pnpm test:gates` 未跑——未修改 workflow 契约或门禁脚本。
