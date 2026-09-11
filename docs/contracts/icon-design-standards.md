---
title: "OmniMux 图标组件选型与迁移规范 (Icon Standards Contract)"
id: "contract-icon-design-standards"
type: "contract"
status: "living"
authority: "L1"
date: "2026-08-26"
authors: ["x", "agent-architect"]
subsystem: "omnimux"
---

# OmniMux 图标组件选型与迁移规范 (Icon Standards Contract)

> **生效范围**：OmniMux 产品矩阵（`product/omnimux-dsh/plugins/*`）以及所有官方/三方扩展客户端界面。  
> **核心目标**：彻底淘汰 Emoji 表情与 Unicode 字符图标，确立矢量 SVG 格式、原生主题自适应与统一设计语言。  
> **硬性门禁 (UI04)**：受 `scripts/guard-ui-rules.mjs` PreToolUse Hook 与 `scripts/scan-ui-gates.mjs` CI 静态扫描双重拦截，违规代码编辑即打断，CI 物理阻断合并。特化场景须添加 `// exempt-ui04 <业务原因>`。

---

## 1. 选型原则与层级决策 (Two-Tier Icon Strategy)

在所有 OmniMux 插件 UI 开发中，图标引入严格遵循 **两级降级选型机制**：

```
                    [ 需要界面图标 ]
                           │
                           ▼
          ┌──────────────────────────────────┐
          │ 第一优先级：DSH 官方原生图标库     │
          │ @deepseek-ai/dsh-client-ui-primitives
          └──────────────────────────────────┘
                           │ 是否存在符合语义的图标？
                 ┌─────────┴─────────┐
                 │ 是                │ 否
                 ▼                   ▼
          ┌─────────────┐   ┌──────────────────────────────────┐
          │ 直接引用原生 │   │ 第二优先级：开源标准库 lucide-react │
          │ Icon* 组件  │   │ 按需 Named Import 引入矢量 SVG    │
          └─────────────┘   └──────────────────────────────────┘
```

### 1.1 第一优先级：DSH 原生图标 (`@deepseek-ai/dsh-client-ui-primitives`)
- **定位**：DeepSeek Harness 官方基础设计系统（对齐 Figma / DeepSuite）。
- **优势**：宿主运行时内置，由 `window.__ModuleLoader__` 提供，打包时作为 `external` 引用，**零额外包体积**，完美融入 DSH 视觉。
- **强制使用场景**：通用操作（搜索、设置、加号、关闭、刷新、复制、编辑、删除、方向箭头、加载态等）。

### 1.2 第二优先级：Lucide React 补充库 (`lucide-react`)
- **定位**：现代开源矢量图标库，具备一致的 24×24 栅格与 2px 线性风格。
- **优势**：图标极其全面、Tree-shaking 良好、纯 SVG React 组件封装。
- **使用场景**：DSH 原生未涵盖的领域/业务图标（如：营销 Hook 靶心 `Target`、分镜电影板 `Clapperboard`、视频画幅 `RectangleHorizontal`、时长时钟 `Timer`/`Clock`、评星 `Star` 等）。

---

## 2. 常用图标映射对照表 (Standard Mapping Table)

### 2.1 基础与系统交互 (优先 DSH 原生)

| 业务含义 / 原废弃用法 | 推荐方案 | 引用来源 | 默认尺寸 |
| :--- | :--- | :--- | :---: |
| **关闭 / 取消** (`×`, `✕`) | `IconCloseOutline16` / `IconCloseFill14` | `@deepseek-ai/dsh-client-ui-primitives` | 16px / 14px |
| **编辑 / 重命名** (`✏️`, `✎`) | `IconEditOutline16` | `@deepseek-ai/dsh-client-ui-primitives` | 16px |
| **删除 / 清除** (`🗑️`, `Del`) | `IconTrashOutline16` | `@deepseek-ai/dsh-client-ui-primitives` | 16px |
| **添加 / 新建** (`+`, `➕`) | `IconPlusOutline16` / `IconProjectAddOutline16` | `@deepseek-ai/dsh-client-ui-primitives` | 16px |
| **成功 / 完成** (`✅`, `✔`) | `IconCheckOutline16` / `IconCheckOutline14` | `@deepseek-ai/dsh-client-ui-primitives` | 16px / 14px |
| **搜索** (`🔍`) | `IconSearchOutline16` | `@deepseek-ai/dsh-client-ui-primitives` | 16px |
| **设置 / 偏好** (`⚙️`) | `IconSettingsOutline16` / `IconSettingsOutline14` | `@deepseek-ai/dsh-client-ui-primitives` | 16px / 14px |
| **刷新 / 重置** (`🔄`) | `IconRefreshOutline16` / `IconRefreshOutline14` | `@deepseek-ai/dsh-client-ui-primitives` | 16px / 14px |
| **下拉 / 展开** (`▼`, `v`) | `IconChevronDownOutline14` / `IconChevronRightOutline14` | `@deepseek-ai/dsh-client-ui-primitives` | 14px |
| **复制** (`❐`) | `IconCopyOutline16` | `@deepseek-ai/dsh-client-ui-primitives` | 16px |
| **附件 / 引用** (`📎`) | `IconPaperclipOutline16` | `@deepseek-ai/dsh-client-ui-primitives` | 16px |

### 2.2 媒体与垂直领域 (DSH 缺省时选用 Lucide)

| 业务含义 / 原废弃用法 | 推荐方案 | 引用来源 | 说明 |
| :--- | :--- | :--- | :--- |
| **营销重点 / Hook** (`🎯`) | `Target` | `lucide-react` | 灵感库/文案提炼核心点 |
| **影视 / 分镜 / 拆解** (`🎬`) | `Clapperboard` / `Film` | `lucide-react` | 视频分镜头、五维拆解报告 |
| **时长 / 倒计时** (`⏱️`) | `Timer` / `Clock` | `lucide-react` | 视频/音频时长规格选择 |
| **比例 / 画幅** (`▱`) | `RectangleHorizontal` / `Square` | `lucide-react` | 16:9, 9:16, 1:1 画幅图标 |
| **评星 / 推荐度** (`★`, `☆`) | `Star`, `StarHalf` | `lucide-react` | 市场评分、评测星级（支持 fill 填充） |
| **素材类型分类** | `ImagePlus`, `Video`, `Music`, `FileText` | `lucide-react` | 资产库、工作流素材节点 |
| **高级调节 / 参数** | `SlidersHorizontal` | `lucide-react` | 音频/高级生成参数面板 |

---

## 3. SVG 图标工程与设计规范 (Technical Specification)

### 3.1 格式与渲染规范
1. **纯矢量 SVG**：严禁在 UI 界面中直接放置 Unicode 文本符号或 Emoji 字符。
2. **主题自适应（`currentColor`）**：
   - 线条图标一律使用 `stroke="currentColor"`，填充图标一律使用 `fill="currentColor"`。
   - 严禁在 SVG 内部硬编码 `#ffffff` 或 `#000000`（特定官方三方 Logo 除外）。
3. **尺寸阶梯**：
   - 次级操作 / 行内标签：`12px` / `14px`
   - 标准按钮 / 工具栏图标：`16px`
   - 大图标 / 封面占位 / 重点入口：`20px` / `24px` / `32px`
4. **无障碍与语义支持**：
   - 装饰性图标声明 `aria-hidden="true"`。
   - 纯图标按钮必须配置 `aria-label` 和 `title` 属性。

### 3.2 打包与构建配置 (`scripts/build-client.mjs`)
- 当使用 `@deepseek-ai/dsh-client-ui-primitives` 时，在 esbuild 构建脚本中配置 `external: ['@deepseek-ai/dsh-client-ui-primitives']`。
- 当使用 `lucide-react` 时，直接按需引入组件：
  ```tsx
  import { Target, Clapperboard, Timer } from 'lucide-react'
  ```
  由 esbuild 自动执行 Tree-shaking 仅打包用到的组件代码。

---

## 4. 迁移与审查检查清单 (Migration Checklist)

在修改或新增任何界面代码时，必须完成以下检查：
- [ ] 源码中无残留任何 UI 视觉用 Emoji（如 🎯, 🎬, ✏️, 🗑️, ⏱️, ⚡, ✅）。
- [ ] 按钮无裸用文本字符（如 `×` 必须替换为 `IconCloseOutline16` 或 `X`）。
- [ ] 所有图标支持响应当前激活的主题色（明暗切换测试）。
- [ ] 插件客户端构建正常通过，无 ModuleLoader 运行时报错。
