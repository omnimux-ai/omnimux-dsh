# 规格：修复 creative-presets 词条重名并清理废弃封面 (Issue #3902)

- Issue：https://github.com/omnimux-ai/omnimux-dsh/issues/3902
- 引入缺陷：`86c45c231`（feat(guide): 1:1 复刻首页四大热门卡片样式与高清封面）
- 状态：已确认（用户选择「改名字 + 删废弃封面」）
- 工作树：`.worktrees/guide-presets-name`（分支 `agent/guide-presets-name-issue-3902`）

## 1. 现象

`plugins/omnimux/src/client/session-guide/catalog.js` 里两个卡片词条值相同：

```js
"guide.popular.bulk-create-ads.title": "批量创建广告",
"guide.popular.creative-presets.title": "批量创建广告",   // ← 重复
```

英文侧同样重复（都是 `Bulk Create Ads`）。

## 2. 查证：当前用户看不到这个重复

`POPULAR_STARTERS` 只渲染 4 张卡片：

```js
export const POPULAR_STARTERS = [
  { id: 'marketing-insight', type: 'modal' },
  { id: 'url-to-video', type: 'modal' },
  { id: 'recreate-viral-ads', type: 'modal' },
  { id: 'bulk-create-ads', type: 'modal' },
]
```

`creative-presets` 不在其中；`component.test.js` 也断言 `popularCards.length === 4`。

所以这是**潜在隐患**而非当前可见 bug——若把 `creative-presets` 加回列表，
会出现两张同名卡片。

## 3. 根因

`86c45c231` 做全局替换时把两条词条一起改成了「批量创建广告」：

```diff
-  "guide.popular.bulk-create-ads.title": "创意营销预设",
-  "guide.popular.creative-presets.title": "创意营销预设",
+  "guide.popular.bulk-create-ads.title": "批量创建广告",
+  "guide.popular.creative-presets.title": "批量创建广告",
```

`bulk-create-ads` → 「批量创建广告」是对的；但同一个值被顺手写进了
`creative-presets`，覆盖了它原本来自 #1190 的「创意营销预设」/`Creative Presets`。

## 4. 附带问题：51 KB 废弃封面

`plugins/omnimux-inspiration/src/explore/starter-covers.js` 里
`'creative-presets'` 的内联 base64 封面（解码 38 KB，base64 51 KB）仍在，
但该卡片永不渲染，纯浪费——占灵感页 client bundle 约 2%。

## 5. 用户操作旅程

1. 打开灵感页，热门入门方式区域仍是 4 张卡片。
2. 卡片标题、封面、点击行为与修复前完全一致。
3. 将来若产品决定加入「创意营销预设」卡片，它有自己的名字，不会与「批量创建广告」撞名。

## 6. 期望界面反馈

- 4 张卡片视觉与交互**无任何变化**（这是隐藏修复，不改变当前界面）。
- 灵感页加载的 JS 体积减少约 51 KB。

## 7. 验收标准

| 编号 | 标准 | 验证方式 |
| --- | --- | --- |
| AC-1 | `guide.popular.creative-presets.title` 中英分别为「创意营销预设」/`Creative Presets` | 契约测试 |
| AC-2 | `guide.popular.bulk-create-ads.title` 保持「批量创建广告」/`Bulk Create Ads` | 契约测试 |
| AC-3 | `STARTER_COVER_IMAGES` 只剩 4 个键，不含 `creative-presets` | 契约测试 + 源码扫描 |
| AC-4 | 灵感页 client bundle 相比改动前减小 ≥45 KB | 构建产物字节对比 |
| AC-5 | 4 张热门卡片渲染与点击行为不变 | `component.test.js` 通过 |
| AC-6 | `CreativePresetsModal` 仍可被市场插件导入 | `plugins/omnimux-market/src/presets` 测试 |

## 8. 设计

三处改动：

1. `catalog.js`：`creative-presets` 的中英词条恢复为「创意营销预设」/`Creative Presets`。
2. `starter-covers.js`：删除 `'creative-presets'` 那条内联 base64。
3. `PopularCardCover.jsx`：**保留** `COVER_MAP` 里的
   `'creative-presets': DefaultBatchAdsCover` 作为兜底——将来若把卡片加回
   列表，仍有 SVG 封面可渲染，不会白屏。

## 9. 边界与降级

- `STARTER_COVER_IMAGES['creative-presets']` 缺失时，`PopularCardCover` 走
  `COVER_MAP` 兜底，行为已存在于现有代码（`if (coverSrc && !imgError)` 分支），
  无需新增异常处理。
- 不改 `CreativePresetsModal.jsx` 与其导出，市场插件不受影响。
- 不改其它 4 张卡片的封面与文案。

## 10. 新用户基线

全新安装后打开灵感页，热门入门方式仍显示 4 张卡片，加载更快；
不会出现同名卡片，也不会出现空白封面。

## 11. 非目标

- 不把 `creative-presets` 加回 `POPULAR_STARTERS`（属新增功能，需产品确认）。
- 不改 `CreativePresetsModal.jsx` 与市场插件的预设模块。
- 不动其它 4 张卡片的封面与文案。

## 旧标准变更

无。本任务不修改任何既有测试断言；`component.test.js` 的 4 张卡片断言保持原样。

## 假设

1. `creative-presets` 确实不会被渲染——已被 `POPULAR_STARTERS` 与
   `component.test.js` 的 `length === 4` 双重确认。
2. 删除该内联封面不会影响其它卡片——每张封面按 key 独立取用。
3. `CreativePresetsModal` 与卡片封面解耦，市场插件只导入模态框本身。

## 证伪方式

1. 若真实浏览器里热门卡片出现空白或缺少封面，则假设 2 错 → 回滚该删除。
2. 若 `plugins/omnimux-market/src/presets` 测试失败，则假设 3 错 → 检查导出链。
3. 若 bundle 减小量 <45 KB，则假设 2 部分错（可能封面被别处引用）→ 用 grep 定位引用。
4. 可执行验证：
   - `node --test plugins/omnimux-inspiration/src/explore/component.test.js`
   - `node --test plugins/omnimux-market/src/presets/*.test.js`
   - ego-browser 打开灵感页，确认真实 4 张卡片封面正常，截图留证
   - 构建前后 `lib/client.js` 字节对比

## 验证说明（补充）

尝试新增专项契约测试时，三处落点（`plugins/omnimux-inspiration/src/explore/`、
`tests/e2e/`、`scripts/`）均被 `guard-anti-cheat` 以 `RULE-01-TEST-IMMUTABLE` 拒绝：
新增测试文件的跨插件相对导入只允许指向 `plugins/<name>/src/index.js` 公开入口，
而 `catalog.js` 词条与 `starter-covers.js` 封面都不是公开入口。

因此不新增测试文件，改用以下组合作为验证证据：

- 既有 `component.test.js` 覆盖 4 张卡片的渲染与点击（`length === 4`）；
- 真实浏览器断言：标题无中英文重名、封面 4/4 加载、废弃封面不存在；
- bundle 体积测量：2412.6 KB → 2362.0 KB（减少 50.6 KB）。
