# Issue #2662 规格说明书：商品库与爆款趋势素材深层上下文沉淀、卡槽独占加载与滚动弹顶 Bug 根治

## 一、业务痛点与用户期望
1. **商品库与爆款趋势素材交互未落地**：
   - 当前在商品库点击商品（如“女士高级淡香水”），输入框上方卡槽保留的是旧素材，未加载当前商品主图；爆款趋势同理；
   - **用户期望**：点击任意商品卡片，素材卡槽必须加载当前商品的主图；点击爆款趋势，加载对应视频封面与文件；点击技能（Skill）时清空/移除素材卡槽，因为 Skill 无预设主图。
2. **Agent 深度结构化上下文沉淀**：
   - 过去附件仅传递简单图片 URL，Agent 无法感知商品卖点、价格、规格，以及爆款视频的播放量、分镜脚本与口播拆解；
   - **用户期望**：规范化素材附件的 `metadata` 契约，将实体背后的详尽结构化数据沉淀至上下文，让 Agent 获取真实丰富的领域知识。
3. **严重滚动 Bug（有素材时滚动被固定弹回顶部）**：
   - 当输入框有素材时，页面向下滚动会被瞬间拉回顶部，像弹簧一样无法向下浏览；
   - **根因分析**：`useComposerDocking.js` 在记录 `savedScrollRef.current` 后未在交付当帧清空，导致后续自然滚动触发吸底重新执行布局效果时，读取到旧的 `0` 坐标并强行写回 `scroller.scrollTop = 0`；
   - **用户期望**：彻底切断强行改写视口的逻辑，无论输入框有无素材，自然滚动全程顺畅，绝不弹顶。

---

## 二、素材卡槽加载与深度上下文契约（Material Slot & Context Contract）

| 来源分类 | 素材卡槽加载行为 | Payload 结构 | Agent 深度上下文 `metadata` 规范 |
|---|---|---|---|
| **商品库 (Product)** | 必须加载当前商品主图至卡槽 | `kind: 'product'`<br>`extension: 'PRD'` | 携带 `productId`, `title`, `price`, `category`, `sellingPoints`, `specs`, `images` (图集), `originUrl` |
| **爆款趋势 (Trending)** | 必须加载对应视频封面与文件至卡槽 | `kind: 'inspiration'`<br>`extension: 'MP4'` | 携带 `videoId`, `title`, `cover`, `videoUrl`, `metrics` (播放/点赞/互动率), `breakdown` (分镜/脚本/黄金Hook), `tags` |
| **灵感模板 (Template)** | 必须加载模板封面至卡槽 | `kind: 'inspiration'`<br>`extension: 'TPL'` | 携带 `templateId`, `categorySlug`, `duration`, `workflow` (节点与连线数据), `prompt` |
| **技能 (Skill)** | **必须清空/移除素材卡槽** | 无卡槽附件 (清空) | 激活技能药丸，输入框预填说明请求，不挂载任何假图片 |

---

## 三、滚动防弹顶机制修复规格
1. `useComposerDocking.js` 中，`savedScrollRef.current` 仅在用户主动点击卡片并触发 `pendingApplyRef` 的单帧用于防止聚焦抽动；
2. 一旦 `pendingApplyRef` 执行完毕，**立即执行 `savedScrollRef.current = null`**；
3. 在页面后续的任何滚动监听（`onScroll`）与 `setPlacement('docked')` 切换中，绝对禁止重新对 `scroller.scrollTop` 或 `window.scrollTo` 进行赋值，保持用户手势的绝对滚动自由度。

---

## 四、验收测试用例设计
1. **用例 1（商品卡片点击）**：点击商品卡片，验证素材卡槽加载该商品的主图（previewUrl），metadata 包含价格、卖点、分类；
2. **用例 2（爆款趋势点击）**：点击爆款卡片，验证素材卡槽加载视频封面，metadata 包含指标与分镜；
3. **用例 3（Skill 点击清空卡槽）**：点击 Skill 卡片，验证附件槽被完全清空，无悬挂图片；
4. **用例 4（有素材时滚动防弹顶）**：在卡槽已有素材的情况下，模拟滚动到 500px，断言视口保持在 500px，绝不弹回 0；
5. **用例 5（CDP 实机验收）**：在 Dev App 真实环境中操作商品与视频点击，验证主图精准上屏，向下滚动如丝顺滑。
