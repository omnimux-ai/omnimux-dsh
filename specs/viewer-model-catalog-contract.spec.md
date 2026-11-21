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

## 旧标准变更

以下既有测试断言因本次契约清理需要改写；原断言锁定了旧的 fallback / 固定参数行为，新实现改为 catalog-only 契约。

- `plugins/omnimux-viewer/src/media-viewer/gpt-image-gateway-3071.e2e.test.js` :: `image channel switch retains ratio and narrows standard resolution/batch without widening`
  - 原断言：目录请求固定返回 503，依赖 `DEFAULT_FALLBACK_CATALOG` 的 gpt/seedream 参数域，并断言标准线路把 batch 收窄到 1。
  - 必须改的理由：目录失败不再加载本地 fallback；batch 是本地任务策略 `[1,2,4]`，不再由 gateway `n`/channel 约束收窄。
  - 新期望证据：测试改为返回 catalog fixture，断言标准/经济线路切换后比例、清晰度保留，batch 保持用户选择的 4，目录失败场景由独立的 no-cost 测试覆盖。
- `plugins/omnimux-viewer/src/media-viewer/media-comment-edit.e2e.test.js` :: `1. 契约自适应：通用图像模型缺省 operations 时提供图片编辑操作兜底`
  - 原断言：缺省 `operations` 的模型由 `operationsOf()` 伪造至少 text_to_image + image_edit。
  - 必须改的理由：生产代码删除通用伪造操作，无法在无契约时猜测能力。
  - 新期望证据：测试模型显式提供 operations，并新增 `operationsOf({id:'gateway-only'}, 'image')` 为空断言。
- `plugins/omnimux-viewer/src/media-viewer/media-config-controls.e2e.test.js` :: `Step 5: MediaConfigControls.jsx 文案白名单与 DOM 结构契约`
  - 原断言：源码必须直接出现 `<span>{imageBatch}</span>` 与固定四段式摘要字符串。
  - 必须改的理由：参数摘要按模型实际存在的字段动态拼接，避免缺失 aspectRatio/resolution 时渲染空值。
  - 新期望证据：改为断言摘要由 imageOpMode/imageAspect/imageRes/imageBatch 生成，且张数不带“张”字后缀。
- `plugins/omnimux-viewer/src/media-viewer/media-viewer-composer.test.js` :: `supplies structured cascade models with brand -> model -> channel`
  - 原断言：测试 fixture 使用旧别名 `seedance-2.0`。
  - 必须改的理由：生产投影不再改写 canonical id，`seedance-2-0` 必须原样进入目录和请求。
  - 新期望证据：断言 canonical `seedance-2-0` 及其默认 standard 线路。
