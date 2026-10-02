# QA 实测证据 · Issue #2972（会话栏「自动」面板裁剪修复 + 纯文本触发器）

## 环境
- ego-browser 真实浏览器 + 产品 harness（`extension/tests/harness` vite build，`frame.html?mode=float&theme=dark&width=420`）
- 静态站点 `python3 -m http.server` 提供 `/ext/bridge-config` modelGroups 兜底数据

## 验证记录（DOM 探测 + computed style + 截图）
| 项 | 证据 |
|---|---|
| 点击「自动」→ 模型面板渲染并可见（dialog + switch + 说明 + listbox） | docs/evidence/2972/panel-open-auto.png；DOM snapshot 含 `dialog "模型"`、`switch "自动"` |
| `.amp-wrap` 计算样式 `overflow: visible`（覆盖 `.composer-actions-start > span` 的 overflow:hidden 裁剪） | page.evaluate PROBE：`wrapOverflow: "visible"` |
| `.amp-trigger` 计算样式 `borderTopWidth: 0px`、background 透明（纯文本触发器，无胶囊） | PROBE：`borderTopWidth: "0px"`、`background: "rgba(0,0,0,0)"` |
| 开关 OFF → 模型列表 6 行（gpt/grok 各 3），副标题按 PM 字典渲染（DOM 逐字：旗舰通用模型/通用模型/代码生成模型/通用对话模型） | docs/evidence/2972/panel-manual-list.png；DOM 行数据比对 |
| 点选 GPT-5.5 → 面板收起、触发器显示「GPT-5.5 ⌄」文本+图标+chevron | docs/evidence/2972/trigger-manual-gpt55.png；DOM snapshot |
| 列表兜底失败态 | 未提供数据时显示「模型列表暂不可用」（空态文案） |

## 结论
裁剪修复生效（面板不再被 overflow:hidden 吃掉）；触发器已去胶囊，纯文本形态符合 PM 核定（PM_SIGN_OFF: PASS）。
