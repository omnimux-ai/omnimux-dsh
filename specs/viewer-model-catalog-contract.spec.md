# 图像生成插件模型目录契约清理

## 背景

viewer 的 `DEFAULT_FALLBACK_CATALOG` 与 GPT Image 2.5 参数兜底已经偏离 `/omnimux/model-catalog`，会在接口失败时显示已下架模型，并为缺少字段的模型生成无效参数控件。

## 目标

1. viewer 只消费 `/omnimux/model-catalog`；目录失败/为空时显示不可用和重试，不用本地模型回退。
2. 图像参数只渲染模型 `parameters` 实际存在的字段；批量张数作为明确的本地任务策略。
3. 删除 `operationsOf()` 对缺失 operations 的伪造图像操作兜底。
4. 监听 `omnimux:model-catalog-updated`，保留仍有效的用户选择，按 catalog `defaults` 切换。
5. 保持现有生成、历史、预览行为不受影响。

## 非目标

- 不发起真实模型生成。
- 不修改 gateway 或 hub 的 catalog 生成规则。
- 不改变 viewer 的图片/视频任务协议。

## 验收

- `seedream-5-5` 显示 `Seedream 5.5`、品牌 `Seedream`；不显示比例控件。
- `muse-image` 不显示清晰度控件；`nano-banana-2-lite` 不显示比例控件。
- 目录请求失败/空数组时无旧模型、生成禁用、重试可见。
- 目录更新时保留 prompt/有效模型选择；失效模型按 defaults 回退。
- `npm test`、`npm run typecheck`、`npm run build`、`npm run check` 通过。
