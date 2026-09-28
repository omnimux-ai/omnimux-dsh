# 灵感库与资产库工具契约演进规格：#2779 协作式取消首片与 #2778 单工具 DSL 试点

- **文档状态**：草案提审中（Pending Approval）
- **交付总监**：齐活林（Qi）
- **技术责任人**：架构师 · 高见远（Gao）/ 后端工程师 · 寇豆码（Kou）
- **适用模块**：`plugins/omnimux-inspiration/` 与 `plugins/omnimux-assets/`
- **关联 Issue**：Issue #2779（协作式取消）、Issue #2778（defineTool DSL）

---

## 一、目标与问题界定（Objective & Problem Statement）

### 1.1 背景
在灵感库与资产库的技术重构方案复评中，确认了两个核心结论：
1. **取消真实缺口存在但必须解耦（#2779）**：目前工具执行未将 Host 传入的 `exec.signal` 传递到本地 dispatcher、媒体下载器及下游分析。当用户在宿主界面中止长耗时导入时，底层流下载可能继续运行、临时文件残留，甚至在取消后因网络错误触发重试或本地语义降级入库，造成脏数据落盘。
2. **DSL 迁移独立推进（#2778）**：原始 `register` 已是官方支持接口，具备 PTC 投影和 signal 接收能力。迁移的主要收益是参数结构强校验与跨工程一致性，而非接入取消的前提。直接全量改写 20 个工具有破坏历史参数宽松度的风险，必须先以单只读工具进行契约与 Host 兼容性试点。

### 1.2 本阶段核心目标（Slice 1 Goals）
- **垂直切片 1（#2779 首片：前台灵感创建协作式取消）**：
  以 `inspiration_create` 的前台下载链路为切片，实现从 Host `exec.signal` 到本地 Dispatcher、媒体下载流、临时文件清理的协作式取消。确保取消时：
  - 立即终止网络流与落盘写入；
  - 彻底清理本次生成的 `.tmp` 临时文件；
  - 严禁向本地库（`library.json`）写入半成品记录；
  - 严禁将取消误判为网络错误而触发第三方 Scraper 降级或本地分析降级；
  - 确保调用在所有资源收敛（quiescent）后才退出。
- **垂直切片 2（#2778 首片：`assets_get` 单工具 DSL 试点）**：
  选取无副作用的单只读工具 `assets_get` 进行 DSH 官方 `defineTool` 迁移试点，验证参数 schema 校验、输出 render 结构及运行时行为，建立标准测试用例模板。

---

## 二、架构设计与取消接缝（Architecture & Seams）

### 2.1 #2779 调用链与取消传播拓扑

```
Host ToolRuntime (exec.signal)
    │
    ▼
[inspiration_create execute(args, exec)]
    │ 传递 signal
    ▼
[http-routes dispatchRequest(ctx, req, url, id, { signal })]
    │ 传递 signal
    ▼
[http-handlers handleImportMedia({ ... }, { signal })]
    │
    ├── 1. Pre-fetch Check: signal.aborted -> 立即抛出 AbortError
    │
    ├── 2. Downloader (downloadMedia)
    │     ├── 传递 fusedSignal (caller signal + internal timeout)
    │     ├── fetchValidated(..., { signal: fusedSignal })
    │     └── writeBody stream pipeline 监听 abort:
    │           - 销毁流，删除当前 .tmp 文件
    │
    ├── 3. Commit Gate (提交门禁):
    │     - 检查 signal.aborted
    │     - 若已取消：拒绝 rename 临时文件，拒绝写入 library.json
    │     - 若未取消：原子 rename 并更新持久化索引
    │
    └── 4. Analysis / Fallback Gate:
          - 若发生 AbortError，严禁调用 scraper-fallback，严禁调用 analyzeInspirationVideo
          - 直接向上冒泡规范的取消错误
```

### 2.2 关键契约与生命周期边界

1. **前台取消 vs 后台任务（Ownership 隔离）**：
   - 本切片仅覆盖前台阻塞调用的 `inspiration_create`。
   - 竞品 `rival_refresh` 调度器队列、已受理返回 202 的后台任务、通过 URL 锁复用他人任务的场景，**严格排除在本切片之外**，严禁因单次调用取消而误杀共享任务。
2. **提交点原则（Commit Boundary）**：
   - 提交前：任何取消动作必须执行完整的临时资源清理（unlink `.tmp`），保持零副作用。
   - 提交后：若写盘已完成但 Host 迟到取消，必须返回明确的落盘成功回执，不得尝试破坏已持久化的索引。
3. **错误分类规范（Error Discrimination）**：
   - 区分 `AbortError`（调用方主动取消）、超时（Deadline Exceeded）与网络故障（Network Failure）。
   - 取消操作不可被降级为 HTTP 502，不可向用户报告模糊的网络异常。

### 2.3 #2778 `assets_get` 试点契约

- **参数规范**：
  ```javascript
  parameters: {
    id: { type: 'string', description: 'Asset unique identifier' }
  }
  ```
  - 显式确认根对象开放性：默认遵循 `defineTool` 隐式根规则；如需限制额外字段需显式在业务逻辑校验。
  - 保留参数合法性防守：如空字符串检查。
- **输出规范**：
  - 严格保持与现有 `{ schema, render }` 兼容。

---

## 三、测试策略与接缝（Testing Strategy & Seams）

### 3.1 测试执行接缝
所有测试必须在隔离的临时存储路径下运行（设置隔离的 `process.env.DSH_HOME`），严禁修改本机实际资产库与灵感库。

1. **Seam A（预取消接缝）**：
   - 传入已处于 `aborted = true` 的 signal 调用 `inspiration_create`。
   - 期望：立即以 `AbortError` 终止，零网络请求，零文件生成。
2. **Seam B（流传输中断接缝）**：
   - 在 Mock Fetcher 写入中间块（chunk）时触发 `controller.abort()`。
   - 期望：流立即关闭，磁盘上的 `.tmp` 文件在返回前被同步清除，`library.json` 未发生任何写入，未触发 `scraper-fallback`。
3. **Seam C（单工具 DSL 契约验证接缝）**：
   - 对迁移后的 `assets_get` 注入非法参数类型（如 `{ id: 123 }`），期望抛出 DSH 标准 `ToolArgsError`。
   - 注入有效参数，验证返回结构与现有逻辑 100% 一致。

### 3.2 运行与验证命令
```bash
# 灵感库单测验证（含网络阻断探针）
node --import ./scripts/deny-network.mjs --test plugins/omnimux-inspiration/src/*.test.js

# 资产库单测验证
node --test plugins/omnimux-assets/src/*.test.js
```

---

## 四、开发边界（Boundaries: Always / Ask First / Never）

- **必须遵循（Always）**：
  - 每次单测必须隔离 `DSH_HOME`，结束必须清理临时目录。
  - 取消时必须等待所有句柄与流完全关闭（quiescent）后再 resolve/reject。
  - 必须保持 0 个出网请求（离线 Mock 验证）。
- **必须先确认（Ask First）**：
  - 修改 `plugins/omnimux/src/official/client.js` 等公用官方 Hub 客户端。
  - 修改其他 19 个工具的公开 Schema。
- **严禁发生（Never）**：
  - 严禁在测试或实现中污染开发者的生产灵感库 `~/.dsh/omnimux/`。
  - 严禁将 AbortError 吞没并降级为第三方抓取或本地假数据分析。
  - 严禁向后台共享任务队列发送无差别中止。

---

## 五、垂直任务清单（Tickets & Dependency Topology）

```
[Ticket 1: #2779 Dispatcher & Signal 贯通]
                    │
                    ▼
[Ticket 2: #2779 Downloader 流取消与 .tmp 清理]
                    │
                    ▼
[Ticket 3: #2779 提交门禁与取消态防降级端到端测试]
                    │
                    ▼
[Ticket 4: #2778 assets_get 单工具 DSL 迁移试点]
```

- **Ticket 1 (`feat(inspiration): 灵感库 Dispatcher 注入与传递 exec.signal`)**：
  在 `inspiration_create` 入口读取 `exec?.signal`，并在 `dispatchRequest` 及内部路由参数中透传，不影响无 signal 时的原有兼容性。
- **Ticket 2 (`feat(inspiration): downloadMedia 流取消监听与临时文件收敛清理`)**：
  在 `downloader.js` 中接入调用方 signal，流写入异常或取消时及时关闭流句柄，确保 `.tmp` 临时文件在返回前彻底删除。
- **Ticket 3 (`test(inspiration): 前台导入协作取消与零脏数据落盘端到端红绿验证`)**：
  编写针对 Seam A / Seam B 的专用离线单元测试，验证取消时无半成品入库、无 fallback 触发、零网络外联。
- **Ticket 4 (`refactor(assets): assets_get 工具迁移至 defineTool DSL 试点`)**：
  迁移单个只读工具 `assets_get`，验证参数校验错误格式与现有业务逻辑的等价性，通过全部现有资产库测试。
