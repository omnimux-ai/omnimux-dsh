# 规格说明：修复直连生成渠道 403 分组未识别导致 Failover 失效缺陷

**Issue**: #2866  
**状态**: 实施中  
**范围**: `plugins/omnimux/src/`  

---

## 1. 缺陷表现与根因分析

### 表现
用户在媒体查看器（图像生成）输入提示词后点击立即生成，界面弹出“生成提交失败”，后端报错：
`Adapter openai-compatible failed: {"error":{"code":"","message":"无权访问 nano-banana 分组 (request id: ...)","type":"new_api_error"}}`

### 根因
1. **上游分组映射偏差**：
   `gpt-image-2.5` 的 `standard` 标准版在 `channel-groups.js` 中将 `wireGroup` 配置为 `"default"`，该分组在上游网关绑定了 `nano-banana` 分组，当前 Token 访问返回 403。
2. **Failover 识别盲区（致命）**：
   `channel-classifier.js` 中的 `GROUP_SWITCH_PATTERNS` 正则写死为 `/无权访问该分组/`。当上游返回 `"无权访问 nano-banana 分组"` 时，未能匹配该模式，导致 `hasGroupFailoverEvidence` 返回 `false`，彻底终止了路由规划中的后续可用候选（如 `gpt-image-2.5-economy`、`gpt-image-2.5-pro`），未触发自动容灾换路。

---

## 2. 修复方案

1. **增强分组错误识别正则 (`channel-classifier.js`)**：
   将 `/无权访问该分组/` 扩展为 `/无权访问.*分组/`，全面覆盖任何携带具体分组名（如 `nano-banana`、`default`、`vip`）的 403 权限拒绝响应，使执行中枢能够识别并无缝故障转移至候选渠道。
2. **优化标准版默认路由 (`channel-groups.js`)**：
   将 `gpt-image-2.5` 的 `standard` 标准版的 `wireGroup` 优化为上游实测 200 OK 的官方基线线路（`gpt-image-2.5-economy`），确保首跳直接成功，无需额外容灾重试耗时。

---

## 3. 验收标准
1. `channel-classifier.test.js` 新增针对 `无权访问 nano-banana 分组` 的断言用例并全部通过。
2. 执行 `executeOmnimuxImage` 时能够成功生成并返回图片结果，状态码为 200。
3. 单元测试与 auto-qa-gate 全部通过。
