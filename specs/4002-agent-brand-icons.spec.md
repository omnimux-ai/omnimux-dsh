# 本地 Agent 卡片品牌图标（Issue #4002）

## 背景

CLI 卡片用 `name[0]` 的 C/K/Q 字母占位，缺少品牌识别度。

## 目标

- 新增内联 SVG 品牌图标：Claude Code（Claude Code 像素标）、Codex（OpenAI 标志）、Kimi（K 标）、Qwen（六边形标），按 agent.id 映射。
- 未知 CLI 回退首字母；图标不依赖网络资源。
- 深色主题下保持可见（品牌色/currentColor）。

## 非目标

- 不改 CLI 扫描/登录/模型接口；不引入外部图片请求。

## 假设

- agent.id 稳定为 claude/codex/kimi/qwen；新增 agent 时回退字母。
- Simple Icons（CC0）与内联 OpenAI 标志可作为品牌标识。

## 证伪方式

- 截图 `agent-selected-continue.png`：Codex 卡片若仍显示 `C` 字母而非 OpenAI 图形，则图标未生效。
- 未知 id 若图标为空且无字母回退，则 fallback 不成立。

## 验收

- 四张卡片分别显示 Claude/OpenAI/Kimi/Qwen 品牌图标；未知回退首字母。
