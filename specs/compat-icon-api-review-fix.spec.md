# Spec: 图标兼容层评审整改（#3652 后续）

- 前置：#3696（图标双代兼容）已合入 main；本任务只补独立评审提出的三点整改
- 范围：`packages/dsh-ui-kit/src/icons/compat-icons.tsx`、新增 rc.3 导出 fixture、新增两个测试文件
- 不含：不改 22 个调用点、不改既有测试断言（无「旧标准变更」）、不改视觉

## 目标

1. 兼容层在「两代都没有该图标名」时给出可观测信号（`console.warn`，按名字去重），而不是静默渲染 null——宿主再次改名时不能变成无声消失的图标。
2. 0.2.x 新名不再只与实现文本自比对：签入 rc.3 官方导出清单作为外部快照（`packages/dsh-ui-kit/src/icons/fixtures/rc3-icon-exports.txt`，190 个导出 + tarball SHA-256 + 提取命令），新增测试对快照校验。
3. 补强 market 产物接线断言：逐行检查所有 `require("@deepseek-ai/dsh-client-ui-primitives")` 行不含旧图标名（与旧名在解构中的位置无关），替换原「正向恒真 + 负向只看末项」的弱断言。

## 假设

1. `console.warn` 在模块求值期最多对每个缺名触发一次（`warned` 去重），正常两代取值不会误报，也不影响 SSR/测试断言。
2. rc.3 fixture 的 190 个名字覆盖实现用到的全部 0.2.x 名（19 对里 `IconRefreshOutlineRegular` 被 14/16 两个旧名共用）。
3. market 的构建产物把 primitives 解构保留在 `require` 同一行（esbuild cjs + external），因此逐行扫描能真正命中旧名。
4. 这两个新测试都能被 CI 跑到：hub 的 `src/**/*.test.js` glob、market 的 `tests/e2e/*.spec.js` glob（其 test 脚本先 build）。

## 证伪方式

1. 若正常路径也打 warn（旧名或新名任一存在），说明取值逻辑有问题，回到 `legacy ?? modern` 并检查 registry。
2. 若把任一 0.2.x 名改错（删字母/换变体）后 fixture 测试仍通过，说明断言退化为自比对，改为集合成员校验。
3. 若产物里出现跨行的解构（旧名不在 require 行），说明逐行扫描失效，改为按语句切块检查。
4. 若 market 测试在未 build 时因读不到 `lib/client.js` 失败，说明依赖顺序不对，改为在 spec 内先断言产物存在并给出清晰失败信息。

## 验收

1. `pnpm --filter dsh-ui-kit build` + `typecheck` 通过；rc.3 类型面 `tsc` 仍通过。
2. `node --test plugins/omnimux/src/client/icon-compat-rc3-fixture.test.js` 通过（190 行 fixture、18 个 distinct 新名）。
3. `pnpm --filter omnimux-market test` 通过（含新增严格 e2e）。
4. 工作树 Web 验收 6/6；`verify:stages`、anti-slop、`git diff --check` 通过。
5. 残留：rc.3 宿主上的真实渲染仍未验证（本机无该宿主，与 #3688 同批补）。

## 风险

R2（单包兼容层 + 两个测试文件）。改动集中在 `dsh-ui-kit` 兼容层与测试；回滚为单 commit revert。
