# OmniMux Always-On Behavior Contracts

Living behavioral contracts dynamically assembled and injected into agent system prompts by `plugins/omnimux/src/agents/contracts-loader.js`.

## Active Contracts

| Contract | Target Agents | Core Invariant |
|---|---|---|
| `baseline.md` | `[orchestrator, video-producer, router, planner, executor]` | Path immutability, max 3 distinct retries, working language priority |
| `anti-loop.md` | `[orchestrator, video-producer, router, planner, executor]` | Pre-call self check, loop-vs-instead table, LoopGuard circuit breaker |
| `semantic-judgment.md` | `[orchestrator, video-producer, executor]` | Input roles (`source/edit`, `layout`, `style/design`, `character/scene`, `mood`), take/adapt/ignore/block/ask |
| `timeline-discipline.md` | `[orchestrator, video-producer, planner, executor]` | Auto-asset registration, hunk-level patch, stage boundary isolation |
| `batch-grouping.md` | `[orchestrator, video-producer]` | Multi-asset batch auto-grouping, grid presentation, clean ungrouping |

## Frontmatter Format

```yaml
---
name: contract-name
agents: [orchestrator, video-producer]
---
```
Use concrete agent role identifiers, or `['*']` for universal routing.
