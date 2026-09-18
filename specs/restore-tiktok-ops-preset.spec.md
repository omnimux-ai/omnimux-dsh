# 规格文档：恢复 TikTok 运营专家团预设与守护拦截修正

> 任务目标：恢复此前组建完成的「TikTok 运营专家团」（下辖 13 位垂直专家），修正同步脚本守护规则，解除对该出厂预设的自动清理与退役拦截，并重新物化编译至 OmniMux 开发环境，恢复其在主界面顶部专家下拉菜单中的正常显示。

## 1. 现象复盘与根因分析
- **现象**：OmniMux 开发版（Dev）的专家列表中未显示「TikTok 运营专家团」。
- **根因分析**：
  1. 此前为了解决设置面板中重复显示社媒专家卡片的问题，PR #2370 误将刚刚升级完成的「TikTok 运营专家团」（`tiktok-agent`）识别为废弃别名进行了物理移除；
  2. `scripts/sync-agent-presets.sh` 中将 `tiktok-agent` 从保留名单移除，并增加了强制 `rm -rf` 及退役移动逻辑；
  3. `scripts/build-agent-presets.mjs` 中移除了 `tiktok-agent` 的自动插桩与人设构建逻辑。

## 2. 改造方案与技术契约
### 2.1 完整恢复预设资产与微内核人设
- 从版本历史快照中完整检出恢复 `presets/tiktok-agent/`（包含 `preset.yml`、`agent.cordis.yml`、`skills.json` 等）；
- 保持其清晰独特的角色定位：名称为「TikTok运营专家团」，英文名「TikTok Ops Team」，描述为「全链路爆款视频创作、带货选品、互动截流与投流增长。」，与「社媒专家」（`omni-agent`）形成明确的业务区隔，杜绝再次被误判为重复别名。

### 2.2 恢复构建脚本逻辑
- 在 `scripts/build-agent-presets.mjs` 中：
  - 恢复 `TIKTOK_AGENT_PERSONA`（TikTok运营专家团主理人人设）；
  - 恢复对 `presets/tiktok-agent/agent.cordis.yml` 的自动插桩合并逻辑（包含 `presets/fragments/tiktok-experts.cordis.yml` 注入的 13 位专家）。

### 2.3 修正同步脚本守卫白名单
- 在 `scripts/sync-agent-presets.sh` 中：
  - 将 `tiktok-agent` 重新加入 `KEEP` 常驻保留名单；
  - 移除对 `tiktok-agent` 的删除与强制退役代码，使其能够平滑物化到 `~/.omnimux-dev` 及打包目录中。

### 2.4 国际化与测试断言对齐
- 确保 `plugins/omnimux/src/client/agent-presets-i18n.js` 和各层测试断言覆盖 `tiktok-agent`，且中英双语展示准确无误。

## 3. 验收标准与验证矩阵
1. `presets/tiktok-agent/` 目录完整存在且结构合法；
2. `node scripts/build-agent-presets.mjs` 构建顺利通过，成功将 13 位专家插桩注入；
3. `node --test tests/e2e/agent-presets-naming-order.e2e.test.mjs` 与 `pnpm presets:verify` 100% 绿灯；
4. `bash scripts/sync-agent-presets.sh` 物化成功，`~/.omnimux-dev/agent-presets-shipped/tiktok-agent` 真实存在；
5. 全量静态与基线门禁通过。
