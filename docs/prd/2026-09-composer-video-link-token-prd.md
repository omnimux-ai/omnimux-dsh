---
title: "OmniMux 会话输入栏（Composer）内嵌视频链接 Token 与社媒富卡片渲染功能规格书"
id: "prd-composer-video-link-token"
type: "prd"
status: "proposed"
authority: "L2"
date: "2026-09-11"
authors: ["xu-qingchu", "product-management-expert"]
subsystem: "omnimux, omnimux-market, omnimux-video-preview"
canonical_target: "docs/prd/2026-09-composer-video-link-token-prd.md"
---

# OmniMux 会话输入栏（Composer）内嵌视频链接 Token 与社媒富卡片渲染 PRD

> **文档版本**：v1.0.0 · **密级**：内部公开 · **权威级别**：L2  
> **负责人**：产品经理 许清楚（Xu） · **专家支持**：产品通（产品管理专家）  
> **工作区**：`omnimux-dsh` · **落盘位置**：`.workbuddy/prd-composer-video-link-token.md`（合入主仓 worktree 时对齐为 `docs/prd/2026-09-composer-video-link-token-prd.md`）  
> **关联契约**：[`design.md`](../design.md)、[`docs/contracts/ui-design-guidelines.md`](../docs/contracts/ui-design-guidelines.md)、[`docs/contracts/icon-design-standards.md`](../docs/contracts/icon-design-standards.md)

---

## 0. 项目信息

| 维度 | 定义与取值 |
|---|---|
| **项目名称** | `composer-video-link-token`（输入框内嵌视频链接 Token 与社媒富卡片渲染） |
| **所属业务线** | OmniMux 多模态社媒内容生产与短视频复刻（MVP 核心链路：Discovery → Deconstruction） |
| **协作插件面** | • **输入层**：`plugins/omnimux`（Composer 容器与 Token 渲染驱动）<br>• **技能联动层**：`plugins/omnimux-market`（Skill 分类元数据、当前激活技能状态通知）<br>• **消息流渲染层**：`plugins/omnimux-video-preview` / Conversation Message View（社媒链接图 3 富卡片转译） |
| **交付形态** | 共享 UI 组件规范 + React/Web 原型组件 + Markdown/AST 双向解析引擎 |

### 0.1 核心价值定位与北极星指标

* **北极星指标（North Star Metric）**：**视频链接有效输入成功率（Video URL Input Completion Rate）≥ 98.5%**（定义为：从用户点击「视频链接」按钮到生成合法包含视频链接的会话消息比例）。
* **核心驱动与体验指标**：
  1. **排版杂乱度清零（Zero URL Clutter）**：长链接在输入框内单行溢出截断率 100%，输入框视觉高度膨胀率降低 75%；
  2. **分类联动命中率（Category Linkage Precision）**：挂载「创作视频」分类下 Skill 时「视频链接」按钮唤起准确率 100%，非视频技能唤起率 0%；
  3. **富卡片转译覆盖率（Rich Card Render Coverage）**：支持 TikTok、YouTube、抖音等主流视频链接的图 3 富卡片解析率 ≥ 99%；
  4. **全键盘可操作性（Keyboard A11y）**：支持 Backspace 物理删除 Token、Tab 切换焦点、Enter 发送率 100%。

### 0.2 非目标（Non-goals）

1. **不替代全功能富文本编辑器**：本功能聚焦于针对视频链接的实体 Token 化，不支持用户在输入框内任意拖拽图片、排版表格或混排超文本。
2. **不承担深层爬虫抓取逻辑**：前端输入框 Token 仅负责 URL 的合法性校验与展示，元数据提取（标题、作者、封面）由后端视频分析服务异步补充，前端有现成缓存或保底骨架图即可。
3. **不侵入修改官方底层 Lexical 源码**：遵循 `workbench-split` 契约，采用 React Controlled Decorator 或外挂 Inline Capsule Block 机制无损嵌入，提交时保证还原为纯净 Markdown。

---

## 1. 业务背景与问题诊断（Why 优先于 What）

### 1.1 现状痛点分析

在目前短视频批量拆解与爆款复刻场景中，用户的主要工作流是：
* 复制 TikTok / 抖音 上的短视频链接 → 打开 OmniMux 挂载「视频分析」或「Seedance 提示词反推」Skill → 粘贴链接并输入 Prompt 要求。

当前交互存在以下三大严重体验缺陷：
1. **长链接严重破坏输入框审美**：社媒分享链接（尤其是 TikTok、抖音）普遍携带大量的跟踪参数（如 `utm_source`、`share_token`、`campaign_id`），长度常达 120~200 个字符。直接粘贴至原生输入框会导致文本区被无意义的乱码字符撑满，用户很难看到自己输入的核心 Prompt，排版极其凌乱。
2. **功能缺乏场景化感知与引导**：用户不知道当前技能是否需要视频链接，输入栏缺乏根据上下文技能能力自适应呈现的“行动点”（Call to Action）。
3. **消息历史中的链接裸露简陋**：提交后，对话流中往往只展示一行蓝色的长文本超链接，无法给用户直观的视频首帧、发布者信息与标题感知，必须手动点击外部链接跳转核对，体验严重割裂。

### 1.2 设计原则

* **直观降噪（Visual De-noising）**：将复杂晦涩的 URL 封装为紧凑有型的胶囊 Token，超出物理限制自动隐去，只留核心信息。
* **按需供给（Progressive Disclosure）**：只在用户进入「创作视频」相关技能上下文时，才激活视频输入特权按钮，不干扰通用对话模式。
* **数据无损（Transparent Markdown Contract）**：UI 上是组件，底层是标准 Markdown，无缝兼容现有模型和 Prompt 流水线。
* **暗房沉浸（Consistent Dark UI）**：严格遵循 `design.md` L1 规范与图 1/2/3 视觉基准，保障深曜石黑背景下的视觉美感。

---

## 2. 目标角色与用户故事（User Stories）

| 角色 | 场景与诉求（As a ... I want to ...） | 获得价值（So that ...） | 优先级 |
|---|---|---|:---:|
| **短视频创作者 / 编导** | 作为短视频创作者，当我选择「视频分析」技能时，我希望输入栏上方自动出现「视频链接」按钮 | 我无需回忆格式指令，一键即可开始分析视频 | **P0** |
| **短视频创作者 / 编导** | 作为短视频创作者，当我点击按钮并粘贴长链接时，我希望链接被收拢在一个精致的「视频」Token 内 | 避免长链接字符串占满输入框，能清晰看清我的修改要求 | **P0** |
| **短视频创作者 / 编导** | 作为短视频创作者，当我发现贴错链接时，我希望可以直接单击修改，或点击 `×` 删除 | 能以最低操作成本完成纠错与重新粘贴 | **P0** |
| **短视频创作者 / 编导** | 作为短视频创作者，当我发送消息后，我希望在气泡里看到该视频的封面图、标题和作者卡片 | 直观确认 AI 正在分析的目标视频，点击还能在侧栏播放 | **P0** |
| **营销运营人员** | 作为仅进行文案创作的运营，当我选择「社交文案生成」技能时，输入框不显示「视频链接」按钮 | 界面保持极简，不产生无关的功能干扰 | **P1** |

---

## 3. 详细功能规格与交互契约（Feature Specification）

```
                                  [ 用户选择 Skill ]
                                          │
                         ┌────────────────┴────────────────┐
                         ▼                                 ▼
                 分类 === '创作视频'               分类 !== '创作视频'
                         │                                 │
                         ▼                                 ▼
             激活「🔗 视频链接」虚线按钮          隐藏按钮 / 保持默认输入
                         │
              [ 用户点击「视频链接」]
                         │
                         ▼
             在光标处插入 [ 视频 | URL ] Token
                         │
                         ├─ 单击编辑/修改 URL
                         ├─ 宽度 > 320px 时文本单行省略截断
                         └─ 点击「×」或 Backspace 物理销毁
                         │
                 [ 点击发送 (Enter) ]
                         │
                         ▼
        底层组装 Markdown: [视频](URL) + Prompt
                         │
                         ▼
             进入会话消息流 (Message Stream)
                         │
                         ▼
         触发「图 3 规范」富卡片解析器：
         - 72×72px 视频缩略图 (带微光边缘)
         - 平台圆形 Logo + TikTok 文字
         - 单行粗体视频标题 (超出...)
         - 创作者 Handle (@ryannreeddesignbuild)
```

### 3.1 Skill 分类智能联动（Category Linkage Engine）

#### 3.1.1 触发规则与状态机
1. **绑定基准**：输入框控制器实时监听 `omnimux-market` 派发的 `activeSkillChange` 事件。
2. **分类判定**：
   * 若当前挂载的 Skill 属于 **「创作视频」**（英文标识：`video-creation`，包括 `视频分析`、`Seedance 提示词反推`、`爆款复刻`、`分镜拆解` 等），则触发状态迁跃至 `ACTIVE`；
   * 若当前挂载的 Skill 属于其他分类（如 `社交营销`、`开发编程`、`办公效率`），或处于未挂载技能状态（Default），则状态迁跃至 `INACTIVE`。
3. **界面反馈**：
   * `ACTIVE` 态：在 Composer 输入框上方动作行动态渲染虚线圆角按钮 **`[ 🔗 视频链接 ]`**（图 2 样式）；
   * `INACTIVE` 态：该按钮以 `0.15s ease` 淡出并收起高度（`display: none`），右侧弱化提示当前技能类别。

### 3.2 输入框内嵌 Token 组件规格（Inline Token Component）

#### 3.2.1 几何与视觉规范（严格遵循图 1 & 图 2）
* **外壳形态**：全圆角胶囊容器（`border-radius: 9999px`），基准高度为 **`32px`**。
* **配色语义（暗房视频青蓝体系）**：
  * 背景填充：`var(--omx-token-cyan-bg, rgba(14, 116, 144, 0.16))`；
  * 边框描边：`1px solid var(--omx-token-cyan-border, rgba(56, 189, 248, 0.42))`；
  * 文字与图标：`var(--omx-token-cyan-text, #38bdf8)`；
  * Hover / Focus 强化：描边提亮为 `#38bdf8`，伴随 `0 0 0 2px rgba(56, 189, 248, 0.35)` 外发光。
* **左侧前缀结构**：
  * 图标：`IconLink`（13×13px 矢量 SVG，契合 `icon-design-standards.md`，严禁原生字符）；
  * 标签：文字 `视频`（13px 苹方/系统默认，字重 500）；
  * 分界线：垂直细线 `1px × 12px`，色值 `rgba(56, 189, 248, 0.35)`，外间距 `8px`。

#### 3.2.2 宽度限制与溢出控制（Anti-clutter Width Ceiling）
* **Token 最大宽度**：外层容器绝对上限为 **`320px`**。
* **内部输入槽宽度**：限定为 `width: 140px; min-width: 60px; max-width: 180px;`。
* **排版截断逻辑**：
  * 针对超长 URL，输入框开启单行隐藏截断：
    ```css
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    ```
  * 无论用户粘贴长度多达数百字符的带参链接，Token 外观均严丝合缝地锚定在 320px 之内，绝不撑大输入框，确保整体界面干净规整。

#### 3.2.3 交互动作闭环（CRUD 规范）
1. **插入（Create）**：点击「视频链接」按钮时，在当前输入框光标所在处就地实例化 Token，并自动将焦点转移至 Token 内部输入框，呈现占位符 `粘贴 TikTok 视频链接`。同一输入框默认支持插入 1 个视频链接 Token（后续版本扩展多视频列表）。
2. **读取与编辑（Read & Update）**：
   * 单击 Token 内部直接激活文本光标，用户可进行全选、粘贴覆盖、鼠标滚动查看；
   * 输入框失焦（Blur）时，自动触发 URL 规整化清洗（剔除两端无意义空格）。
3. **物理删除（Delete）**：
   * **鼠标操作**：Token 右侧固定内置微型 `×` 按钮（16×16px 矢量 SVG）。点击后立即将整个 Token 节点从 DOM / 编辑器状态中彻底移除，并将光标无缝交还给主输入框；
   * **键盘操作**：当光标处于 Token 之后直接按 `Backspace` 键时，第一下选中该 Token（高亮反白），第二下按 `Backspace` 或 `Delete` 键执行物理删除。

### 3.3 数据模型与 Markdown 契约（Data & Protocol）

#### 3.3.1 内存状态与序列化
在前端受控状态中，输入栏内容维持双重表达：
* **Visual AST 状态**：
  ```json
  {
    "type": "composer_state",
    "prompt": "请帮我分析拆解这个视频。",
    "entities": [
      {
        "type": "video_link_token",
        "label": "视频",
        "url": "https://www.tiktok.com/@ryannreeddesignbuild/video/7391823719283719283",
        "platform": "tiktok"
      }
    ]
  }
  ```
* **提交至 Agent 的纯文本/Markdown 协议**：
  在点击发送或按 Enter 提交瞬间，引擎自动序列化为符合标准规范的 Markdown 文本：
  ```markdown
  请帮我分析拆解这个视频。

  [视频](https://www.tiktok.com/@ryannreeddesignbuild/video/7391823719283719283)
  ```
* **技术收益**：后端 LLM、Python 工具链、Agent Prompt 无需针对私有 Token 做任何繁复适配，无缝延续 Markdown 标准超链接消费逻辑。

---

### 3.4 消息流社媒富链接卡片渲染（严格对齐图 3 规范）

当包含社媒视频链接的消息被发送并展示在用户会话历史中时，界面不再直接暴露裸露 URL，而是统一编译为**高保真富卡片**。

#### 3.4.1 视觉与排版结构规格
* **外层卡片容器**：
  * 底色：半透暗石板 `rgba(0, 0, 0, 0.25)`（遵循暗房原则）；
  * 描边：`1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.12))`；
  * 圆角：`12px`；内边距：`10px 14px 10px 10px`；
  * 间距：紧随用户 Prompt 正文下方，垂直间距 `14px`。
* **左侧 72×72px 视频封面缩略图**：
  * 尺寸：`72px × 72px` 绝对正方形，固定 `flex-shrink: 0`；
  * 圆角：`8px`，带 `1px solid rgba(255, 255, 255, 0.08)` 描边；
  * 内容：展现视频封面帧（图 3 中重现了标志性的反差道具：草坪椅与背景停车场车队）；
  * 状态：网络未加载完成时展现平滑 Skeleton 渐变占位。
* **右侧信息区块**：
  1. **平台标徽行**：
     * 左侧为 16×16px 纯黑圆形底色内的 TikTok 官方矢量 SVG 图标；
     * 右侧为浅灰色文本 `TikTok`（13px，字重 500）；
  2. **视频标题行**：
     * 一级高亮白字（`--dsw-alias-label-primary`），14px，字重 600；
     * 单行显示，超出容器宽度自动呈现 `...` 省略截断（如 `Mr. Bucks County 2027 nominee. Community...`）；
  3. **作者 Handle 行**：
     * 辅助弱化文本（`--dsw-alias-label-tertiary`），12px，如 `@Ryann Reed Design Build`；
  4. **右侧行动引导图标**：
     * 卡片最右侧内置次级图标 `IconExternalLink`，指示可展开或外链。

#### 3.4.2 交互行为与侧边栏深度打通
* **悬浮反馈**：鼠标悬停在富卡片上方时，卡片微幅抬升 `translateY(-1px)`，描边高亮为青蓝发光色，呈现清晰的可点击指引；
* **点击事件（联动侧边栏拆解）**：
  * 点击该卡片，系统优先调用 `omnimux-video-preview` 模块，在右侧侧边栏原地滑出**「视频智能拆解与分镜播放器」**；
  * 播放器自动载入视频流与秒级分镜打点，左侧视频播放与右侧分镜双向高亮跟随。

---

## 4. 边界条件与异常处理（Edge Cases）

| 异常/边界场景 | 发生诱因 | 预期系统行为 | 容错保障 |
|---|---|---|---|
| **粘贴非视频链接** | 用户误在 Token 内粘贴了普通网页链接（如 GitHub、知乎） | Token 依然允许输入，但前缀图标降级为通用 `🔗 链接`，且不展示 TikTok 平台 Logo | 不阻断用户发送，作为通用 Markdown 链接提交 |
| **粘贴非法/空文本** | 用户粘贴空字符串或纯空格 | 失焦时自动回退为 Placeholder 占位提示 | 阻止发送按钮激活，避免发送空内容 |
| **超极端长 URL（> 1000 字符）** | 社媒链接携带巨量安全重定向与广告参数 | 容器严格锁定 320px 宽度，内部仅渲染视口范围字符 | 杜绝横向撑爆 DOM，内存中完整保留真实 URL |
| **网络离线/封面抓取失败** | 本地无外网或社媒接口反爬拦截 | 消息气泡中的富卡片使用默认的优雅暗黑占位插画（带有视频胶卷与播放符号） | 标题降级展示清洗后的短链，不发生页面崩溃 |
| **频繁切换 Skill** | 用户在「创作视频」和「文案生成」之间高速切换 | 顶部按钮动画防抖（Debounce 100ms），已插入 Token 的内容保留在草稿状态 | 切换技能不丢失用户已输入的草稿内容 |

---

## 5. 验收测试用例与验证矩阵（Acceptance Criteria）

### 5.1 功能与交互验收表

* [ ] **AC-01 技能联动隐显**：进入会话，选择「视频分析」，顶部出现 `[ 🔗 视频链接 ]`；切换为「社媒文案生成」，该按钮消失。
* [ ] **AC-02 Token 插入响应**：点击 `[ 🔗 视频链接 ]`，输入框立即嵌入 Token 胶囊，光标自动落入内部输入区。
* [ ] **AC-03 超长链接截断**：粘贴带 150 字符参数的 TikTok 链接，Token 宽度不超过 320px，末尾展示省略号，不发生折行。
* [ ] **AC-04 链接修改与清空**：单击 Token 内输入框，支持退格修改或替换新链接。
* [ ] **AC-05 叉叉删除闭环**：点击 Token 右侧 `×` 按钮，Token 与其中数据瞬间销毁，主输入框恢复纯文本状态。
* [ ] **AC-06 提交无损转换**：点击发送后，查看网络层发送 Payload，确认内容被无损序列化为 `[视频](https://...)` 标准语法。
* [ ] **AC-07 图 3 富卡片渲染**：用户消息流中正确渲染包含 72×72px 封套、TikTok 徽标、粗体标题与作者 Handle 的富卡片。
* [ ] **AC-08 双主题色彩一致性**：在 Dark 模式和 Light 模式下切换，Token 与富卡片文字对比度严格符合 WCAG AA（≥ 4.5:1）。

---

## 6. 指标度量与数据埋点（Telemetry & Metrics）

| 事件标识 | 触发时机 | 关键上报参数 | 观测目的 |
|---|---|---|---|
| `composer_video_token_button_show` | 按钮因进入「创作视频」分类而展示 | `{ skill_id, skill_category }` | 统计联动曝光量 |
| `composer_video_token_insert` | 用户点击按钮插入 Token | `{ trigger_type: "click" \| "shortcut" }` | 统计组件渗透率与使用频率 |
| `composer_video_token_delete` | 用户删除 Token | `{ method: "btn_remove" \| "backspace", has_url: boolean }` | 分析误触率与编辑摩擦 |
| `composer_video_token_submit` | 带有 Token 的消息成功发送 | `{ url_domain: "tiktok.com" \| "youtube.com" \| "other", url_length: number }` | 监控最终业务链路达成率 |
| `rich_link_card_click` | 用户在会话流中点击富卡片 | `{ url, action: "open_sidebar_preview" }` | 评估侧边栏播放器引流转化效果 |

---

## 7. 附录：高保真交互演示验证凭证

* **本地原型路径**：`.workbuddy/composer-video-link-token-prototype.html`
* **原型已验证项目**：
  1. 技能分类智能联动状态机切换；
  2. 320px 物理宽度截断与超长 URL 降噪呈现；
  3. 图 3 标准社媒富卡片像素级还原与点击反馈；
  4. 实时 Markdown AST 双向同步机制验证完毕。
