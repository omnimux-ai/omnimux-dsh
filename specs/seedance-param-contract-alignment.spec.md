# 画布参数校验语义与线路档位参数约束对齐 — Issue #1804

## Objective
修复画布参数校验与执行中枢不一致导致 Seedance 2.5 全部固定时长被误拒的阻塞缺陷，并补齐线路档位的参数约束能力，使用户切到按次专线时看到并提交正确的固定时长。

## 验收标准 (Acceptance)

### A. 校验语义对齐（阻塞级，恢复可用）
- 画布校验对同时声明 `options` 与 `range` 的参数，采用**或**语义：命中选项**或**落在范围内即合法，与执行中枢 `submit-guard/guard.js` 完全一致。
- 回归复现项：`seedance-2-5` 的 `duration`（range 4~30 + options [-1]）填 **5** 必须通过；填 `-1`（自适应）必须通过；填 **31**、**3** 必须被拒。
- 未声明任何约束的参数（如 `seed`）不受影响。
- 只有 `options` 的参数（如 `resolution`）仍严格按选项白名单。
- 只有 `range` 的参数（如其他 seedance 型号的 duration）行为不变。
- 前后端语义一致性有对照测试锁定，防止再次漂移。

### B. 线路档位参数约束（按次专线固定时长）
- 线路档位表（中枢 `channel-groups.js` 与画布镜像 `channelGroups.ts`，逐字一致）支持声明该线路的参数约束。
- `seedance-2-5` 的特惠版（`seedance-cheap`）与进阶版（`seedance-2-5-task-pro`）声明时长固定 30 秒。
- 画布切换到这两条线路时，时长自动取固定值且用户无法选出非法值。
- 分辨率**不锁**：上游未公布档位证据，不凭空限制。
- 标准版（按秒）不受约束，保持 4~30 自由可调。

### C. 质量门禁
- `pnpm --filter omnimux-workflow test`、`pnpm --filter omnimux test`、`pnpm verify:model-contracts` 全绿。
- 隔离工作树真实浏览器验证证据（截图或结构化报告）。

## Commands
- `pnpm --filter omnimux-workflow test`
- `pnpm --filter omnimux-workflow typecheck`
- `pnpm --filter omnimux-workflow build`
- `pnpm verify:model-contracts`
- `pnpm test:gates`
- `git diff --check`
- 浏览器验证用仓内隔离 QA 运行器或 ego-browser，动态端口、自清理；不使用共享 Dev 代签。

## Project Structure
- 校验真源：`plugins/omnimux-workflow/src/shared/validation/declaredParameterValidation.ts`（与中枢 `plugins/omnimux/src/catalog/contract/submit-guard/guard.js` 镜像）。
- 校验调用点：`src/shared/validation/executionReadiness.ts`、`ConfigPanel/videoParams/videoParamAdapter.ts`、`videoParameterSelection.ts`。
- 线路档位表：`plugins/omnimux/src/catalog/serving/channel-groups.js` 与 `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/channelGroups.ts`。
- 证据：`.agent-reports/1804/`。

## Code Style
复用现有类型与校验结构；不新增并行校验器或第二套参数模型。精确 TypeScript 注解，命名沿现有约定。注释说明与中枢的镜像关系，不叙述改动过程。

## Testing Strategy
先写复现失败测试并确认失败（红），再最小实现使通过（绿），最后跑全量确认无回归。负例必须证明非法值仍被拒；正例必须证明 5 与 -1 都能通过。线路约束部分先测「固定值生效且非法值被拒」，再做浏览器现场验证。

## Boundaries
总是：只写本任务隔离工作树；保持中枢与画布两侧镜像逐字一致；保留其他模型的既有参数行为。
先问：新增能力、付费调用、生产发布或跨工作区写入。
绝不：为绕过门禁放宽校验；凭空编造上游未公布的分辨率档位；破坏「未声明约束的参数不受影响」的既有语义。
不删除无关模型的参数声明，不改动 submit-guard 已有语义（以中枢为准对齐画布）。

## Plan
1. 写复现失败测试锁定 A 的「或」语义，确认变红。
2. 最小实现对齐中枢语义，跑通 A 全部正负例。
3. 线路档位表新增参数约束声明并同步两侧，实现面板联动与提交校验。
4. 类型/构建/契约门禁全量验证，隔离工作树真实浏览器取证。
5. 独立评审、PR 必需检查与队列合入；仅清理任务资源。

## Design review
根因由前后端代码对照实证：中枢 `!optionMatches && !inRange` 为「或」，画布在 `options.length > 0` 时直接以选项为唯一白名单。命中条件为契约同时声明 range 与 options，全仓仅 `seedance-2-5#duration` 命中，故该型号除自适应外任何时长均不可用。用户截图的报错与线路选择无关。方案对比：改契约去掉 `-1` 选项会丢失自适应入口；改中枢语义会放宽后端门禁；选用「画布对齐中枢」的最小修复。线路约束采用档位自带声明，避免第二套参数来源。
