# 规格：资产文件夹详情侧边栏轻量弹窗化与编辑入口改造

## 1. 业务目标与背景
在 OmniMux 资产中心浏览资产文件夹（如角色包、场景包等）时，现行设计在右侧默认常驻渲染 `AssetDetail`（320px 侧边栏），导致中间核心媒体素材网格视口受限。同时，若用户点击侧边栏右上角关闭，会连同当前文件夹浏览状态一并退出。

为提供更沉浸、高留白、单层直观的现代操作体验，本任务对资产详情做轻量弹窗化改造：
1. **取消常驻侧边栏**：移除右侧常驻占用 320px 的 `AssetDetail` 侧边栏，让素材网格 100% 铺满主体区域；
2. **面包屑行增加编辑入口**：在有「返回」按钮的面包屑导航行中，增加「编辑」图标按钮；
3. **轻量详情弹窗**：点击编辑图标后，以弹窗形式展示资产详情，且**不显示关联的素材列表**，仅保留名称、类型、描述、引用及保存操作；
4. **共享组件规范复用**：弹窗复用 `dsh-ui-kit` 共享 UI 组件（`ModalDialog`、`InputField`、`DropdownSelect`、`Button`、`IconButton`），100% 遵循设计系统 Token。

## 2. 用户旅程与界面契约

### 2.1 文件夹浏览视图（`AssetBrowse`）
- 顶部导航行（`.omnimux-assets-crumbs`）：
  - 保留「返回」按钮与面包屑路径（如 `科技 Vlogger-粉衣女郎 Yuna`）；
  - 在面包屑路径旁新增编辑图标按钮（`IconButton` 挂载 `EditIcon`），并提供可访问性标签与提示；
  - 点击编辑图标，触发 `onEdit()` 回调，呼出资产详情弹窗；
- 主体素材网格：全宽自适应排列，不再被右侧侧边栏挤压。

### 2.2 资产详情弹窗（`AssetDetailDialog` / `AssetDetail`）
- 复用 `dsh-ui-kit` 的 `ModalDialog`（`size="md"`，`title="资产详情"`，自带右上角关闭与遮罩）；
- 弹窗主体内容（严格对齐图 2）：
  - **名称**：`InputField`，支持编辑资产名称；
  - **类型**：`DropdownSelect`，支持切换 6 大资产类型（角色、场景、风格、道具、知识包、自定义）；
  - **描述**：`textarea`（`.omnimux-assets-textarea`），支持编辑多行详细描述；
  - **引用**：展示 `@类型/名称` 规范化只读引用；
  - **移除素材列表**：彻底不渲染原侧栏中的 `detail.files` 素材列表部分；
- 底部操作栏（`footer`）：
  - 「保存」按钮（`Button` variant="primary"），支持 busy loading 态；
  - 点击保存后调用更新资产接口，更新成功后自动关闭弹窗并刷新界面元数据。

### 2.3 舞台编排（`AssetsStage`）
- `AssetsBody` 彻底移除 `<aside className="omnimux-assets-detail">` 挂载；
- `AssetsStage` 维护弹窗开关状态 `editingDetail`；
- 在 `AssetBrowse` 触发 `onEdit` 时开启弹窗，在关闭或保存时销毁弹窗，不影响当前资产文件夹的浏览堆栈。

## 3. 验收标准与测试
1. 单元与组件契约测试：
   - `AssetBrowse.jsx` 必须接收并支持 `onEdit` 回调，且在面包屑行中正确渲染编辑图标按钮；
   - `AssetDetail.jsx` 必须使用 `ModalDialog` 呈现，且不再包含文件列表容器；
   - `AssetsStage.jsx` 中 `AssetsBody` 必须不再常驻挂载 `aside.omnimux-assets-detail`；
   - 资产修改后保存逻辑（`name`, `type`, `description`）保持 100% 连通与数据一致。
2. 自动化测试套件（`pnpm test`）100% 绿灯通过，零报警、零回归。
