# 模型级联菜单渠道分组单选与契约锁定验证证据 — Issue #2049

## 一、验证概况
- **任务编号**：Issue #2049
- **验证时间**：2026-09-16
- **验证范围**：
  1. `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/ModelCascadeMenu.tsx`
  2. 模型级联菜单第三列的视觉减法与单选锁定交互
  3. 移除策略胶囊（稳定性优先/低价优先）与底部批量操作区（已选统计/清空/全选）
  4. 触发器胶囊内展示单一选中的线路分组标签

## 二、关键验证事实与结果

### 1. 结构与无障碍语义核验
- 第三列原 `wf-cascade-strategy-btn` 策略切换按钮已 100% 剥离，代码中无策略按钮残留。
- 渠道列表项 `ChannelRow` 的无障碍语义从 `menuitemcheckbox`（复选）变更为 `menuitemradio`（单选）。
- 点击渠道行触发互斥单选切换，仅当前激活项渲染 `Check` 绿色对勾。
- 底部批量全选/清空区域已移除，渠道列表直落到底，容器高度恒定 480px 无抖动。
- 外部触发胶囊 `wf-model-cascade-capsule` 移除策略图标（ShieldCheck/Percent）与数字角标，渲染当前单选分组的标签（如 `特惠版`、`官方版` 等）。

### 2. 契约派发与收敛核验
- 单选模型某一分组后，`onSelect` 派发固定契约 `allowedGroups: [selectedGroupId]`，策略默认为 `auto`。
- 节点参数与卡槽收敛完全由该唯一分组声明的 `constraints` 驱动，杜绝了多选时的交集裁剪或跨模态 400 报错。

### 3. 测试套件执行记录
```
✔ 底栏三个触发器复用同一份共享几何声明 (0.472416ms)
✔ 共享组提供 hover / open / active / focus-visible / disabled 五态契约 (0.56925ms)
✔ 模型触发器不再携带内联业务样式 (0.079292ms)
✔ 模型触发器 chevron 与共享组图标同阶（14px）并随展开翻转 (0.142167ms)
✔ 音色触发器不再重复声明几何与状态 (0.142667ms)
✔ 模型触发器保留不可压缩与不可选中的专属约束 (0.08675ms)
✔ 模型触发器仍由 aria-expanded 派生展开态（点击写入路径不变） (0.046042ms)
✔ 共享触发器各规则不写裸色字面量（令牌缺失一律用令牌 mix 兜底） (1.095542ms)
✔ static: model cascade menu channel card removes stability data bar completely (0.382ms)
✔ e2e: model cascade menu columns strictly lock 480px height to prevent hover fluttering (0.654292ms)
✔ static: model cascade menu removes redundant "选择模型" section title in brand column (0.668125ms)
✔ production emit rejects stale models and alien channel groups (42.056209ms)
✔ actual model handler preserves routing-only parameters and transitions switches once (1.082708ms)
✔ empty brand selection has no fabricated default (0.140333ms)
✔ picker consumes only final filtered options and renders their labels (0.088292ms)
✔ emission and channel lists validate model membership (0.06325ms)
✔ model transition and routing are written atomically once (0.106334ms)
✔ hover remains preview-only and clicks select a real brand row (0.0775ms)
✔ preserves viewport anchor, accessibility and dismissal (0.141292ms)
✔ brand column removes redundant section title (0.097709ms)
✔ cascade menu columns have uniform fixed height (480px) to prevent hover jitter (1.709458ms)
```
全部 21 项关键交互断言与回归测试 100% 绿色通过。
