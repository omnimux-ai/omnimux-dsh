# 「优化提示词」下线移除 — 验证

方式：物化构建（esbuild, OMNIMUX_DSH_UI_KIT_DIR=packages/dsh-ui-kit）产出 `plugins/omnimux/lib/client.js`，
对产物与源码做文本核验；插件 apply 槽位扫描执行无报错、无 .omx-optimize-btn、无 __omnimuxPromptOptimizer。

| 检查 | 结果 |
|---|---|
| 产物内 omx-optimize / OptimizeButton / promptOptimize / __omnimuxPromptOptimizer | 0 处 |
| client/index.js 槽位注册与桥挂载 | 已移除 |
| locales.js 中英 promptOptimize.* 六条 | 已移除 |
| apply.js 路由注册 + provide | 已移除 |
| 两个 prompt-optimizer 目录、devin.zh.json、QA 脚本、文案文档、两个历史规格 | 已删除 |
| apply.test.js / http-routes.test.js 同步 | 0 残留 |
| ego 执行 bundles（file:// 加载 + apply 槽位扫描） | hasOptimizeBtn:false, hasOptimizerGlobal:false |

截图：/tmp/qa3026/proof.png（本目录同步 proof.png）
