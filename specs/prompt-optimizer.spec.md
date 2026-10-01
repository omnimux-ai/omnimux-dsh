# Spec: 会话输入框「优化提示词」入口（Jev 模板匹配）

## 1. 目标与边界

在会话输入框新增一个图标按钮：点击后对当前草稿执行「模板匹配 + 生成」，完成后**直接替换输入框内容**，用户自行决定是否发送。无任何预览浮层、无任何命中徽标/胶囊（用户已明令禁止多余元素）。

非目标：不做模板管理 UI、不做历史记录、不做多模板并列推荐。

## 2. 已拍板决策（不可漂移）

| 项 | 决策 |
|---|---|
| 入口 | `conversation.input.right` slot（宿主渲染序 `input.right` → `input.model`，即模型选择器左侧） |
| 匹配引擎 | TypeSafe Jev `jev-latest`，**官方直连** `POST https://api.typesafe.ai/v1/systemone` |
| 密钥 | `JEV_API_KEY`：env → ctx credentials → `~/.dsh/.credentials.yaml` 三级解析；绝不进 client bundle |
| 模板库 | Devin 快捷指令 20 模板 + `generic-optimize` 兜底；资产位于 `plugins/omnimux/assets/prompt-templates/devin.zh.json` |
| 兜底 | Jev 裁决 `generic-optimize` 或命中概率 < 0.30 → 通用优化模板 |
| 填充方式 | A. 机械回填：用户原文替换首个占位符，其余 `[槽位]` 保留待补全（零额外调用、结果确定） |
| 运行反馈 | running = 图标 spinner + 禁用重入；成功后无徽标；失败仅 toast |
| 文案 | 以 `docs/product/prompt-optimizer-copy.md`（PM 终审签发）为唯一白名单 |

## 3. 状态机

```
idle ──点击(draft 非空)──▶ running ──成功──▶ idle(草稿已替换+聚焦)
                            │
                            └──失败──▶ idle + toast「优化失败，请重试」
idle 附加态：draft 为空 → disabled；JEV_API_KEY 缺失 → disabled + tooltip「配置 API Key 后可用」
```

- running 态禁重入；请求 30s 超时按失败处理。
- 替换成功后 `focusComposerEditor({preventScroll:true})`，光标回到输入框。

## 4. 数据流与接缝

```
OptimizeButton (client, conversation.input.right)
  → window.__omnimuxPromptOptimizer.optimize(draft)      [client↔host 桥]
  → promptOptimizer.evaluate(text)                      [host 服务，ctx.provide]
      ├─ Jev choice 裁决（criteria=21 候选，instructions 见实现）
      └─ 模板填充（首个 `[…]` 占位符 ← 用户原文）
  → __omnimuxComposerActions.setDraft(prompt)            [既有草稿桥回执]
```

- 读草稿：`composer-quick-shortcuts/dom.js` 的 `readDraft()`（getDraft + DOM 兜底）。
- 写草稿：`writeDraft(text)` 布尔回执；false → 失败 toast，不静默。

## 5. 文件面

| 层 | 路径 |
|---|---|
| host 服务 | `plugins/omnimux/src/prompt-optimizer/{typesafe-client,templates,optimize,mount}.js` |
| 模板资产 | `plugins/omnimux/assets/prompt-templates/devin.zh.json` |
| client UI | `plugins/omnimux/src/client/prompt-optimizer/{OptimizeButton.jsx,optimize-bridge.js,styles.js}` |
| 注册 | `plugins/omnimux/src/client/index.js`（slot `conversation.input.right`）、`plugins/omnimux/src/host/apply.js`（`ctx.provide('promptOptimizer')`） |
| i18n | `plugins/omnimux/src/client/locales.js`（`promptOptimize.*`，仅白名单内文案） |
| 配置 | `dsh.manifest.json` 增可选 `promptOptimizer.jevApiKey`/`enabled` 字段 |
| 测试 | `optimize.test.js`、`typesafe-client.test.js`、`OptimizeButton.test.jsx`/`.test.js`、slot 注册断言 |

## 6. 验收标准（AC）

- AC-1 输入「登录接口偶尔报 500…」点击图标 → running → 输入框替换为「排查生产环境问题」模板化提示词。
- AC-2 空草稿不可点；running 中不可重入；替换后可直接编辑与发送。
- AC-3 泛化输入（如「帮我把这段写得更清楚一点」）→ generic-optimize 兜底模板。
- AC-4 无 JEV_API_KEY → 按钮 disabled + tooltip「配置 API Key 后可用」，零报错。
- AC-5 失败路径（网络错误/超时）→ toast「优化失败，请重试」，草稿不变。
- AC-6 相关单测全绿；guard-ui-design/UI04/UI11/verify-product-baseline 零违规。
- AC-7 真机截图验收：默认/running/完成三态，符合 design.md。

## 7. 风险与降级

- TypeSafe 429/529：客户端 toast 失败，不重试（防止误触连击产生重复计费）。
- Jev 延迟 ~1.5s：可接受（按钮有明确 running 态）；不设缓存（同一草稿重复点击成本由用户承担）。
- 模板资产缺失或损坏 → 功能降级为按钮禁用（启动期校验）。
