# 移除重复的快速填充提供方选择器（Issue #3995）

## 背景

「使用自己的 Key」里「API 提供商」chip 组与「快速填充提供方」下拉都用于选择同一 provider（如 OpenAI），功能完全重复，用户困惑该点哪个。

## 目标

- 删除「快速填充提供方」字段及其 DropdownSelect、locale 文案、CSS id 规则、QA 断言。
- 保留 API 提供商 chip 组作为唯一厂商入口；点击后仍自动带出 endpoint 与模型。
- 继续流程、保存协议不变。

## 非目标

- 不改 provider 数据、BYOK 保存协议与其它表单字段。

## 假设

- 快速填充下拉只绑定同一 provider，不承载额外预设参数；删除不减少能力。

## 证伪方式

- `grep runtime.quickFill / omnimux-key-quick-fill TextKeyPanel.jsx` 若仍有命中，重复入口未移除。
- QA 切换 provider 后 endpoint/model 仍更新，则能力未丢失。

## 验收

- 页面只有一组 API 提供商 chip；选择后 API Key/Base URL/模型流程不变。
