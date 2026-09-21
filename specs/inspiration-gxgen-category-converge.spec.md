# 规格：灵感社区分类收敛为 gxgen 官方 18 行业（Issue #2507）

## 目标（Objective）

灵感社区云端 `category` 当前混入商品形态（`digital` / `physical`）与源站原名，精确筛选对不上官方行业。本轮把写入、下拉、存量回写收敛到 gxgen 官方 18 个行业 id。

用户：浏览灵感社区的人；运维：用本机中枢回写云端分类的管理员。

成功：下拉固定「全部」+ 18 个中文行业；筛选参数发官方 id；新导入写入官方 id；存量脚本默认只读，apply 才 PATCH 已变条目。

新用户基线：未登录或云端失败时，分类下拉仍渲染「全部」+ 18 个中文名；筛选结果可为空，页面不报错、不依赖开发机私有状态。不新增商品形态筛选项。

## 命令（Commands）

```bash
cd /Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/inspiration-gxgen-category-converge
pnpm --filter omnimux-inspiration test
node --test scripts/import-gxgen-inspirations.test.mjs
node --test scripts/rewrite-inspiration-categories.test.mjs
node --test plugins/omnimux/src/official/inspiration-http.test.js
git diff --check
```

存量回写（工程师阶段只实现与单测，不对生产云端真实 PATCH）：

```bash
node scripts/rewrite-inspiration-categories.mjs
node scripts/rewrite-inspiration-categories.mjs --apply --base http://127.0.0.1:45120
```

## 项目结构（Project Structure）

| 路径 | 职责 |
| --- | --- |
| `plugins/omnimux-inspiration/src/gxgen-category-map.js` | 单一真源：`OFFICIAL_CATEGORIES`、`normalizeCategory`、`isOfficialCategoryId` |
| `plugins/omnimux-inspiration/src/gxgen-category-map.test.js` | 对照表与别名/形态/tags 推断单测 |
| `scripts/import-gxgen-inspirations.mjs` | `extractCategory` 全部候选走 `normalizeCategory` |
| `scripts/import-gxgen-inspirations.test.mjs` | 导入映射单测 |
| `scripts/rewrite-inspiration-categories.mjs` | 存量 dry-run / apply |
| `scripts/rewrite-inspiration-categories.test.mjs` | 回写脚本单测 |
| `plugins/omnimux-inspiration/src/client/feed-helpers.js` | 固定 18 项下拉，不再吃 `/categories` 聚合 |
| `plugins/omnimux-inspiration/src/client/InspirationSection.jsx` | 下拉不请求动态分类 |
| `plugins/omnimux-inspiration/src/client/locales.js` | 18 行业中英文案；`category.all` 恰为「全部」 |
| `plugins/omnimux-inspiration/src/client/category-options.test.js` | 下拉与文案门禁 |
| `plugins/omnimux-inspiration/src/client/inspiration-category.e2e.test.js` | 渲染门禁：全部 + 18 中文，不依赖 `/categories` |

中枢 `GET /omnimux/inspiration/categories` 可保留，下拉不依赖它。Hub 不 import 本插件对照表。

## 代码风格（Code Style）

纯 ESM、具名导出、单引号、无分号。对照表零依赖，供 scripts 与 client 复用。

```js
export const OFFICIAL_CATEGORIES = [
  { id: 'baby_parenting', zh: '母婴亲子', en: 'Baby & Parenting' },
  // … sort_order 1–17，最后 other
]

export function normalizeCategory(raw, options = {}) {
  // trim + 大小写不敏感别名 → 官方 id；形态走 tags 推断，否则 other
}

export function buildCategoryFilterOptions(translate) {
  return [
    { value: '', label: translate('category.all') },
    ...OFFICIAL_CATEGORIES.map((row) => ({
      value: row.id,
      label: translate(`category.${row.id}`),
    })),
  ]
}
```

`extractCategory` 收集 `category_zh/en`、`industry`、源站 category、`assets.categories[]`、`product_type`，全部 `normalizeCategory`；优先行业 id，形态只作 tags 推断输入。

## 测试策略（Testing Strategy）

框架：Node test runner。不测生产 PATCH。

- 对照表：官方 18 项顺序；id/中文/英文回映射；所列源站英文与 genshot 中文别名；`digital`/`physical`/`software`/`service` 非行业；tags 保守推断；`ai_tool`/`mobile_app` 不判数码科技。
- 导入：美妆护肤→`beauty_skincare`；Health & Wellness→`health_wellness`；厨房用品→`home_living`；digital+fitness tags→`fitness_sports`；digital 无行业 tag→`other`。
- 下拉：首项恰为「全部」/「All」；随后 18 个官方 id；中英 locales；门禁正则 `/全部(平台|账号|来源|类型|状态|分类|发布方式)/` 零命中；不请求 `/categories`；未登录/失败仍 19 项；筛选 query 发官方 id。
- 回写：默认 dry-run 零 PATCH；已是官方 id 跳过；变化项 apply 时 `PATCH /omnimux/inspiration/:id` body 仅 `{ category }`；打印 raw→id 计数。

## 边界（Boundaries）

- 总是：对照表单一真源；下拉固定 18 行业；导入与回写走 `normalizeCategory`；默认 dry-run；提交前跑上列测试；文案走 locales。
- 先问：新增形态筛选项、改云端 schema、给 Hub 增加独立 `product_type` 字段、对生产云端真实 PATCH。
- 绝不：把 `digital`/`physical` 当行业写入或展示；下拉首项写成「全部分类」；工程师阶段对生产云端 PATCH；改官方 DSH；改主仓。

## 成功标准（Success Criteria）

1. `OFFICIAL_CATEGORIES` 恰好 18 项，顺序与 gxgen `sort_order` 一致。
2. `normalizeCategory` 覆盖规格所列别名；形态 + tags 规则符合上表。
3. 导入写入官方 id，五个指定用例通过。
4. 灵感社区分类下拉：`[{ value:'', label: 全部 }, …18 官方 id]`，筛选发官方 id。
5. 未登录/云端失败：下拉仍 全部+18 中文，不抛错。
6. 回写脚本默认不写；`--apply` 只 PATCH 变化项且幂等。
7. 指定测试全绿。

## 假设（Assumptions）

1. 云端列表精确匹配 `category`，筛选必须发官方 id 而非中文名。
2. 本轮不回写本地库、不改 Hub 聚合接口契约。
3. 回写走已登录管理员的本机中枢（默认 `http://127.0.0.1:45120`），无 Origin 的 Node fetch 可通过 `assertLocalWrite`。
4. 存量 tags 可供形态条目做保守行业推断。

## 开放问题（Open Questions）

无。Issue 已冻结词表、别名、形态规则与「工程师阶段不真实 PATCH」。
