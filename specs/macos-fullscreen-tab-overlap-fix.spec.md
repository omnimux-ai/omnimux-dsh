# 规格说明：修复 macOS 下右侧全屏且左侧折叠时顶栏标签栏与展开及新建会话按钮重叠问题

**文件**：`specs/macos-fullscreen-tab-overlap-fix.spec.md` ｜ **优先级**：P0 ｜ **模块**：`plugins/omnimux`
**关联 Issue**：#2064

---

## 1. 业务目标与问题根因

### 1.1 问题描述
在 macOS 桌面端运行环境下，当右侧侧边栏（工作台/DockKit）进入全屏模式（`[data-sidebar-right-panel="fullscreen"]`），且左侧边栏处于收起折叠状态（`html[data-omnimux-left-collapsed]`）时：
1. macOS 原生窗口左上角具有 3 个红黄绿圆圈按钮（交通灯区域），占用约 0px ~ 84px；
2. OmniMux 桌面端在此模式下，紧接着在交通灯右侧注入了两个常驻快捷操作按钮：
   - **展开侧边栏按钮**（`button[data-omnimux-sidebar-toggle-topbar="1"]`）：位于 `84px ~ 116px`；
   - **新建会话按钮**（`button[data-omnimux-topbar-new-session="1"]`）：位于 `124px ~ 156px`；
   - 两按钮及间距共占用至 `164px`。
3. 历史全屏补丁中，存在一条硬编码规则：
   ```css
   body[data-dsh-desktop-platform="darwin"] html[data-omnimux-left-collapsed] [data-sidebar-right-panel="fullscreen"] [data-dockkit-strip],
   body[data-dsh-desktop-platform="darwin"] .dshDesktopFrame[data-sidebar-collapsed] [data-sidebar-right-panel="fullscreen"] [data-dockkit-strip] {
     padding-left: 84px !important;
   }
   ```
   该规则静态写死 `84px`，仅避让了交通灯，忽略了并排的两个快捷操作按钮，导致右侧标签栏容器从 84px 开始排列，首个标签（“项目”）被展开按钮及新建会话按钮直接覆盖遮挡。

### 1.2 改造方案
1. **统一自适应变量契约**：
   - `computeChromeLayout` 中已准确计算避让终点 `toggleEnd` 并写入 CSS 变量 `--omnimux-topbar-toggle-end`（在 macOS 且左侧收起时计算值为 `164px`，即 `84 + 32 + 8 + 40`）；
   - 在全屏且左侧收起规则中，将 `padding-left: 84px !important` 替换为优先读取 `--omnimux-topbar-toggle-end`，并回退到安全的 `164px`：
     ```css
     body[data-dsh-desktop-platform="darwin"] html[data-omnimux-left-collapsed] [data-sidebar-right-panel="fullscreen"] [data-dockkit-strip],
     body[data-dsh-desktop-platform="darwin"] .dshDesktopFrame[data-sidebar-collapsed] [data-sidebar-right-panel="fullscreen"] [data-dockkit-strip] {
       padding-left: var(--omnimux-topbar-toggle-end, 164px) !important;
     }
     ```
2. **保证非折叠全屏与非全屏不受干扰**：
   - 当左侧侧边栏展开时，右侧全屏从 `var(--omnimux-sidebar-width, 280px)` 开始排布，左侧已有足够空间，标签栏保持正常的左内边距；
   - 分栏模式下，工作台位于右侧网格，不触发全屏覆盖规则。

---

## 2. 验收标准（Acceptance Criteria）

### 2.1 几何与对齐规范 (P0)
- **AC-101**：在 macOS 环境下，当右侧侧边栏进入全屏且左侧侧边栏折叠收起时，`[data-dockkit-strip]` 的 `padding-left` 必须达到 `164px`（严格大于新建会话按钮右边缘 `156px` 并留有安全间距）。
- **AC-102**：右侧标签栏的第一个 Tab（如“项目”）左边缘坐标必须 `≥ 164px`，不得与展开按钮（84px~116px）及新建会话按钮（124px~156px）发生任何像素级重叠。
- **AC-103**：当左侧侧边栏展开时，标签栏左内边距保持常规内距（`10px`），不产生异常的多余偏移。

### 2.2 自动化测试与实机验证 (P0)
- **AC-201**：`plugins/omnimux` 单元测试中增加全屏 macOS 左侧折叠下 `[data-dockkit-strip]` 样式与变量断言，测试 100% 通过。
- **AC-202**：通过真实运行的桌面应用进行 CDP 实机几何坐标验证，断言首个 Tab 的 `rect.left >= 164` 且与左侧按钮无几何交集。
