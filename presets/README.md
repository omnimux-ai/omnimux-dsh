# OmniMux 出厂 Agent Presets

顶部会话模式下拉对齐出厂预设：

| id | 显示名（中 / 英） | order | 说明 |
|---|---|---|---|
| `cordis` | 创建Agent / Create Agent | 1 | 插件实验开发、运行时检查与团队搭建（自定义Agent系统入口）。 |
| `omni-agent` | 全域社媒操盘手 / Social Media Lead | 2 | 跨平台矩阵分发策略、全网趋势雷达、各平台格式自适应改写与全域数据复盘。 |
| `tiktok-agent` | TikTok运营操盘手 / TikTok Ops Lead | 3 | TikTok 蓝海选品、前3秒黄金Hook、爆款视频复刻、带货短视频与评论截流。 |
| `instagram-agent` | Instagram视觉增长专家 / Instagram Growth Expert | 4 | 高转化4:5图文轮播（Carousel）、Reels短片脚本、美学排版与高端品牌视觉设计。 |
| `x-agent` | X (推特) 流量运营专家 / X (Twitter) Ops Expert | 5 | 高互动推文串（Threads）、热点截流跟帖、长文专栏（Articles）与私信触达。 |
| `youtube-agent` | YouTube创作增长专家 / YouTube Growth Lead | 6 | 高点击率封面（CTR缩略图）、高完播留存分段脚本、SEO搜索标签与长视频大纲。 |
| `viral-video-agent` | 爆款视频复刻操盘手 / Viral Video Replication Lead | 7 | 爆款原片5D秒级解构、分镜数据表编排、创作画布节点调度与成片导出。 |
| `ad-creative-agent` | 出海广告创意投放操盘手 / Ad Creative & Media Buyer | 8 | 海外买量投放、96款广告格式与开场匹配、痛点卖点挖掘与多语言广告矩阵。 |

## 产品化机制

1. 本目录是 **OmniMux 产品真源**（不是 DSH 上游 `config/agent-presets`）。
2. `scripts/sync-agent-presets.sh` 物化出厂 8 项主力预设（1个系统级工具 + 7个社媒专属矩阵）以及历史兼容别名矩阵。
3. 非社媒角色（代码开发、日常工作、短剧制作人等）全部移入「专家市场」作为可选安装/聘用项。

## 铁律：不可逆退役契约（Permanent Legacy Tombstone Contract）

1. **会话持久化与状态机约束**：
   - 存量历史会话（Sessions）会在本地文件系统长期持久化。即使某个 Agent 预设在产品层面退役或更名，历史会话在下次打开、恢复（resume）或切换至新预设时，底座 RPC 仍必须能够解析旧预设 ID。
   - **绝对禁止物理删除已发布的预设 ID**！若从 `presets/` 中物理删除历史预设，用户只要在历史会话中点击切换预设，底座就会抛出 `preset "<id>" not found`，导致会话永久死锁、无法切换至任何新预设。
2. **退役与兼容处理规范**：
   - 任何退役预设必须在 `presets/<legacy-id>/` 留存轻量兼容别名（Tombstone），指向当前系统最接近的主力预设。
   - 在 `scripts/sync-agent-presets.sh` 的 `LEGACY_ALIASES` 列表中登记，确保 App unpacked 目录与 Asar Header 始终包含该 ID。
   - 在 `plugins/omnimux/src/client/agent-preset-enhancer.js` 的 `LEGACY_COMPATIBILITY_PRESET_IDS` 中登记，前端下拉菜单自动对用户隐藏，保证界面纯净且存量会话顺畅恢复。
3. **CI 自动化防删硬门禁**：
   - `scripts/verify-agent-presets.test.mjs` 中已固化历史预设完整性校验与同步断言；任何试图删除兼容预设的改动都将被 CI 直接拦截。
