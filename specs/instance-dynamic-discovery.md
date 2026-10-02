# Spec · 连接实例选择器动态发现（Instance Dynamic Discovery）

- **Owner**: PM 许清楚 / FE 裴像素
- **Scope**: `plugins/omnimux-browser/extension/src/panel/components/DshInstanceSelector.tsx`、`WorkspaceSelector.tsx`（复用同一发现逻辑）
- **Status**: Approved for implementation

---

## 1. 背景与目标

现状：`PRESET_INSTANCES` 写死 OmniMux PRD (:43128) 与 DSH Desktop (:43120)；OmniMux Dev (:45120) 在跑但不可选。background 已有 `DISCOVERY_PORTS`（`src/background/index.ts:131`），面板已有 `probeInstanceHealth(port)`（fetch `http://127.0.0.1:<port>/ext/bridge-config`，1.2s 超时）。

**目标（方案 A · 纯扩展侧动态发现）**：面板打开选择器时遍历 `DISCOVERY_PORTS` 逐端口探测，按响应动态生成实例条目，选中仍写 `omnimux_target_port`（custom 路径已支持任意端口）。

### 探测结果判定（唯一真源）

| HTTP 结果 | 判定 | 条目 |
|---|---|---|
| 200 + JSON 且 `wsUrl` 以 `ws://` 开头 | **在线** | 可点选，显示延迟 |
| 200/403 但无 `wsUrl`（含 43120 `forbidden` 字符串） | **运行中·未开放** | 可点选（用户可能就是要连它，bridge 连接失败由既有链路报错兜底） |
| 超时 / 网络错误 / 其他 | **离线** | 仅已知端口（映射表内）显示为离线条目；未知端口不展示 |

## 2. 验收标准（可测）

1. **Dev 可发现**：OmniMux Dev 运行于 :45120 时，打开选择器出现 `OmniMux Dev` 条目，状态「在线」，可点击选中。
2. **PRD 离线**：:43128 无进程时，`OmniMux PRD` 条目存在、状态「离线」，不可点选。
3. **空态**：全部已知端口无响应且无 custom 记录时，列表区显示空态文案（见 §4），自定义入口仍可用。
4. **选中生效**：选中 `OmniMux Dev` 后 `omnimux_target_port` 写入 `45120`，面板 bridge 走 `ws://127.0.0.1:45120/ext/bridge`。
5. **延迟显示**：在线条目状态处显示实测毫秒数（如 `在线 · 42ms`），不得显示固定假值。
6. **刷新**：点击刷新按钮重新触发全端口探测，探测期间刷新图标呈 loading 态，不重排已选中项。
7. **去重**：custom 端口与动态发现同端口时，只渲染一条（动态条目为准，名称取映射表或 `本地实例 :端口`）。

## 3. UI 元素白名单（Whitelist Lock · 未列入即非法）

### 3.1 下拉结构

```
┌─────────────────────────────────┐
│ [行] 健康点 名称 · 端口   状态  ✓ │
│ ...                             │
│ ─────────────────────────────── │
│ 自定义端口            [刷新图标] │
└─────────────────────────────────┘
```

| 组件 ID | 元素类型 | 允许内容 | 规则 | 严禁附加项 |
|---|---|---|---|---|
| `selector.trigger` | 触发按钮 | 当前选中实例名；未选中时 `选择实例` | 常驻 | 禁加副标题、禁加版本号 |
| `list.item` | 行容器 | 整行可点（离线行 `disabled`） | 每实例一行 | 禁加分割线间分组小标题 |
| `item.dot` | 健康点 | 绿=在线 / 灰=离线 / 橙=未开放 | 8px 圆点 | 禁加动画脉冲、禁加图标字符 |
| `item.name` | 名称文本 | 实例名（映射表或 `本地实例`），后接 ` :端口` | 同行同字号，端口用次要色 | 禁加独立端口胶囊 Badge |
| `item.badge` | 徽章 | 仅 `推荐`，仅 Dev 条目可带 | 名称右侧，小胶囊 | 除 `推荐` 外禁加任何徽章（`高画质`/`极速`/`NEW` 等均非法） |
| `item.status` | 状态文本 | `在线 · {n}ms` / `未开放` / `离线` | 行右侧，次要色 | 禁加图标、禁加括号解释 |
| `item.check` | 选中勾 | `✓` | 仅当前选中行，行最右 | 无 |
| `list.divider` | 分割线 | — | 实例列表与自定义入口之间，仅一条 | 禁加 `自定义` 分组标题 |
| `footer.custom` | 自定义入口 | `自定义端口` | 点击展开端口输入框 | 禁加 `+` 图标、禁加说明文字 |
| `footer.refresh` | 刷新按钮 | 刷新图标（无文字） | 触顶行右侧；探测中旋转/禁用 | 禁加 `刷新` 文字标签 |
| `list.empty` | 空态文本 | `未发现可用实例` | 居中，次要色 | 禁加插画、禁加引导按钮 |

### 3.2 未开放/离线的交互

- `未开放` 行：可点选（选定后由既有 bridge 连接失败路径报错，本组件不新增提示条）。
- `离线` 行：`disabled`，不可点；当前选中项若探测为离线，保留选中样式但状态显示 `离线`。

## 4. 文案字典（zh / en · 逐字锁定）

| key | zh | en | 说明 |
|---|---|---|---|
| `instance.omnimuxDev` | `OmniMux Dev` | `OmniMux Dev` | :45120 |
| `instance.omnimuxPrd` | `OmniMux PRD` | `OmniMux PRD` | :43128 |
| `instance.dshDesktop` | `DSH Desktop` | `DSH Desktop` | :43120 |
| `instance.local` | `本地实例 :{port}` | `Local :{port}` | 未知端口兜底 |
| `instance.recommended` | `推荐` | `Recommended` | 仅挂在 `OmniMux Dev`（当前开发场景为推荐目标） |
| `status.online` | `在线 · {ms}ms` | `Online · {ms}ms` | 健康点绿色 |
| `status.noBridge` | `未开放` | `Unavailable` | 响应存在但无 `wsUrl`；健康点橙色 |
| `status.offline` | `离线` | `Offline` | 健康点灰色 |
| `selector.placeholder` | `选择实例` | `Select instance` | 无选中时触发按钮 |
| `selector.refresh` | `刷新` | `Refresh` | 刷新按钮 `aria-label`（图标无文字，无障碍名称由此提供） |
| `selector.detecting` | `检测中` | `Detecting` | 首轮探测中且列表为空时的占位状态 |
| `footer.custom` | `自定义端口` | `Custom port` | |
| `empty.noInstances` | `未发现可用实例` | `No instances found` | 空态 |
| `custom.placeholder` | `端口号` | `Port` | 自定义输入框占位符 |
| `custom.confirm` | `确定` | `Add` | 自定义端口确认按钮 |

**红线**：`自动 (由 Agent 决策)`、`本地实例 (端口 45120)`、`在线 (已连接)` 之类括号解释一律非法；`在线` 后只允许 ` · {ms}ms` 一种后缀。

## 5. 排序与状态规则

1. 在线实例在前；组内按已知端口优先级 `45120 → 43128 → 43120 → 其余 DISCOVERY_PORTS 顺序`。
2. `未开放` 次之（同样按端口优先级），`离线` 最后。
3. 当前选中项**不置顶**——保持自然排序位置，仅用 `✓` 标记（避免每次打开列表跳动）。
4. custom 端口与动态条目同端口 → 合并为动态条目一条；custom 独有端口且不在 `DISCOVERY_PORTS` → 按 `本地实例 :{port}` 追加在已知端口之后（按其 port 升序排在未知端口区）。

## 6. 边界与非目标

### 边界

- **探测时机**：每次打开下拉时触发一次并发探测（`Promise.allSettled`，单端口 1.2s 超时，总耗时 ≤1.5s）；关闭下拉不做后台轮询。
- **缓存**：面板会话内缓存上一次探测结果用于打开瞬间先渲染（标记各条目为上次状态），本轮探测返回后原地刷新状态；不重启缓存跨面板生命周期。
- **手动刷新**：`footer.refresh` 保留，点击即重探；探测中禁用防连点。
- **失败重试**：不做自动重试；超时端口下一轮打开时自然重探。
- **并发安全**：探测竞态以「最后一次打开/刷新」的结果为准（stale response 丢弃）。

### 非目标（Non-Goals）

- 不改 `background/index.ts` 的 `discoverBridge` 端口顺序与逻辑。
- 不动宿主 fork / 桌面端代码。
- 不给实例加身份字段（名称、版本、PID 均不采集不显示）。
- 不新增「编辑/删除自定义实例」管理界面。
- 不引入 soundness 之外的新状态（如「连接中」由既有 bridge 链路表达，本组件不渲染）。

## 7. 实施与验收计划

1. FE 在 `DshInstanceSelector.tsx` 内实现 `discoverInstances()`（遍历 `DISCOVERY_PORTS` → 判定表 → 排序规则 → 条目模型），`WorkspaceSelector.tsx` 复用同一函数。
2. 删除 `PRESET_INSTANCES` 写死清单；已知端口命名映射保留为常量表。
3. 自测场景：仅 45120 在跑 / 仅 43120 在跑（未开放）/ 全部离线 / custom 端口与 45120 冲突。
4. PM 终验核对 §3 白名单与 §4 文案逐字一致，任何未列元素（Badge/副标题/图标/括号说明）即 REJECT。
