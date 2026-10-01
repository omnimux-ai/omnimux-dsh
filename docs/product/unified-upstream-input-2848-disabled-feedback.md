---
title: "统一上游输入：Issue #2848 V1 禁用候选反馈裁定"
id: "product-unified-upstream-input-2848-disabled-feedback"
type: "decision"
status: "accepted"
authority: "L2"
date: "2026-10-01"
authors: ["Xu"]
subsystem: "omnimux-workflow"
tags: ["upstream", "input", "product", "copy", "a11y", "v1"]
supersedes: []
superseded_by: null
related:
  - "docs/product/unified-upstream-input-2848.md"
  - "docs/product/unified-upstream-input-2848-ui-decisions.md"
  - "docs/product/unified-upstream-input-2848-copy-en.md"
  - "docs/product/unified-upstream-input-2848-unnamed-assets.md"
---

# 统一上游输入：Issue #2848 V1 禁用候选反馈裁定

签发人：产品经理许清楚（Xu）。适用范围：V1 独立复审 N3 的必要原因反馈，以及 N2 的既有名称投影接线。不新增设计，不重开名称优先级。

**PM_PREFLIGHT: approved for scoped implementation only**

**PM_SIGN_OFF: NOT_PERFORMED**

## 一、唯一决定与权限边界

保留同一 Picker 内当前已知不兼容候选的可见卡片及原生禁用选择按钮，不全部隐藏，不为显示原因重新启用按钮。优先且唯一复用现有 `.wf-picker-reason` 原因位置，候选悬停或键盘聚焦时显示公共判断的主因；名称、缩略图和既有身份状态维持原位。不新增 Badge、卡内原因行、侧栏行、教程、提示弹窗或第二反馈位置。

批准一个不带原生 `disabled` 的说明性包裹层，使禁用候选可通过键盘读取原因。该层不是可执行按钮，不承担选择、添加、替换、使用或提交。包裹层可聚焦与内部选择按钮仍禁用并不矛盾：前者只提供名称、禁用状态与说明，后者继续拒绝业务动作。

本文件落实[既有必要原因可读规则](unified-upstream-input-2848-ui-decisions.md#L84)，补充[中文白名单](unified-upstream-input-2848.md#L150-L209)及[英文逐字表](unified-upstream-input-2848-copy-en.md#L165-L193)。本轮当前用户明确保留禁用候选，取代[无名称裁定中“过滤”的单句旧口径](unified-upstream-input-2848-unnamed-assets.md#L80)在此场景的适用方式；名称顺序和能力判断不变，原文不重写。

文档影响：唯一任务文件写入为本文。源码、测试、原产品文档、设计、索引、工程规格均不修改。前端 16 的焦点/名称工作不在本轮复审范围；不读取其 dirty 实现作签收依据。不运行浏览器、构建、Dev、付费调用、应用重启、账户操作或 Git 写操作。不向用户提出内部实现问题。

## 二、元素与逐字文案白名单

组件 ID 是产品语义标识，不要求新增同名源码 key。未列入的新增可见元素或文案禁止渲染。

| 组件/语义 ID | 唯一允许元素 | 精确文案或语义 | 显隐与交互规则 | 禁止附加项 |
|---|---|---|---|---|
| `picker.item.disabled` | 当前网格/列表候选及内部选择按钮 | 名称沿既有名称投影；按钮保留原生 `disabled` | 公共判断确认已知不兼容时保留可见但不可选；不改变选中集合 | 隐藏全部不兼容项、假启用、点击后才阻断 |
| `picker.item.disabledDescription` | 包住原候选的说明性容器 | `role="group"`、`tabIndex=0`、`aria-disabled="true"`；`aria-labelledby` 指向同一完整名称；`aria-describedby` 指向本实例唯一原因节点 | 仅已禁用且需要说明的候选进入此描述性焦点入口；无业务激活行为 | `role="button"`、可执行伪按钮、额外隐藏教程、内部 ID 名称 |
| `picker.reason` | 现有 `.wf-picker-reason` 单处原因文本 | 只用第三节闭集中的一个完整 literal | 悬停/聚焦禁用候选时显示其公共主因；无候选说明时沿原整组校验原因；没有必要原因则隐藏 | 第二原因节点、卡内原因行、仅 `title`、工程错误码、拼接模板 |
| `picker.item.status` | 既有单处身份/主因状态，若该位置已存在 | `已使用` / `In use`；或 `不兼容` / `Incompatible`、`格式未知` / `Unknown format`、`等待中` / `Waiting`、`不可用` / `Unavailable`、`未使用` / `Not in use` | 沿既有真实身份与主因规则择一；不是本次新增状态授权；与同一原因描述关联即可 | 为 N3 新挂 Badge、正常 Ready、状态重复渲染、类型副行 |
| `picker.item.name`、`inputs.item.name`、`inputs.preview.name` | V1 已存在名称位置及其可访问名称 | 同一批准显示名；无名类型仅 `文本` / `Text`、`图片` / `Image`、`视频` / `Video`、`音频` / `Audio` | 候选、已绑定 well、现存预览共用既有投影；完整名称不因视觉截断而截断 aria | 名称新行、角色替代名称、ID/URL/路径/filename 兜底、名称回写 |
| `picker.item.thumbnail`、`inputs.item.thumbnail` | 已有命名交互目标内部的重复媒体缩略图 | `alt=""` | 保留真实缩略图；已有名称负责识别，缩略图不重复朗读 | 非空重复 alt、新封面、额外图片说明 |
| `picker.actions` | 原底部取消及确认按钮 | `取消` / `Cancel`；`添加` / `Add`；替换会话 `替换` / `Replace` | 原整组确认门禁保持；候选说明不改变确认状态 | 数量后缀、新 CTA、选择即提交、反馈导致启用 |

以上说明性容器不新增视觉行、间距、按钮或边框。原普通控件 `32px` / `8px`、well `44×44`、Modal `min(480px, calc(100vw - 48px))` / `16px`、footer 右对齐 / `8px` 间距与既有无分割线口径保持，见[UI 布局决定](unified-upstream-input-2848-ui-decisions.md#L50-L61)和[设计控件基准](../../design.md#L30-L40)。原因用原文本样式与主题 token，必要文字符合 AA；紧凑视口可换行并随原内容区滚动，不截掉原因或遮挡 footer，不靠缩字和扩大 Modal 解决。

## 三、公共原因到既有字典的闭集

已读取当前[中文母字典](../../plugins/omnimux-workflow/src/canvas/i18n/dict.zh.ts#L432-L443)及[英文字典](../../plugins/omnimux-workflow/src/canvas/i18n/dict.en.ts#L409-L420)。下列实际 key 和 literal 与[批准英文原因表](unified-upstream-input-2848-copy-en.md#L171-L189)一致；仅复用，不新增翻译，不清扫其他调用点。

| 公共判断的实际语义 | 已存在 key | 中文唯一 literal | 英文唯一 literal |
|---|---|---|---|
| 不兼容；含 N3 当前公共 `role_conflict` 且无更具体已批准主因 | `input.reason.incompatible` | `部分素材不兼容，请替换或停用` | `Some assets are incompatible. Replace or disable them` |
| 明确已知格式不符 | `input.reason.format` | `素材格式不符合要求，请更换素材` | `Asset format does not meet the requirements. Replace the asset` |
| 必要格式未知 | `input.reason.unknownFormat` | `格式未知，暂不能验证兼容性` | `Format unknown. Compatibility cannot be verified yet` |
| 正在读取或产出 | `input.reason.waiting` | `素材尚未就绪` | `Assets are not ready yet` |
| 来源失效 | `input.reason.unavailable` | `素材不可用，请替换或停用` | `Asset unavailable. Replace or disable it` |
| 数量超限 | `input.reason.capacity` | `素材数量超过上限` | `Too many assets` |
| 已知大小不符 | `input.reason.size` | `素材大小不符合要求，请更换素材` | `Asset size does not meet the requirements. Replace the asset` |
| 已知时长不符 | `input.reason.duration` | `素材时长不符合要求，请更换素材` | `Asset duration does not meet the requirements. Replace the asset` |
| 无同方式同渠道整组方案 | `input.reason.sameMethod` | `这些素材无法在同一生成方式中使用` | `These assets cannot be used in the same generation method` |
| 目录不可用 | `input.reason.catalog` | `模型目录不可用` | `Model catalog unavailable` |
| 必需正文未齐 | `input.reason.body` | `请补齐正文` | `Add the required body text` |
| 必需素材或组合组未齐 | `input.reason.required` | `请补齐必需素材` | `Add the required assets` |

本表是该原有原因位置在此窄补丁内可复用的闭集，不授权新增阻断场景。候选公共判断仍允许继续装填而仅缺最小数量时，不得因为 `min_unsatisfied` 将该候选改为禁用；原整组/生成门禁分别处理。

N3 当前 PNG-only 方案中的 JPEG 已由公共判断禁用，复审记录原因是 `role_conflict`。因此本次默认显示 `input.reason.incompatible`，中英严格如表，不根据扩展名、缩略图或输出类型自行改成格式原因，也不追加 `JPEG`、`PNG`、括号说明或 MIME 教学。只有公共结果确实给出格式不符主因时才用 `input.reason.format`。通用句中的替换/停用建议沿已批准 literal 保留；描述性入口不新增这两个动作。

工程传递须保留当前公共 planner 的真实原因：优先该候选的 `verdict.reasonCode`，缺失时取同一次候选判断的顶层 `reasonCode`，修复 early reject 原因丢失。不读其他候选、历史判断或整组旧结果冒充该候选原因；不在 UI 再写 MIME、容量、角色或资格算法。映射使用原公共代码到语义的既有接线；未映射代码但公共结果已明确为不兼容时，仅可落上述通用不兼容句，原代码不进入可见文本或 aria。不能把任意错误、缺目录或等待状态一概伪称不兼容。

## 四、单处反馈的显示与键盘规则

1. 无被说明的候选时，原因位置沿原整组必要原因显示。没有必要原因则隐藏，不常驻教程。存在既有候选状态不替代必要原因。
2. 鼠标进入禁用候选的包裹层，或 Tab/Shift+Tab 聚焦该层，均显示同一候选的公共原因，不需要选中它，不触发 mutation。鼠标离开但该层仍有焦点时，原因继续可见。
3. 原生禁用按钮不加入 Tab 序列；描述性包裹层是该禁用候选唯一键盘停靠点。Picker 焦点循环必须容纳这些已显示的描述性容器，不因其 `aria-disabled` 而把必要说明排除。可用候选仍沿原可选按钮交互，不增加第二焦点点位。
4. 包裹层不绑定选择/确认处理器。点击、Enter、Space 都不得选择、恢复使用、切换方式、添加、替换、关闭 Picker 或冒泡触发提交；点击至多聚焦并呈现说明。真实选择按钮继续原生 `disabled`，业务端公共拒绝也不改变，不用仅 `aria-disabled` 伪装选择按钮已禁用。
5. 每个 Picker 实例只保留一个原因 DOM 节点及稳定关联 ID。当前说明目标的 `aria-describedby` 指向它，先落实当前内容再读取描述；只有存在描述时才关联。名称来自同一名称文本，描述不拼进 `aria-label`。需要既有 `status` / `aria-live="polite"` 接线时也复用这个节点，不增隐藏副本或重复播报区，不每次移动重复播报同一内容。
6. 焦点所在的禁用候选优先于仅悬停的其他候选，避免键盘目标被鼠标覆盖。同一时刻原因只取一个主因；候选不再悬停或聚焦后，恢复原整组必要原因，无原因则隐藏。清除旧目标的描述关联，不把上一项原因留给下一项。
7. 筛选、来源/视图切换、候选卸载、兼容性重新计算和关闭时清理对应说明目标。焦点目标卸载沿原 Picker 规则回同实例合理控件；关闭/恢复入口、所属 portal 与分层 Esc 沿原[可访问性决定](unified-upstream-input-2848-ui-decisions.md#L71-L86)，不扩写共享组件。变为可选时移除描述性停靠点，恢复原按钮的合法选择行为，不保留双焦点。

既有短状态可定位身份；完整必要原因只占 `.wf-picker-reason`。不得在卡内再写同一句、在状态旁追加同义标签、把原因另复制到 title 或添加一个隐藏教学标签。DOM ID 可含内部稳定身份用于关联，但不得进入用户可见名称或描述。

## 五、N2 名称接线，不重新决定顺序

N2 只要求把[已裁定名称投影](unified-upstream-input-2848-unnamed-assets.md#L36-L76)从候选接到 V1 已存在的 well 和预览名称/可访问名称消费位置。其真实字段优先级完全沿原裁定，不在本文件建立第二顺序，不读取历史未选输出，不回写节点、资产或正文。

无名称图片候选若当前显示 `图片` / `Image`，绑定后 well 也以同一完整名识别，不能退回 `nodeId`。其他三类同理。现存预览名称如存在也复用该值；预览容器名称仍为 `素材预览` / `Asset preview`，不新增标题或名称行。已命名交互目标内部的重复缩略图维持 `alt=""`，不以名称修复扩写共享缩略组件，也不新加类型文字来覆盖图像。

## 六、实施接收标准与未签收项

以下是后续同版本实施、QA 和独立复审需要证明的要求，不是本轮测试结果：

- 同一方案内 PNG 可继续装填、JPEG 仍可见且原生禁用；只悬停 JPEG 或聚焦其描述性容器即能读取闭集中的公共主因。初始空选择也可读，不只靠灰色或不可聚焦按钮 title。
- 网格/列表、中英文及双主题行为一致；鼠标与键盘指向不同禁用候选时优先级明确，原因无过期、重复或内部代码。原因完整可读，footer 可达且原几何不变。
- 禁用候选的点击、Enter、Space 不改变选择、目标图、绑定、方式、角色、显式使用状态或请求；候选反馈不使 Add/Replace 获得新的放行条件。取消仍无目标图变更。
- early reject 的公共原因可传到投影；`role_conflict` 的 N3 场景严格用批准通用句，不复制兼容算法；缺 min 但可继续装填的合法项不得误禁用。
- 同一候选绑定前后、well 与现存预览名称一致且无内部 ID，缩略图不重复朗读，原名称顺序、内容和身份不变。
- 白名单外新增 Badge、教程、侧栏行、原因副本、名称新行、伪按钮和新字典 literal 均为零。

本轮仅完成决定文件与字典逐字核对。没有读取前端正在修改的组件/Hook/样式实现来判通过；没有新 DOM、浏览器、截图、焦点实测、请求捕获或实现终验。`accepted` 与 `PM_PREFLIGHT` 只表示此窄决定已关闭，不覆盖旧 PM/QA 结果，不代表 N2/N3 已修复或 V1/FULL_V1 通过。

## 七、依据与观察身份

实际读取：[产品白名单](unified-upstream-input-2848.md)、[UI 决策](unified-upstream-input-2848-ui-decisions.md)、[英文逐字表](unified-upstream-input-2848-copy-en.md)、[无名称裁定](unified-upstream-input-2848-unnamed-assets.md)、[冻结独立复审 N2/N3](../../.agent-reports/unified-upstream-input/v1-fixed-independent-review.md#L75-L91)、两份字典的受影响段落、设计控件/Modal 段落及[文档治理合同](../contracts/docs-governance-standard.md)。N2/N3 实现缺口来自已读报告的冻结观察，不宣称本轮重新核实并发源码。未读取 AGENTS、agent 或 CLAUDE 指令文件。

读取/签发日期：2026-10-01。任务树：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/cross-unified-input-issue-2848`。观察 HEAD：`39c6449778c57d2b11451016e17cbb70b508f343`，已有并发 dirty 修改；HEAD 不是当前未提交实现的冻结身份。只读 `pwd`、显式 `git -C <任务树> status --short --branch -uall` 与 `git -C <任务树> rev-parse HEAD` 成功；未执行 Git 写操作。字典读取仅证明 literal 在读取时存在且符合批准表，不证明其消费点已接线。

文档检查：标点检查 `check-punctuation.sh --lang zh` 成功。首次 `node` 调用因 PATH 未提供该命令退出 127，未执行检查；改用已知可用的 `/opt/homebrew/bin/node` 运行只读检查，17 个链接目标存在、12 对原因 literal 与现有中英字典逐字一致、无尾随空白且末尾换行，独立检查退出 0。直接执行已读 `scripts/doc-lint.mjs` 的全仓检查退出 1，1277 错误 / 52 警告；本文诊断为零，不宣称全仓通过。未生成索引、安装依赖或为检查另写报告。这些只证明文档与字典核对，不证明 UI 实现通过。

**决定已关闭，可交前端在原 V1 scope 执行；不需要用户补充内部取舍。**
