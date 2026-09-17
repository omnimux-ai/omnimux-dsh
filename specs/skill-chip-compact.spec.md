# 任务规格：会话栏技能胶囊缩小自适应为仅图标与交互优化

- 关联 Issue: #2181
- 目标插件: `plugins/omnimux-market`

## 1. 业务目标与用户旅程
在会话输入框底栏中，用户挂载技能后会展示该技能的胶囊（如 `TikTok Market Trend Analysis`）。
当窗口缩窄、开启侧边栏或处于分屏紧凑状态时，胶囊过宽会导致与右侧模型切换按钮和发送按钮重叠挤压变形。
通过自适应收敛与手感优化，在窄屏下自动收缩为 28px 圆形图标按钮，彻底杜绝重叠变形；悬停时提供平滑的快速移除操作与完整说明提示；宽屏下提供文本限宽与省略截断防护。

## 2. 交互与视觉规范（方案 A）
### 2.1 紧凑状态自适应
- 触发条件：`html:is([data-omnimux-composer-density='short'], [data-omnimux-composer-density='icon']) .sh-active-skill-chip`，或容器宽度小于 460px。
- 尺寸与几何：
  - `width: 28px !important; min-width: 28px !important; max-width: 28px !important;`
  - `height: 28px !important; padding: 0 !important; border-radius: 24px !important;`
  - `justify-content: center !important; flex-shrink: 0 !important;`
- 元素显隐：
  - 技能名称 `span`：`display: none !important;`
  - 原生右侧常驻移除叉号 `.sh-chip-close`：`display: none !important;`
  - 默认展示技能居中图标（12px~14px）。

### 2.2 紧凑状态交互优化（方案 A）
- 鼠标悬停（`:hover`）于 28px 图标胶囊时：
  - 图标平滑过渡显示为清除叉号（`×`），背景微亮（`background: var(--dsw-alias-interactive-bg-active)`）；
  - 点击整颗胶囊即执行 `clearActiveSkill()` 移除技能；
  - 原生 `title` 提示：`技能：{name} · 点击移除`。

### 2.3 宽屏状态溢出防护
- 非紧凑模式下，`.sh-active-skill-chip > span` 添加：
  - `max-width: 130px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;`
  - 防止超长英文名称在任何情况下撑破底栏。

## 3. 验收标准
1. 在 `data-omnimux-composer-density="icon"` 与 `"short"` 状态下，技能胶囊宽度锁定为 28px，名称文本隐藏；
2. 窄栏下与右侧模型切换按钮、发送按钮无任何重叠挤压；
3. 悬停在紧凑胶囊上能明确辨识技能全名，点击能成功清除技能；
4. 宽屏下超长名称自动显示省略号（`...`）；
5. 自动化测试 100% 通过，无回归。
