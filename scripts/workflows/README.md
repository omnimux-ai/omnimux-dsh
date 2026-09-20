# 电商批量出片 · 固化工作流脚本

本目录存放**配方生成与编排的固化脚本**，运行在 OmniMux（DeepSeek Harness）的 `workflow` 工具里。

上游设计：[执行层优先路线](../../docs/specs/2026-09-20-execution-first-route.md)｜[配方库 PRD](../../docs/specs/2026-09-20-omnimux-recipes-prd.md)

**要跑的话，直接看 [`OMNIMUX-PROMPT.md`](./OMNIMUX-PROMPT.md)（可复制指令）。** 本文件讲清设计与约束。

---

## 一、为什么脚本放在项目仓

脚本是本产品的**核心资产**——它决定了每条素材的配方从哪来、怎么组合、能不能归因。因此它必须：

- 可评审（改了什么一眼可见）
- 可回归（坏了能被测出来）
- 可 diff（版本演进有据可查）

放个人目录（如 `~/.dsh/`）无法满足以上任何一条。

---

## 二、两边分工契约

当前 WorkBuddy 会话**不是** DSH Agent，工具集里没有 `workflow` / `subagent` / `workflow_run`。DSH 的编排能力只存在于 DSH 运行时（OmniMux app / DSH Desktop）。

因此按「写入」与「执行」分离：

| 谁 | 职责 | 产物 |
| :--- | :--- | :--- |
| **WorkBuddy（设计侧）** | 写池子数据、写脚本源码、本地确定性计算、本地静态校验 | 本目录下的文件 |
| **OmniMux app（执行侧）** | 读取配方与脚本体 → 提交 `workflow` 工具 → 扇出子代理 → 调 `workflow_run` 出片 | 成片 + 配方指纹 |

**接口就是「文件」**：设计侧写文件入库，执行侧读文件提交。两边解耦，互不依赖对方的运行时。

### ⚠️ 关键约束：args 由模型逐字写出

`args` 不是脚本读盘读来的，而是**模型写进工具参数的**。这决定了一条硬设计线：

| 方案 | args 体积 | 可行性 |
| :--- | :--- | :--- |
| v0：把四个池子塞进 args | **113 KB** | ❌ 模型抄不对，且白烧上万 token |
| v1：只传本地算好的配方 | **约 10 KB** | ✅ |

所以产生了 v0 / v1 的分工：

| 脚本 | 职责 | args |
| :--- | :--- | :--- |
| `batch-shoot.v0.js.txt` | 一体化：读池子 → 算配方 → 扇出 | `{ product, requests, pools, seed, dryRun }` |
| `batch-shoot.v1.js.txt` | 只扇出：接收算好的配方 | `{ product, recipes, seed, dryRun }` |

**执行侧一律用 v1。** v0 保留用于本地计算与校验（`prepare-args.mjs` 跑的就是 v0 的脚本体）。

算法不重复实现：`prepare-args.mjs` 直接执行 v0 的脚本体，与在 OmniMux 里跑 v0 得到的结果逐位一致（同 seed）。

### ⚠️ 关键约束二：执行侧读不到项目仓（macOS 隐私授权）

**实测结论**：OmniMux app 读不了 `~/Desktop/Project/dsh-plugin/...`，`read` 工具与 `bash` 都会
`EPERM: operation not permitted`。但同一个会话里它可以正常读自己的会话工作区、`$DSH_HOME`、`/tmp`。

也就是说，授权是**按目录**给的，不是整个 `~/Desktop`。项目仓不在已授权范围内。

排障过程中排除掉的两条错误猜测，记下来免得重复踩：

| 猜测 | 实测 |
| :--- | :--- |
| DSH 沙箱拦了读 | ❌ 沙箱的 seatbelt 策略只有 `(deny file-write*)`，只拦写；app 代码里没有任何 `file-read` 规则；本地复现该策略读那个目录成功 |
| 目录 ACL 差异 | ❌ `~/Desktop` 与项目目录的 ACL 无实质差异 |

首次跑的时候，OmniMux 侧自己绕的弯（先试 `ls` → 试 Python `listdir` → 试 `osascript` → 最后用
PostgreSQL 的 `pg_read_file`，因为 postgres 跑在系统级权限下）——一圈下来花了 57 步、6 分 25 秒、4.8M token。

**所以加了「物化」这一步**：

```bash
node scripts/workflows/stage-to-dsh-home.mjs          # 把运行期产物复制到 $DSH_HOME/omnimux/recipes
node scripts/workflows/stage-to-dsh-home.mjs --verify # 校验暂存区与仓库是否一致
```

约定：**项目仓是事实来源，`$DSH_HOME/omnimux/recipes` 是只读暂存区**。改了脚本或池子，重新跑一次物化。

修好之后同样一批 12 条：**2 分 26 秒、1.1M token**——快 2.6 倍，省 4 倍 token。

### ⚠️ 关键约束三：返回体超限会被 spill

完整 12 条脚本的返回值约 **54 KB**，超过工具的 `maxResultChars`，DSH 会把它 spill 到临时文件，
模型只看到**头 + 尾**，中间被省略（本次省略了 4823 字节，正好切掉一条脚本）。

返回的文本里会带一行：

```
(Omitted N bytes. Full formatted result stored at: <路径>. Use read with offset/limit, or grep this path.)
```

**所以指令里必须写明：结果被 spill 时，要用 `read` 把那个文件读出来再落盘。** 否则 12 条脚本拿不全。

这也是脚本内 `index` 摘要存在的原因——即使 `scripts` 被截断，配方与指纹这层也丢不了。


---

## 三、脚本形态约束

DSH 的 `workflow` 脚本是**脚本体（plain JavaScript body）**，不是模块。硬约束：

| 约束 | 说明 |
| :--- | :--- |
| 不能 `import` / `require` | 是 body 不是 module；一切外部数据走 `args` |
| 支持 top-level `await` | 脚本体被引擎包进 async IIFE 执行：`new vm.Script("(async () => {\n" + body + "\n})()")` |
| 必须以 `return <json-value>` 结束 | 返回未序列化的值会报错 |
| **不得含随机源** | 禁用 `Math.random` / `Date.now` / `new Date()`；随机性一律来自传入的 `seed` |
| `args` 是只读 JSON | 由引擎注入，非求值代码 |
| 工具参数三件套 | `meta`（必填 name/description）+ `script`（纯 JS body，**不带** `export const meta`）+ `args` |

**确定性是硬要求**：同一脚本 + 同一 seed + 同一池子 = 完全相同的配方集。这是「可归因」的前提——数据回来才能把表现拆回具体变量。

### 3.1 钩子契约（照抄真实实现，别猜）

引擎注入的全局只有这 6 个，签名取自 `dsh-workflow-worker-thread/lib/worker.cjs`：

```js
agent(prompt, opts)          // opts 只认：label / phase / schema / provider / model
parallel(thunks)             // thunks = [() => ..., () => ...]，返回结果按序对齐
pipeline(items, ...stages)   // 每个 item 依次过各 stage
phase(title)                 // 只收一个字符串
log(message)                 // 只收一个字符串
args                         // 工具参数里的 args 对象
```

> ⚠️ **踩过的坑**：`agent()` 的选项是 **`label`**，不是 `name`。写 `{ name: ... }` 会直接
> `WorkflowError: agent() option "name" is not recognized (supported: label, phase, schema, provider, model)`。
>
> 这个错本地校验一开始**没拦住**（mock 只记录调用次数、不检查选项键），是在 OmniMux 里真实
> 跑才炸出来的，而且当时是**模型自己把脚本改对了**才跑通——也就是说仓库里的脚本是坏的。
> 现在校验器加了静态 + 运行时两道白名单检查（见第六节），并用反向测试验证过确实能拦住。

`label` 会显示在 workflow 的进度面板上。本脚本把它写成 `shot-<序号> <指纹>`，方便对着面板认人。


---

## 四、变量池的设计约定

### 4.1 `category` 是广告形式，不是行业

`method.json` 的 `category` 取值为 `Video Ads` / `UGC & Testimonial` / `Product Showcase` / `Image & Static Ads` 等，是**广告形式**维度。

**它不能用来判断行业适配。** S0 首次 dry-run 就暴露了这个错：`dark-saas-ui-hero`（category = Product Showcase）被配到了美妆精油上——形式上没错，领域上离谱。

正确做法是**黑名单减法**：

- `method.domain`：该手法**锁定**的行业（依据 id 命名判定）。无标记 = 行业中立，可用于任意垂类。
- `persona.verticals[].domains` / `excludeDomains`：本垂类相关领域，以及要剔除的其余领域。
- 候选池 = 形式命中(methodHint) **减去** 领域冲突项。

为什么是减法而不是加法：112 个手法里 **94 个是行业中立的**，只有 18 个锁定行业。加法匹配会把候选池挖空，减法只剔除明确错配的。

**tag 打标已证伪**：曾尝试用 `metadata.json` 的 tags 打领域标签，结果 `wellness` 把 `ugc-skeptic-convert`、`saas` 把 `phone-mockup-page`、`fashion` 把 `mirror-tryon-haul-beat-cut` 这些**通用手法误锁成行业专属**，导致跨垂类不可用。故改为只依据 id 命名。

### 4.2 `kind` 区分创意手法与工具

| kind | 数量 | 是否参与抽样 | 例子 |
| :--- | :--- | :--- | :--- |
| `creative` | 94 | ✅ | `ugc-unwrap`、`mirror-tryon-haul-beat-cut` |
| `tool` | 12 | ❌ | `script-to-video`、`ugc-script-planner`、`dtc-multi-format-ad-playbook` |
| `generic` | 6 | ❌ | `cinematic`、`ecommerce`、`static-image` |

`catalog/skills/` 下的 140 个子目录里，只有 112 个带 `metadata.json` 的是真手法；另 28 个是团队/工具/运营类 skill。而这 112 个里又混了工具类与占位类，所以真实可用的创意手法是 **94 个**。

### 4.3 `region` 是市场适配，不是错配

7 个地区语言版手法（卡纳达语、拉美、西语、巴西葡语、印地语、海湾、国风）默认**保留**——它们是出海适配变量，不是行业错配。需要时可按 `region` 字段单独筛选。

### 4.4 单角色条数上限

配方要求「同角色内手法不重样、Hook 不重样」，所以条数受最小池限制：

| 维度 | 池子大小 | 是否卡条数 |
| :--- | :--- | :--- |
| 手法 | 各垂类候选 21-40 条 | 否 |
| Hook | 15 个 | 否 |
| **画面形态** | **6 个** | **是 ← 当前卡在这** |

超限会被脚本显式拒绝（fail loud），不会静默产出重复配方。突破方式见 `OMNIMUX-PROMPT.md` 第五节。

---

## 五、目录结构

```
scripts/workflows/
├── README.md                  本文件：设计与约束
├── OMNIMUX-PROMPT.md          ⭐ 可复制的执行指令（要跑就看这个）
├── RUN-IN-OMNIMUX.md          执行侧操作手册（背景与排障）
├── batch-shoot.v0.js.txt          一体化脚本：读池子 → 算配方 → 扇出
├── batch-shoot.v1.js.txt          扇出版脚本：接收配方 → 扇出  ← 执行侧用这个
├── prepare-args.mjs           本地配方预生成器：跑 v0 dry-run，产出 args.json
├── stage-to-dsh-home.mjs      物化：把运行期产物复制到 $DSH_HOME（执行侧才读得到）
├── verify-batch-shoot.mjs     本地校验器：41 项检查，不需要 DSH 运行时
├── out/                       生成物（args.json 等，不入库）
└── pools/
    ├── method.json            手法池：112 条（94 creative / 12 tool / 6 generic）
    ├── persona.json           人设池：9 垂类 × 10 身份，含领域声明
    ├── hook.json              Hook 池：15 个开场类型
    └── format.json            形态池：10 个 operation，其中 6 个为画面形态
```

---

## 六、本地校验

```bash
node scripts/workflows/verify-batch-shoot.mjs
```

当前 **41 项全绿**，覆盖：

| 段落 | 覆盖内容 |
| :--- | :--- |
| [1] 静态约束 | 无 import、无随机源、有 return、有 agent() 扇出 |
| [2] 变量池 | 四个池子可读非空、手法 id 无重复 |
| [3] dry-run | 配方数正确、指纹唯一、同角色内不重样、**手法全为 creative**、**美妆无行业错配** |
| [4] 确定性 | 同 seed 完全可复现、异 seed 组合不同 |
| [5] full | 每配方一个子代理、输出全解析、指纹随产物 |
| [6] 异常兜底 | 未知角色拒绝、池子缺失 fail loud、**超容量 fail loud** |
| [7] v1 扇出版 | 正文边界、无随机源、指纹透传、dryRun 不扇出、空配方/重复指纹 fail loud、**agent() 选项白名单（静态 + 运行时双检）**、**每次调用都带 label** |

**不调用真实模型**，仅验证编排逻辑。

> mock 运行时必须与真实 worker **同构**。`agent()` 选项这道检查就是这么补上的：
> 原来的 mock 只数调用次数，所以 `{ name }` 这种非法选项一路绿灯，直到在 OmniMux 里真实运行才炸。
> 新增的两道检查已用反向测试验证——把 `label` 改回 `name`，3 条检查立刻 FAIL（38/41）。


---

## 七、边界

- 本目录只承载**编排逻辑与池子数据**，不含媒体生成——画面生产由 `omnimux-workflow` 画布负责。
- 不新增插件、不改动 hub、不改动官方组件。
- 池子数据若来自灵感库解构，入池前必须标记来源；**降级产物（`analyzer.js` 的硬编码兜底）一律不入池**。
- `out/` 为生成物目录，不纳入版本管理。
