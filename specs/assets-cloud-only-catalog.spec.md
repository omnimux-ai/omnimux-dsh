# 公共资产目录全云化（Issue #3028 切片 1）

## 用户旅程
新安装用户打开资产库 → 公共 → 声音：列表只展示云端已有的内容；点击播放键走 https://assets.omnimux.ai，不存在「有播放键但放不出」。

## 决策（用户裁定 2026-10-03）
- 运行时合法来源仅三种：随包相对路径数据、用户自己的 DSH_HOME 数据、官方 HTTPS。
- 媒体文件上 R2；声音素材只上传来源清楚的，其余（克隆、来源不明、性感）下架。
- 连接器市场本期不做（页面无开放入口）。

## 范围
1. 构建脚本 `plugins/omnimux-assets/scripts/build-cloud-assets-catalog.mjs`
   - `--assets-root` 必填，删除开发机默认路径。
   - 产物 `media_url`/`cover_url` 只写 https 地址；有本地文件但无云端映射的行**不入目录**；manifest 不写 `sourceRoot`。
   - 音频样本：`音效/` 用 `audio/sfx/`；其余样本（女声/男声/纯音乐/播客/口播）白名单映射 `audio/voiceover/`、`audio/bgm/`；未在白名单（克隆/性感/下载*）不产生条目。
2. `plugins/omnimux-assets/cloud-catalog/**` 重新生成：零 `file:` 定位符、`sourceRoot` 为空。
3. `plugins/omnimux-assets/src/cloud-catalog.js`：移除 `resolveLocal`/`sourceRoot`/`file:` 本地解析（目录已不含本地定位符；`saveToLocal` 保留远端下载路径）。
4. `scripts/verify-product-baseline.mjs`：`DEV_MACHINE_PATH_RE` 补 `~/Desktop/` 形态。
5. `plugins/.scratch/omni-shot.mjs`：删除被跟踪的开发机探针文件。

## 新用户基线
公共资产只依赖 assets.omnimux.ai；断网时卡片仍在但媒体请求失败，本地「保存」路径走远端下载（无本地文件可复制）。

## 验收
- `cloud-catalog/index.json` 及各 page：media_url/cover_url 非空即 `https://assets.omnimux.ai/`；`file:` 出现次数为 0；manifest.sourceRoot 为 ""。
- 音频类：R2 上传的 13 条样本返回 200；声音总数由 640 变为 615（13 条上传 + 5 条音效 + 103 条已有云端 BGM + 494 条音色描述行；10 条来源不明下架）。
- `pnpm --filter omnimux-assets test` 全绿；`pnpm verify:product-baseline` 通过。

## 不做
连接器市场、Veo 输出目录、凭据跨环境搜索（另开单）；运行时 `useCloudAudition` 行为不变。
