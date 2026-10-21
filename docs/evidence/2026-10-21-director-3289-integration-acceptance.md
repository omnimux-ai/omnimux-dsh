# 3D 导演台集成分支真实验收（#3289，2026-10-21）

## 结论

任务私有（task-source-installed）完整应用中的真实浏览器验收**通过**：正常项目入口创建 3D 导演台、加入标准女性、选择 9:16、播放/导出白膜视频、保存关闭重开，8 项断言全部通过；构图 PNG 与白膜视频经独立 ffmpeg 解码，首/中/尾像素互异，场景修订重开一致。本次运行**不**代表 F01–F12/A01–A12 全矩阵完成（云端智能、Agent 真实旅程、剪辑消费等仍为后续项，见文末）。

## 运行身份

- 产品 HEAD：`56582c8ab`；验收 runner 硬化后 HEAD：`654ef7822`；base：`110f3ae4`（运行时刻 origin/main）。
- 装配路径：`startTestEnvironment` fresh `task-source-installed`。`evidenceLevel=task-source-installed`、`taskPluginsCount=3`、私有包 208 个；support 包 `dsh-better-sidebar@0.18.0`（packaged-support）、peer support `react-dom@18.3.1`；未读取 Dev/Prod 业务数据或凭据。
- server entries 实测加载：omnimux `src/index.js` 198B、omnimux-automation `src/index.js` 7201B、omnimux-workflow `dist/index.js` 1858292B；client bundles：hub 1440534B、automation 320007B、workflow 549135B（sha256 见原始 `runtime.json`）。
- 运行命令：`PATH="/usr/local/bin:$PATH" DIRECTOR_EGO_BROWSER=<ego> DIRECTOR_FFMPEG=<ffmpeg> env npm_config_verify_deps_before_run=false node scripts/director-acceptance-3289.mjs`。墙钟 138.4s（app ready 80.6s，浏览器旅程 55.4s）。
- 原始证据目录（本机、不进版本库）：`.agent-reports/beeftv-director/acceptance-3289-zY5vGt/`。

## 断言（8/8 通过，读自 assertions.json）

| 断言 | 实际证据 |
|---|---|
| normal-project-entry | 首启 Internal Testing Notice 关闭；Projects → New Project → 3D Director → 打开导演台；画布工具栏可见 |
| portrait-selected | 加入标准女性、跳过引导、画幅 9:16 且 aria-pressed=true |
| managed-media-decoded | 白膜视频 WebM 5.1247s、521×927 可解码播放 |
| saved-scene | 权威场景 revision=5，sceneId `f91caa03-85d1-40b9-8236-7852605d8693` |
| play-seek | currentTime=2.5s、readyState=4 |
| decoded-motion | 首/中/尾像素 SHA-256 互异 |
| scene-reopened | 关闭重开后同 sceneId、revision 5 |
| aspect-reopened | 重开仍为 9:16 |

## 媒体与产物

- 构图 PNG `composition.png`：57,848B，521×927（9:16），magic `89504e47`，sha256 `7f0f0be0b8bfca3efe59ef2ed28b373f2389e4bcc5d3db015b5a2d935031615a`。
- 白膜视频 `reference.webm`：1,092,132B，VP8 521×927，5.1247s，146 帧（≈28.5fps 实测；场景镜头 fps=30），sha256 `5f6df9d640d0e8eb5d57b4713be8bdbef0c44b012072f05c967c0717d8c61f48`。
- 播放/重开截图：`playback.png` 127,374B、`reopened.png` 129,328B、`camera-properties.png` 180,907B。
- 首/中/尾解码像素 SHA-256：`12c9b81d7f2334e6af3e4cd24304fe100f5d88adeb4b7e989606e9dffe062c01`、`c0bef27377fa69716831e6698d968081f45e9dd603e93217827a61441afe72a7`、`135fffbc27d0892835667b385c3146256c8b3b2aad02623fa88f3b6091d06e51`。
- 独立解码（ffmpeg，非浏览器内解码）：`status=passed`，PNG 解码 true、整段视频解码 true，framemd5 首/中/尾互异。

## 保存/重开与清理

- 保存镜头：duration 5、fps 30、cameraMove `push_in`、shotSize `medium`、camera keyframes 2；actor 标准女性（`standard_female`）；场景深度相等，revision 5→5。
- 浏览器空间 165：`closedSpace=true`、`keptManagedLabels=[]`；应用清理 `cleaned=true`（app-child / mock-server / app-private-directory 全 completed）；无 `.test-env-*` 残留、无残留进程；未触碰共享 Dev 应用。

## 仍未闭合（不得据此宣称完整迁移验收）

- A11 真实视觉理解/生图渠道与 A12 Agent 真实旅程未配置实际云调用；F/A 账本其余 PENDING/PARTIAL 子项（骨骼播放、GLTF 配套、多镜头输出 provenance、剪辑消费时间线与原 assetId 贯通等）。
- 零字节队列记录用例因测试只读门禁未能新增；`directorAssistant` ledger 读取仍为 stat+readFileSync（P2 硬化项）。
- 场景控件回归（搜索/分组/舞台轴）在本分支未重跑，旧 `formal-scene-controls-*` 证据属于旧基线，不作为本分支结论。
