# Spec: 图标 API 双代兼容（0.1.5 `Icon…Outline<size>` / 0.2.x `Icon…Outline<Regular>`）

- Issue: #3652（R1，跨 7 个包：`dsh-ui-kit` + 6 个插件）
- 来源：#3658 清点报告 §3.1；本任务在 issue 下已评论修正清点（19 符号 / 7 包 / 22 文件）
- 依赖批次：#3688（本仓 pin 统一）——本任务只交付类型面与逻辑面兼容，rc.3 运行时证据同批补

## 目标

DSH 0.2.1-rc.3 把 `@deepseek-ai/dsh-client-ui-primitives` 的图标命名从 `Icon<Name>Outline<14|16>`（尺寸写进名字）改成 `Icon<Name>Outline<Regular|Medium>`（笔画变体写进名字，尺寸由 `IconProps.size` 传）。当前线上宿主仍是 0.1.5，直接改名会让旧宿主崩。本任务在 `dsh-ui-kit` 增加一个兼容层，让 19 个受影响符号在两代宿主上都解析到可用组件，并把 22 个调用点的导入切到该兼容层。

## 范围

- 新增 `packages/dsh-ui-kit/src/icons/compat-icons.tsx`：`旧名 ?? 新名 ?? 渲染 null 的兜底组件`，以**旧名**导出 19 个稳定符号，并导出 `IconProps` 兼容类型。
- `packages/dsh-ui-kit/src/index.ts`：追加这 19 个导出（该包 `exports` 只有 `.`，走主入口）。
- 6 个 `dsh-ui-kit` 内部文件改为相对导入兼容层：`drawer/Drawer.tsx`、`search/SearchField.tsx`、`button/CopyButton.tsx`、`button/Button.tsx`、`stat/StatBar.tsx`、`stage/PageHeader.tsx`。
- 6 个插件的 16 个文件把图标导入从 primitives 改为 `dsh-ui-kit`（同文件里的 `Menu` / `RiskConfirmation` 仍从 primitives 导入）：`omnimux` 1、`omnimux-analytics` 3、`omnimux-assets` 1、`omnimux-automation` 1、`omnimux-publish` 5、`omnimux-workflow` 5。
- 旧名写 14 的符号（`IconChevronDownOutline14`、`IconChevronUpOutline14`、`IconChevronLeftOutline14`、`IconRefreshOutline14`、`IconRightUpOutline14`、`IconCloseFill14`）在未传 `size` 的调用点补 `size={14}`，保持原尺寸。
- 新增测试（不改既有断言）：`packages/dsh-ui-kit/src/icons/compat-icons.test.js`、`plugins/omnimux-analytics/tests/e2e/icon-compat-wiring.e2e.spec.js`。
- 不改视觉设计、不改 `Menu`/`RiskConfirmation`/`Modal`/`Tooltip`、不动 `omnimux-studio` 的 vendored `dsh-ui-kit-0.1.0.tgz`。

## 假设

1. 宿主模块以 CJS interop 形式加载（`require(...)` + `__toESM`），因此缺失的具名导出在运行时是 `undefined` 而不是链接期错误，`旧名 ?? 新名` 在 0.1.5 与 rc.3 上分别取到旧名与新名。
2. `dsh-ui-kit` 会被内联进各插件客户端 bundle（`@deepseek-ai/dsh-client-ui-primitives` 仍是外部 require），所以单一兼容层就够，不需要每个插件各写一份。
3. rc.3 的 19 个新名都存在且组件接受可选 `size`（已对 `lib/types/icons/index.d.ts` 与 `icons/props.d.ts` 核实），14/16 的差异必须靠显式 `size` 保持。
4. 既有测试桩只提供旧图标名（`better-sidebar-inject.test.mjs`、`ProjectFolderCard.menu.test.mjs`、automation `render.test.js`、publish 的 `*-mocks.jsx`），优先取旧名可让它们继续命中。

## 证伪方式

1. 若构建后的插件 bundle 在 stub 宿主下因缺名导出抛错，说明假设 1 不成立，改为动态取用（`primitives['IconX']`）并重跑工作树 Web 验收。
2. 若 bundle 里仍出现对 primitives 图标名的直接具名导入（而非走兼容层），说明假设 2 不成立，改为每个插件各自一份 shim。
3. 若 `IconCloseFill14` 或任一旧符号没有直接对应名，则该符号改用 `Medium` 变体或从兼容层剔除并单独记录，不机械替换。
4. 若显式 `size` 后截图显示 14px 图标视觉退化（或 Refresh 合并导致尺寸不对），按截图证据修正为在兼容层内包一层固定尺寸。
5. 若 rc.3 类型面 typecheck 无法用临时 `paths` 映射跑通，记录为跳过并说明原因，不用 0.1.5 类型通过冒充双代类型通过。

## 验收

1. `pnpm --filter dsh-ui-kit check`（typecheck + build）与新增兼容层测试通过；19 个导出齐全，缺名时渲染 null 且不抛。
2. rc.3 类型面：以 rc.3 primitives tarball 的 `lib/types` 为 `paths` 目标对兼容层跑 `tsc --noEmit` 通过（跳过需说明）。
3. 6 个受影响插件与 hub 的既有测试、客户端构建通过。
4. `pnpm verify:stages`、`node --test scripts/verify-anti-slop.test.mjs`、`pnpm test:worktree-web`（6/6，含 analytics/publish/workflow/assets）通过并留证。
5. 源码扫描：非测试源码不再从 primitives 直接导入旧图标名（由新增测试断言）。
6. rc.3 运行时证据标注为残留（本机无该宿主），与 #3688 同批补；`omnimux-automation` 不在 6 条 journey 内，其证据为自身测试 + 人工 Dev 目视。

## 风险

R1（跨 7 包、公共 UI 出口）。`dsh-ui-kit` 新增 19 个导出是一份新的公共面承诺，兼容层内注明其临时性质；视觉退化风险由显式 `size` 与工作树截图覆盖。回滚为单 commit revert。

## 旧标准变更

- `plugins/omnimux-assets/src/client/CloudAssetsView.test.js` :: `swaps the glyph and the label when the row is saved`
  - 原断言：`import { IconDownloadOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'`（锁定旧导入路径）。
  - 必须改的理由：图标导入已收敛到 `dsh-ui-kit` 兼容层（#3652），旧路径正是 rc.3 会打断的那条接线；保留原断言等于要求源码继续直接依赖 primitives。
  - 新期望与证据：断言改为 `import { Button, EmptyState, IconButton, IconDownloadOutline16 } from 'dsh-ui-kit'`；`pnpm --filter omnimux-assets test` 通过（766/767 → 全绿）。
- `plugins/omnimux-publish/src/client/row-action-menu.test.js` :: `*`
  - 原状态：该 spec 用 esbuild 的 stub 模块替身 `dsh-ui-kit`，stub 只导出 `IconButton`；源文件改为从 kit 取 `IconEllipsisOutline16` 后 stub 缺该导出，构建直接失败。
  - 必须改的理由：stub 必须覆盖被测源真实导入的 kit 导出，这是测试替身的完备性修复，不是放宽断言。
  - 新期望与证据：stub 增加 `IconEllipsisOutline16` 导出；`pnpm --filter omnimux-publish test` 通过（253/254 → 全绿）。

