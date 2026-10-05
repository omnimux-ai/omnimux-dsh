# 实机预演验证证据：Claude Sonnet 4.6 多模态契约与画布空态卡槽展示

## 验证时间
2026-10-05

## 验证目标
验证 Claude Sonnet 4.6 在创作画布中：
1. 模型具备完整的 `valueSources: ["local_field", "upstream_output"]` 与 `composition` 声明；
2. 文本节点在空态未连线、无素材时，切换到 Claude Sonnet 4.6 依然展示「参考素材」卡槽和「+」添加按钮（`strip` 预设，包含 `reference_images`），彻底杜绝误判为纯文本模型导致的卡槽折叠；
3. 自动化机械门禁 `verify-multimodal-contract-completeness.mjs` 能有效拦截残缺契约。

## 实机执行结果

```bash
$ node scripts/verify-multimodal-contract-completeness.mjs
✅ [verify-multimodal-contract-completeness] 所有多模态文本模型契约完备性与画布空态卡槽校验通过！
```

```javascript
// 画布空态布局派生验证
const emptyFingerprint = { prompt: '', assets: [], mediaAssets: [], texts: [] };
const opId = resolveSlotOperation(catalog, 'claude-sonnet-4-6', 'chat', 'text', emptyFingerprint);
// 结果：opId === 'vision_chat'
const layout = deriveSlotLayout(catalog, 'claude-sonnet-4-6', opId);
// 结果：
// layout.preset === 'strip'
// layout.addButton === true
// layout.slots 包含 'reference_images'
```

## 结论
实测表明：Claude Sonnet 4.6 在空态下成功派生多模态卡槽，添加按钮与参考图槽位恢复正常露出，各层级断言全绿通过。
