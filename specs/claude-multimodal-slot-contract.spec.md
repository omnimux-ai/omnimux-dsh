# spec: 补齐 Claude Sonnet 4.6 多模态契约与空态卡槽展示门禁

## 背景
用户在创作画布使用 Claude Sonnet 4.6 时，发现节点在空态下无法看到多模态素材卡槽与「+」添加按钮，误以为该模型不支持图片输入。
经深入排查根因：
1. **中枢模型契约残缺**：`plugins/omnimux/src/catalog/specs/text-models.yaml` 中，`claude-sonnet-4-6` 的 `chat` 与 `vision_chat` 操作的 `prompt` 槽位漏掉了 `valueSources: ["local_field", "upstream_output"]` 与 `composition` 声明，未对齐 `gemini-3.8-flash` 规范。
2. **文本节点卡槽解析绕过**：`plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/index.tsx` 中，对新版本节点（`currentInputs === true`），只要带有默认或历史残留的 `preferredOperationId === 'chat'`，便直接取用 `chat`，跳过了本该优先匹配多模态 operation 的 `resolveSlotOperation` 判定；同时 `canvasSlotRecompute.ts` 中的 `chat` 自愈分支受制于 `!currentVersion`，导致文本节点空态卡槽被错误折叠为 `preset: none`。
3. **缺乏自动化防线**：缺乏机械门禁核验 `cordis.patch.yml` 中声明了 `image` 输入的多模态文本模型在 `text-models.yaml` 及画布空态下的卡槽完整性。

## 目标与改动
1. **补齐完整多模态上游契约**：
   - 在 `plugins/omnimux/src/catalog/specs/text-models.yaml` 中，将 `claude-sonnet-4-6` 的 `chat` 与 `vision_chat` 操作的 prompt 槽位声明完整对齐 `gemini-3.8-flash`（补充 `valueSources` 与 `composition`）。
2. **空态默认露出卡槽**：
   - 调整 `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/index.tsx`：文本节点由于没有 operation 切换 UI，空态及默认 `chat` 不得锁死卡槽，必须由 `resolveSlotOperation` 为多模态模型派生出 `vision_chat` 卡槽与「+ 添加」按钮。
   - 调整 `plugins/omnimux-workflow/src/shared/graph/canvasSlotRecompute.ts`：放宽 `outputType === 'text' && params.operation === 'chat'` 的自愈条件，确保所有文本节点切换到多模态模型时均能恢复多模态卡槽。
3. **增加自动化契约完整性校验**：
   - 新增 `scripts/verify-multimodal-contract-completeness.mjs` 及测试 `scripts/verify-multimodal-contract-completeness.test.mjs`；
   - 强制校验：凡是在 `cordis.patch.yml` 声明了图片输入的多模态文本模型，必须在 `text-models.yaml` 具备完备的多模态 operation 契约，且在画布空态下 `resolveSlotOperation` 必须派生多模态卡槽（`addButton: true` 且 `preset !== 'none'`），彻底消灭伪装成纯文本模型的残缺契约。
   - 注册至 `package.json` 与 `scripts/governance-manifest.json`。

## 验收标准
- `pnpm verify:multimodal-contracts` 全绿通过。
- `pnpm verify:model-contracts` 全绿通过。
- `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/textSlotAcceptance.test.mjs` 及相关单元测试全绿通过。
- 文本节点选中 Claude Sonnet 4.6 在空态下立即可见「参考素材」卡槽和「+」添加按钮。
