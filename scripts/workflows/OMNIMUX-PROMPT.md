# 去 OmniMux app 跑批量出片 · 复制即用指令

> 设计侧（WorkBuddy）负责脚本与池子；执行侧（OmniMux app）负责真实运行。
> `workflow` / `subagent` / `workflow_*` 这些工具只存在于 DSH 运行时里。
>
> 推荐预设：`marketing-agent`（含 6 个营销专家子代理）或 `omni-agent`。

---

## 〇、跑之前：先物化一次

```bash
# 在仓库根目录
node scripts/workflows/prepare-args.mjs \
  --name "护发精油" \
  --selling "不油腻,顺毛躁,不掉发" \
  --audience "25-35 岁女性，染烫受损发质" \
  --roles "beauty:reviewer:6,home:mom:6" \
  --seed 20260920

node scripts/workflows/stage-to-dsh-home.mjs
```

第一步算配方（本地确定性计算，不花算力），第二步把产物复制到 `$DSH_HOME/omnimux/recipes`。

**为什么必须物化**：OmniMux app 读不到 `~/Desktop` 下的项目仓（macOS 按目录授权，
`read` 与 `bash` 都会 `EPERM: operation not permitted`），但能读 `$DSH_HOME`。
不物化的话，执行侧会绕一大圈（实测 57 步 / 6 分 25 秒 / 4.8M token）。

---

## 一、指令正文（复制这一整段给 OmniMux）

```text
在 DSH home 下执行一次批量出片编排。

## 第 1 步：读两个文件

1. 读 $DSH_HOME/omnimux/recipes/batch-shoot.v1.js.txt
   只取「// 脚本正文开始」和「// 脚本正文结束」这两行之间的内容，作为 workflow 工具的 script 参数。
   两行边界本身可以不带（它是 JS 注释，带了也无害）；文件头的说明注释不要带。

2. 读 $DSH_HOME/omnimux/recipes/args-dry.json
   整个 JSON 对象就是 args 参数（里面已经含 dryRun: true，不要改）。
   注意：不要改任何字段。里面的 fingerprint 是归因钥匙，错一个字符就断链。

不要读 ~/Desktop 下的任何路径——app 没有那个目录的读权限。

## 第 2 步：提交 workflow 工具（先 dry-run）

用法：
- meta = { "name": "batch-shoot", "description": "按角色生成互不重复的电商视频配方并扇出子代理产出拍摄脚本", "phases": [{ "title": "扇出子代理生成脚本" }] }
- script = 第 1 步取到的脚本体，逐字原样，不要改写、不要补 export、不要包成函数
- args = 第 1 步读到的 JSON 对象

dry-run 预期：返回 mode="dry-run"、total=12，12 条 fingerprint 互不相同，且不启动任何子代理。
如果这一步失败，停下来报告，不要继续第 3 步。

## 第 3 步：跑真实扇出

把 args 换成 $DSH_HOME/omnimux/recipes/args.json 的内容（dryRun 为 false），
其余参数一字不动，重新提交同一个 workflow 调用。

预期：启动 12 个子代理（每个配方一个），返回 mode="full"、total=12、failed=0。

## 第 4 步：如果返回被截断，去读 spill 文件

返回体大约 54KB，超过工具的 maxResultChars，会被 spill 到临时文件，你只会看到「头 + 尾」，
中间被省略。返回文本里会有这么一行：

  (Omitted N bytes. Full formatted result stored at: <路径>. Use read with offset/limit, or grep this path.)

看到这行就用 read 把那个路径完整读出来，从中取出 12 条脚本的完整内容，
写到 $DSH_HOME/omnimux/recipes/out/run-<时间戳>.json（目录不存在就创建）。

## 第 5 步：回报

贴出：
- 两次调用的真实返回（至少含 mode / total / failed / 12 条 fingerprint）
- 落盘文件的路径
不要只回一句"完成了"。

## 硬性要求

- args 必须逐字来自 args-dry.json / args.json，不要自己编造配方。
- 不要修改脚本内容。脚本里没有随机源，随机性全部来自 args.seed。
- 不要新增插件、不要改 hub、不要改官方组件。
```

---

## 二、想换商品 / 角色 / 条数，只改这三处

| 想改什么 | 改哪里 | 取值 |
| :--- | :--- | :--- |
| 商品 | `--name` / `--selling` / `--audience` | 自由文本；卖点用逗号分隔 |
| 角色 | `--roles "垂类:身份:条数"`，多个用逗号分隔 | 见下方 id 表 |
| 组合 | `--seed` | 任意整数。同 seed 配方完全一致；换 seed 换一批组合 |

垂类 id：`beauty` `home` `health` `food` `apparel` `tech` `kids` `service` `saas`

身份 id：`reviewer` `creator` `mom` `expert` `homeowner` `skeptic` `founder` `elder` `student` `colleague`

不确定就让它跑 `node scripts/workflows/prepare-args.mjs --list`，会把可用的 id 和中文名全列出来。

例：`--roles "beauty:reviewer:6,kids:mom:6,tech:expert:4"`

> 改完记得重跑 `stage-to-dsh-home.mjs`，否则执行侧读到的还是旧产物。

---

## 三、⚠️ 单角色条数上限 = 6，这是硬约束

配方要求「同角色内手法不重样、Hook 不重样」。三个维度里最小的是**画面形态池，只有 6 个**，所以单角色最多 6 条。

| 维度 | 池子大小 | 是否限制条数 |
| :--- | :--- | :--- |
| 手法 | 94 个可用（已剔除工具类与行业错配） | 各垂类候选 21-40 条 |
| Hook | 15 个 | 否 |
| **画面形态** | **6 个** | **是 ← 卡在这** |

超了会被脚本直接拒绝（fail loud），不会静默产出重复配方。要突破有两条路：

1. **冻结画面形态**（推荐先做）：首期只测「人设 × Hook」，画面形态固定一种。上限立刻升到 15 条/角色，而且更符合正交实验「只让要测的因子变化」的原则。
2. **扩画面形态池**：把 `digital_human`（数字人口播）也计入画面形态，并把内容形态（商品图+B-roll / 数字人口播 / 图文轮播）与实现 operation 拆成两个维度。

这是待拍板的一项，见第六节。

---

## 四、跑完检查什么

| 检查项 | 预期 | 不达标怎么办 |
| :--- | :--- | :--- |
| 配方数 | 等于请求条数 | 检查 `--roles` 写法 |
| 指纹唯一 | 12 条全不同 | 脚本会自己 fail loud，不用你查 |
| 同角色内手法/Hook 不重样 | 是 | 同上，脚本自己拦 |
| **手法是否对口商品** | 美妆不该出现 saas / 招聘 / 房产类手法 | 领域错配已由黑名单拦住；若仍有"适配度"不佳（如家居配到 `ctv` 电视广告），补 `method.json` 的 `domain` 或 `kind` |
| full 模式 agents 数 | 等于配方数 | 看返回信封 `completed (N agents)` |
| full 模式失败数 | `failed=0` | 看返回里 `scripts[].parseError` |
| 抄写完整性 | 返回的指纹与本地 `args.json` 一致 | 不一致说明 args 被抄错，重跑 |
| 脚本落盘 | 有 `run-<时间戳>.json` | 说明第 4 步没做，返回被 spill 后脚本就丢了 |

**这一关的意义**：配方质量决定后续所有产出质量。配方不合理就改池子，不要带着问题往下走。

---

## 五、已知的真实运行结果（2026-09-20 首跑）

| 指标 | 值 |
| :--- | :--- |
| 调用 | 1 次 dry-run（0 agents）+ 1 次 full（12 agents） |
| 结果 | `mode=full`、`total=12`、`failed=0` |
| 分镜数 | 每条 5-6 个 |
| 耗时 / 用量 | 2 分 26 秒 / 1.1M token |
| 12 条配方指纹 | 与本地 `args.json` 逐位一致 |

产物落在 `deliverables/omnimux-batch-shoot-run-20260920/`。

已验证到位的两点：

- **Hook 与配方对齐**：指定「街头采访」的那条，hookLine 就是"在街头随机问了 10 个…"；指定「价格反差」的是"刚看到这价格我还以为看错了"。
- **手法渗透进画面描述**：指定 `color-spec-sheet`（色卡规格表）的那条，画面描述里真的出现了 Pantone 色卡、CMYK 数值、供应商规格单版式。

---

## 六、需要你拍板的一项

**画面形态要不要参与首期抽样？**

| 选项 | 单角色上限 | 代价 |
| :--- | :--- | :--- |
| A. 冻结画面形态（只测人设 × Hook） | 15 条 | 批次内画面形态单一，但归因最干净 |
| B. 保持现状（画面形态也参与抽样） | 6 条 | 素材形态更多样，但可归因变量的维度也更多，12 条样本不够拆 |

按正交实验的原则，**首期建议 A**：先只测两个因子，等胜出的人设与 Hook 稳定了，再放开画面形态做第二轮。

---

## 七、常见报错对照

| 报错 | 原因 | 处理 |
| :--- | :--- | :--- |
| `EPERM: operation not permitted` | 读了 app 没授权的目录（如 `~/Desktop` 下的项目仓） | 先跑 `stage-to-dsh-home.mjs`，改读 `$DSH_HOME/omnimux/recipes` |
| `args.recipes 为空` | 没跑第 1 步，或 args 传错 | 重跑 `prepare-args.mjs` + 物化 |
| `配方指纹重复` | args 被手改过 | 用 `args.json` 原始内容重传 |
| `可用的不重复组合只有 N 种` | 请求条数超过池子容量 | 降到 N 以内，或按第六节放开维度 |
| `agent() option "name" is not recognized` | 脚本用了非法的钩子选项（只认 `label`） | 用仓库里的 v1；校验器已加白名单检查 |
| `unknown persona` | 垂类/身份 id 拼错 | 跑 `--list` 对照 |
| `args.pools 不完整` | 误用了 v0 脚本 | v0 需要传四个池子（113KB，模型抄不动），执行侧一律用 **v1** |
| `SANDBOX_UNAVAILABLE` | DSH 沙箱后端不可用 | 它宁可失败也不会无隔离运行；查沙箱后端 |
| 子代理结果被截断 | 返回体超过 `maxResultChars`，被 spill | 读 spill 文件（第 4 步）；脚本已同时返回 `index` 摘要兜底 |

---

## 八、边界

- 本脚本**不生成画面**，只产出配方与拍摄脚本。画面生产是 `omnimux-workflow` 画布的事。
- 不新增插件、不改 hub、不改官方组件。
- 配方 `fingerprint` 必须随产物落盘——它是后续归因（S3）的唯一钥匙。
- 物化是**单向**的：只从仓库复制到 `$DSH_HOME`，绝不反向覆盖仓库。
