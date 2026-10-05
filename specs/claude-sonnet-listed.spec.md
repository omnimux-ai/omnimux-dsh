# spec: claude-sonnet-4-6 操作上架 (listed)

## 背景
PR #3086 已注册 claude-sonnet-4-6 的 canonical 契约与畅享版渠道组，并把模型 ID 放进画布 text 白名单。
但 chat / vision_chat 两个 operation 的 research 状态为 draft，按「verified 才上架」规则，模型在画布清单中不可见（Dev 实测：Google 品牌出现畅享版，Anthropic 品牌与 Claude 模型缺失）。

## 实测证据（2026-10-05，token id 45，生产网关 api.omnimux.ai）
- existence: GET /v1/models → 200，claude-sonnet-4-6 在列
- chat minimal: POST /v1/chat/completions → 200，1440ms，id chatcmpl-req_vrtx_011CfiPiyWDMENUoDzjrYwaF，usage 15+5=20 tokens，content "pong"
- vision_chat minimal: 同端点带 1x1 PNG image_url → 200，2565ms，id chatcmpl-req_vrtx_011CfiPmNi33kpeF5oJ33tB3，usage 21+6=27 tokens，content "**Pink**"
- 用户已授权本次付费级真实生成验证。

## 改动范围
1. `plugins/omnimux/src/catalog/specs/text-models.yaml`：claude-sonnet-4-6 的 chat、vision_chat 两个 operation 的 research.status 由 draft 改为 verified，docUrl 指向新证据文档，verifiedAt=2026-10-05。
2. 新增证据文档 docs/evidence/2026-10-05-model-claude-sonnet-4-6-chat.md 与 ...-vision_chat.md。
3. listedOperations 将由 24 → 26（+2）；受影响断言按需更新。

## 验收
- pnpm verify:model-contracts 全绿
- pnpm verify:cross-plugin-models 全绿
- Claude Sonnet 4.6 出现在画布文本节点 Anthropic 品牌下，含标准版/畅享版两条渠道
