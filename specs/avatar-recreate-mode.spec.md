# 数字人页图片/视频生成 UI 同步 + 爆款复刻第三模式（Issue #3799）

## 目标与成功标准

把 OmniMux 官网 `web/src/features/influencer` 自 2026-10-13 基线（插件 base `911cb74a6`）以来针对**数字人页图片/视频生成**的 UI 迭代与交互修复同步进 `plugins/omnimux-avatar`，并补齐第三个视频模式「爆款复刻」。

源仓 `/Users/x/Desktop/Project/OmniMux`，HEAD `f9e008405b166a3fa55d65ac75ccca3799c25c48`；基线起 `influencer` 相关提交 99 个（前端 76 / 后端 23，均不含 merge）。

- 视频创作左栏出现三模式：动作复刻 / 角色替换 / 爆款复刻；切换模式恢复各自已选素材与草稿，上传库与历史库保持共享。
- 爆款复刻只有「生成视频」一个动作：点击后先跑分镜拆解，再立即提交编译好的提示词；拆解进度如实可见，不伪造服务端进度。
- 参考视频在爆款复刻里只是拆解材料，不进入视频模型请求；提交体只有参考图 + 编译后的提示词。
- 分析失败与提交失败分开呈现；提交失败保留已完成的拆解，重试不再二次付费分析。
- 参考图支持多选上传，上传中卡片显示真实状态；切换模式后上传结果仍落在发起它的模式。
- 任务卡与预览的失败原因中文化；预览里的分镜拆解只读，不触发重新分析。
- 模型调用全部走中枢既有 seam，不改 `plugins/omnimux/`。

## 逐项迁移映射

状态取值：**已迁**（本插件此前已实现）/ **本轮迁**（本次实现）/ **不适用**（网站专属，按产品定位与 MVP 边界不迁）/ **阻断**（依赖外部能力）。

| # | 源变更 | 源提交代表 | 本轮处置 |
|---|---|---|---|
| 1 | 爆款复刻成为第三个视频模式 | `802e47e75` | 本轮迁：MotionPanel 三模式 + 独立表单 |
| 2 | 复刻改为一次生成（去掉分析按钮/确认屏/可编辑提示词） | `9dcd55a34` | 本轮迁：CTA 单动作，分析为内部步骤 |
| 3 | 复刻输入合并为一张素材卡 | `dc5adcf04` | 本轮迁：参考视频 + 参考图同卡 |
| 4 | 复刻输出时长跟随参考片 | `4aef89649` | 本轮迁：时长由分析结果决定，不做手填 |
| 5 | 复刻分析进度可见 | `7898afb36` | 本轮迁：有界计时进度 + 分步文案 |
| 6 | 复刻预览图改为宽幅 | `1dca0fba0` | 本轮迁：模式说明用宽幅分区，不引入新位图 |
| 7 | 复刻模式图标替换 | `6a7affff7` | 本轮迁：内联 SVG，不复制源素材 |
| 8 | 复刻参考选择器锚到素材卡 | `67c20a3a6` | 本轮迁：选择器锚点复用现有 materialAnchor |
| 9 | 复刻统一走共享视频线路 | `a9686608e` | 本轮迁：复用 `video_multi_ref` 候选选择 |
| 10 | 预览里的只读分镜拆解移除 | `948e7dcba` | 本轮迁：预览只显示拆解摘要，不重跑分析 |
| 11 | 模式素材隔离（视频/图/提示词各自保存） | `14707017c` | 本轮迁：per-mode 快照 + 在途目标模式 |
| 12 | 选择器媒体加载加速 + 首帧兜底 | `d14c4a02d` | 本轮迁：缩略图本地缓存 + 元数据首帧占位 |
| 13 | 参考图多选上传 | `87f4c2d3a` | 本轮迁：多选 + 顺序保持 |
| 14 | 上传中卡片只表达自身状态 | `7d519826c` | 本轮迁：状态落在卡片上，不在面板顶部重复 |
| 15 | 简化参考上传为一次引导选择 | `b82178fe2` | 本轮迁 |
| 16 | 并发批次保持上传顺序 | `7ab387f4d` | 本轮迁：按发起序落位 |
| 17 | 复刻表单用共享提示词开关 | `76365f9b6` | 本轮迁 |
| 18 | 模式切换在任意语言下不换行 | `775f9a547` | 本轮迁：分段控件不换行 |
| 19 | 任务失败原因全语言本地化 | `d47c64c3f` | 本轮迁：中文词条 + 失败详情组件 |
| 20 | 参考图预览复用共享预览窗 | `e7202dd2e` | 本轮迁：复用 TaskPreviewDialog/MultiViewDialog 的媒体预览能力 |
| 21 | 参考视频预览复用共享播放窗 | `cf80f5f6f` | 本轮迁 |
| 22 | 提示与失败落在共享表面 | `a75e8b55a` | 本轮迁：错误统一走 onError，不在多处自造 |
| 23 | 参数卡去掉参考时长文案 | `351761bd4` | 本轮迁：参数卡只留清晰度/画幅 |
| 24 | 预览面板去掉「不可复用」提示 | `cdc506df6` | 本轮迁 |
| 25 | 槽位预览按钮与关闭控件对齐 | `282a0ea94` | 本轮迁：CSS 对齐 |
| 26 | 视频元数据持久化（上传/完成各一次） | `b73fededf` `a2da384cc` | 已迁：`materials.js` 已存真实时长尺寸 |
| 27 | 参考视频时长/画幅按浏览器实测 | `09ddf1b97` `f344522ce` | 已迁：`mediaInspect` 真实解析 |
| 28 | 参考视频与输出参数分开校验 | `3623bf569` | 已迁：`/motion/options` 分离 |
| 29 | 失败卡去掉重试按钮 | `45e3cb853` `28b84c633` | 本轮迁：失败卡只给详情，重试走重新生成 |
| 30 | 手选锁定，重载重置外观 | `e35049a18` | 已迁：`use-builder` 随机锁语义 |
| 31 | 图片四模式输入保持 | `f5bc5aae7` | 已迁：`sheet` 四模式已存在 |
| 32 | 视频生成预估积分 | `1272255a1` `24b61acf3` | 不适用：积分来自官网结算，中枢目录无按渠道报价；插件已显式留空不编数字 |
| 33 | 订阅付费墙 / 余额门禁 | `e62d96cb2` `a31d23e46` `19f2a5e11` `532f42a8e` | 不适用：本仓无计费与订阅体系 |
| 34 | 游客登录门禁 / 登录落地页 | `224ac4528` 等 | 不适用：宿主连接鉴权已覆盖 |
| 35 | CLI 创建工作流 | `2d4d912b6` `9eb34d1e2` 等 | 不适用：网站命令行入口，非页面能力 |
| 36 | 管理员预设发布/下架 | 相关提交 | 不适用：网站账户运营 |
| 37 | 云端 5 槽排队 / 72 小时短链 | `8457137e1` `954f18ccd` 等 | 不适用：改为中枢持久意图 + 本地受管素材 |
| 38 | 动作提示词反向重写 / Argon 规划器 | `0c6c4c085` `73350d195` 等 | 不适用：官网模型编排内部实现；插件用固定业务提示词 |
| 39 | 对象替换理解失败判定 | `79c36044f` | 不适用：官网对象替换规划器；插件无该规划器 |
| 40 | Sunburst 图像掩码/报价 | `37b06f969` `4ddf9011c` | 不适用：官网图像线路与计费 |

## 用户旅程与验收点

1. 视频创作左栏可切到「爆款复刻」，切回其它模式时已选参考视频/图片/提示词各自保留。
2. 选一条 4–30 秒参考视频 + 至少一张参考图，点「生成视频」：按钮先报「正在拆解参考视频」，进度条按有界计时推进到 92% 封顶，拆解完成后立即提交并切到历史。
3. 拆解失败：错误落在共享错误面，表单保持可见，用户可重试；重试重新拆解。
4. 拆解成功但提交失败：拆解结果保留，再次点生成直接提交，不再重新拆解（不二次付费）。
5. 参考视频/图片/意图任一变化，已保留的拆解失效。
6. 多选上传 3 张图：3 张上传中卡片按发起顺序出现，完成后按序进入已选列表；切到别的模式再切回，图片仍在。
7. 任务失败卡显示中文失败原因与详情入口；预览里的分镜只读。
8. 1280 / 820 / 390 三个视口无横向溢出，模式切换不换行。

## 项目结构与复用

- 服务端：`plugins/omnimux-avatar/src/recreate.js`（新，拆解流水线）、`src/http.js`（新路由 `/recreate/analyze`）、`src/motion.js`（`submit` 接受 `recreate` 模式与编译后提示词）、`src/index.js`（装配 seam）、`dsh.manifest.json`（`seamsConsumed` 增补）。
- 拆解流水线只用中枢公开 seam：`videoProcess`（抽帧，来自 omnimux-video 插件）、`textComplete`（视觉与编译两轮，来自中枢）、`mediaInspect`（素材真值）。不导入中枢私有模块、不持密钥、不发裸模型请求。
- 客户端：`src/client/components/MotionPanel.jsx`（三模式 + 模式快照）、新增 `RecreateForm.jsx` / `RecreateProgress.jsx` / `PendingUploadCard.jsx` / `FailReasonDetail.jsx`、`src/client/lib/mode-assets.js`（纯函数快照逻辑）、`src/client/lib/recreate.js`（拆解失效与提交体组装）、`src/client/locales.js`（新词条）、`src/client/styles.js`（新增样式）。
- 复用既有 `RecoverableMedia`、`MaterialPicker`、`SegmentedToggle`、`TaskPreviewDialog`、`dsh-ui-kit` 的 Button/InputField/DropdownSelect；不新建平行控件体系。

## 新用户基线

仅依赖正式安装的插件、中枢已配置文本与视频渠道、`omnimux-video` 插件提供抽帧能力。缺 `videoProcess` 时爆款复刻明确报「视频分析能力未就绪」而不是空转；缺文本渠道时报「文本能力未就绪」；缺视频渠道时生成按钮不可用并说明原因。不依赖开发机端口、本地模型服务、绝对检出路径或私 profile。

## 命令与测试策略

- 插件测试：`cd plugins/omnimux-avatar && npm test`（`node --test src/*.test.mjs src/client/*.test.mjs src/client/*.test.js src/client/components/*.test.mjs`）。
- 构建：`node plugins/omnimux-avatar/scripts/build-client.mjs`。
- 静态按触及面：`node scripts/verify-plugin-boundaries.mjs`、`node scripts/verify-product-baseline.mjs`、`node scripts/verify-stage-contracts.mjs`、`node --test scripts/verify-anti-slop.test.mjs`。
- 影响矩阵：`node scripts/impact-matrix.mjs --git-diff --base origin/main`，据此补最小 union。
- 浏览器：任务工作树内完整应用 `ui` 合成模式 + 专属 journey，真实浏览器截图与逐项断言；不执行真实收费视频生成。
- 先写会失败的回归（拆解失效、模式隔离、上传顺序、提交体不含参考视频），再最小实现。

## 假设

中枢的 `textComplete` seam 支持传入本地图片绝对路径作为视觉输入（`probeTextImage` 对非 http(s)/data 的输入走 `readLocalImage`，已读源码确认），因此抽帧后的关键帧可以直接交给文本模型做结构化拆解，不需要另外的图像理解通道；抽帧用 `videoProcess` 的 `video_thumbnail_extract` 按真实时长等距取帧（512 长边、约 1.2 秒一帧、6–12 帧），不用 `video_scene_detect`。

### 已证伪并修正的假设（保留记录）

初稿假设用 `videoProcess` 的 `video_scene_detect`（`extractFrames: true`）抽帧。**已用真实 ffmpeg 证伪**：`video_scene_detect` 靠 `gt(scene,0.4)` 选帧，无剪切点的连续镜头会返回 0 帧（实测 5 秒纯色片段 `pts_time` 计数为 0，两段拼接片段只有 1），而数字人参考视频经常是长镜头。改为等距抽帧后，同一无剪切片段可稳定产出全部帧（实测 6 个时间点取到 5 帧，尾部超出时长的一帧按预期缺失），且与源仓实际参数一致（源 `influencerRecreateFrameMinCount=6` / `MaxCount=12` / `SecondsPer=1.2` / `FrameBox=512`，即按片长等距取帧，不是场景检测）。

## 证伪方式

若 `textComplete` 实际不接受本地图片路径、或等距抽帧产不出可解码的帧文件，则拆解流水线跑不通：表现为 `/recreate/analyze` 返回 `needs-analysis` 而非拆解 JSON。证伪步骤：用 `mediaInspect` 拿到真实时长后按 1.2 秒步长取 6–12 个时间点，各调一次 `video_thumbnail_extract`，检查返回的每个文件都是可解码 JPEG；再把其中一个路径作为 `references[].pathOrUrl` 交给 `textComplete`，检查返回是否含真实文本。任一不成立即改走「仅用视频元数据 + 用户意图编译提示词」的降级路径，并在 README 与映射表标注为阻断。

## 边界

- 总是：先读规则与文件，先规格后代码，可逆切片，只改本工作树，保留真实错误，不伪造进度或通过。
- 先问：真实收费视频验证、生产发布、凭据初始化、跨工作区修改、付款。
- 绝不：复制 AGPL 源码或素材，改 `plugins/omnimux/` 中枢与官方 DSH 源码，用 CSS/DOM 掩盖数据错误，把合成数据当真实生成质量，把未合并源码装入共享开发版。

## 证伪结果（已执行，2026-10-26）

两条假设都已用真实工具验证，未发任何网络请求：

1. **等距抽帧可产出可解码帧**：对一段无剪切点的合成片段（5 秒纯色、两段拼接）按 0.8–1.2 秒步长取点，`ffmpeg -frames:v 1 -vf scale='min(512,iw)':-2` 稳定产出可解码 JPEG（实测 6 个时间点取到 5 帧，尾部超时长那帧缺失属正常）。同一片段用 `video_scene_detect` 返回 0 帧，证实初稿方案不可用。
2. **中枢可读取本地抽帧文件**：直接调用 `plugins/omnimux/src/text/image.js` 的 `probeTextImage('/tmp/…/f0.jpg', { attachments: { imageLimits: {} } })`，返回 `{"mediaType":"image/jpeg","sizeBytes":674,"bytesOk":true}`。说明 `textComplete` 的本地路径分支真实可用，抽帧文件能作为视觉输入交给文本模型。

真实模型请求（文本与视频生成）仍未执行，按仓库边界留给任务级授权与后续 live 验证。

## 旧标准变更

- `plugins/omnimux-avatar/src/client/components/gallery.test.mjs` :: `失败原因与重试按钮齐备，重试先阻断冒泡`

理由：该用例原有断言 `assert.match(taskCard, /fail_reason \|\| t\('生成失败'\)/)` 与 `assert.match(taskCard, /event\.stopPropagation\(\)/)` 锁的是「失败卡内有重试按钮及其冒泡阻断」。本轮映射表第 29 项（源提交 `45e3cb853` / `28b84c633`）要求失败卡去掉重试按钮，重试语义收敛为预览窗里的「重新生成」。旧断言锁的正是被删掉的按钮，不改就无法实现需求。

新期望比原断言更严：失败原因统一走 `describeFailReason(t, task?.fail_reason)` 解析并渲染 `FailReasonDetail`，同时以负向断言确认失败卡内不再出现 `t('重试')` 与 `onRetry(task)`。这是整个插件测试里唯一一条需要改写的既有用例，其余 294 条原样保留。
