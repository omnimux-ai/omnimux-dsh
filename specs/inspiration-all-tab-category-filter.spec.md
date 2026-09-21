# 规格：全部 Tab 选行业时只展示该类云端素材（Issue #2511）

## 目标（Objective）

灵感社区默认停在「全部」。商品分类切到具体行业后，下拉文案变了、云端也按官方 id 拉了，但本地半边不过滤、仍堆在列表最上面，用户以为分类没响应。分类是给「全部」用的，必须看得见筛选结果。

用户：浏览灵感社区、在「全部」里按行业找云端爆款的人。

成功：在「全部」选具体行业后，列表只显示该类云端素材，不再出现未过滤的本地卡片；分类回到「全部」后恢复本地+云端混排。本地 Tab 仍不写入官方 id。

新用户基线：未登录时选行业可得到空列表或登录提示，页面不报错、不依赖开发机私有状态。

## 命令（Commands）

```bash
cd /Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/omnimux-inspiration-all-tab-category
pnpm --filter omnimux-inspiration test
git diff --check
```

隔离浏览器验收（动态端口，不占用 Dev 45120）：

```bash
pnpm --filter omnimux-inspiration test -- plugins/omnimux-inspiration/src/client/inspiration-category.e2e.test.js
pnpm --filter omnimux-inspiration test -- plugins/omnimux-inspiration/src/client/inspiration-section-render.test.js
```

## 项目结构（Project Structure）

| 路径 | 职责 |
| --- | --- |
| `plugins/omnimux-inspiration/src/client/api.js` | `loadInspirationsAtomic`：tab=all 且 category 非空时只拉云端 |
| `plugins/omnimux-inspiration/src/client/api.test.js` | 全部+行业不请求 /local；全部+空分类仍混排 |
| `plugins/omnimux-inspiration/src/client/inspiration-section-render.test.js` | 渲染：全部选行业后列表无本地徽章盖顶 |
| `plugins/omnimux-inspiration/src/client/inspiration-category.e2e.test.js` | 同上，官方 id 仍发给云端 |
| `specs/inspiration-all-tab-category-filter.spec.md` | 本规格 |

不改对照表、导入、回写脚本、Hub。

## 代码风格（Code Style）

纯 ESM、具名导出、单引号、无分号。

```js
const industry = category.trim()
const cloudArgs = { ...sharedArgs, category: industry || undefined }

if (tab === 'all' && industry) {
  const res = await listInspirationsGuarded(cloudArgs)
  // 只返回云端该类；不请求 /local
}
```

本地 Tab 仍用 `sharedArgs`（无 category）。云端 Tab 行为不变。

## 测试策略（Testing Strategy）

- `loadInspirationsAtomic({ tab:'all', category:'beauty_skincare' })`：有云端 `category=` 请求；无 `/local` 请求；返回项 `is_local` 全为 false。
- `loadInspirationsAtomic({ tab:'all', category:'' })`：仍同时请求 `/local` 与云端。
- `tab:'local'` 带 category：仍不把 category 转给 `/local`。
- 渲染：全部 Tab 点「美妆护肤」后，列表节点不含「本地」徽章盖顶（或本地请求次数为 0）。
- 本地 Tab 点行业仍不写入隐藏官方 id（既有用例保留）。

## 边界（Boundaries）

- 总是：选行业时「全部」只出云端该类；分类「全部」混排；本地 Tab 不写官方 id；文案首项恰为「全部」。
- 先问：给本地库补官方行业字段、改云端 schema、生产云端 PATCH。
- 绝不：把 digital/physical 当行业；下拉首项写成「全部分类」；改官方 DSH；改主仓。

## 成功标准（Success Criteria）

1. 全部 + 具体行业：不请求 `/omnimux/inspiration/local`，列表无未过滤本地卡片盖顶。
2. 全部 + 分类「全部」：仍混排本地与云端。
3. 云端 Tab 选行业行为不变。
4. 本地 Tab 点行业不写入隐藏官方 id。
5. 指定测试全绿。

## 假设（Assumptions）

1. 本地库没有与官方 18 行业对齐的 `category`，不能按官方 id 过滤本地。
2. 「全部」选行业时用户要看的是云端该类，而不是本地+云端拼接。
3. 回到分类「全部」必须恢复原来的混排。

## 开放问题（Open Questions）

无。用户已明确：全部 Tab 必须能用分类，否则分类没有意义。
