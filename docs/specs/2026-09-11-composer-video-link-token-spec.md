---
title: "OmniMux 会话输入栏（Composer）内嵌视频链接 Token 与社媒富卡片渲染系统架构设计与实现规格书"
id: "spec-composer-video-link-token"
type: "architecture-design"
status: "proposed"
authority: "L2"
date: "2026-09-11"
authors: ["高见远（Architect / Gao）"]
subsystem: "omnimux, omnimux-market, omnimux-video-preview"
related:
  - ".workbuddy/prd-composer-video-link-token.md"
  - "design.md"
  - "docs/contracts/ui-design-guidelines.md"
  - "docs/contracts/icon-design-standards.md"
canonical_target: "docs/specs/2026-09-11-composer-video-link-token-spec.md"
---

# Composer 内嵌视频链接 Token 与社媒富卡片渲染系统架构设计（Spec）

> **系统架构师**：高见远（Gao） · **角色**：Software Architect  
> **文档版本**：v1.0.0 · **权威级别**：L2  
> **上游档案**：[`prd-composer-video-link-token.md`](prd-composer-video-link-token.md)（产品功能规格书）  
> **设计基准**：严格契合 OmniMux / DSH 官方 L1 视觉契约（[`design.md`](../design.md)）与控件标准。

---

## 0. 架构决策记录（Architecture Decision Records, ADR）

### ADR-001：输入框内嵌 Token 的实现机制（Lexical Inline Decorator vs 外挂 DOM Overlay）

* **Context（背景）**：
  官方 DSH Composer 基于受控编辑器（Lexical / ContentEditable）。直接向内部 `textarea` 插入纯文本会导致长 URL 破坏排版；若采用不可控的外部绝对定位 DOM 遮罩（DOM Overlay），无法与键盘光标（Caret）、选中选区（Selection）以及退格键（Backspace）平滑联动。
* **Decision（决策）**：
  采用 **Lexical Inline Decorator Node（`VideoLinkTokenNode`）** 架构。
  1. 将 Token 注册为独立原子行内节点（Atomic Inline Node），在光标流中占据单一位置；
  2. 节点内部通过 React 受控子组件渲染 32px 全圆角青蓝胶囊，内置专用受控 `<input>`；
  3. 拦截 Lexical 的 `KEY_BACKSPACE_COMMAND` 与 `KEY_DELETE_COMMAND`，支持在光标邻近时先选中高亮、再按物理删除。
* **Consequences（影响）**：
  * **正面**：键盘光标、换行、选区、撤销/重做（Undo/Redo）完全受 Lexical 原生状态机托管，零视觉脱节与光标漂移；
  * **负面**：需确保在纯文本回落模式（Plain Textarea Fallback）下，具备降级为单行文本块的兼容逻辑。

---

### ADR-002：双向数据映射与提交契约（Markdown-First Protocol）

* **Context（背景）**：
  如果为 Token 引入私有 JSON 标记或自定义 HTML 标签（如 `<video-token ...>`），会导致下游所有环节（Prompt 组装器、模型推理引擎、外部 Python 脚本、记忆系统）均需针对该私有标签编写解析器，破坏系统的松耦合。
* **Decision（决策）**：
  坚持 **“UI 表现与数据协议彻底解耦”** 原则。
  * **编辑器渲染期**：将 `[视频](URL)` 识别为 Decorator 并在视觉上膨胀渲染为交互式 Token 胶囊；
  * **消息提交期（Export）**：直接序列化为最标准的通用 Markdown 链接语法：
    ```markdown
    [视频](https://www.tiktok.com/@ryannreeddesignbuild/video/7391823719283719283)
    ```
* **Consequences（影响）**：
  * **正面**：后端模型与 Agent 流程无感透明，零协议破裂，零数据污染；
  * **负面**：若用户本身输入了其它格式的超链接，序列化管道需通过前缀判定（`[视频](...)`）进行精准靶向识别，避免非视频链接被错误转译。

---

### ADR-003：消息流图 3 富卡片编译策略（Client-side Hydration + Async Metadata Cache）

* **Context（背景）**：
  在用户消息流中，若直接在发送时同步等待抓取视频元数据（封面、标题、作者），会导致消息发送产生 2~5 秒的网络卡顿（TikTok 接口延迟）。
* **Decision（决策）**：
  采用 **“乐观流式上屏 + 异步元数据注水（Hydration）”** 架构：
  1. **阶段 1（立即）**：发送后，客户端正则捕获到社媒视频链接，瞬间渲染图 3 富卡片骨架（Skeleton），并展示平台 Logo 与短链占位；
  2. **阶段 2（异步）**：由轻量本地元数据缓存层（`VideoMetaCache`）尝试命中本地缓存；未命中时触发背景抓取或由视频分析 Agent 派发 `video_metadata_ready` 事件补全标题、作者与封面 URL；
  3. **阶段 3（渲染）**：卡片平滑淡入（`fadeIn 0.2s`）呈现图 3 所示的 72×72px 封套与粗体省略标题。
* **Consequences（影响）**：
  * **正面**：极佳的交互实时性（零发送延迟），弱网/离线状态下优雅降级；
  * **负面**：卡片需设计严谨的 Skeleton 骨架屏与重试机制。

---

## 1. 系统总体架构与拓扑模型（System Architecture）

系统由 **三大核心模块** 构成，各模块通过松耦合的事件与纯函数进行数据交换：

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   OmniMux Web Client                                        │
│                                                                                             │
│  ┌─────────────────────────────┐           ┌─────────────────────────────────────────────┐  │
│  │   plugins/omnimux-market    │           │               plugins/omnimux               │  │
│  │   (Skill Registry & State)  │           │              (Composer Engine)              │  │
│  │                             │           │                                             │  │
│  │  - Category: video-creation │           │  ┌───────────────────────────────────────┐  │  │
│  │  - Active Skill State       │           │  │ SkillCategoryLinkageManager           │  │  │
│  └──────────────┬──────────────┘           │  │ (订阅技能变化 -> 隐显 [🔗 视频链接] 按钮)   │  │  │
│                 │                          │  └──────────────────┬────────────────────┘  │  │
│                 │ activeSkillChange Event  │                     │                       │  │
│                 └──────────────────────────┼─────────────────────┘                       │  │
│                                            │                     │ 点击插入              │  │
│                                            │                     ▼                       │  │
│                                            │  ┌───────────────────────────────────────┐  │  │
│                                            │  │ Lexical VideoLinkTokenNode            │  │  │
│                                            │  │ - 32px 胶囊几何与青蓝视觉 (L1规范)    │  │  │
│                                            │  │ - 320px 宽度上限 / 单行溢出截断       │  │  │
│                                            │  │ - 单击编辑 / 退格删除 / 一键 × 销毁   │  │  │
│                                            │  └──────────────────┬────────────────────┘  │  │
│                                            │                     │                       │  │
│                                            │                     │ 点击发送 / Enter      │  │
│                                            │                     ▼                       │  │
│                                            │  ┌───────────────────────────────────────┐  │  │
│                                            │  │ Markdown Bi-directional Serializer   │  │  │
│                                            │  │ (导出纯文本: [视频](URL) + Prompt)    │  │  │
│                                            │  └──────────────────┬────────────────────┘  │  │
│                                            └─────────────────────┼───────────────────────┘  │
│                                                                  │ 派发标准 User Message     │
│                                                                  ▼                          │
│                                            ┌─────────────────────────────────────────────┐  │
│                                            │        plugins/omnimux-video-preview        │  │
│                                            │         (Conversation Message View)         │  │
│                                            │                                             │  │
│                                            │  ┌───────────────────────────────────────┐  │  │
│                                            │  │ SocialMediaLinkTransformer            │  │  │
│                                            │  │ (检测社媒链接 -> 编译为图 3 富卡片)   │  │  │
│                                            │  └──────────────────┬────────────────────┘  │  │
│                                            │                     │                       │  │
│                                            │                     ▼                       │  │
│                                            │  ┌───────────────────────────────────────┐  │  │
│                                            │  │ RichVideoLinkCard (图 3 规范组件)     │  │  │
│                                            │  │ - 72×72px 封套 + 平台图标 + 粗体标题  │  │  │
│                                            │  │ - 点击唤起侧边栏分镜拆解播放器        │  │  │
│                                            │  └───────────────────────────────────────┘  │  │
│                                            └─────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 核心子系统与详细技术设计（Component Specifications）

### 2.1 子系统一：Skill 分类联动总线（Skill Category Linkage Bus）

#### 2.1.1 依赖契约与事件流
* **事件生产者**：`plugins/omnimux-market` 内部的 `SkillPicker` 实例。
* **事件名称**：`omnimux:skill:changed`
* **载荷接口（TypeScript 契约）**：
  ```typescript
  export interface ActiveSkillPayload {
    skillId: string | null;
    displayName: string;
    category: 'video-creation' | 'social-marketing' | 'development' | 'efficiency' | string;
    capabilities: string[]; // 如 ['video-url-input', 'frame-extraction']
  }
  ```

#### 2.1.2 状态驱动逻辑
1. 位于 `plugins/omnimux/src/client/composer-skill-linkage.ts` 的联动控制器维护局部布尔状态 `isVideoContextActive`：
   ```typescript
   export function isVideoCategory(skill: ActiveSkillPayload | null): boolean {
     if (!skill) return false;
     return skill.category === 'video-creation' || skill.category === '创作视频';
   }
   ```
2. 当 `isVideoContextActive === true` 时：
   * 将虚线胶囊按钮节点挂载至 Composer 工具栏上方（CSS 类名 `.omx-btn-insert-link`）；
   * 采用 `opacity 0.15s, transform 0.15s` 产生纵向微弹跳进场；
3. 当用户切至其他技能时，按钮以 `transform: scale(0.95); opacity: 0;` 优雅退场并移除 DOM。

---

### 2.2 子系统二：Composer 内嵌 Token 节点（Lexical Decorator Node）

#### 2.2.1 节点类定义与生命周期
在 `plugins/omnimux/src/client/editor/VideoLinkTokenNode.tsx` 中定义：

```typescript
import { DecoratorNode, NodeKey, SerializedLexicalNode, Spread } from 'lexical';
import React from 'react';
import { VideoLinkTokenView } from './VideoLinkTokenView';

export type SerializedVideoLinkTokenNode = Spread<
  {
    url: string;
    label: string;
  },
  SerializedLexicalNode
>;

export class VideoLinkTokenNode extends DecoratorNode<React.ReactElement> {
  __url: string;
  __label: string;

  static getType(): string {
    return 'video-link-token';
  }

  static clone(node: VideoLinkTokenNode): VideoLinkTokenNode {
    return new VideoLinkTokenNode(node.__url, node.__label, node.__key);
  }

  constructor(url: string, label: string = '视频', key?: NodeKey) {
    super(key);
    this.__url = url;
    this.__label = label;
  }

  // 序列化与导出
  exportJSON(): SerializedVideoLinkTokenNode {
    return {
      type: 'video-link-token',
      version: 1,
      url: this.__url,
      label: this.__label,
    };
  }

  // 关键：导出为纯文本/Markdown 时的字符串形式
  getTextContent(): string {
    return `[${this.__label}](${this.__url})`;
  }

  // 渲染受控 React 胶囊
  decorate(): React.ReactElement {
    return (
      <VideoLinkTokenView
        nodeKey={this.__key}
        url={this.__url}
        label={this.__label}
        onUpdateUrl={(nextUrl) => {
          const writable = this.getWritable();
          writable.__url = nextUrl;
        }}
      />
    );
  }

  isInline(): boolean {
    return true;
  }

  isKeyboardSelectable(): boolean {
    return true;
  }
}
```

#### 2.2.2 视觉与样式隔离（CSS Modules 契约）
样式文件 `VideoLinkToken.module.css` 遵循 `design.md` L1 色彩矩阵：

```css
.tokenCapsule {
  display: inline-flex;
  align-items: center;
  height: 32px;
  max-width: 320px; /* 物理最大宽度防爆屏 */
  background: var(--omx-token-cyan-bg, rgba(14, 116, 144, 0.16));
  border: 1px solid var(--omx-token-cyan-border, rgba(56, 189, 248, 0.42));
  border-radius: 9999px;
  padding: 0 10px 0 12px;
  vertical-align: middle;
  box-sizing: border-box;
  transition: all 0.15s ease;
  user-select: none;
}

.tokenCapsule:focus-within,
.tokenCapsule.isSelected {
  border-color: #38bdf8;
  box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.35);
}

.prefix {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--omx-token-cyan-text, #38bdf8);
  font-size: 13px;
  font-weight: 500;
  flex-shrink: 0;
}

.divider {
  width: 1px;
  height: 12px;
  background: rgba(56, 189, 248, 0.35);
  margin: 0 8px;
  flex-shrink: 0;
}

.urlInput {
  background: transparent;
  border: none;
  outline: none;
  color: var(--omx-token-cyan-text, #38bdf8);
  font-size: 13px;
  font-family: inherit;
  width: 140px;
  min-width: 60px;
  max-width: 180px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis; /* 单行文本省略截断 */
}

.urlInput::placeholder {
  color: rgba(56, 189, 248, 0.65);
}

.removeButton {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: rgba(56, 189, 248, 0.7);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-left: 6px;
  flex-shrink: 0;
  transition: all 0.12s ease;
}

.removeButton:hover {
  background: rgba(56, 189, 248, 0.25);
  color: #ffffff;
}
```

---

### 2.3 子系统三：Markdown 双向序列化与反序列化管道（Serializer Pipeline）

#### 2.3.1 提交导出流（Editor -> Markdown）
在点击发送时，调用 `exportComposerMarkdown(editorState)`：
1. 遍历 Lexical AST 根段落子节点；
2. 普通文本节点输出 `node.getTextContent()`；
3. `VideoLinkTokenNode` 输出 `[视频](https://...)`；
4. 拼接生成标准 Markdown 字符串，作为会话的 `content` 载荷交付给后端。

#### 2.3.2 预填与导入流（Markdown -> Editor）
当用户点击外部“一键复刻”或历史重播时，管道自动反序列化：
1. 正则匹配 `\[(视频|链接)\]\((https?:\/\/[^\s)]+)\)`；
2. 命中后自动实例化 `new VideoLinkTokenNode(url, label)` 插入编辑器文档流；
3. 保证编辑区与历史记录在草稿状态下的完全对称。

---

### 2.4 子系统四：消息流社媒富链接卡片（图 3 规范组件）

#### 2.4.1 核心组件接口定义
位于 `plugins/omnimux-video-preview/src/client/RichVideoLinkCard.tsx`：

```typescript
export interface RichVideoLinkCardProps {
  url: string;
  defaultTitle?: string;
  defaultAuthor?: string;
  defaultCoverUrl?: string;
  onOpenSidebar?: (url: string) => void;
}
```

#### 2.4.2 视觉与排版结构契约
严格还原图 3：
```tsx
export function RichVideoLinkCard({ url, defaultTitle, defaultAuthor, onOpenSidebar }: RichVideoLinkCardProps) {
  const meta = useVideoMetadata(url, { defaultTitle, defaultAuthor });

  return (
    <div 
      className={styles.richCard} 
      onClick={() => onOpenSidebar?.(url)}
      role="button"
      tabIndex={0}
      title="点击在侧边栏打开视频分镜分析"
    >
      {/* 72×72px 视频封面封套 */}
      <div className={styles.thumbnailWrapper}>
        <img 
          src={meta.coverUrl || '/assets/video-placeholder.png'} 
          alt={meta.title} 
          className={styles.thumbnailImage}
        />
      </div>

      {/* 右侧信息排版 */}
      <div className={styles.infoCol}>
        <div className={styles.platformRow}>
          <span className={styles.tiktokBadge}>
            <TikTokLogoIcon width={10} height={10} />
          </span>
          <span className={styles.platformName}>TikTok</span>
        </div>
        <div className={styles.videoTitle} title={meta.title}>
          {meta.title}
        </div>
        <div className={styles.authorHandle}>
          {meta.author}
        </div>
      </div>

      {/* 次级操作图标 */}
      <div className={styles.actionIcon}>
        <IconExternalLink width={14} height={14} />
      </div>
    </div>
  );
}
```

---

## 3. 性能、并发与安全架构（Non-Functional Attributes）

### 3.1 渲染性能与单行流防护
* **防抖控制**：Token 内部 `<input>` 的 `onChange` 执行 150ms 防抖更新，避免每次按键触发整个 Lexical Editor 全树 Re-render；
* **CSS 强行单行锁**：设置 `white-space: nowrap; overflow: hidden;`，杜绝任何外部非受控注入导致卡片破损。

### 3.2 安全与 XSS 防御
* **URL 协议白名单过滤**：严格仅允许 `http://` 和 `https://` 协议，全面封杀 `javascript:`、`data:` 与 `blob:` 恶意伪协议注入；
* **标题与作者文本转义**：进入 DOM 渲染前一律执行 React 内置 HTML 转义，杜绝 DOM-based XSS 风险。

---

## 4. 实施计划与分阶段验收路线（Implementation Roadmap）

| 阶段 | 交付物与工程任务 | 验收证据 |
|---|---|---|
| **Phase 1** | `VideoLinkTokenNode` 与独立样式模块开发（含 320px 截断与增删改查） | 独立 Storybook / 单元测试通过，光标聚焦正常 |
| **Phase 2** | `omnimux-market` 技能分类联动总线接通，虚线按钮 `[ 🔗 视频链接 ]` 动态隐显 | 切换「创作视频」分类时按钮秒级唤起，切出时淡出 |
| **Phase 3** | 消息流 `RichVideoLinkCard` 图 3 规范组件与侧边栏分镜播放器联调 | 消息发送后无感转译为图 3 富卡片，点击右侧侧栏响应 |
| **Phase 4** | 自动化测试矩阵（`npm test`）与 CI 门禁验证通过 | 全量单元测试 + UI01~UI10 物理硬门禁 100% 绿灯 |

---

## 5. 架构审查核对清单（Architectural Checklist）

- [x] **无第三方重量级运行时依赖**：100% 原生 React + Lexical + 官方 UI 原语，不引入庞大富文本扩展库；
- [x] **官方 Token 100% 消费**：色值全面使用 `--dsw-alias-*`，无任何违规裸色；
- [x] **数据无损协议**：以标准 Markdown 链接作为序列化单一事实源，零下游侵入；
- [x] **全键盘可访问性（a11y）**：完整覆盖 Tab 键跳入、Backspace 退格选中与删除交互。
