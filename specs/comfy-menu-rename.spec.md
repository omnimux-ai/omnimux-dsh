# 规格：移除菜单里的 ComfyUI 工作流入口 + 把「ComfyUI 页面」改名为「ComfyUI 工作流」（Issue #3741）

## 业务目标

画布上现在有两处 ComfyUI 入口，名字还撞车：右键菜单里的「ComfyUI 工作流」（打开导入/最近记录面板）与加节点菜单里的「ComfyUI 页面」（真正的页面型节点）。用户要求只保留后者，并把它改名成「ComfyUI 工作流」——一个入口、一个名字，用户不用猜哪个是哪个。

## 用户关键操作旅程

1. 用户点「添加节点」→ 与 ComfyUI 相关的只有一项，名字是「ComfyUI 工作流」。
2. 用户加出来的节点卡片、以及点开后的全屏层标题，都是「ComfyUI 工作流」。
3. 用户在画布上右键（钻取面板）→ 菜单里不再出现「ComfyUI 工作流」入口，也不会再弹出导入/最近记录面板。
4. 用户仍然可以用工具栏的文件导入/拖拽把工作流 JSON 放进画布（这条通用路径不受影响）。

## 期望 UI 反馈

- 加节点菜单：`ComfyUI 工作流` 一项，无重复的 ComfyUI 条目。
- 节点卡与全屏层标题：`ComfyUI 工作流`。
- 右键菜单/钻取面板：ComfyUI 相关入口消失，其余菜单项顺序与行为不变。

## 变更点

1. `AddNodeMenu.tsx`：删除 `comfy.entry.*` 入口行与 `isComfyView` 面板视图（导入动作 + 最近记录列表），以及只服务它的 props/状态。
2. `comfyRecents.ts`：随入口一起删除（仅该入口使用）。
3. `ContextMenu.tsx` / `Toolbar.tsx` / `CanvasEditor.tsx`：删除只服务该入口的数据与动作传递；不留不可达分支、无人引用模块、只剩一处调用的包装。
4. `addNodePalette.ts` 与 i18n：`comfy-page` 的显示名改为「ComfyUI 工作流」；节点卡标题、全屏层标题、搜索关键字同步；中英双语。
5. 通用导入路径（Toolbar 文件导入/拖拽、transfer store 通用部分）保持不动。
6. 测试：改名后的显示名断言；菜单里不再出现该入口；通用导入仍可用。

## 非目标

不改 ComfyUI 页面节点本身的能力（托管后端、状态机、方案矩阵、目录设置都不动）；不删除通用工作流导入导出（Toolbar 的能力，与本入口无关）；不改队列/预览/模板面板。

## 新用户基线

新用户第一次打开画布时，ComfyUI 相关入口只有一项；不依赖任何本地缓存文件（最近记录缓存被删掉，不产生新文件）。

## 假设

1. 假设 `comfyRecents.ts` 只被这个入口使用（需在实现时确认；若还有别的引用则保留该模块并只删入口）。
2. 假设 transfer store 的通用部分被 Toolbar 的导入路径共用，因此只删入口相关接线，不删 store 本身。
3. 假设 i18n 的 `comfy.panel.*` / `comfy.entry.*` 键在删除入口后没有其他引用（需确认后一并清理，避免留死文案）。
4. 假设改名不涉及节点类型标识（`comfy-page` 这个内部 type 保持不变，只改显示名与文案），以免破坏既有工作流文件。
5. 假设搜索关键字也应包含新名字，用户搜「工作流」能搜到它。

## 证伪方式

1. 若加节点菜单里仍有两处 ComfyUI 入口，则不成立——断言菜单项里 ComfyUI 相关恰好一项。
2. 若右键菜单仍能打开导入/最近记录面板，则不成立——断言该入口不存在且对应视图代码已删。
3. 若删完还留有不可达分支或无人引用的模块，则不成立——由 lint/anti-slop 与人工检查共同确认。
4. 若通用导入被误删，则不成立——断言 Toolbar 导入路径的单测仍绿。
5. 若内部 type 被改名导致既有工作流文件读不出来，则不成立——断言 `comfy-page` type 未变。

## 验收标准

1. 加节点菜单与 ComfyUI 相关恰好一项，名字「ComfyUI 工作流」（中英一致）。
2. 右键菜单/钻取面板无该入口；导入面板与最近记录代码删除干净。
3. 节点卡与全屏层标题均为「ComfyUI 工作流」。
4. 通用导入路径仍可用，单测全绿。
5. 单测/typecheck/anti-slop 全绿；浏览器证据含「改名后的菜单项」与「右键菜单里已无该入口」两张。

## 旧标准变更

- `plugins/omnimux-workflow/src/canvas/editor/components/AddNodeMenu` 相关测试（若存在断言「ComfyUI 页面」文案或入口存在的用例）与 `comfyRecents` 的测试文件：随功能移除而删除或改名。
  - 原断言：菜单里有「ComfyUI 工作流」入口；`comfy-page` 显示名为「ComfyUI 页面」。
  - 必须改的理由：本任务按用户要求移除该入口、并把显示名改为「ComfyUI 工作流」。
  - 新期望证据：菜单里与 ComfyUI 相关恰好一项且名字为「ComfyUI 工作流」；入口相关的既有用例随代码一并删除（删除用例必须在实现时逐条在此登记：`<仓库相对路径>` :: `<用例名>`）。

### 实现时逐条登记：随 `comfyRecents.ts` 删除的用例

`comfyRecents.test.mjs` 整体删除——被删的 `comfyRecents.ts` 已无任何生产引用（唯一调用方是 transfer store 的「最近导入」缓存，而缓存只服务已移除的面板入口；通用导入路径不依赖它），模块删了，测它的文件没有存在意义。

- 原断言：`readComfyRecents` / `writeComfyRecents` / `upsertComfyRecent` / `formatComfyRecentTime` 的编解码往返、畸形输入退回空列表、同名提最前并截断上限、空名与超体积降级、存储不可用时不抛、时间格式 `MM-DD HH:mm`。
- 必须改的理由：被测模块随入口一起删除（Issue #3741 要求「不留死代码 / 无人引用模块」），无法保留这些用例。
- 新期望证据：新用例 `comfyMenuEntry.test.mjs :: 「添加节点」菜单里 ComfyUI 相关恰好一项，名字是 ComfyUI 工作流` 与 `AddNodeMenu.test.mjs :: ComfyUI 工作流导入入口已删除：无入口行、无 comfy 视图、无 comfy prop` 覆盖本任务的真实契约（入口唯一、改名到位、入口代码删除）。

- `plugins/omnimux-workflow/src/canvas/editor/utils/comfyRecents.test.mjs` :: `3669：解码畸形内容一律退回空列表，不抛出`
- `plugins/omnimux-workflow/src/canvas/editor/utils/comfyRecents.test.mjs` :: `3669：编码/解码往返保持条目与顺序，且截断到上限`
- `plugins/omnimux-workflow/src/canvas/editor/utils/comfyRecents.test.mjs` :: `3669：同名条目替换并提到最前，超出上限淘汰尾部`
- `plugins/omnimux-workflow/src/canvas/editor/utils/comfyRecents.test.mjs` :: `3669：空名称与超体积条目不入缓存（可解释降级）`
- `plugins/omnimux-workflow/src/canvas/editor/utils/comfyRecents.test.mjs` :: `3669：存储不可用时读空列表、写返回 false，不抛出`
- `plugins/omnimux-workflow/src/canvas/editor/utils/comfyRecents.test.mjs` :: `3669：可用存储里读回写入的内容`
- `plugins/omnimux-workflow/src/canvas/editor/utils/comfyRecents.test.mjs` :: `3669：展示时间格式为 MM-DD HH:mm，非法时间返回空串`

## 文档影响

本规格；证据 MD/JSON。若有文档提到「ComfyUI 页面」这个旧名字，同步改为「ComfyUI 工作流」。
