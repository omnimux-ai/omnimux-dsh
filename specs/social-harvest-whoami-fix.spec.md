# 支持 parseEnvelope 解析 whoami 登录探针返回的单对象信封规格

- Issue: #2471
- 日期: 2026-09-20
- 目标: 允许 `parseEnvelope` 解析 OpenCLI 官方标准的 `whoami` 单对象响应（例如 `{ logged_in: true, site: 'tiktok', ... }`），避免将其误判为非法载荷。

## 1. 根因分析

OpenCLI 的 `whoami` 命令设计为单记录输出，JSON 格式为单层对象：
```json
{
  "logged_in": true,
  "site": "tiktok",
  "sec_uid": "MS4wLjABAAAA...",
  "username": "geminix56",
  "nickname": "GeminiX"
}
```
现有的 `parseEnvelope` 仅支持纯数组 `[...]` 或包含常见集合键（如 `data: [...]`, `items: [...]`）的字典。
当遇到 `whoami` 返回的合法对象时，由于没有数组字段，直接抛出 `HARVEST_BAD_PAYLOAD`，导致应用认为该平台探针异常并显示为「未登录」。

## 2. 修复方案

在 `plugins/omnimux-social-harvest/src/core/envelope.js` 中：
在检查完常见数组 key 后，如果对象满足：
`envelope.logged_in !== undefined`
则将其包装为单元素数组 `{ kind: 'array', items: [envelope] }` 返回。
同时补充单测，验证包含 `logged_in: true` 的单对象可被正确解析为含 1 个元素的数组。

## 3. 验收标准

1. `envelope.test.js` 新增单测，包含 `logged_in` 的单对象成功解析为 `kind: 'array'`。
2. 58 项单元测试、14 项 E2E 测试全部通过。
3. 门禁全绿：`test:agent-tools`、`verify:product-baseline`。
4. 合入物化到 Dev 后，TikTok、Instagram、YouTube、Twitter、Flow 等已登录平台在前端工作台正确显示绿色「已连接」。
