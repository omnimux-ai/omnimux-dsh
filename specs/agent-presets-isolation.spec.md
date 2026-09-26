# Spec: OmniMux Agent 预设、技能环境隔离与市场体系落地治理

## 1. 业务目标与愿景
根据真实 OmniMux 产品纯净出厂运行标准，确立：
1. 全局技能极简收敛（≤4 个通用底座：全网检索、网页读取、文字润色、界面呈现），专业技能一律不进全局；
2. 桌面壳环境加载隔离：通过配置物理切断对外部 `~/.agents/` 及 `~/.dsh/` 的全局技能扫描，严格限制在 OmniMux 私有环境（`~/.omnimux-dev` 或 `~/.omnimux`）及当前工作区；
3. 出厂预设聚焦社媒运营：保留 `cordis`（创建Agent），其余预设 100% 收敛为社媒运营矩阵（TikTok、Instagram、X/推特、YouTube、爆款视频复刻、出海广告投放、全域社媒操盘）；非社媒角色全部剥离移入专家市场作为可选安装项；
4. 专属技能精准下沉与正交配置：彻底废除社媒与 TikTok 预设技能的 100% 粗暴复制，各角色按细分场景绑定专属技能；
5. 市场统一元数据：专家与技能市场 Catalog 显式标记 `pre-installed` 与 `marketplace` 状态。

## 2. 核心验收断言
- **GATE-01**：全局技能白名单硬门禁 `scripts/verify-global-skills.mjs`，非白名单专业技能无法进入全局；
- **GATE-02**：Agent 预设健康度门禁 `scripts/verify-agent-presets.mjs`，校验出厂预设属于社媒矩阵+cordis，且任意两角色 skills 重合度不超过 30%；
- **GATE-03**：市场 Catalog 元数据校验门禁 `scripts/verify-market-catalog.mjs`，所有条目具备显式 `installType` 且合法；
- **GATE-04**：桌面壳 `cordis.patch.yml` 中 `dsh-skill-filesystem` 显式设置 `includeDefaultRoots: false`；
- **GATE-05**：`scripts/sync-agent-presets.sh` 仅物化白名单内的社媒角色与 cordis，非社媒角色不进入出厂预设。
