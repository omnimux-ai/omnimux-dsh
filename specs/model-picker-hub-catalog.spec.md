# 会话模型选择器 · 动态中枢已上架目录（Issue #2136）

## 目标
会话输入区「模型」面板只展示执行中枢 `modelCatalog` 的 **video / image 已上架桶**，禁止静态硬编码假清单作为列表真源；本地仅可覆盖展示文案，并提供带指纹的客户端缓存。

## 产品基线
- 新用户机器：无开发机私有服务；目录来自本机 Host 中枢已加载契约。
- 中枢未就绪且无缓存：空列表 + 不可用提示，不得回退假 Seedance 清单。

## 成功标准
1. 列表 id 集合 ⊆ 中枢 `catalog.video` / `catalog.image`（listed 投影）；未 listed 的 `seedance-2-0-fast` / `seedance-2-0-mini` / 无契约的 `seedance-2-0-mini-trial` 不得出现。
2. `MODEL_METADATA_PRESETS` 仅 enrichment：不得因 preset 新增 id。
3. 成功拉取后写入 `localStorage` 缓存（含 fingerprint + 时间戳）；TTL 内可秒开；fingerprint 变化或目录更新事件触发重载。
4. 拉取失败：有缓存则继续展示缓存；无缓存则空列表，源码中不得再有 `DEFAULT_MODEL_CATALOG` 作为初始列表。
5. 单测锁定：无并集 merge、有 projectListedCatalog / 缓存读写、preset 不创造 id。

## 范围
- 改：`plugins/omnimux-market/src/client/model-picker.js`、`model-picker.test.js`
- 不改：中枢 listed 门禁、画布节点选择器（另有 catalog seam）

## 边界
- 总是：列表真源 = 中枢已上架桶；失败闭门（无假清单）。
- 先问：改 TTL 策略、改 Host getModelCatalog 契约形状。
- 绝不：把 unlisted / draft 模型塞进会话面板。
