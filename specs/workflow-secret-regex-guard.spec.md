# 规格：创作画布防泄密安全检查规则边界修复 (Issue #2182)

## 1. 背景与业务痛点
用户在创作画布中打开视频、音频、文本等生成节点时，底部模型选择入口全部显示为「暂无兼容模型」，且无法展开选择具体模型。

经过链路排查，根因是：
1. 画布加载时向后台请求能力目录 `/omnimux-workflow/api/capabilities`；
2. 后台在序列化输出响应时，通过 `sendJson` 进行通用防泄密正则检查；
3. `sendJson` 中的正则匹配规则为 `/access_token|sk-[A-Za-z0-9]/`，缺少前置单词边界隔离；
4. 视频模型专线/通道代号如 `seedance-2-0-task-pro` 包含了 `task-pro`（含有 `sk-p`），被误判为命中 `sk-[A-Za-z0-9]`，触发防泄密硬拦截并返回 500 错误；
5. 前端接口失败后降级为空目录，进而使节点模型过滤全部落入零候选状态，呈现「暂无兼容模型」。

## 2. 目标与范围
- 修正 `plugins/omnimux-workflow/src/http/helpers.ts` 中的防泄密正则，补充前置单词边界与长度约束，杜绝合法标识符（如 `task-pro`、`task-xxx`）被误杀。
- 对齐同仓已有防御标准（如 `plugins/omnimux-assets/src/http-routes.js` 与 `plugins/omnimux-assets/src/artifacts.js`）：
  - 判定包含 `access_token` 或以单词边界起始的真实密钥格式 `(?:^|[^A-Za-z0-9])sk-[A-Za-z0-9]{8,}`。
- 保证真正的密钥泄露（如 `sk-abc12345678` 或 `sk-proj-...`）依然能被严格拦截并返回 500。
- 保证 `/omnimux-workflow/api/capabilities` 接口恢复 200 返回，画布文本、图像、视频、音频节点全部能正常获取并呈现模型列表。

## 3. 验收标准
1. **单元测试与防误判测试**：
   - 包含 `task-pro`、`seedance-2-0-task-pro`、普通文本、合法模型配置的 JSON 响应正常通过 `sendJson`，状态码 200，内容完整。
   - 真实伪造密钥（如带有 `sk-1234567890abcdef`）依然被拦截，返回 500 `{ error: 'refused to emit a secret' }`。
2. **接口端到端验收**：
   - `gateway.capabilities()` 序列化输出经 `sendJson` 不再被拦截，HTTP 状态为 200。
   - 前端各节点模型计算（`buildFilteredModelOptions`）能正常产出候选模型，消除「暂无兼容模型」异常。
3. **质量门禁 100% 通过**：
   - 静态扫描、单元测试、TypeScript 类型检查无错误。
