# 吸附栏贴顶（消除穿模）· 实测证据

任务：Issue 1977 跟进 —— 技能/专家页吸附栏上方露出下层内容（用户截图红框处）。
规格：`specs/sticky-rail-flush.spec.md`

## 1. 真实浏览器对照实测（Chrome 内核 · 无头 · CDP 驱动）

夹具：一个整页滚动容器 + 吸附栏（`.omx-stage-sticky`）+ 60 张卡片，滚动到 300px 后测量吸附栏顶边与滚动容器顶边的距离。

| 写法 | 吸附栏上方缝隙 | 判定 |
|---|---|---|
| 滚动容器带 `padding: 18px 20px 32px`（修复前） | **18px**（露出滚动中的内容） | 复现用户所见穿模 ✘ |
| 滚动容器零内边距、内边距下移到内容层（修复后） | **0px** | 吸附栏贴顶、无缝 ✔ |

结论：根因确认为**滚动容器自带 `padding-top`** —— `position: sticky; top: 0` 的吸附位置落在内边距之下，内边距那一条始终露出内容。

## 2. 修复范围

`plugins/omnimux-market/src/client/css.js`：

```css
.sh-plaza-body   { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; }   /* 去掉内边距 */
.sh-plaza-body .sh-mkt { max-width: none; width: 100%; padding: 18px 20px 32px; }   /* 内边距下移 */
```

## 3. 其余一级页核对

| 页面 | 滚动容器 | 是否带 `padding-top` |
|---|---|---|
| 资产中心 | `.omnimux-assets-stage` | 否（留白在其子元素上） |
| 技能 / 专家 | `.sh-plaza-body` | **是 → 本次修复** |
| 创作灵感 | `.omnimux-inspiration-root` | 否（`padding: 0 20px 24px`） |
| 账号中心 | `.omnimux-accounts-stage-body` | 否 |
| 内容发布 | `.omnimux-publish-stage` | 否 |
| 数据分析 | `.omnimux-analytics-stage` | 否 |
| 商品库 | `.omnimux-products-stage` | 否 |

## 4. 回归用例

`tests/e2e/sticky-rail-flush.e2e.test.mjs`（真实 Chrome 对照两种写法：带内边距留缝 > 10px；内边距下移后缝隙 = 0px）。
