# 查看器回退目录口径对齐 + 画布语音转写默认模型（#3705）

- Issue: #3705
- 日期: 2026-10-24
- 基线: `origin/main@5250f5c44`
- 来源: 2026-10-21 网关对账（`docs/evidence/2026-10-21-hub-gateway-drift-audit.md`）遗留的两处口径漂移

## 1. 用户旅程与期望反馈

### 旅程 A：查看器选择 seedance-2-5 档位

1. 用户打开媒体查看器，选 seedance-2-5 生成视频。
2. 中枢目录可用时，档位来自中枢 `channel-groups.js`：480p=「经济版」、720p=「标准版」且 720p 为默认。
3. 中枢目录不可用（离线/首启/接口失败）时，查看器回退到本地 `DEFAULT_FALLBACK_CATALOG`。

**现状（错）**：回退态下 480p 显示「标准版」且被选中为默认，720p 显示「高清版」。用户在中枢可用/不可用两种状态下看到**互相矛盾**的档位名称与默认档。

**期望**：两种状态下档位名称与默认档一致——480p「经济版」（非默认）、720p「标准版」（默认）。

### 旅程 B：素材节点做语音转写

1. 用户把一个音频/视频素材节点接入「语音转写」。
2. 节点按缺省参数提交转写请求（不显式选模型）。

**现状（错）**：缺省模型是 `doubao-asr-bigmodel`。该模型自 #3516 起「仅登记不上架」，网关没有任何启用渠道，首次提交必然失败。画布侧还在调用处额外硬编码了同一个 id。

**期望**：缺省模型与中枢一致（`whisper-1`，当前唯一上架的转写模型），且默认值只落在一个地方（请求 schema），调用方不再硬编码模型 id。

## 2. 方案

1. `plugins/omnimux-viewer/src/media-viewer/MediaViewerComposerData.js`：把 seedance-2-5 的 480p/720p 两档 label 与 default 对齐中枢真源（4 个字段）；并把 `seedream-5-0-pro` 的 `subtitle`/`badge` 也对齐中枢（回退「文生图 / 垫图 · 官方专线」+ badge「官方」vs 中枢「1K-2K」无 badge，经 `parseCatalogToCascade` 映射为 `desc`，同样用户可见）。
2. `plugins/omnimux-workflow/src/workflow/speechToText/schema.ts`：缺省 model 由 `doubao-asr-bigmodel` 改为 `whisper-1`。
3. `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/nodeMediaOperations.ts`：去掉硬编码的 `model`，改由 schema 缺省决定（请求类型里 `model` 本就是可选）。
4. `plugins/omnimux-workflow/src/shared/api.ts` 注释同步更正，避免文档继续撒谎。
5. 新增测试钉住这两处，防止再次漂移。

**非目标**：不删除回退目录本身（去镜像属 P2）；不改中枢 `channel-groups.js`（它是真源）；不新增或下架任何模型。

## 3. 验收

- [ ] 用同一份脚本对比「查看器回退目录」与「中枢目录」，**用户可见字段**（模型 label/subtitle/badge + 分组 label/badge/wireGroup/default/pointsEstimate）差异为 0（改动前：seedance-2-5 4 处 + seedream-5-0-pro 2 处）。
- [ ] 查看器侧新增用例断言 480p=经济版且非默认、720p=标准版且默认。
- [ ] 工作流侧新增用例断言缺省 model 为 `whisper-1`；调用方不再出现 `doubao-asr-bigmodel`。
- [ ] `pnpm --filter omnimux-viewer test`、`pnpm --filter omnimux-workflow test` 通过。
- [ ] 如判定为 UI 变更：`pnpm verify:stages` + `node --test scripts/verify-anti-slop.test.mjs` + 工作树浏览器证据。
- [ ] 独立评审确认「中枢是唯一真源」且回退态不再自相矛盾。

## 旧标准变更

- `plugins/omnimux-viewer/src/media-viewer/media-viewer-composer.test.js` :: `supplies structured cascade models with brand -> model -> channel`

原断言：`assert.equal(hd720.name, '高清版')`。

必须改的理由：该断言把回退目录里漂移的档位名钉成了「正确值」——它断言的正是本次要修的缺陷（中枢口径 720p 是「标准版」，480p 才是「经济版」，见 `catalog/serving/channel-groups.js` 与 #3516 评审修正）。不放松任何检查：仍然断言 720p 存在、`defaultMediaChannel(seedance25)` 落在 720p，只把被钉住的名称改成中枢口径。

新期望与证据：改为 `assert.equal(hd720.name, '标准版')`；并在同一用例内追加断言 480p 的名称是「经济版」且不是默认档（追加断言放行）。

- `plugins/omnimux-workflow/src/workflow/routes/speechToTextRoutes.test.mjs` :: `workflow STT defaults to Doubao SRT without writing the graph or starting audio generation`

原断言：夹具 `const model = 'doubao-asr-bigmodel'`，被用于 `assert.deepEqual(h.calls, [{ model, audio: request.audioPath, response_format: 'srt' }])` 等 seam 断言（`request` 不含 `model`，因此这些断言钉住的是 schema 缺省值）。

必须改的理由：本次修复的对象正是「缺省模型指向已下架模型」。`doubao-asr-bigmodel` 自 #3516 起在网关没有任何启用渠道，缺省必须改为中枢当前唯一上架的 `whisper-1`。断言结构（请求不带 model → seam 收到缺省模型 → response_format=srt）完全保留，不删除用例、不放松检查。

新期望与证据：夹具改为 `const model = 'whisper-1'`（附注释说明 #3705 与 #3516 依据）；用例体新增一行注释说明「用例名沿用历史措辞，断言已是 whisper-1」。

**用例名未能同步更名**：本仓库的测试门禁 `scripts/test-authoring-inspection.mjs` 在「用例名改写」时会先判定出 `test-execution-selector-needs-review`（非可声明原因）而拒绝，即使 spec 已逐条点名。已用最小复现确认这是门禁缺陷而非本用例特有（两个只差用例名、其余完全相同的文件即触发；与用例体内的 `h.call()` 这类成员表达式有关）。因此保留原名并就地注释；门禁缺陷另案上报（见 PR 说明）。

## 假设

- 中枢 `catalog/serving/channel-groups.js` 是档位名称与默认档的唯一真源：它是 #3516 评审时按网关实际计费口径修正过的（480p 0.17 折经济档、720p 0.24 折标准档），而查看器回退目录是更早的手抄副本。
- `whisper-1` 是当前唯一可用的转写模型：中枢目录里 `doubao-asr-bigmodel` 与 `seedasr-auc` 均为「仅登记不上架」，只有 `whisper-1` 上架；中枢自身的 STT 缺省（`media/route.js`）也已经是 `whisper-1`。
- 回退目录只在「中枢目录不可用」时生效，因此本次改动不影响中枢可用时的正常路径，属于纯纠正。

## 证伪方式

- 若把回退目录的 480p 改回 `default: true`，旅程 A 的对齐脚本应重新报出 4 处差异——这是「修好了」的反向验证。
- 若 `doubao-asr-bigmodel` 在改动后仍出现在工作流的缺省路径上（`rg 'doubao-asr-bigmodel' plugins/omnimux-workflow/src` 命中非测试代码），则旅程 B 未修好。
- 若 `whisper-1` 其实不可用（中枢目录里它变成「仅登记不上架」），则本次改的缺省值同样不可达——此时应以中枢目录为准重新选择，而不是保留任一个硬编码值。
- 若工作流的请求类型要求 `model` 必填，则「去掉调用方硬编码」会编译失败，需改为显式传 `whisper-1`；这属于方案回退，不是验收通过。
