# clip-i18n 可见面中文适配 · Batch 1 证据（Issue #3198）

- 工作树：`.worktrees/clip-i18n-visible-issue-3198`（分支 `agent/clip-i18n-visible-issue-3198`）
- 验收环境：工作树内合成宿主 QA 页（`http://localhost:64123/`，ego-browser 真机 Chromium）
- 产物：`plugins/omnimux-clip/lib/client.js`（SHA-256 `d53a45be…b70206`，与页面实际加载字节一致）

## 1. 已核实为中文（截图 `welcome-zh.png`）
- 剪辑插件新建表单：新建剪辑项目 / 项目名称 / 分辨率 / 帧率 / 进入官方欢迎页 / 创建并进入编辑器
- OpenReel 欢迎页：Open Reel Video / 从创意到成片。/ 就在浏览器里。/ 选一个画幅即可开始创作,随时可更改。/ 浏览模板 / 最近项目 / 打开编辑器 / 启动时跳过 / 按 Esc 跳过
- 三个画幅卡片的无障碍名称：创建 竖屏 项目 / 创建 横屏 项目 / 创建 方形 项目

## 2. 未通过项（必须人工复核）
三个画幅卡片的**可见正文**渲染为 `vertical` / `horizontal` / `square`（即选项 id），而非 `竖屏/横屏/方形`。
- 已排除的原因：产物非陈旧（bundle 18:36 > 最新源码 18:35，且服务端字节哈希与工作树一致）；编译后的调用点确实传入完整 children 数组（`children:[div,div,div]`，见 bundle 偏移 9320911）；`ToolcraftClickableCard` 实现忠实渲染 `{children}`；字典存在 `Vertical→竖屏`。
- 未解释：同一屏内 `aria-label`（同样走 `t(option.label)`）是正确的 `创建 竖屏 项目`，但按钮子节点为空元素、纯文本节点为 id。同一 QA 页内编辑器顶栏也出现同类现象（`video`/`motion` 而非字典里的 `视频编辑`/`动效设计`），而这两处源码均渲染 label。
- 判定：**高度疑似合成宿主（harness）挂载产物时的渲染差异，而非产品构建缺陷**；需在 Dev 应用人工目视确认。在确认前不得宣称欢迎页 100% 通过。

## 3. 明确不在 Batch 1 范围（Batch 2+）
- 属性面板分组标签：media / text / graphics / effects / transitions / adjust（约 75 个分组，~1000 条）
- motion 工作区（~900 条）、chat / ai-panel / kieai、设置、引导、SharePage、MobileBlocker
- 上述中文缺失是"尚未翻译"，与第 2 节的渲染差异是两件事。

## 4. 自动化
- `pnpm --filter omnimux-clip test`：146/146 通过（含 `clip-i18n.test.js` 6 条：字典覆盖、缺键回退原文、非中文语言直通）
