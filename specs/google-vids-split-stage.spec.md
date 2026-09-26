# Google Vids 中间栏主舞台与视频剪辑同屏开发规格说明书 (Spec)

- **Issue**: #2698
- **模块**: `omnimux` / `omnimux-video` / `omnimux-clip`
- **状态**: Approved (产品经理许清楚核定)
- **权威等级**: L1

---

## 1. 目标与背景 (Objective & Background)

### 1.1 业务背景
当前架构中 `Google Vids (Veo)` 与 `OmniMux Clip (视频剪辑)` 作为右侧辅助侧边栏 `betterSidebar` 的互斥页签存在，导致同屏死锁、指引方向颠倒（中栏需要向右插入剪辑器，但此前被放在右侧并写着向左插入）与心流阻断。

### 1.2 改造目标
1. **中栏主舞台沉浸生成 (Left-Center Stage)**：将 Google Vids 迁出 `betterSidebar`，升级为一级产品舞台（Product Stage），挂载于 `[data-slot="shell.overlay"]`，覆盖主会话区。
2. **右栏剪辑轨道常驻同屏 (Right Studio Rail)**：激活 Google Vids 时，系统联动激活右侧 `betterSidebar` 并强制切至 `omnimux-clip:studio`，形成 **45% : 55%** 黄金比例同屏创作格局。
3. **跨栏语义与数据流闭环 (Cross-Column Synergy)**：
   - 门禁状态秒级感知：中栏门禁条感知右侧工程打开状态，就绪后平滑淡出自愈；
   - 成片即入轨：成片动作明确为「`→ 插入`」，点击后毫秒级追加至右侧时间轴主视频轨（V1），监视器自动加载预览；
   - 资产模式回填：成片支持一键回填至底部抽屉的「修改」或「扩展」卡槽，无缝启动下一次生成。

---

## 2. 核心架构与命令 (Commands & Architecture)

### 2.1 执行与测试命令
- 单元测试：`pnpm --filter omnimux test` / `pnpm test`
- 打包构建：`pnpm build`
- 规则与门禁扫描：`node scripts/scan-ui-gates.mjs`

### 2.2 文件结构变动拓扑
- `plugins/omnimux/src/client/conversation-box.js`：
  - `STAGE_CSS_CLASS_MAP` 新增 `'omnimux-vids': 'omnimux-vids-stage'`；
  - `PRODUCT_STAGE_CHROME` 针对 betterSidebar、toggleCluster、shell.sidebar.auxiliary 隐藏规则追加 `:not([data-dsh-product-stage="omnimux-vids"])` 豁免。
- `plugins/omnimux-video/dsh.manifest.json`：
  - capabilities.slots 声明 `shell.overlay` 目标并指向 `src/client/GoogleVidsStage.jsx`。
- `plugins/omnimux-video/src/client/index.js`：
  - 移除 `betterSidebar.registerTab` 注册；
  - `ctx.slots.inject('shell.overlay', ...)` 注册 `omnimux-vids-stage` (order: 36, component: GoogleVidsStage)。
- `plugins/omnimux-video/src/client/sidebar-entry.js`：
  - 点击执行 `claim('omnimux-vids')` + `workbench.open('omnimux-clip:studio')` + `workbench.setFocus('split')`。
- `plugins/omnimux-clip/src/client/OpenReelStudioTab.jsx`：
  - 广播工程就绪状态，监听 `omnimux-clip:insert` 事件将切片追加至 V1 视频轨。
- `plugins/omnimux-video/src/client/GoogleVidsStage.jsx`：
  - 100% 严格对照产品经理 Spec 白名单实现全屏组件与极简文案。

---

## 3. UI 元素白名单与文案字典 (UI & Copy Spec — 唯一真源)

### 3.1 顶部导航与门禁区域 (Chrome & Banner)
| 组件 ID | 元素类型 | 精确显示文案（逐字锁定） | 显隐与交互规则 | 严禁项 |
|---|---|---|---|---|
| `stage.header.closeBtn` | 图标按钮 | `✕` (SVG 或原生) | 点击触发 `releaseProductStage('omnimux-vids')` | 禁加文字标签 |
| `stage.header.title` | 页面标题 | `Google Vids` | 常驻 14px 加粗 600 | 禁加 Emoji/副标题 |
| `stage.header.badge` | 状态微标 | `内测版` | 常驻 12px 轮廓微标 | 禁写营销词 |
| `stage.header.wizardBtn` | 辅助按钮 | `向导` | 展开开箱向导面板 | 禁写开箱向导 |
| `stage.banner.gate` | 警告提示条 | `请在右侧创建或打开剪辑工程` | 工程未进入时显示；工程就绪后平滑淡出收缩 | 禁加 Emoji/废话 |
| `stage.banner.createBtn` | 行内动作按钮 | `新建工程` | 仅未就绪显示，触发右侧新建工程 | 禁加外发光 |

### 3.2 任务时间线生成记录流 (Timeline Feed)
| 组件 ID | 元素类型 | 精确显示文案（逐字锁定） | 显隐与交互规则 | 严禁项 |
|---|---|---|---|---|
| `feed.header.count` | 分组标题 | `生成记录 ({count})` | 显示任务总数 | 禁写时间线/历史记录 |
| `feed.card.progressNum` | 动态数值 | `{progress}%` | 生成中显示 | 禁加 Loading |
| `feed.card.genStatus` | 状态描述 | `正在生成视频...` | 生成中文案 | 禁暴露底模名称 |
| `feed.card.upscaleStatus`| 状态描述 | `正在升频画质...` | 升频中文案 | 禁冗长修饰 |
| `feed.card.cancelBtn` | 文本按钮 | `取消` | 点击中断后台生成 | 禁加图标 |
| `feed.card.specTag` | 规格微标 | `{res} · {dur}s` / `{res} · {dur}s · 已升频` | 浮于成片视频预览右下角 | 禁加括号与营销词 |
| `feed.card.insertBtn` | 核心按钮 | `→ 插入` | 点击向右侧时间轴主视频轨无缝追加该片段 | 严禁写成 `← 插入` |
| `feed.card.extendBtn` | 动作按钮 | `延续` | 切换至「扩展」Tab 并载入原片卡槽 | 禁加图标 |
| `feed.card.modifyBtn` | 动作按钮 | `修改` | 切换至「修改」Tab 并载入底片卡槽 | 禁加图标/编辑 |
| `feed.card.upscaleBtn` | 动作按钮 | `升频` | 点击启动 1080p 增强；已升频后置灰 | 禁加图标 |
| `feed.card.removeBtn` | 破坏性按钮 | `移除` | 危险红色文字，点击移除任务 | 禁加垃圾桶图标 |

### 3.3 底部创作抽屉与参数区 (Prompt Drawer & Controls)
| 组件 ID | 元素类型 | 精确显示文案（逐字锁定） | 显隐与交互规则 | 严禁项 |
|---|---|---|---|---|
| `drawer.tab.create` | 模式选项 | `创建` | 默认激活 | 禁写文生视频 |
| `drawer.tab.modify` | 模式选项 | `修改` | 挂载视频底片 | 禁写编辑/微调 |
| `drawer.tab.animate`| 模式选项 | `动画` | 挂载参考图片 | 严禁写成添加动画 |
| `drawer.tab.extend` | 模式选项 | `扩展` | 挂载前序视频 | 禁写视频延展 |
| `drawer.input.area` | 多行输入框 | 见 3.4 动态占位符 | 未建工程时彻底 disabled | 禁拉伸尺寸 |
| `drawer.param.capsule`| 规格胶囊 | `{res} · {ratio} · {dur}s` | 客观技术参数 | 禁加营销包装词 |
| `drawer.submit.btn` | 生成动作键 | `↑` (ArrowUp 图标) | 条件满足时高亮 | 禁写文字 |

### 3.4 动态占位符 (Placeholder) 字典
1. 工程未就绪态：`请先在右侧创建或打开剪辑工程...`
2. 创建模式：`描述您想生成的视频画面与动作...`
3. 修改模式：`描述需要对当前视频进行的调整（如光影或服装风格）...`
4. 动画模式：`描述图像素材中应展现的动作与运镜细节...`
5. 扩展模式：`描述当前视频结尾后续发生的情节发展...`

---

## 4. 边界与约束 (Boundaries & Invariants)
- **Always**：
  - 100% 消费 CSS Token：`--dsw-alias-*`。
  - 严格遵守 32px 控件高基准与 8px 圆角体系。
  - 严格对照第 3 节文案与 UI 白名单，零自由发挥。
- **Never**：
  - 绝对禁止使用装饰性 Emoji（如 💎、✨、🔥 等）。
  - 绝对禁止在 `betterSidebar` 再次注册该 Tab。
  - 绝对禁止破坏右侧时间轴或使右侧侧边栏空白。

---

## 5. 验收标准 (Acceptance Criteria)
1. 双栏同屏：点击左侧 Google Vids 入口，中栏激活主舞台，右侧同时打开 Clip 剪辑工作台，会话列被中栏覆盖但右侧栏正常可见。
2. 文案一致性：源码中文案 100% 匹配第 3 节白名单，无任何多余词汇。
3. 联动与数据流：成片卡片动作栏点击「`→ 插入`」，右侧 Clip 时间轴 V1 轨道无缝追加片段，并提供轻量反馈。
4. 门禁自愈：右侧无工程时中栏提示「请在右侧创建或打开剪辑工程」且输入框置灰禁用；右侧新建或打开工程后门禁条淡出，输入框激活。
5. 退出安全：中栏点击 `✕` 退出舞台后，主会话完整恢复，右侧剪辑工程不受干扰。
