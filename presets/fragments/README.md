# Agent preset fragments

`content-experts.cordis.yml` 和 `engagement-experts.cordis.yml` 是 10 个社媒专家 spawn 行及其精简 persona 的真源。Persona 只保留角色输入、职责、输出与边界；具体技能和领域参考按需读取。

```
node scripts/build-agent-presets.mjs
```

按完整 `tool-subagent-fork` 六行块插入，禁止中线搜索 `    # ──`。运行两次应幂等。

| 产物 | 插入片段 |
|---|---|
| `presets/tiktok-agent/agent.cordis.yml` | 两份工具清单（10 spawn）+ TikTokAgent 主理人 persona |
| `presets/social-content-team/agent.cordis.yml` | 仅创作 6 人 |
| `presets/social-engagement-team/agent.cordis.yml` | 仅增长 4 人 |
