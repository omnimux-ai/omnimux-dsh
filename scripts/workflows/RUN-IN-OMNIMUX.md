# 在 OmniMux 里运行 batch-shoot

> ⚠️ **要执行，请直接看 [`OMNIMUX-PROMPT.md`](./OMNIMUX-PROMPT.md)** —— 那是可直接复制的指令。
> 本文件保留为**背景与排障手册**。注意：执行侧一律使用 `batch-shoot.v1.js.txt`（扇出版），
> 不要用 v0 传四个池子（113KB，模型抄不动），v0 只用于本地计算与校验。

本文件是**执行侧操作手册**。设计侧（WorkBuddy）只负责写脚本与池子；真实运行必须在 DSH 运行时（OmniMux app）里做，因为 `workflow` / `subagent` / `workflow_run` 这些工具只存在于那里。

---

## 一、为什么不能在 WorkBuddy 里跑

| 环境 | 有什么 | 能不能跑 |
| :--- | :--- | :--- |
| WorkBuddy（当前设计侧会话） | 文件读写、shell、代码分析 | ❌ 没有 `workflow` 工具 |
| OmniMux app（DSH 运行时） | `workflow` / `subagent` / `ralph` / `workflow_run` 等 | ✅ 全部具备 |

已核实：OmniMux 的 **7 个预设全部**装配了 `tool-workflow` + `tool-subagent` + `tool-ralph`（来源：`~/.dsh/profiles/omnimux/agent-presets-shipped/*/agent.cordis.yml`）。

**推荐预设**：`marketing-agent`（含 6 个营销专家子代理）或 `omni-agent`（含 10 个创作专家子代理）。

---

## 二、运行前检查

在 OmniMux 会话里确认三件事：

| # | 检查项 | 怎么查 |
| :--- | :--- | :--- |
| 1 | `workflow` 工具可用 | 直接问「你有哪些编排工具」，应能看到 `workflow` / `subagent` / `ralph` |
| 2 | 工作目录正确 | 应为 `product/omnimux-dsh`（脚本与池子都在 `scripts/workflows/` 下） |
| 3 | 池子文件就位 | `scripts/workflows/pools/` 下应有 method / persona / hook / format 四个 json |

---

## 三、运行步骤

完整指令见 [`OMNIMUX-PROMPT.md`](./OMNIMUX-PROMPT.md)，此处只讲为什么这么设计。

### 为什么要先在本地跑 prepare-args

`args` 是模型逐字写进工具参数的，不是脚本读盘读来的。四个池子合计 113KB（`method.json` 单文件就 107KB），模型抄不动，也会白烧上万 token。

但其中绝大部分是**确定性计算的输入**，本不需要经过模型的手。所以拆成两步：

1. **本地算**（`prepare-args.mjs`）：跑 v0 脚本体的 dry-run，算出配方，写成约 10KB 的 `args.json`
2. **执行侧扇出**（`batch-shoot.v1.js.txt`）：只接收算好的配方，启动子代理

算法不重复实现——`prepare-args.mjs` 执行的就是 v0 的同一段脚本体，同 seed 结果逐位一致。

### 步骤 1：本地生成 args

```bash
node scripts/workflows/prepare-args.mjs \
  --name "护发精油" --selling "不油腻,顺毛躁" \
  --audience "25-35 岁女性" \
  --roles "beauty:reviewer:6,home:mom:6" --seed 20260920
```

产出 12 条配方 + `out/args.json`。

### 步骤 2：确认配方合理

看命令打印的配方表：

- 同一个角色内，手法（method）和 Hook 是否不重样
- **手法是否对口这个商品**（美妆不该出现 saas / 招聘 / 房产类手法）
- 指纹是否唯一

**这一步是关卡**：配方不合理就改池子，不要往下走。

### 步骤 3：提交 workflow 工具（先 dry-run）

meta / script / args 的取法见 `OMNIMUX-PROMPT.md`。先把 `dryRun` 设为 `true` 跑通链路，确认返回 `total=12` 且指纹唯一。

### 步骤 4：跑 full（真实扇出）

把 `dryRun` 改成 `false`，其余一字不动。

**预期**：启动 12 个全新上下文的子代理（每个配方一个），各返回一条结构化拍摄脚本，按指纹归集。

### 步骤 5：接生产

每条脚本的结果里带 `format` 字段，值是 operation id（如 `text_to_video` / `digital_human`）。把脚本投给画布生产：

- 用 `omnimux-workflow` 的画布模板，节点按 operation 配置
- 或用 `workflow_run` 触发已保存的生产图
- 产物与配方指纹一起落盘

---

## 四、meta 块

```json
{
  "name": "batch-shoot",
  "description": "按角色与条数生成互不重复的电商视频配方，扇出子代理产出拍摄脚本",
  "whenToUse": "需要为某个商品批量产出多条差异化素材脚本时",
  "phases": [
    { "title": "解析配方请求" },
    { "title": "扇出子代理生成脚本" }
  ]
}
```

---

## 五、args 参考

### v1（执行侧用这个）

| 字段 | 类型 | 说明 |
| :--- | :--- | :--- |
| `product` | object | `{ name, url?, sellingPoints?, audience? }` |
| `recipes` | array | 由 `prepare-args.mjs` 生成，每条含 `index` / `fingerprint` / `vertical` / `identity` / `method` / `hook` / `format` / `compliance` |
| `seed` | number | 与配方同源，随产物落盘 |
| `dryRun` | boolean | 缺省或 `true` 时只回显配方，不启动子代理 |

### v0（只用于本地计算与校验）

| 字段 | 类型 | 说明 |
| :--- | :--- | :--- |
| `product` | object | 同上 |
| `requests` | array | `[{ verticalId, identityId, count }]`；`count` 受池子容量限制 |
| `pools` | object | `{ method, persona, hook, format }` —— **113KB，不要在执行侧传** |
| `seed` | number | 决定配方组合；同 seed 完全复现 |
| `dryRun` | boolean | `true` 只出配方 |

合法的 `verticalId` / `identityId` 见 `pools/persona.json`，或跑 `node scripts/workflows/prepare-args.mjs --list`。

---

## 六、常见问题

| 现象 | 原因 | 处理 |
| :--- | :--- | :--- |
| 报 `args.pools 不完整` | 池子没传或传空 | 确认四个 json 都读出来并放进 `pools` |
| 报 `unknown persona` | `verticalId` / `identityId` 拼错 | 对照 `persona.json` 的 id 字段 |
| 报 `批次内配方指纹重复` | 正交分配失效（池子太小） | 补充池子条目；这是设计上的硬失败，不要绕过 |
| 子代理返回解析失败 | 子代理没按 JSON 输出 | 看 `scripts[].parseError`；收紧脚本里的输出约束 |
| 预算不足 / 触顶 | 子代理数超过 `maxTotalAgents` | 降低单批条数或拆批 |

---

## 七、边界提醒

- **本脚本不生成画面**，只产出配方与脚本。画面生产是 `omnimux-workflow` 画布的事。
- **不新增插件、不改 hub、不改官方组件。**
- 配方 `fingerprint` 必须随产物落盘——它是后续归因（S3）的唯一钥匙。
