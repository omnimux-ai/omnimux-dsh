# #773/#774 T02 真实库存、真实来源与只读接线实施记录

## 1. 阶段进展与结论

- **状态**：实施完成，工程自检通过，就绪转交独立 QA。
- **全局一致性审查结论**：**IS_PASS: YES**。
- **基线信息**：固定 base = HEAD = `580234923268673562cacb5cd01aebdb780339e1`，分支 `agent/market-skill-workshop-issue-773`。
- **唯一工作树**：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/skill-workshop-773`。
- **范围约束**：本地未提交增量开发，严格遵守 MVP 边界与安全规则；不修改官方仓、外部仓，不修改共享 profile，不提交，不 push，不发布。

---

## 2. 失败根因分析与修复

### 2.1 根因定位与排查

1. **`checkedDirectory(path)` 在 macOS 上抛出 `SCOPE_UNVERIFIED`**：
   - **机理**：macOS 系统下 `tmpdir()` 通常位于 `/var/folders/...`，而系统根目录下的 `/var`、`/tmp`、`/etc` 是指向 `/private/...` 的系统符号链接。
   - **表现**：`src/workshop-store.ts` 原实现中从根 `/` 逐级通过 `lstat` 检查到第一级 `/var` 时，因 `st.isSymbolicLink()` 为 true 直接抛出 `SCOPE_UNVERIFIED`，导致所有涉及系统临时目录的 store/inventory 测试全部失败（共 11 项）。
   - **修复方案**：在 `checkedDirectory(path)` 中增加 Darwin 平台顶层系统根链接规范化映射（将以 `/var`、`/tmp`、`/etc` 开头的绝对路径规范化为其真实的物理路径前缀 `/private` 后再逐级检查），继续保留自根向叶逐级 `lstat` 严格检查，禁止任何非系统目录符号链接与跨级跳出，最终返回 `realpath`。

2. **`src/tests/workshop-sources.test.ts:153` 失败**：
   - **机理**：测试用例在 `tmpdir()` 临时目录下创建 catalog 目录并验证 revision 指纹。底层 `readWorkshopCatalog` 调用 `readWorkshopFile`，进而调用 `checkedDirectory`。
   - **表现**：因上述根因 1，`checkedDirectory` 抛出 `SCOPE_UNVERIFIED`，被 `readWorkshopCatalog` 内部的 `catch` 块兜底捕获并返回 `revision: 'catalog-unavailable'`，导致期望非 unavailable 的断言失败。
   - **修复**：根因 1 修复后，`readWorkshopCatalog` 正确读取文件内容并计算 sha256 签名，测试顺利通过。

3. **Inventory 其余断言问题（`b.revision > a.revision`、`origin` 解析、`status` 判定）**：
   - **机理**：均为根因 1 的次生连锁反应。`checkedDirectory` 报错导致 `scan()` 遇到错误，`reasons` 包含 `SCOPE_UNVERIFIED`，`records` 数组为空，`status` 变为 `'error'`。
   - **表现**：
     - 空 records 导致测试读取 `result.records[0].origin` 时抛出 `TypeError: Cannot read properties of undefined`。
     - 文件修改前后两次 `reconcile` 均返回相同的错误空结构，导致计算的 `fingerprint` 保持不变，`this.revision` 未自增，`assert(b.revision > a.revision)` 失败。
     - 期望 `complete` 或 `partial` 的测试因存在 `SCOPE_UNVERIFIED` 误报为 `'error'`。
   - **修复**：根因 1 修复后，`InventoryService` 正确扫描目录项，按规范提取 metadata，正常计算内容变化与 revision 自增，10 项 inventory 测试与 16 项 request-guard 测试全部通过。

---

## 3. 改动文件与代码职责清单

| 文件路径 | 状态 | 职责与关键实现 |
|---|---|---|
| `plugins/omnimux-market/src/workshop-store.ts` | 修改/补全 | 安全文件与目录读取，Darwin 平台系统根符号链接规范化（`/private` 对应映射），从根到叶逐级 `lstat` 防越界；严格校验 schemaVersion/scopeKey/CAS 自增/tombstone 保护；只读 store 访问，缺失状态回退安全空默认。 |
| `plugins/omnimux-market/src/workshop-sources.ts` | 补全 | 真实 catalog 读取与 sha256 指纹计算；SkillHub 远程分页有界读取与限额控制（20页/1600项/30秒超时）；`QueryService` 装配，查询快照管理与分页，catalog 详情绑定与严格 sourceRef 校验。 |
| `plugins/omnimux-market/src/workshop-inventory.ts` | 补全 | 真实库存扫描与核对；仅扫描授权根下一级子目录中的 `SKILL.md`，遇到符号链接跳过并记录 `EXTERNAL_LINK_UNVERIFIED`；不推测 origin/version/enabled；按 installId/skillKey 稳定排序并计算 sha256 指纹，动态维护单调 revision。 |
| `plugins/omnimux-market/src/workshop-request-guard.ts` | 已实装 | 只读请求守卫；严格校验 Origin 协议/主机/端口；body 读取前鉴权与范围检查；Host/API 只读方法调度与异常拦截。 |
| `plugins/omnimux-market/src/tests/workshop-store.test.ts` | 测试 | 覆盖 state 默认值、CAS 原子性与保护、模式验证、高版本只读保留、符号链接与越界拒绝、sourceRef 结构等（12 项）。 |
| `plugins/omnimux-market/src/tests/workshop-sources.test.ts` | 测试 | 覆盖真实 catalog 枚举、指纹计算、远程枚举中断与限额、快照过期与失效、详情绑定等（15 项）。 |
| `plugins/omnimux-market/src/tests/workshop-inventory.test.ts` | 测试 | 覆盖未授权作用域拒绝、空根完成态、历史文件安全扫描、origin 持久化与 policy 隔离、修改后 revision 自增、无效包降级、符号链接隔离、重复身份冲突等（10 项）。 |
| `plugins/omnimux-market/src/tests/workshop-request-guard.test.ts` | 测试 | 覆盖 Origin 精确比对、鉴权失败拦截、重复 Origin/方法拦截、Host/API 只读消费、防越界等（16 项）。 |
| `docs/implementation/issue-773-inventory.md` | 本文 | T02 实施与自检完整记录。 |

---

## 4. 验证命令、退出码与测试计数

所有命令均在工作树根目录 `/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/skill-workshop-773` 下执行：

| 验证命令 | 退出码 | 测试计数 / 检查结果 | 结论 |
|---|---|---|---|
| `npm --prefix plugins/omnimux-market run test` | 0 | 628 项全部通过（7 suites，0 fail，0 skipped）<br>- 原有 575 项（480 + 73 QA + 22 返修）完全不回退<br>- 新增 53 项（inventory: 10, sources: 15, store: 12, guard: 16）100% 通过 | PASS |
| `node --test plugins/omnimux-market/lib/tests/workshop-*.test.js` | 0 | 98 项 workshop 系列测试（含 query 45 项 + inventory/sources/store/guard 53 项）全部通过 | PASS |
| `npm --prefix plugins/omnimux-market run typecheck` | 0 | `tsc -p tsconfig.json --noEmit` 0 诊断、0 错误 | PASS |
| `git diff --check` | 0 | 格式检查无尾随空白、无冲突标记 | PASS |
| `node scripts/verify-plugin-boundaries.mjs` | 0 | 2142 个源码文件依赖与运行时边界 100% 验证通过 | PASS |
| `node scripts/verify-plugin-agent-tools.mjs` | 0 | 98 个已实装工具与文档清单 100% 对齐，0 错误 0 警告 | PASS |
| `node scripts/verify-slot-contracts.mjs` | 0 | 1647 个客户端文件插槽契约验证通过，0 violations | PASS |

---

## 5. 全局一致性审查（Global Consistency Review）

依照工程自检规范进行全局跨文件一致性核查：

1. **跨文件导入一致性**：
   - `src/workshop-store.ts`、`src/workshop-sources.ts`、`src/workshop-inventory.ts`、`src/workshop-request-guard.ts` 及各测试文件均正确引用相对路径 `.js` 后缀。
   - 无任何未解析或悬空 import，无循环依赖。
2. **接口契约一致性**：
   - 严格遵循 `src/types.ts` 定义的 `WorkshopState`、`WorkshopInventoryRecord`、`WorkshopInventoryResult`、`SourceRef`、`SourceStatus` 等数据契约。
   - `checkedDirectory`、`readWorkshopFile`、`parseWorkshopState` 等导出签名与调用方完全吻合。
3. **数据流与安全性正确性**：
   - 坚持“不猜测、不伪造”原则：未授权根不访问，符号链接不跟踪，历史文件 origin/version/enabled 保持 unknown/null。
   - 坚持纯函数与只读隔离：运行时不提供写入口，CAS 仅为可插拔受控事务契约；请求准入在 body 读取前完成。
4. **无重复实现**：
   - 统一复用 `src/workshop-query.ts` 中的 `workshopDomains`、`workshopSourceOptions`、`workshopDate` 等基础函数，无重复代码逻辑。

**最终自检结论**：**IS_PASS: YES**
代码已就绪，等待独立 QA 进行复核。
