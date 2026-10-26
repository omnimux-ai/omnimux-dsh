# Spec: 市场工具卡片按 rc.3 阶段模型读取参数（Issue #3753）

## 目标与用户结果

rc.3 把"运行中的工具调用"拆成两个阶段：`preparing`（还没有参数）与 `start`（已派发、带 `argsRaw`）；已结算的结果节点则把参数留在配对的调用头 `call.argsRaw` 上。

市场插件的工具卡片仍在用迁移前的两臂读法：

```js
const raw = (block && "kind" in block ? block.call?.argsRaw : block?.argsRaw) || "";
```

判定条件是"有没有 `kind`"，而不是"是不是结算结果"。于是运行中的调用（无论 preparing 还是 start）都被当成结算结果，去读 `call?.argsRaw`，拿到 `undefined` → 参数为空 → 卡片上的查询词为空、按参数发起的检索拿不到条件。

## 事实与证据

| 事实 | 证据 |
| --- | --- |
| 现状读法 | `plugins/omnimux-market/src/client/tool-views.js:3` |
| `start` 阶段也拿不到参数 | 用 `runInNewContext` 取出现有 `parseToolArgs`，喂 `{block:{kind:'tool-call',phase:'start',argsRaw:'{"query":"视频"}'}}` → 返回 `{}`（不是只有 preparing 有问题） |
| 结算结果正常 | 喂 `{block:{kind:'tool-result',call:{argsRaw:'{"query":"图像"}'}}}` → 返回 `{"query":"图像"}` |
| 正确写法已有先例 | `plugins/omnimux-viewer/src/client/card-model.ts:49-56`：结算读 `call?.argsRaw`，运行中只在 `phase === 'start'` 读 `argsRaw`，其余返回 `undefined` |
| 该文件不在类型检查内 | `plugins/omnimux-market/tsconfig.json` 的 `include` 是 `["src/**/*.ts"]`；`tool-views.js` 是 `.js` 且是"拼接用 fragment"（顶层只有函数声明，依赖 `h` / `useState` 等由 `boot.js` 提供的全局），直接纳入 `tsc` 会因非模块 + 未定义标识符报错 |

## 改动

- `plugins/omnimux-market/src/client/tool-views.js`：`parseToolArgs` 改为按阶段读取——结算结果读 `block.call?.argsRaw`；运行中只在 `phase === 'start'` 读 `block.argsRaw`；其余返回空串（进而返回 `{}`）。
- 测试：在既有的市场客户端测试文件里追加用例，用 `runInNewContext` 取出现有 `parseToolArgs`，钉住四种输入（preparing / start / settled / settled 无调用头）的行为。
- 类型覆盖：不把该 fragment 塞进 `tsconfig.include`（它不是模块），改由上述用例钉住契约，并在本 spec 记录原因。

## 假设
- rc.3 的运行中块与结算块的判别就是 `kind === 'tool-result'`（与 viewer 的实现一致）；`start` 是唯一携带 `argsRaw` 的运行阶段。
- 该 fragment 的其余逻辑不依赖 `parseToolArgs` 的旧行为（唯一的调用点是 `SearchToolView` 里取 `args.query` 等）。

## 证伪方式

- 若修完仍拿不到参数：对 `start` 输入必须返回 `{"query":"视频"}`；若仍为 `{}`，说明读法没改对。
- 若误伤结算：对 `tool-result` 输入必须仍返回 `{"query":"图像"}`。
- 若 preparing 反而报错：对无 `argsRaw` 的 preparing 输入必须返回 `{}` 而不是抛异常。
- 若用例恒真：把实现改回旧的 `"kind" in block` 写法，新增用例必须变红。

## 验证

1. 上述四种输入的用例全过；把实现回退成旧写法后该用例变红（反证）。
2. `pnpm --filter omnimux-market test`（含 build）全绿。
3. `pnpm --filter omnimux-market exec tsc -b --pretty false` 或等价类型检查 0 错。
4. `pnpm test:gates` 全绿。

## 非目标与依赖

- 不改市场卡片 UI 与文案；不动 hub 与壳层；不发布。
- 依赖 #3715（rc.3 客户端阶段迁移，viewer 已按同一模型改写）。
