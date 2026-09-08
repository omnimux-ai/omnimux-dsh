# #773/#774 T02 真实库存、数据源与只读接线独立 QA 验收报告

## 1. 结论与路由

- **验收结论**：**IS_PASS: YES**
- **智能路由判定**：**Route: NoOne**（所有验收项 100% 通过，0 失败，0 告警，无需回退返工，就绪推进下一阶段）
- **测试执行结果**：
  - 全包测试 `npm --prefix plugins/omnimux-market run test`：**628/628 全部通过**（7 suites，0 failed，0 skipped，0 todo，耗时 13.2s）。
  - Workshop 系列定向测试 `node --test plugins/omnimux-market/lib/tests/workshop-*.test.js`：**98/98 全部通过**（45 项 query + 10 项 inventory + 12 项 store + 15 项 sources + 16 项 request-guard）。
  - 静态类型检查 `npm --prefix plugins/omnimux-market run typecheck` (`tsc -p tsconfig.json --noEmit`)：**0 错误，0 诊断，exit 0**。
  - 格式与差异检查 `git diff --check`：**exit 0，格式规范无空白违规**。
  - 依赖边界门禁 `node scripts/verify-plugin-boundaries.mjs`：**2142 个源码文件边界 100% 验证通过**。
  - Agent 工具对齐门禁 `node scripts/verify-plugin-agent-tools.mjs`：**98 个实装工具与文档清单 100% 对齐**。
  - 插槽契约门禁 `node scripts/verify-slot-contracts.mjs`：**1647 个客户端文件插槽契约 0 violations**。

---

## 2. 身份、工作树与基线信息

- **工作树绝对路径**：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/skill-workshop-773`
- **基线 commit**：base = HEAD = `580234923268673562cacb5cd01aebdb780339e1`
- **Git 分支**：`agent/market-skill-workshop-issue-773`
- **测试环境**：macOS Darwin 24.6.0 (arm64)，Node.js v25.8.0
- **输入文档依据**：
  - 实施报告：`docs/implementation/issue-773-inventory.md`（86 行）
  - 前序架构规格：`docs/specs/2026-09-08-skill-workshop/architecture.md`（W03/W04、§3.3/§3.4/§4.1）
  - 产品需求：`docs/specs/2026-09-08-skill-workshop/prd.md`
  - 验收契约：`docs/specs/2026-09-08-skill-workshop/acceptance.md`
- **铁律遵循**：未修改官方仓代码、未修改外部仓、未修改共享 profile、不执行 git commit 或 push。

---

## 3. 验收重点逐项验证

### 3.1 真实库存与目录扫描（`src/workshop-inventory.ts`）

| 验收项 | 验证内容与实现审查 | 对应测试用例与验证结果 | 判定 |
|---|---|---|---|
| **授权根目录范围** | `InventoryDependencies.scope` 为空时，返回 `status: 'error'`, `reasons: ['SCOPE_UNVERIFIED']`, `scopeVerified: false`，绝不把未授权吞并为空数组伪成功；根目录无法访问或状态文件无法读取时如实汇报 `ROOT_UNREADABLE` / `STATE_UNREADABLE`，status 降级为 `partial` 或 `error`。 | `unknown scope is explicit error, not successful zero inventory`<br>`unreadable root and state errors do not mean empty inventory`<br>`unknown provider layers cannot be promoted to full inventory` | **PASS** |
| **外部符号链接防御** | `entry.isSymbolicLink()` 时跳过处理，不跟随软链接进入外部目录，并在 `reasons` 中记录 `EXTERNAL_LINK_UNVERIFIED`，同级合法包正常被索引。 | `symlink not followed, valid sibling retained and status partial` | **PASS** |
| **禁止猜测历史状态** | 历史已有本地 Skill 扫描时不凭空推断 origin（无持久记录时为 `unknown`）、version（仅提取 frontmatter 中显式 version，无则为 `null`）、enabled（显式为 `null`，并记录 `ENABLED_UNVERIFIED`，不预设 true 或 false）、updatedAt/publishedAt/downloads 均为 `null`。 | `actual historical file is inventoried without guessing origin/version/time/enabled`<br>`proven installed origin persists independently from discover winner; policy is not enabled proof` | **PASS** |
| **指纹与 Revision 单调递增** | `finish(result)` 按 `installId` 和 `skillKey` 稳定排序，计算整个库存结果对象的 sha256 `fingerprint`；当且仅当指纹变化时 `this.revision++`，无变化时读取保持 revision 严格稳定。 | `actual authorized empty root can be complete, revision stable across reads`<br>`local files unchanged, no schema migration and revision invalidates after metadata edit` | **PASS** |

### 3.2 安全路径与状态存储（`src/workshop-store.ts`）

| 验收项 | 验证内容与实现审查 | 对应测试用例与验证结果 | 判定 |
|---|---|---|---|
| **Darwin 根链接规范化与严格防越界** | 在 Darwin 平台下将 `/var`、`/tmp`、`/etc` 系统目录前缀规范化为其真实物理前缀 `/private`；保留自根到叶逐级 `lstat` 严密排查，若任何中间片段为符号链接直接抛出 `SCOPE_UNVERIFIED`，杜绝一切目录跳出与跨级逃逸；最终返回 `realpath`。在 `readWorkshopFile` 中复核 `nlink === 1`、非软链接、`O_NOFOLLOW` 打开，并在读取后比对 inode/dev/mtime/ctime，杜绝 TOCTOU 攻击。 | `metadata read rejects links, escaping paths and bounded files`<br>macOS 系统临时目录下 12 项 store 测试与 10 项 inventory 测试全量跑通 | **PASS** |
| **Schema 保真与只读保留** | `parseWorkshopState` 遇到 `schemaVersion > 1` 明确抛出 `SCHEMA_NEWER`，不进行降级写入、擦除或自动修复；磁盘文件字节原样保留。 | `higher schema persisted fixture is preserved byte for byte`<br>`state rejects higher schema without repair` | **PASS** |
| **CAS 并发控制与 Tombstone 保护** | `compareAndSwapWorkshopState` 比对 `old.revision === expected` 且 `candidate.revision === expected + 1`，否则抛出 `REVISION_CONFLICT`；严格校验旧状态中的每一个 `policyTombstone`，禁止被普通 CAS 操作隐式移除或篡改，违者抛出 `TOMBSTONE_PROTECTED`。 | `state CAS is immutable, increments exactly once and rejects stale revision`<br>`tombstones survive generic CAS, independent of records/catalog identity revisions` | **PASS** |

### 3.3 真实 Catalog 与数据源装配（`src/workshop-sources.ts`）

| 验收项 | 验证内容与实现审查 | 对应测试用例与验证结果 | 判定 |
|---|---|---|---|
| **真实 Catalog 读取与指纹** | `readWorkshopCatalog` 读取真实 `catalog/index.json`，计算其原始字节的 sha256 作为 revision；若目录缺失或格式损坏，捕获后返回 `revision: 'catalog-unavailable'` 并记录 `CATALOG_UNREADABLE`，不捏造推荐项。 | `packaged real catalog is enumerated and fingerprinted without recommendation fabrication`<br>`catalog failure returns per-source error rather than complete empty`<br>`catalog revision fingerprints bytes rather than fetch time` | **PASS** |
| **远程分页与有界限额控制** | `createWorkshopSources` 校验 page 在 1..20 范围内，单页上限 80，单次响应体上限 2MB (`SOURCE_BODY_LIMIT`)；`enumerateWorkshopRemote` 遵循 30 秒总预算 (`WORKSHOP_QUERY_LIMITS.wallMs`) 与 20 页/1600 项上限，遇到重复游标或无进展时立即熔断 (`SOURCE_NO_PROGRESS`)，超时立即触发 `AbortSignal` (`SOURCE_TIMEOUT`)。 | `20 pages and 1600 candidates stop real loader without requesting page 21`<br>`repeated identities/cursor and overlong page cannot inflate accepted results`<br>`timeout aborts uncooperative provider and retains no false completeness`<br>`full response byte limit and abort-aware body deadline are enforced` | **PASS** |
| **QueryService 与详情绑定** | `QueryService.detail` 严格校验 `validSourceRef`；对安装项与 catalog 来源，比对 `sameSource` 与当前 catalog revision，防止远程恶意替换或跨来源身份篡改；快照生命周期 TTL 5 分钟严格受控，revision 变更时游标失效 (`CURSOR_EXPIRED`)。 | `detail binds exact catalog source and returns honest metadata completeness`<br>`QueryService consumes snapshots: no remote browse, full exact count, revision and TTL rejection`<br>`snapshot eviction and catalog revision changes invalidate old pages` | **PASS** |

### 3.4 只读请求守卫与鉴权（`src/workshop-request-guard.ts`）

| 验收项 | 验证内容与实现审查 | 对应测试用例与验证结果 | 判定 |
|---|---|---|---|
| **精确 Origin 比对与防御伪造** | `canonicalWorkshopOrigin` 规范化协议、主机、有效端口（http:80 与 https:443 标准化），剔除含 path、query、hash、auth、多值逗号、null 等恶意 Origin；拒绝 `rawHeaders` 中包含多个 Origin 头；不信任未验证的 `X-Forwarded-Host`。 | `exact Origin compares protocol/host/effective port; malformed values fail closed`<br>`guard rejects Origin https://127.0.0.1:44444`<br>`guard rejects Origin http://127.0.0.1:44445`<br>`guard rejects Origin http://evil.test:44444`<br>`guard rejects duplicate Origin, POST and GET bodies; legal read passes` | **PASS** |
| **读 Body 前鉴权拦截** | 鉴权失败、Origin 违规、未授权 operation 或非 GET 方法，全部在读取请求体之前立即抛出错误（测试用例通过注入引发异常的 body 异步迭代器验证 `throw new Error('body touched')`，确认鉴权拦截发生在触碰请求体之前）；只读请求若附带非零 body 立即报 400 `INVALID_REQUEST`。 | `guard missing auth rejects before body iterator`<br>`guard expired auth rejects before body iterator`<br>`guard denied auth rejects before body iterator`<br>`guard missing origin config rejects before body iterator`<br>`guard missing authorization rejects before body iterator`<br>`guard cross scope denial rejects before body iterator` | **PASS** |

---

## 4. 验证命令与结果矩阵

所有检查均在当前工作树路径执行并复核：

| 检查项 / 验证命令 | 命令与参数 | 退出码 | 关键指标 / 结果详情 | 结论 |
|---|---|---|---|---|
| **全包回归测试** | `npm --prefix plugins/omnimux-market run test` | 0 | 628 passed, 0 failed, 7 suites, 0 skipped | **PASS** |
| **Workshop 定向测试** | `node --test plugins/omnimux-market/lib/tests/workshop-*.test.js` | 0 | 98 passed, 0 failed (query 45 + inv/store/src/guard 53) | **PASS** |
| **TypeScript 类型检查** | `npm --prefix plugins/omnimux-market run typecheck` | 0 | `tsc -p tsconfig.json --noEmit` 0 errors, 0 diagnostics | **PASS** |
| **代码格式与差异检查** | `git diff --check` | 0 | 格式干净，无空白与冲突标记 | **PASS** |
| **插件依赖与运行时边界** | `node scripts/verify-plugin-boundaries.mjs` | 0 | 2142 个源码文件边界全部验证通过 | **PASS** |
| **Agent 工具契约一致性** | `node scripts/verify-plugin-agent-tools.mjs` | 0 | 98 个工具与 inventory.md 登记 100% 对齐，0 错误 0 警告 | **PASS** |
| **前端插槽契约** | `node scripts/verify-slot-contracts.mjs` | 0 | 1647 个客户端文件扫描完成，0 violations | **PASS** |

---

## 5. 架构边界与后续依赖提示

1. **只读性与无副作用保证**：
   本次验收的 T02 模块（`workshop-inventory.ts`、`workshop-store.ts`、`workshop-sources.ts`、`workshop-request-guard.ts`）严格保持**只读查询与安全验证**特性。CAS 仅为可插拔状态迁移函数，`WorkshopStore` 仅对外暴露 `read()` 方法，未在运行时向磁盘写入任何非测试数据。
2. **外部依赖门槛说明**：
   - 依赖项 G-01（统一策略与加载屏障）与 G-03（实际 scope 核实）在当前 T02 只读模型下均正确回退：当 scope 未授权时返回 `SCOPE_UNVERIFIED`，当策略不可查时标记 `POLICY_UNVERIFIED` 与 `ENABLED_UNVERIFIED`，符合“不猜测、不伪造”的安全底线。
   - 后续 T03（安装/更新/卸载生命周期）在真正开放磁盘写操作与 Registry 注册前，必须确保解除对应门槛。
3. **下一步建议**：
   T02 真实库存与只读接线已具备高健壮性与完整测试保障，可以正式转交进入 **T04 界面入口、工作台 Tab 迁移与会话挂载** 阶段。
