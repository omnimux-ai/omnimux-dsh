# 规格：下线输入框「优化提示词」（Issue #3026）

## 背景
用户裁定不保留两套提示词增强。输入框「优化提示词」（#2895 / PR #2901）的 21 套 Devin 开发场景模板，已并入个人插件「增强提示词」的「按场景套模板」模式（由默认模型选模板并填空，无需专用密钥）。OmniMux 侧整体移除。

## 用户旅程
1. 打开 OmniMux 会话输入框：模型选择器左侧不再出现「优化提示词」图标；其他输入框按钮（快捷方式、附件、模型选择）位置与行为不变。
2. 需要提示词增强时，使用输入框旁「增强提示词」星形按钮（个人插件，不在本仓）。

## 移除清单
- 客户端：`plugins/omnimux/src/client/prompt-optimizer/` 全部；`client/index.js` 中 `conversation.input.right` 的 `omnimux-prompt-optimizer` 注册与 `installOptimizeBridge(ctx)`；`locales.js` 中 `promptOptimize.*` 中英各 3 条
- 宿主：`plugins/omnimux/src/prompt-optimizer/` 全部；`host/apply.js` 中 `registerPromptOptimizerRoutes` 与 `mountPromptOptimizer`
- 资产：`plugins/omnimux/assets/prompt-templates/devin.zh.json`
- 脚本/文档/规格：`scripts/optimize-button-qa.mjs` 及其 governance 登记、`docs/product/prompt-optimizer-copy.md`、`specs/prompt-optimizer.spec.md`、`specs/prompt-optimizer-btn-fix.spec.md`
- 测试同步：`host/apply.test.js` provided 清单去掉 `promptOptimizer`；`auth/http-routes.test.js` 路由清单去掉 `exact:/omnimux/prompt-optimizer`

## 验收标准
- A1 客户端不再向 `conversation.input.right` 注册 `omnimux-prompt-optimizer`，不再挂 `window.__omnimuxPromptOptimizer`
- A2 宿主不再注册 `/omnimux/prompt-optimizer` 路由，不再 `provide('promptOptimizer')`
- A3 仓库源码、脚本、文档中无 `prompt-optimizer` / `promptOptimize` / `devin.zh` / `JEV_API_KEY` 残留（`.agent-reports/` 历史证据除外）
- A4 构建后的客户端包不含「优化提示词」按钮代码；真实浏览器中输入框右侧无该图标，其余控件正常
- A5 `pnpm --filter omnimux test` 无新增失败；`pnpm check:boundaries`、反冗余检查通过
