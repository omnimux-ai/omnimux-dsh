# Spec · 浏览器扩展实例连接状态实时同步与防缓存穿透优化

- **Issue**: #3077
- **Scope**: 
  - `plugins/omnimux-browser/extension/src/shared/instance-discovery.ts`
  - `plugins/omnimux-browser/extension/src/panel/components/WorkspaceSelector.tsx`
  - `plugins/omnimux-browser/extension/src/panel/components/DshInstanceSelector.tsx`
  - `plugins/omnimux-browser/src/index.ts`
- **Status**: Approved for implementation

---

## 1. 背景与根因

### 1.1 现状与用户问题
用户在精灵助手（OmniMux 浏览器扩展）中查看连接实例选择器：
1. 顶部药丸按钮显示绿色圆点（在线、已连接），说明后台 WebSocket 实际已经正常握手并保持活跃连接（`bridgeConnected: true`）。
2. 下拉菜单展开后，当前选中的 OmniMux Dev 条目却依然显示橙色圆点及「未开放」文案。
3. 点击右下角刷新按钮后，列表未能自动纠正为在线状态。

### 1.2 根本原因
1. **渲染状态未同步（UI Disconnect）**：
   - 触发按钮使用 `dotClass(resolved?.status, bridgeConnected)`，当 `bridgeConnected === true` 时正确映射为 `online`（绿色）。
   - 下拉列表行（`WorkspaceSelector.tsx` 与 `DshInstanceSelector.tsx`）渲染时，无论当前端口是否正是已激活连接的实例（`isChosen && bridgeConnected`），均机械使用单次探测保存的静态 `inst.status`，未与实时连接状态建立联动。
2. **HTTP 探测缺乏防缓存机制（Cache Trap）**：
   - `instance-discovery.ts` 中的 `fetch('http://127.0.0.1:${port}/ext/bridge-config')` 未携带 `cache: 'no-store'`。
   - 服务端 `/ext/bridge-config` 未显式返回 `Cache-Control: no-store, no-cache`。
   - 浏览器在应用冷启动瞬间若首次探测到非就绪响应，可能将失败状态保存在 HTTP 缓存中，导致用户手动点击刷新时重复命中旧缓存，无法穿透至真实服务。

---

## 2. 验收标准（Given / When / Then）

1. **已连通实例状态实时同步**：
   - Given: 浏览器扩展后台与目标实例（如 45120）已建立 WebSocket 连接（`bridgeConnected === true`）。
   - When: 用户打开实例下拉选择器。
   - Then: 列表中对应已连接的选中端口条目健康点显示为绿色（`online`），状态文本显示为「在线」或包含延迟，绝不显示「未开放」。
2. **探测请求防缓存穿透**：
   - Given: 用户点击刷新图标发起重新探测。
   - When: `probeInstance` 发送 HTTP 请求探测 `/ext/bridge-config`。
   - Then: 请求携带 `cache: 'no-store'`，服务端返回 `Cache-Control: no-store, no-cache`，确保每次探测均直接穿透至本机服务，不读取 stale 缓存。
3. **既有单元测试与 E2E 回归**：
   - 保证既有实例动态发现规格（`specs/instance-dynamic-discovery.md`）中的白名单、离线禁用与推荐徽章逻辑完全不受破坏。

---

## 3. 修改计划

1. `plugins/omnimux-browser/src/index.ts`：`/ext/bridge-config` 路由响应头增加 `'cache-control': 'no-store, no-cache, must-revalidate'`。
2. `plugins/omnimux-browser/extension/src/shared/instance-discovery.ts`：`probeInstance` 的 `fetch` 增加 `cache: 'no-store'`。
3. `plugins/omnimux-browser/extension/src/panel/components/WorkspaceSelector.tsx`：列表项状态结合 `bridgeConnected` 进行判断（若当前端口为已连接端口，则健康点与状态自动提升为 `online`）。
4. `plugins/omnimux-browser/extension/src/panel/components/DshInstanceSelector.tsx`：同步补齐相同的一致性保护。
5. 补充针对该场景的单元测试与回归断言。
