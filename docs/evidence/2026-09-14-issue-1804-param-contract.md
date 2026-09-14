# Issue #1804 画布参数契约对齐与码表参数约束 — 验证证据

- 日期：2026-09-14
- 工作树：`.worktrees/workflow-seedance-params-issue-1804`
- 分支：`agent/workflow-seedance-params-issue-1804`
- 基线：`origin/main` @ `fa7962ef3`

## 一、根因（前后端代码对照实证）

用户在画布选中 Seedance 2.5（默认 5s / 720P）提交，被前端拒绝：`参数“duration”不支持值 5`。

同日应用户截图，定位为**画布校验语义与执行中枢不一致**：

| 侧 | 实现 | 语义 |
| --- | --- | --- |
| 执行中枢 `submit-guard/guard.js` | `if (!optionMatches && !inRange) 拒绝` | 选项 **或** 范围，满足其一即合法 |
| 画布 `declaredParameterValidation.ts` | `if (options.length > 0) { if (!matches) 拒绝 }` | 选项优先且互斥，range 分支永不生效 |

命中条件为契约同时声明 `range` 与 `options`。全仓仅 `seedance-2-5#duration`（range 4~30 + options `[-1]`）命中，
故该型号除「自适应」外**任何时长都无法提交**，含契约自身默认值 5。与线路选择无关（选标准版按秒线同样被拒）。

画布文件注释自称 `mirrors the hub submit guard's declared-parameter rules`，实现漏掉了「或」关系。

## 二、复现（红）

新增用例 `#1804 range and options are alternatives in the hub-guard mirror`，使用真实契约片段
（`range 4~30 + options [-1] + allowAuto + defaultValue 5`）。

```
✖ #1804 range and options are alternatives in the hub-guard mirror (0.528916ms)
  AssertionError: duration 5 must be accepted, matching the hub submit guard
  + actual: { field: 'duration', message: '参数“duration”不支持值 5' }
  - expected: null
ℹ tests 5  pass 4  fail 1
```

复现出的报错原文与用户截图**一字不差**。

## 三、修复与结果（绿）

1. **校验语义对齐中枢**：`options` 与 `range` 改为「或」关系，新增 `withinRange` 承担范围+步长+`-1` 自适应判定。
   范围为唯一声明时保留原有措辞（`必须为数字` / `超出合同允许范围`），枚举声明沿用 `不支持值`。
2. **码表参数约束**：中枢 `channel-groups.js` 与画布镜像 `channelGroups.ts` 为 `seedance-2-5` 的 `pro` 与 `cheap`
   声明 `parameterConstraints: { duration: { fixed: 30 } }`（上游 9 图按次专线固定 30 秒）。
   分辨率**不锁**：上游标注「以接口返回为准」，未公布档位，不凭空限制。
3. **面板收敛**：`videoParameterSelection` 在算出控件值后应用已选线路的固定值，并以中文提示告知收敛原因。
   契约仍为权威：固定值若被自身声明拒绝则丢弃，不写入非法值。自动路由不施加任何约束。
4. **镜像防漂移**：镜像测试增加 `parameterConstraints` 字段比对。

```
✔ declared parameter validation rejects kept values outside operation/model contract
✔ operation declarations override model declarations and preserve documented automatic duration
✔ #1804 range and options are alternatives in the hub-guard mirror
✔ #1804 a declaration with neither options nor range stays unconstrained
✔ #1804 an options-only declaration still enforces its whitelist
ℹ tests 5  pass 5  fail 0
```

```
✔ pins the fixed duration of the per-task lines the node routes to
ℹ Canvas ConfigPanel ChannelGroups: tests 22  pass 22  fail 0
ℹ videoParameterSelection: tests 22  pass 22  fail 0
```

```
✔ OmniMux Model Channel Groups & Routing Strategies
ℹ tests 19  pass 19  fail 0
```

## 四、全量套件与基线对比

`pnpm --filter omnimux-workflow test` 有 2 项失败：

```
✖ real Hub catalog: both ASR contracts are selectable in the audio-transcription tool (#1789)
✖ capability seam admits only LISTED speech models, and only to the tool that consumes the seam
```

**基线对比**（同一命令在白主检出 `main`，工作树未含本次改动）：

```
## main...origin/main          ← 干净，无未提交改动
✖ capability seam admits only LISTED speech models, and only to the tool that consumes the seam
✖ real Hub catalog: both ASR contracts are selectable in the audio-transcription tool (#1789)
ℹ tests 13  pass 11  fail 2
```

结论：这 2 项为**预先存在**的 ASR 目录缺陷，与本次改动无关；本次改动引入 0 项新失败。按边界规则记录而不扩大范围。

## 五、门禁判定

```
$ node scripts/impact-matrix.mjs --base origin/main
{
  "isUiChange": false,
  "dimensions": {
    "l0":      { "required": true,  "phase": "pre-merge" },
    "browser": { "required": false, "reason": "无客户端/UI文件变更，浏览器 Web 验证不适用" },
    "dev":     { "required": false, "reason": "无产品运行时或依赖变更，物化与真机验收均不适用" }
  }
}
```

```
$ pnpm verify:model-contracts
model-contracts mode=strict ok=true
auto-serving offline ok=true registered=17 required=13
cross-plugin offline ok=true whitelistChecked=14
admission errors=0 warnings=0
```

## 六、执行命令清单

- `node --test plugins/omnimux-workflow/src/shared/validation/declaredParameterValidation.test.mjs`
- `node --test plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/channelGroups.test.mjs`
- `node --test plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/videoParams/videoParameterSelection.test.mjs`
- `pnpm --filter omnimux-workflow build`
- `pnpm --filter omnimux-workflow test`
- `node --test plugins/omnimux/src/catalog/serving/channel-groups.test.js`
- `pnpm verify:model-contracts`
- `node scripts/impact-matrix.mjs --base origin/main`
