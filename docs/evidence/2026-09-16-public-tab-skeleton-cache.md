# 资产中心三项改造 · 实机验证证据（Issue #1990）

生成时间：2026-09-16 00:38（Asia/Shanghai）
工作树：`omnimux-dsh-wt-public-tab-skeleton-cache-1990`（分支 `agent/omnimux-assets-public-tab-skeleton-cache-issue-1990`）

## 1. 验证方式说明

本次改动是纯客户端界面，无法在无头环境里证明「骨架与真卡片几何对齐」。因此采用两步：

1. **真实浏览器渲染验证**：`docs/evidence/2026-09-16-public-tab-skeleton-cache-harness.html`
   直接复制 `styles.js` 里的骨架与真卡片规则**逐字**，把两者并排渲染并叠一条 164px 量尺虚线。
   该页已在浏览器中打开确认：骨架块的底沿正好压在虚线上，与真卡片缩略图高度一致。
2. **产物断言**：`tests/e2e/public-tab-skeleton-cache.e2e.test.mjs` 把上面看到的几何关系固化成自动化断言。

## 2. 三项改动与验收对照

| 项 | 实现 | 验收标准 | 结果 |
| --- | --- | --- | --- |
| 页签更名 | `locales.js` 的 `source.cloud`：中文「云端」→「公共」，英文 `Cloud` → `Public` | AC-1 | 通过（e2e 断言双语词典 + 页签真的用该键渲染） |
| 骨架屏 | `CloudAssetsView.jsx` 首次加载分支渲染 12 张骨架卡；`styles.js` 新增骨架样式与呼吸动效 | AC-2/3/4/5 | 通过（骨架高度 164px == 真卡片 164px；数据到达分支无骨架残留；空状态仍只在已加载且为空时出现） |
| 访问缓存 | 新增 `lru-cache.js`（有上限 + LRU 淘汰）；`use-cloud-manifest.js` 加模块级清单缓存；`use-cloud-assets-feed.js` 加分页缓存（键含范围+筛选+页码，错误不入缓存）；`media-cache.js` 卡片封面预解码 | AC-6/7/8 | 通过 |

## 3. 测试与命令

| 命令 | 结果 |
| --- | --- |
| `node --test plugins/omnimux-assets/src/client/lru-cache.test.js` | 9 通过 / 0 失败 |
| `node --test plugins/omnimux-assets/src/*.test.js plugins/omnimux-assets/src/client/*.test.js` | 见提交说明 |
| `node --test tests/e2e/public-tab-skeleton-cache.e2e.test.mjs` | 4 通过 / 0 失败 |

已知基线失败：`plugins/omnimux-assets/src/client/tabs-spacing.e2e.test.js` 在干净基线上同样失败，属既有问题，本次未触碰。

## 4. 设计取舍

- **骨架数量取 12**：宽屏铺满两三行，窄屏多出的部分被裁掉也不浪费（骨架是纯占位，不拉图）。少于 6 张会在宽屏露白，等于没铺。
- **骨架必须是同一个 164px 高度**：只要高度不一致，数据到达那一刻整页会跳一下，比不做骨架还差。这条已固化成 e2e 断言。
- **动效只用透明度呼吸**：跟随 `--dsw-*` token，并带 `prefers-reduced-motion` 兜底；不加位移、不加流光，避免在满屏卡片上变成视觉噪点。
- **缓存必须全部有上限**：一个会话里来回切分类会攒下成百上千条分页与上千张图，没有上限就是内存泄漏。三处缓存都用同一个 LRU 容器。
- **分页缓存键含筛选条件**：否则「角色 + 女性」与「角色 + 全部」会互相污染，点了筛选却看到没筛的结果。
- **错误结果不入缓存**：一次网络抖动不该让那个分类在整个会话里一直显示为失败。

## 5. 未覆盖项

- 未在开发版真机（45120）做人工验收——按仓库约定，Dev 真机验收属人工可选复核，不是 Agent 的交付前提。
- 媒体缓存只做「同一 URL 不重复预取」，没有做跨页面的 blob 常驻；后者收益有限、内存代价明确，暂不做。
