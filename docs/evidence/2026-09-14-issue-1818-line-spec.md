# Issue #1818 线路档位完整规格 — 验证证据

- 日期：2026-09-14
- 工作树：`.worktrees/workflow-line-spec-issue-1818`
- 分支：`agent/workflow-line-spec-issue-1818`

## 一、根因

消费方（画布）已完整适配契约——卡槽数量与类型、格式与体积与时长上限、参数选项、生成方式列表全部由契约推导。
问题出在契约只有「模型级」声明，缺「线路级」规格：

- 模型契约（Seedance 2.5 全能参考）：参考图 30、参考视频 10、参考音频 10、三档清晰度、七种画幅、全部已上架模式
- 特惠按次线实际接受：**9 张图、无视频、无音频、仅 720p、仅 16:9 与 9:16、仅全能参考、固定 30 秒**

断链位置：网关本有独立的按次条目（规格完整），产品侧有意把它折叠成同一款模型的一条线路档位，
折叠时只带走了计费与路由，没有带走规格。

## 二、设计

收窄发生在**契约投影层**，渲染层零改动：卡槽布局、生成方式列表与参数控件都从「按模型标识取模型」计算，
故只要把收窄后的模型交给下游，卡槽数量、类型、参数选项与模式列表会自动正确。

线路档位的约束统一为一段声明：

- `operations`：该线路可用的生成方式
- `parameters.<字段>.fixed`：固定取值
- `parameters.<字段>.only`：限定选项集（与契约取交集，不引入契约外的取值）
- `inputs.<类型>.max`：该类型输入的上限，`0` 表示整条移除

冲突语义：契约始终优先——线路声明的取值被契约拒绝时丢弃该约束，交集为空时保持契约原状。

## 三、改动

| 文件 | 作用 |
| --- | --- |
| `shared/validation/lineConstraints.ts`（新） | 收窄函数、约束类型、解析器注入点、按路由收窄 catalog |
| `catalog/serving/channel-groups.js` | 档位表迁移为 `constraints`；特惠线写入完整规格 |
| `.../ConfigPanel/channelGroups.ts` | 镜像同步 + `resolveLineConstraints`（多线路取更严的一侧）+ 注入解析器 |
| `.../videoParams/videoParameterSelection.ts` | 参数面板改用收窄后的模型 |
| `shared/graph/canvasSlotRecompute.ts` | 卡槽与生成方式改用按路由收窄后的 catalog |

特惠按次线写入的规格：`operations: ["video_multi_ref"]`、
`parameters: { duration: {fixed:30}, resolution: {only:["720p"]}, aspectRatio: {only:["16:9","9:16"]} }`、
`inputs: { image:{max:9}, video:{max:0}, audio:{max:0} }`。

## 四、验证

```
$ node --test .../lineConstraints.test.mjs
✔ 把参考图收到线路上限，并去掉线路不接受的输入类型
✔ 只保留线路可用的生成方式
✔ 把参数收敛到线路允许的范围，且拒绝值仍不合法
✔ 空约束与未指定线路时不改变模型
✔ 限定集只做收窄：契约没有的取值不会被引入
✔ 收窄结果为空集时放弃该约束，而不是产出无选项的参数
✔ 不修改传入的模型对象
ℹ tests 7  pass 7  fail 0

$ node --test .../channelGroups.test.mjs
✔ resolves the full spec of the lines the node routes to
✔ keeps what several selected lines agree on, with the stricter ceiling
ℹ Canvas ConfigPanel ChannelGroups: pass 11  fail 0

$ node --test plugins/omnimux/src/catalog/serving/channel-groups.test.js
ℹ tests 19  pass 19  fail 0

$ pnpm --filter omnimux-workflow build
wrote dist/index.js (1637196 bytes) · lib/client.js · lib/canvas.js   ← 含类型检查

$ pnpm --filter omnimux-workflow test
ℹ tests 1784  pass 1782  fail 2
```

那 2 项失败为**预先存在**的 ASR 目录缺陷（`real Hub catalog: both ASR contracts…` 与
`capability seam admits only LISTED speech models…`），已在干净主干基线复现同样两项，本次改动引入 0 项新失败。

```
$ pnpm verify:model-contracts
admission errors=0 warnings=0        ← 中枢与画布档位镜像逐字一致

$ node scripts/impact-matrix.mjs --base origin/main
{ "isUiChange": false, "browser": { "required": false, "reason": "无客户端/UI文件变更，浏览器 Web 验证不适用" } }
```

## 五、执行命令清单

- `node --test plugins/omnimux-workflow/src/shared/validation/lineConstraints.test.mjs`
- `node --test plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/channelGroups.test.mjs`
- `node --test plugins/omnimux/src/catalog/serving/channel-groups.test.js`
- `pnpm --filter omnimux-workflow build`
- `pnpm --filter omnimux-workflow test`
- `pnpm verify:model-contracts`
- `node scripts/impact-matrix.mjs --base origin/main`
