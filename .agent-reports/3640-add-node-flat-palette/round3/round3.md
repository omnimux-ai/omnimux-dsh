# Issue #3640 最终 revision 浏览器验收（round 3）

- 验收时间：2026-10-23 22:08–22:12 (+08:00)
- 执行者：teammate `browser-evidence`
- 目的：`origin/main` 合入 #3639「添加节点面板底部补『新建工作流』入口卡」并解冲突后，在**合并后的 revision** 上做交付前最后一轮真实浏览器验收。
- 结论：**5/5 断言 pass**；无分类平铺与底部入口卡**共存无重叠/遮挡**；未修改任何源码或测试。

## 1. 源码身份

| 项 | 值 |
| --- | --- |
| 工作树 | `/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/workflow-addnode-flat-menu` |
| 分支 | `agent/workflow-addnode-flat-menu-issue-3640` |
| **HEAD** | **`7c67027276982908e1c731546e4ee74402986115`**（短 `7c6702727`） |
| HEAD 提交 | `Merge remote-tracking branch 'origin/main' into agent/workflow-addnode-flat-menu-issue-3640`，2026-10-23 21:59:55 +0800 |
| 工作区状态 | `git status --porcelain` 为空（干净） |
| 本任务是否改源码 | 否（仅新增 `.agent-reports/.../round3/` 证据） |

> 前两轮证据绑定的是 `70439270…`；本轮是合并后 revision 的独立验收，旧轮次不覆盖本结论。

## 2. 执行命令

```bash
# 1) 随机高位空闲端口（向 OS 申请临时端口后释放复用）
node -e 'const n=require("net");const s=n.createServer();s.listen(0,"127.0.0.1",()=>{const p=s.address().port;s.close(()=>console.log(p))})'
# -> 60721

# 2) worktree 内起画布 harness（dev-only 视觉入口）
cd /Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/workflow-addnode-flat-menu
node plugins/omnimux-workflow/scripts/canvas-harness.mjs --port 60721
```

启动日志：

```
skipped .../plugins/omnimux-workflow/lib/canvas.js (--harness does not write production bundle)
wrote .../plugins/omnimux-workflow/dist-harness/canvas-harness.js (18060774 bytes)
canvas harness: http://localhost:60721/
```

HTTP 探测：`curl -s -o /dev/null -w '%{http_code} %{size_download}' http://127.0.0.1:60721/` → `200 358`

## 3. 服务与浏览器

| 项 | 值 |
| --- | --- |
| 端口 | `60721`（OS 分配，随机高位） |
| URL | `http://localhost:60721/`、`http://127.0.0.1:60721/` |
| 页面标题 | `omnimux-workflow canvas harness (W4)` |
| 浏览器 | ego-browser（ego lite，guide v2.1.0），未使用 IAB |
| ego 空间 | id `254`，名 `omnimux-3640-merge-final-20261023-2202`，ownership `agent`（新建） |
| 空间收尾 | `finish({ keep: [] })`，未保留页面 |
| 视口 | `innerWidth 1728 / innerHeight 883 / DPR 2` — 与截图像素尺寸 **1728x883 完全一致** |
| harness 收尾 | 已停止，端口已释放，无残留进程 |

## 4. 逐条断言结果

### 断言 1：面板仍为无分类平铺 8 项，旧分组选择器仍全 0 — **PASS**

dock 面板 `.wf-node-menu--dock`：

| 探针 | 读数 |
| --- | --- |
| `.wf-node-menu__group` | **0** |
| `.wf-node-menu__group-header` | **0** |
| `.wf-node-menu__group-caret` | **0** |
| `.wf-node-menu__group-title` | **0** |
| `.wf-node-menu__group-count` | **0** |
| 「素材/数据/合成/创作」作为独立叶子文本节点 | 各 **0** |
| `.wf-node-menu__list` 直接子元素 | **8 × `BUTTON.wf-node-menu__item`**（无分组包裹层） |
| list 内 `svg` 数 / 条目数 | **8 / 8**（每项恰 1 图标，无折叠箭头） |

条目顺序（8 项，逐一对应）：

```
["文本", "表格", "图片", "视频", "音频", "导演台", "视频剪辑", "导入素材"]
```

徽标：`[null, "HTable", null, "MiniMax H3", null, null, "Clip", null]`

### 断言 2：菜单仍显示「导演台」「视频剪辑」— **PASS**

dock 第 6 项 `导演台`、第 7 项 `视频剪辑`；钻取面板同样第 6/7 项为 `导演台`/`视频剪辑`。

### 断言 3：面板底部出现「新建工作流」入口卡，且不改变上面 8 项的顺序与文案 — **PASS**

入口卡（`.wf-node-menu__footer` > `BUTTON.wf-node-menu__entry`）：

| 探针 | 读数 |
| --- | --- |
| `.wf-node-menu__footer` 存在 | `true` |
| `.wf-node-menu__entry` 存在 | `true` |
| 元素 | `BUTTON` |
| 标题 `.wf-node-menu__entry-title` | **`新建工作流`** |
| 副文案 `.wf-node-menu__entry-hint` | **`把当前画布保存为可复用模板`** |
| 右侧箭头 `.wf-node-menu__entry-arrow` | `true` |
| 在视口内 | `true` |
| 完整落在面板容器内 | `true` |
| **是否在 `.wf-node-menu__list` 内** | **`false`**（是列表的兄弟节点，不参与 8 项顺序） |
| **list 与 footer 重叠面积** | **0 px²** |
| **任一 palette 条目与入口卡的最大重叠面积** | **0 px²** |
| 容器 `scrollHeight` / `clientHeight` | `529 / 529`（无溢出） |
| list `scrollHeight` / `clientHeight` | `382 / 382`（无溢出） |
| 面板 `scrollHeight` / `clientHeight` | `545 / 545`（无溢出） |
| 8 个条目全部在视口内 | `true` |

几何读数（CSS px，视口 1728x883）：

| 元素 | x | y | w | h |
| --- | --- | --- | --- | --- |
| list | 719 | 344.5 | 235 | 382 |
| footer | 719 | 734.5 | 235 | 62.5 |
| entry 卡 | 719 | 743.5 | 235 | 53.5 |
| 面板 | 710 | 259.5 | 253 | 546.5 |
| 条目 1..8 | 719 | 344.5 / 392.5 / 440.5 / 488.5 / 536.5 / 584.5 / 632.5 / 680.5 | 235 | 46 |

list 底边 `726.5` < footer 顶边 `734.5`，间隔 8px（即 `margin-top: 8px` 的视觉间距 + 1px 分隔线）——**无重叠、无遮挡**。

面板全文（顺序可读）：

```
添加节点N文本表格HTable图片视频MiniMax H3音频导演台视频剪辑Clip导入素材新建工作流把当前画布保存为可复用模板
```

即 8 项调色板在前、入口卡在后，8 项的顺序与文案与合并前一致。

### 断言 4：搜索「导演台」仍只命中 1 项 — **PASS**

| 探针 | 读数 |
| --- | --- |
| 搜索框 value | `导演台` |
| 条目数 | **1** |
| 条目文案 | `["导演台"]` |
| `mark.wf-node-menu__match` 数量 | 1，文本 `导演台`，class `wf-node-menu__match` |
| mark 计算样式 | `background-color: rgb(251, 251, 252)` |
| label 计算样式 | `background-color: rgba(0, 0, 0, 0)`（透明） |
| `highlightApplied` | `true` |
| 空态 | 未出现 |
| 搜索时入口卡是否仍在 | `true`（标题仍为 `新建工作流`，位置未变 `x=719 y=743.5 w=235 h=53.5`） |

即入口卡不参与命中计数，也不被搜索过滤掉——符合「底部固定入口」的预期。

### 断言 5：右键钻取面板仍无分类、7 项、不含「导入素材」— **PASS**

- pane 右键主菜单文案：`["导入素材", "添加节点", "撤销", "重做", "创建工作流", "粘贴", "全选"]`（此处「导入素材」是右键菜单自身顶层项，设计如此）
- 点「添加节点」（索引 1）进入钻取面板 `.wf-node-menu wf-node-menu--context`，有返回键
- 条目数 **7**：`["文本", "表格", "图片", "视频", "音频", "导演台", "视频剪辑"]`
- `containsImportAsset` = **`false`**
- 五个分组选择器全为 **0**；「素材/数据/合成/创作」独立文本节点各 **0**
- list 直接子元素 **7 × `BUTTON.wf-node-menu__item`**；list 内 `svg` **7 == 7 项**
- list 与 footer 重叠面积 **0**
- 面板全文：`添加节点文本表格HTable图片视频MiniMax H3音频导演台视频剪辑Clip新建工作流把当前画布保存为可复用模板`

## 5. 观察到的一点（非缺陷，供你判断）

**钻取面板里也出现了同一张「新建工作流」入口卡。** `ContextMenu.tsx` 给 `scope="context"` 的 `AddNodeMenu` 也传了 `onCreateWorkflow`，所以右键钻取面板现在是「7 项 + 底部入口卡」。

- 这不违反本次 5 条断言（钻取面板仍 7 项、不含「导入素材」、无分类）。
- 但从产品角度值得你确认：#3639 的入口卡原本是否只该出现在 dock 面板？如果钻取面板也想要它，那当前行为正确；如果只想 dock 有，则 `ContextMenu.tsx` 那处 `onCreateWorkflow` 需要去掉。
- 我**没有改代码**，只如实报现象。

## 6. 证据文件

全部为真实可解码 PNG（Pillow `Image.verify()` 通过，sha256 互不相同），已逐张目视核对。

| 文件 | 像素 | 字节 | sha256 | 内容 |
| --- | --- | --- | --- | --- |
| `dock-panel.png` | 1728x883 | 109431 | `0802befa69b97598094654969e4527b4c4bfe0e78fc8e359dc777fc6bc5ed8f6` | dock 面板：8 项平铺 + 底部「新建工作流」入口卡，无分类 |
| `search-director.png` | 1728x883 | 90585 | `895b31e1e3f98095baedd1e8cf4db9375d6d2b5b8d064d8fd6daf0c24df8d892` | 搜索「导演台」仅 1 项，入口卡仍在底部 |
| `context-drill-panel.png` | 1728x883 | 109749 | `ce96bacd5d0a37e1a7d81928fe8653b08f8d2c7287dbc993671c6689d34384fc` | 右键钻取面板：7 项平铺 + 入口卡，无「导入素材」 |
| `dock-panel-zoom.png` | 825x1695 | 252244 | `6a00f5d749c29bd4b59321a1c22313ba5a8d0df4a9737d5f6f1c53146fe1e999` | dock 面板 3x 放大 |
| `entry-card-zoom.png` | 1080x488 | 111255 | `248d627b4e3edaf0e675a35c9ed223926632271a089c4709f3c5d39202d823ed` | 「导入素材」+ 分隔线 + 入口卡 4x 放大，看重叠/间距 |
| `search-director-zoom.png` | 825x1695 | 170783 | `8c08da9ace6eecf265435a31ea19740b6233e88670b3601788410d3799ea9243` | 搜索面板 3x 放大 |
| `context-drill-panel-zoom.png` | 840x1455 | 207476 | `0669500f4b0a8265db10cab8e7b0d23ce96e2d9cd6c94a4ecd4779e5d7b50e04` | 钻取面板 3x 放大 |

## 7. 限制与未覆盖项

1. **英文 locale 未复核**：本轮只验默认 `zh`。`dict.en.ts` 的 `template.panel.newWorkflow` 文案未在浏览器确认。
2. **未点击入口卡**：只验了入口卡渲染、文案、位置与无重叠；点它之后的「存为模板」流程未走。
3. **未点击任何 palette 条目**：本轮是共存/回归验收，未重复第三轮之外的建节点路径（「视频剪辑 → 节点标题仍为视频合成」已在 round 2 单独验过，但那是旧 HEAD）。
4. **暗色主题未验**：入口卡与列表在 dark 下的对比度未检查。
5. **未验快捷键 N** 打开面板。
6. **未验面板在极窄视口下的换行/挤压**：本轮视口固定 1728x883，未做响应式断点验证。
7. **harness 是 dev-only 入口**，构建明确 skip 生产 bundle（`lib/canvas.js`）；本证据覆盖画布岛内的 add-node 面板，**不覆盖 Dev app / Electron shell**。
8. 本任务为**只读取证**：未修改源码、未改测试、未在主检出写文件。
