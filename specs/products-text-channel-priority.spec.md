# 链接导入大模型通道优先级与超时熔断规范

**文件：** `specs/products-text-channel-priority.spec.md` ｜ **优先级：** P0 ｜ **模块：** `plugins/omnimux-products`

## 1. 问题与目标

### 1.1 现象（用户真实旅程）

用户在桌面 App（Electron 运行时）里粘贴一个商品链接、点击「智能解析」，界面长时间停在加载态，**60 秒以上**才出现结果；用户以为卡死，反复点击，整条解析链路被拖垮。

### 1.2 根因

`createHubSeams(ctx).textComplete` 原先按「宿主席位 → 官方工具 → 本地 chat 桥」的顺序串行尝试：

- 宿主席位 `ctx.get('textComplete')` 的 `execute` 会去解析一个本机并不存在的 `omnimux` provider（或缺少会话连接），此时它**既不 resolve 也不 reject**，即"死锁通道"；
- 官方工具 `omnimux_text_complete` 在未装载/未配置时同样不可用；
- 只有最后兜底的 chat 桥能在 1.9 秒左右拿到答案，但前面的死锁已经把预算耗尽。

### 1.3 目标

把能在纯 Electron App 运行时稳定作答的本地 chat 桥升为**首选主力通道**，并为所有回退通道加**硬超时熔断**，让链接导入在秒级返回模型分析报告。

## 2. 通道契约

| 顺序 | 通道 | 解析方式 | 超时 | 命中后行为 |
|---|---|---|---|---|
| 1（主力） | 本地 chat 桥 `textCompleteViaChat` | 自适应读取 `~/.omnimux-dev/settings.yaml` / `~/.dsh/settings.yaml` / credentials 中已配置的本地提供商（如 CPA / `gemini-3.8-flash-high` / `http://127.0.0.1:8317/v1`） | 由通道自身决定（实测约 1.9s） | **直接返回，不再触碰任何席位** |
| 2（回退） | 宿主席位 `ctx.get('textComplete')` | 宿主提供的 `service.execute` | 8s（`Promise.race` 熔断） | 成功即返回 |
| 3（回退） | 官方工具 `omnimux_text_complete` | `tools.get('omnimux_text_complete').execute` | 8s（`Promise.race` 熔断） | 成功即返回 |
| 4（兜底） | 无通道作答 | 抛出聚合错误，导入降级为启发式答案 | — | 请求仍是 200，界面仍出结果 |

**不变量：**

1. 主力通道成功 ⇒ 席位与工具**零调用**（不产生任何副作用、不消耗配额）。
2. 任一通道的等待时间上界为 8 秒；超时后立即进入下一通道。
3. 超时与通道自身报错在错误信息中可分辨（`timed out after Nms` vs `failed: <原因>`）。
4. 被放弃的通道若在超时后 reject，不得产生 unhandled rejection。
5. 超时计时器必须 `unref()`，不阻止进程退出。
6. 全部通道失败 ⇒ `importProductFromUrl` 仍返回可用草稿（`analysis.mode === 'heuristic'`），不抛 500。

## 3. 验收用例表

| # | 场景 | 操作 | 预期结果 |
|---|---|---|---|
| 1 | 主力通道优先 | 席位返回 `{text:'seat'}`、工具返回 `{text:'tool'}`，chat 桥返回 `{mode:'live',text:'bridged'}` | ✅ 返回 chat 桥答案；席位调用次数 = 0、工具调用次数 = 0 |
| 2 | 主力失败后回退席位 | chat 桥抛错，席位返回 `{text:'x'}` | ✅ 返回 `{text:'x'}`，席位收到原始请求对象 |
| 3 | 主力失败后回退工具 | chat 桥抛错、无席位，工具返回 `{text:'y'}` | ✅ 返回 `{text:'y'}`；`max_tokens` 字段名与 `reason` 前缀 `omnimux-products` 保留 |
| 4 | 席位死锁熔断 | 席位 `execute` 返回永不 settle 的 Promise，chat 桥抛错 | 🚫 在 8s（测试注入 30ms）内拒绝，错误含 `textComplete seat timed out after 30ms` 与 `bridge offline` |
| 5 | 工具死锁熔断 | 工具 `execute` 永不 settle，chat 桥抛错 | 🚫 在超时上限内拒绝，错误含 `omnimux_text_complete timed out after 30ms` |
| 6 | 主力通道不被死锁拖累 | 席位永不 settle，chat 桥立即作答 | ✅ 立即返回 chat 桥答案，耗时远小于熔断阈值 |
| 7 | 席位挂死下的秒级导入 | 真实 `importProductFromUrl` 链路 + 宿主席位挂死 + 页面读取打桩 + chat 桥给出模型报告 | ✅ `POST /omnimux/products/import-from-link` 返回 200、`analysis.mode === 'model'`、`name` 取模型答案，**总耗时 < 3s** |
| 8 | 无宿主上下文 | `createHubSeams({})`，chat 桥打桩关闭 | 🚫 拒绝并给出聚合原因，含 `omnimux_text_complete unavailable` |
| 9 | `ctx.get` 抛错 | `get()` 抛 `no such seat`，chat 桥打桩关闭 | ✅ 工具通道仍作答，返回 `{text:'z'}` |

## 4. 验证命令

```bash
# 插件单测（含上表全部用例）
pnpm --config.verify-deps-before-run=false --filter omnimux-products test

# UI 规范静态门禁
node scripts/scan-ui-gates.mjs
```

## 5. 边界

- **总是**：新增/修改通道行为必须同时补单测；单测必须显式打桩 chat 桥，避免触达真实网络与本机凭据。
- **总是**：保留 8 秒默认上限与错误信息中可分辨的超时原因。
- **先问**：调整默认超时数值、改变通道顺序、新增第四条通道。
- **绝不**：在本插件内直连 provider HTTP、读取密钥文件或存放 provider key（凭据由宿主席位持有）；绝不为了让测试变绿而放宽断言或删除既有用例。

## 6. 残留风险（不在本次范围）

主力 chat 桥本身不受 8 秒熔断约束（任务要求仅对回退通道熔断）；若宿主配置的本地端点长期无响应，导入仍会等待该端点。已知本地端点实测约 1.9s，本次不引入额外上限。
