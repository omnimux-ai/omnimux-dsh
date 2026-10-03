# 规格：侧边栏「开始」区条目名称乱码/英文修复

## 问题现象
右侧工作台「开始」面板里，两个条目名称显示异常：
- 「mediaViewer.tabTitle」：直接显示翻译键名（未翻译）。
- 「Asset Hub」：中文界面下显示英文。
- 其余条目正常。

## 根因
1. 媒体查看器的标题挂载用 `tool.viewer` 命名空间取 `mediaViewer.tabTitle`，但该插件自己的词条表里没有这个键（该键在 hub 的 `omnimux` 命名空间里），翻译服务取不到 → 原样回显键名。
2. 资产插件词条表中 `assetHub.tabTitle` 的中英文案填反（中文写成英文、英文写成中文）。

## 验收标准
- 媒体查看器词条 zh/en 对称补 `mediaViewer.tabTitle`（中文「图像生成」，英文「Image Generation」），挂载处经本插件命名空间取到词条。
- 资产插件词条 `assetHub.tabTitle` 中文为「素材工作台」、英文为「Asset Hub」。
- 中文界面下右侧「开始」面板对应行分别显示「图像生成」「素材工作台」，无英文与键名残留。
