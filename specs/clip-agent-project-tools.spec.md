# Spec · clip-agent-project-tools（Issue #2461）

## 1. 目标（Objective）

剪辑插件（omnimux-clip）已有 6 个 `clip_*` Agent 工具，但全部要求先给 `projectId`，而项目只能由人在侧边栏面板手动新建；`clip_view` / `clip_snapshot` 还依赖编辑器面板已挂载。Agent 无法零人工完成「建项目 → 导入素材 → 剪辑 → 预览 → 导出」闭环（线上会话已实测卡死于此）。

本任务补齐三个缺口工具：

| 工具 | 行为 | 写操作 |
| --- | --- | --- |
| `clip_list` | 列出已有剪辑项目（id、标题、更新时间、时长秒），支持 `limit` | 否 |
| `clip_create` | 新建项目（`name` 必填；`resolution` 枚举 landscape/portrait/square，默认 landscape；`fps` 默认 30），落盘并返回 `projectId` | 是 |
| `clip_open` | 拉起/聚焦侧边栏「视频剪辑」面板并挂载指定工程，使 overlay ready（`__omnimuxClipReady`），打通 clip_view/clip_snapshot/导出 | 否（仅 UI 导航） |

成功标准（可测）：

1. `clip_create` 返回 `projectId` 后，`clip_edit`（import_media）→ `clip_list` 可见 → `clip_get` 可读，全链无人工介入。
2. `clip_list` 能列出侧边栏手动创建并已保存的项目（同一份 projectStore）。
3. `clip_open` 在无头/无侧边栏环境下抛出明确的 `ClipDomainError`（不静默假成功），不污染 undo。
4. 既有 6 个工具行为零变化（既有测试不改即绿）。

## 2. 命令（Commands）

```bash
pnpm --filter omnimux-clip test          # 插件单测
pnpm test:agent-tools                    # Agent 工具四层门禁
pnpm verify:product-baseline             # 产品基线门禁
pnpm test:gates                          # 规格/验证门禁（本仓）
```

## 3. 项目结构（Project Structure）

- 改动根：`plugins/omnimux-clip/`
  - `src/tools.js` — 新增三个工具 spec（复用 `objectParams` / `jsonOut` / `store`）
  - `src/store/projectStore.js` — 已具备 `create(id, schema)` 与 `list(opts)`，**不改动**除非必要
  - `src/index.js` — 注册处如需注入 UI 拉起依赖则在此接线
  - `src/tools.test.js` — 新增工具单测
  - `dsh.manifest.json` — capabilities.tools 增加三行
  - `skills/clip-craft/SKILL.md` 与 `CLIP_PROMPT` — 更新工作循环（先 clip_list/clip_create 拿 projectId）
- 本规格：`specs/clip-agent-project-tools.spec.md`（仅本工作树）

## 4. 代码风格（Code Style）

遵循 `src/tools.js` 现有风格：具名导出、JSDoc 类型注解、`objectParams({...})` 编译 schema、错误一律 `throw ClipDomainError.*`，绝不返回 `{ ok: false }`。时间入参用秒、存储用毫秒。projectId 生成沿用 store 现有约定（不允许 Agent 自由传入任意 id 覆盖他人工程：create 由 host 生成 id）。

## 5. 测试策略（Testing Strategy）

- 单测（node:test，随 `src/tools.test.js`）：三工具的正/反路径——create 必填校验、分辨率枚举校验、list 排序与 limit、open 在无 UI 桥时的显式失败。
- 门禁：`pnpm test:agent-tools` 四层（Schema Lint / 沙箱执行 / 意图 eval / 安全）。
- 基线：`pnpm verify:product-baseline`。
- UI 行为变化极小（仅可选的面板拉起指令）；clip_open 的浏览器侧证据在工作树内 ego-browser / QA runner 验证。

## 6. 边界（Boundaries）

- **总是做**：先 `store.load/list` 校验再动手；所有失败 throw 领域错误；测试先于合并全绿。
- **先问**：改 `projectStore` 的落盘格式；给 create 增加素材导入等超出「空工程」的能力。
- **绝不做**：触碰 `src/client/openreel/` vendor 目录；发明 store 没有的持久化路径；让 Agent 传入任意 projectId 覆盖既有工程；在 create 里静默吞错。

## 假设

1. `clip_open` 的最小可行实现 = host 侧向侧边栏/工作台发拉起指令；若运行时无此通道则显式报错，用户手动打开后可继续——不阻塞 list/create 的价值。
2. 三个工具沿用现有 `ctx.tools.register` 通道，无需新 hub seam。
3. resolution 枚举与 GUI「新建剪辑项目」表单一致（横屏/竖屏/方形）。

## 开放问题

- 无（实现中若 UI 拉起通道不存在，降级为显式错误 + 提示用户手动打开）。
