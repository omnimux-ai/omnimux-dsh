# 加号选素材改为整页浏览 — 验证证据

日期：2026-09-22
工作区：`.worktrees/omnimux-plus-library-stage`（分支 `agent/omnimux-plus-library-stage-issue-2548`）
Issue：#2548

## 验证方式

真实浏览器（ego-browser，Chromium）打开本工作区自己打包的单页预览，预览直接渲染真实的 `LibraryStage` 组件与真实样式表，接口用固定样本替换。任务空间 82 已关闭。

- 预览构建：`tmp/library-stage-preview.jsx`（esbuild 打包，样式取自 `session-guide/styles.js` 与三套选择器）
- 截图：`docs/evidence/2026-09-22-plus-library-stage.png`

## 实测结果

| 检查项 | 实测 |
| --- | --- |
| 顶部分类顺序 | 精选、资产库、灵感库、产品库、爆款趋势 |
| 分类位置 | 内容区顶部（top=28px，视口高 929px） |
| 输入框位置 | 页面底部（769–909px） |
| 技能按钮 | 可见（宽高均大于 0） |
| 精选 | 同时出现 assets、inspiration、products、trending 四路，8 张 |
| 灵感库 | 只有 inspiration 路，2 张 |
| 爆款趋势 | 只有 trending 路，2 张 |
| 资产库 | 只有 assets 路，2 张 |
| 点一张本地灵感卡 | 输入框写入「请参考本地灵感「本地藤编猫窝」继续创作：」，整页仍在 |
| 点第二张资产卡 | 两句话换行相接，原文未被覆盖 |

## 边界

- 未连接真实后端；各库数据由预览夹具提供，接口路径与生产一致（`/omnimux/assets/library`、`/omnimux/products`、`/omnimux/inspiration/local`、`/omnimux/inspiration`）。
- 未在开发版真机上验收：该验收为人工职责，不作为本次交付前提。
- 预览文件位于 `tmp/`，不进入提交。
