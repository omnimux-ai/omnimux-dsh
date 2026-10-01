# 规格说明：媒体任务生命周期统一与安全续接 (Media Task Lifecycle Specification)

## 1. 目标与范围 (Objective & Scope)

### 1.1 核心目标
修复 OmniMux 创作画布中官方多模态模型（视频/音频/图片）生成在等待阶段被误拦为“本机助手只承接文字”的根本缺陷，建立以 Hub 任务账本为单一事实源的媒体生成与收取全链路：
`统一提交决策 → 签发不可变 taskRef → 仅凭句柄收取（跳过新生成准入）→ 产物有效性校验 → 幂等入库`。

### 1.2 边界约束
- **严禁新增全局/过度设计 UI**：不增加独立任务卡片、浮层横条或额外徽标。
- **复用既有恢复控件**：画布顶栏“恢复执行”（Play 图标）作为受阻后继续收取的唯一交互入口。
- **严格 Fail-Closed**：未知任务、404/410 或损坏引用严禁静默重新提交生成，防止造成重复扣费。
- **不破坏离线隔离**：单元测试与 CI 不得访问公网外部真实多模态生成接口。

---

## 2. Hub 任务账本架构与契约 (Hub Media Task Ledger)

### 2.1 账本存储规则
- **物理路径**：`$DSH_HOME/omnimux/media-tasks/<taskRef>.json`。
- **权限与并发**：目录模式 `0700`，文件模式 `0600`。写操作必须使用 `atomicWriteFileSync`（写临时文件 + fsync + 原子 rename），杜绝写入中断导致文件损坏。
- **生命周期状态机**：
  `submitting`（提交意图）→ `submitted`（上游已受理）→ `ready`（产物已下载到受控缓存）
  异常态：`failed`（上游生成失败）、`unknown`（提交结果不明确，Fail-Closed）。

### 2.2 任务数据结构定义 (Task Schema)
```ts
export interface MediaTaskRecord {
  schemaVersion: 1;
  taskRef: string;          // Hub 生成的唯一不透明字符串，如 "mtask_<uuid>"
  requestKey: string;        // 幂等调用键 (由调用方作用域与节点标识派生)
  capability: 'image' | 'video' | 'audio';
  model: string;             // 提交时锁定的规范模型 ID
  operation?: string;        // 规范操作类型
  providerId: string;        // 实际提供商 (如 'omnimux', 'fal', 'openai')
  protocol: string;          // 传输协议 ('openai-media' 等)
  baseUrl: string;           // 实际目标网关 URL
  wireModel: string;         // 上游真实请求使用的模型名称
  group?: string;            // 命中的实际渠道组 (如 'default', 'minimax-h3-video-pro')
  taskPath: string;          // 绑定的状态查询与详情路径
  credentialRef?: string;    // 引用的凭据名或哈希绑定标识 (严禁存明文秘钥)
  submittedAt: number;       // 首次提交成功的时间戳
  deadlineMs: number;        // 绝对任务截止超时
  upstreamTaskId?: string;   // 上游供应商返回的真实任务 ID
  status: 'submitting' | 'submitted' | 'ready' | 'failed' | 'unknown';
  error?: { code: string; message: string };
  artifact?: {
    cachePath: string;       // Hub 托管的本地临时缓存路径
    mimeType: string;
    sizeBytes: number;
    sha256?: string;
  };
}
```

---

## 3. 接口与执行流程 (Interface & Execution Flow)

### 3.1 职责分离契约
- **`submitMediaTask(capability, input, context)`**:
  1. 解析输入模型、能力和渠道意图；
  2. 匹配有效提供商与可用凭据引用；
  3. 创建并原子写入 `submitting` 任务意图记录；
  4. 向对应适配器发起生成请求；
  5. 获得上游任务 ID 后，将记录原子更新为 `submitted` 并持久化 `upstreamTaskId`；
  6. 返回 `{ mode: "submitted", taskRef, taskId: upstreamTaskId }`。
- **`collectMediaTask(taskRef, input, context)`**:
  1. 依据 `taskRef` 读取持久化账本（若传入 `taskId` 则在本地账本中检索唯一定位）；
  2. **完全跳过新生成准入校验**（不检查当前默认模型、不触发 Agent 模式拦截）；
  3. 使用记录中锁定的 `baseUrl`、`taskPath` 与 `credentialRef` 轮询上游状态；
  4. 任务完成后，下载文件至 Hub 托管临时缓存，校验 MIME 与非空；
  5. 原子更新任务状态为 `ready`；
  6. 将缓存安全复制/交付至请求的 `dest`，返回 `{ mode: "live", taskRef, url: dest }`。

### 3.2 工作流与网关契约 (`omnimuxGateway.ts`)
- `submit` 返回包含 `taskRef` 的结果；
- `awaitTask(taskId, dest, signal)` 与 `reconcileTask(ref, dest, signal)`：
  优先透传 `taskRef`。当进程重启后，恢复逻辑直接使用持久化的 `taskRef` 发起 `collect`，保证路由与凭据绝对一致。

---

## 4. 受阻保护与断点恢复 (Error Handling & Recovery)

### 4.1 异常分类与应对策略
| 错误类型 | 典型原因 | 处理动作 | 是否保留 taskRef |
|---|---|---|---|
| **鉴权受阻** | 401/403 凭据过期或配置被清空 | 工作流转为已暂停（Paused），抛出可恢复错误 | 是 |
| **临时网络超时** | 上游轮询接口临时 502/超时 | 保持已暂停，等待用户点击恢复 | 是 |
| **下载或入库失败** | 磁盘满或文件写入冲突 | 任务在 Hub 中已为 ready，恢复时仅重试入库 | 是 |
| **上游明确失败** | 敏感词拦截/模型报错终态 | 标记为失败终态，清除任务引用 | 否 |
| **未查明上游结果** | 首次 POST 发出后断网无响应 | 标记为 `submission-unknown`，Fail-Closed | 是（禁止自动重发 POST） |
| **404 / 410 / 未知任务** | 上游无此任务 | 标记为不可恢复错误，Fail-Closed（禁止降级为重发） | 否 |

### 4.2 画布受阻态与文案白名单 (PM Sign-off Spec)
严格遵循现代 SaaS 极简规范（Linear / Vercel 风格，零多余徽标、零冗余图标）：
- **节点状态容器 (`GenerationStateContainer.tsx`)**：
  - 遇到受阻暂停时，展示纯文本提示：`暂时无法继续。`
  - 隐藏“重新生成”按钮，防止未出片时二次提交。
- **画布顶栏 (`HeaderControls.tsx`)**：
  - 维持现有胶囊状态：`已暂停`；
  - 现有播放图标按钮标题：“恢复执行”，用户点击后通知调度器从受阻节点继续尝试收取，不重新发起提交。

---

## 5. 验证与测试矩阵 (Verification Matrix)

### 5.1 最小验证命令集
```bash
# 1. Hub 媒体执行引擎与任务账本测试
pnpm --filter omnimux test

# 2. 工作流网关与执行器测试
pnpm --filter omnimux-workflow test

# 3. 工作流静态类型检查
pnpm --filter omnimux-workflow typecheck

# 4. 变更面静态合规门禁扫描
node scripts/impact-matrix.mjs --git-diff --base origin/main
```

### 5.2 核心断言场景
1. **Agent 对话模式放行断言**：在 `runtimeMode === 'agent'` 且未配置 BYOK 情况下，轮询请求（携带 `taskRef` 或账本记录的 `taskId`）100% 不触发 `omnimux-unconfigured`；
2. **特殊任务路径固化断言**：`index-tts` 等音频模型的收取请求必须严格使用视频任务路径，路由不漂移；
3. **断网受阻引用保护断言**：模拟轮询过程中 500 报错，验证工作流节点未调用 `clearUpstreamTask()`，任务引用依然保存在 DAG 状态中；
4. **幂等性与零重复提交断言**：同一 `requestKey` 重复调用 `submit`，生成 POST 接口调用计数必须严格为 1。
