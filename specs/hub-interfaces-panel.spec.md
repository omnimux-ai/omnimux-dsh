---
title: "执行中枢接口全景面板（补全工具/账号/发布接口 + 黑白主题）"
id: "spec-hub-interfaces-panel"
type: "acceptance-spec"
status: "active"
date: "2026-09-14"
authors: ["agent"]
issue: 1712
---

# 执行中枢接口全景面板

把已交付的「模型目录面板」升级为覆盖**四类接口**的执行中枢接口全景面板，并按 `design.md` 全面重构为黑白中性双主题。

## 1. 范围

| 交付项 | 说明 |
| --- | --- |
| 生成脚本 | `scripts/generate-hub-interfaces-html.mjs`：动态汇总四类接口数据并产出单文件页面；移除旧脚本 `scripts/generate-model-catalog-html.mjs`。 |
| 持久化页面 | `docs/tools/hub-interfaces.html`：自包含单文件，四段式信息架构；移除旧页面 `docs/tools/model-catalog.html`。 |
| 四类接口数据源（全部动态、禁止手工维护） | ① 模型能力：`plugins/omnimux/src/catalog/contract/load.js` + `dispositions.json`；② 智能体工具：`node scripts/verify-plugin-agent-tools.mjs` 的静态扫描输出（治理门禁同源），按插件分组；③ 账号接入平台：账号插件中的平台标识真源；④ 发布通道：发布插件的投递能力与媒体通道真源。 |
| 视觉重构 | 严格遵循 `design.md`：黑白中性 Token 体系、双主题自适应、32px 控件基准、8/12/16 圆角阶梯、字阶与系统字体栈、严禁高饱和装饰色与紫色/品牌亮蓝滥用。 |
| 注册与清理 | `package.json` 新指令、`AGENTS.md` 登记更新为新路径，删除旧文件与旧指令。 |

## 2. 验收标准

1. 页面四类接口数据与真实来源逐项一致（模型 50 款；智能体工具数量与门禁扫描一致；账号平台与发布通道取自代码真源），页脚注明每类数据的来源文件与生成时间。
2. 视觉符合 `design.md` §3.6「Ink & Paper / Structural Monochrome」：深色底与纸白底双向自适应；主行动点为黑底白字/白底黑字；无紫色、无品牌亮蓝滥用、无高饱和徽章底色。
3. 交互保留并可离线使用：分组浏览、关键词搜索、模态/类别过滤、点击复制标识。
4. `git diff --check` 干净；`node scripts/verify-model-contracts.mjs --strict` 全绿。
5. 真实浏览器验证证据落盘（截图 + 结构化报告），并说明所用命令与端口。

## 3. 非目标

- 不改动任何业务插件源码（仅新增工具脚本、页面与文档登记）。
- 不新增运行时服务；页面为纯静态文件。
